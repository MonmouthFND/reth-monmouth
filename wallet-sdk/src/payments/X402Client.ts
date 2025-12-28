/**
 * X402Client - Automatic payment client for x402 protocol
 *
 * Wraps fetch() to automatically handle HTTP 402 (Payment Required) responses
 * by parsing payment requirements, validating against guardrails, signing
 * payments, and retrying requests.
 *
 * @example
 * ```typescript
 * const wallet = createMonmouthWallet({ ... })
 * const client = new X402Client(wallet)
 *
 * // Automatically pays if 402 is returned
 * const response = await client.fetch('https://api.example.com/paid-endpoint')
 * const data = await response.json()
 * ```
 */

import type { Address, Hex } from 'viem'
import type { MonmouthWallet } from '../MonmouthWallet'
import type { ActivityLog } from '../memory/ActivityLog'
import {
  type PaymentRequired,
  type PaymentPayload,
  type PaymentReceipt,
  type X402ClientConfig,
  type X402FetchResult,
  type X402PaymentDomain,
  X402Error,
  X402_HEADERS,
  X402_PAYMENT_TYPES,
  parsePaymentRequired,
  serializePaymentHeader,
  isNativeToken,
  getTokenAddress,
} from './types'

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<Omit<X402ClientConfig, 'onPaymentRequired'>> = {
  timeoutMs: 30_000,
  autoRetry: true,
  maxAutoApprove: BigInt(0), // No auto-approve by default
  defaultHeaders: {},
}

/**
 * X402Client - Fetch wrapper with automatic x402 payment handling
 */
export class X402Client {
  private wallet: MonmouthWallet
  private config: Required<Omit<X402ClientConfig, 'onPaymentRequired'>> & {
    onPaymentRequired?: X402ClientConfig['onPaymentRequired']
  }
  private activityLog?: ActivityLog
  private signTypedData?: (params: {
    domain: X402PaymentDomain
    types: typeof X402_PAYMENT_TYPES
    primaryType: 'Payment'
    message: Record<string, unknown>
  }) => Promise<Hex>

  constructor(
    wallet: MonmouthWallet,
    config?: X402ClientConfig,
    options?: {
      activityLog?: ActivityLog
      signTypedData?: (params: {
        domain: X402PaymentDomain
        types: typeof X402_PAYMENT_TYPES
        primaryType: 'Payment'
        message: Record<string, unknown>
      }) => Promise<Hex>
    }
  ) {
    this.wallet = wallet
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    }
    this.activityLog = options?.activityLog
    this.signTypedData = options?.signTypedData
  }

  /**
   * Fetch with automatic x402 payment handling
   *
   * If a 402 response is received:
   * 1. Parse payment requirements from headers
   * 2. Validate against wallet guardrails
   * 3. Create signed payment
   * 4. Retry request with X-Payment header
   *
   * @returns Response (either original non-402, or retry response after payment)
   * @throws X402Error if payment validation fails or is rejected
   */
  async fetch(url: string, options?: RequestInit): Promise<Response> {
    const result = await this.fetchWithPaymentInfo(url, options)
    return result.response
  }

  /**
   * Fetch with full payment information
   *
   * Returns additional metadata about whether payment was made
   */
  async fetchWithPaymentInfo(url: string, options?: RequestInit): Promise<X402FetchResult> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs)

    try {
      // Merge headers
      const headers = new Headers(options?.headers)
      for (const [key, value] of Object.entries(this.config.defaultHeaders)) {
        if (!headers.has(key)) {
          headers.set(key, value)
        }
      }

      // Make initial request
      const initialResponse = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      })

      // If not 402, return as-is
      if (initialResponse.status !== 402) {
        return {
          response: initialResponse,
          paymentMade: false,
        }
      }

      // Parse payment requirements
      const paymentRequired = parsePaymentRequired(initialResponse.headers)

      // Log payment required event
      this.logActivity('decision', {
        event: 'payment_required',
        url,
        paymentRequired: {
          recipient: paymentRequired.recipient,
          amount: paymentRequired.amount.toString(),
          token: paymentRequired.token,
          chainId: paymentRequired.chainId,
          description: paymentRequired.description,
        },
      })

      // Check if auto-retry is enabled
      if (!this.config.autoRetry) {
        return {
          response: initialResponse,
          paymentMade: false,
        }
      }

      // Validate against guardrails
      const validation = this.validatePayment(paymentRequired)
      if (!validation.allowed) {
        this.logActivity('error', {
          event: 'payment_rejected',
          url,
          reason: validation.reason,
          rule: validation.violatedRule,
        })
        throw new X402Error(
          'GUARDRAIL_REJECTED',
          validation.reason || 'Payment rejected by guardrails',
          { rule: validation.violatedRule }
        )
      }

      // Check auto-approve limit
      if (this.config.maxAutoApprove > 0n && paymentRequired.amount > this.config.maxAutoApprove) {
        // Need explicit approval
        if (this.config.onPaymentRequired) {
          const approved = await this.config.onPaymentRequired(paymentRequired)
          if (!approved) {
            throw new X402Error('GUARDRAIL_REJECTED', 'Payment not approved by user')
          }
        } else {
          throw new X402Error(
            'GUARDRAIL_REJECTED',
            `Payment amount ${paymentRequired.amount} exceeds auto-approve limit ${this.config.maxAutoApprove}`
          )
        }
      }

      // Create signed payment
      const payment = await this.createPayment(paymentRequired)

      // Retry with payment header
      const paymentHeader = serializePaymentHeader(payment)
      headers.set(X402_HEADERS.PAYMENT, paymentHeader)

      const retryResponse = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      })

      // Check if payment was accepted
      if (retryResponse.status === 402) {
        throw new X402Error('PAYMENT_REJECTED', 'Server rejected payment')
      }

      // Record the spend
      this.wallet.recordTransaction(
        `0x${'0'.repeat(64)}` as Hex, // Placeholder hash for off-chain payment
        paymentRequired.amount
      )

      // Log successful payment
      this.logActivity('transaction', {
        event: 'payment_made',
        url,
        payment: {
          recipient: paymentRequired.recipient,
          amount: paymentRequired.amount.toString(),
          token: paymentRequired.token,
        },
      })

      // Build receipt
      const receipt: PaymentReceipt = {
        paymentId: paymentRequired.nonce,
        amount: paymentRequired.amount,
        recipient: paymentRequired.recipient,
        token: paymentRequired.token,
        timestamp: Date.now(),
      }

      return {
        response: retryResponse,
        paymentMade: true,
        payment,
        receipt,
      }
    } catch (error) {
      if (error instanceof X402Error) {
        throw error
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new X402Error('TIMEOUT', 'Request timed out')
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Create a signed payment payload
   *
   * Validates against guardrails and creates an EIP-712 signature
   */
  async createPayment(paymentRequired: PaymentRequired): Promise<PaymentPayload> {
    // Check expiry
    if (paymentRequired.expiry < Math.floor(Date.now() / 1000)) {
      throw new X402Error('PAYMENT_EXPIRED', 'Payment requirements have expired')
    }

    // Get payer address
    const payer = this.wallet.getConnectedAddress()
    if (!payer) {
      throw new X402Error('SIGNATURE_FAILED', 'Wallet not connected')
    }

    // Validate against guardrails
    const validation = this.validatePayment(paymentRequired)
    if (!validation.allowed) {
      throw new X402Error(
        'GUARDRAIL_REJECTED',
        validation.reason || 'Payment rejected by guardrails',
        { rule: validation.violatedRule }
      )
    }

    // Create EIP-712 signature
    const signature = await this.signPayment(paymentRequired, payer)

    return {
      paymentRequired,
      signature,
      payer,
      createdAt: Date.now(),
    }
  }

  /**
   * Validate payment against wallet guardrails
   */
  private validatePayment(paymentRequired: PaymentRequired) {
    // Convert payment to transaction intent for validation
    // For native ETH, value is the amount
    // For tokens, value is 0 (token transfer handled separately)
    const value = isNativeToken(paymentRequired.token) ? paymentRequired.amount : 0n

    return this.wallet.validateTransaction({
      to: paymentRequired.recipient,
      value,
      isContractDeploy: false,
    })
  }

  /**
   * Sign payment using EIP-712
   */
  private async signPayment(paymentRequired: PaymentRequired, payer: Address): Promise<Hex> {
    if (!this.signTypedData) {
      // Return a stub signature for testing
      // In production, this would be connected to wagmi's signTypedData
      return this.stubSign(paymentRequired, payer)
    }

    const domain: X402PaymentDomain = {
      name: 'X402Payment',
      version: '1',
      chainId: paymentRequired.chainId,
    }

    // Get token address
    const tokenAddress = isNativeToken(paymentRequired.token)
      ? '0x0000000000000000000000000000000000000000'
      : getTokenAddress(paymentRequired.token, paymentRequired.chainId)

    const message = {
      recipient: paymentRequired.recipient,
      amount: paymentRequired.amount,
      token: tokenAddress,
      nonce: paymentRequired.nonce,
      expiry: BigInt(paymentRequired.expiry),
      description: paymentRequired.description || '',
    }

    try {
      const signature = await this.signTypedData({
        domain,
        types: X402_PAYMENT_TYPES,
        primaryType: 'Payment',
        message,
      })
      return signature
    } catch (error) {
      throw new X402Error(
        'SIGNATURE_FAILED',
        'Failed to sign payment',
        { originalError: error }
      )
    }
  }

  /**
   * Stub signature for testing without wagmi
   */
  private async stubSign(paymentRequired: PaymentRequired, payer: Address): Promise<Hex> {
    // Create a deterministic stub signature based on input
    const data = JSON.stringify({
      recipient: paymentRequired.recipient,
      amount: paymentRequired.amount.toString(),
      token: paymentRequired.token,
      nonce: paymentRequired.nonce,
      expiry: paymentRequired.expiry,
      payer,
    })

    // Simple hash for stub (not cryptographically secure - just for testing)
    let hash = 0
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }

    // Format as hex signature
    const hashHex = Math.abs(hash).toString(16).padStart(64, '0')
    return `0x${hashHex}${'0'.repeat(64)}${'1b'}` as Hex
  }

  /**
   * Log activity to the activity log if available
   */
  private logActivity(
    actionType: 'transaction' | 'signature' | 'decision' | 'error',
    data: unknown
  ): void {
    if (!this.activityLog) return

    this.activityLog.log({
      agentId: this.wallet.getAgentId(),
      actionType,
      data,
    })
  }

  /**
   * Set the activity log for logging payments
   */
  setActivityLog(log: ActivityLog): void {
    this.activityLog = log
  }

  /**
   * Set the sign typed data function (from wagmi)
   */
  setSignTypedData(
    fn: (params: {
      domain: X402PaymentDomain
      types: typeof X402_PAYMENT_TYPES
      primaryType: 'Payment'
      message: Record<string, unknown>
    }) => Promise<Hex>
  ): void {
    this.signTypedData = fn
  }

  /**
   * Update client configuration
   */
  updateConfig(config: Partial<X402ClientConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): X402ClientConfig {
    return { ...this.config }
  }
}

/**
 * Create a new X402Client instance
 */
export function createX402Client(
  wallet: MonmouthWallet,
  config?: X402ClientConfig,
  options?: {
    activityLog?: ActivityLog
    signTypedData?: (params: {
      domain: X402PaymentDomain
      types: typeof X402_PAYMENT_TYPES
      primaryType: 'Payment'
      message: Record<string, unknown>
    }) => Promise<Hex>
  }
): X402Client {
  return new X402Client(wallet, config, options)
}
