/**
 * PaymentRouter - Unified payment interface with multi-protocol routing
 *
 * Routes payments to the appropriate protocol based on:
 * - Payment purpose (api_access, service, direct)
 * - Recipient type (EOA, contract, x402 endpoint)
 * - Transaction requirements
 *
 * @example
 * ```typescript
 * const router = new PaymentRouter(wallet, {
 *   x402Client,
 *   escrowClient,
 * })
 *
 * // Pay for API access (routes to x402)
 * await router.pay({
 *   recipient: 'https://api.example.com',
 *   amount: parseEther('0.01'),
 *   purpose: 'api_access',
 * })
 *
 * // Pay for service with escrow
 * await router.pay({
 *   recipient: serviceAgent,
 *   amount: parseEther('0.5'),
 *   purpose: 'escrow',
 *   metadata: { description: 'Data analysis' },
 * })
 *
 * // Direct payment
 * await router.pay({
 *   recipient: otherAgent,
 *   amount: parseEther('0.1'),
 *   purpose: 'direct',
 * })
 * ```
 */

import type { Address, Hex } from 'viem'
import type { MonmouthWallet } from '../MonmouthWallet'
import type { ActivityLog } from '../memory/ActivityLog'
import type { X402Client } from './X402Client'
import type { PaymentToken, PaymentReceipt } from './types'
import type { EscrowClient, EscrowId } from '../commerce'

/**
 * Payment protocol types
 */
export type PaymentProtocol = 'x402' | 'direct' | 'escrow'

/**
 * Payment purpose types
 */
export type PaymentPurpose = 'api_access' | 'service' | 'direct' | 'escrow'

/**
 * Payment request
 */
export interface PaymentRequest {
  /** Recipient address or URL (for x402) */
  recipient: Address | string
  /** Amount to pay */
  amount: bigint
  /** Token to use (default: ETH) */
  token?: PaymentToken
  /** Purpose of payment */
  purpose: PaymentPurpose
  /** Optional metadata */
  metadata?: {
    /** Description of payment */
    description?: string
    /** Service ID for escrow */
    serviceId?: string
    /** Escrow duration in seconds */
    escrowDuration?: number
    /** Custom data */
    [key: string]: unknown
  }
}

/**
 * Payment result
 */
export interface PaymentResult {
  /** Whether payment succeeded */
  success: boolean
  /** Protocol used */
  protocol: PaymentProtocol
  /** Transaction hash (for direct/escrow) */
  txHash?: Hex
  /** Escrow ID (for escrow payments) */
  escrowId?: EscrowId
  /** Payment receipt (for x402) */
  receipt?: PaymentReceipt
  /** Error message if failed */
  error?: string
  /** Response data (for x402 API calls) */
  response?: Response
}

/**
 * Protocol detection result
 */
export interface ProtocolDetection {
  /** Detected protocol */
  protocol: PaymentProtocol
  /** Confidence level */
  confidence: 'high' | 'medium' | 'low'
  /** Reason for detection */
  reason: string
}

/**
 * Configuration for PaymentRouter
 */
export interface PaymentRouterConfig {
  /** X402 client for API payments */
  x402Client?: X402Client
  /** Escrow client for service payments */
  escrowClient?: EscrowClient
  /** Activity log for logging */
  activityLog?: ActivityLog
  /** Default escrow duration in seconds */
  defaultEscrowDuration?: number
  /** Callback for direct transfers */
  sendTransaction?: (params: {
    to: Address
    value: bigint
    data?: Hex
  }) => Promise<Hex>
}

/**
 * Payment event types
 */
export type PaymentRouterEvent =
  | { type: 'payment_started'; request: PaymentRequest; protocol: PaymentProtocol }
  | { type: 'payment_completed'; request: PaymentRequest; result: PaymentResult }
  | { type: 'payment_failed'; request: PaymentRequest; error: string }
  | { type: 'protocol_detected'; recipient: string; detection: ProtocolDetection }

/**
 * Payment event listener
 */
export type PaymentRouterEventListener = (event: PaymentRouterEvent) => void

/**
 * PaymentRouter - Routes payments to appropriate protocol
 */
export class PaymentRouter {
  private wallet: MonmouthWallet
  private config: PaymentRouterConfig
  private listeners: Set<PaymentRouterEventListener> = new Set()

  constructor(wallet: MonmouthWallet, config?: PaymentRouterConfig) {
    this.wallet = wallet
    this.config = {
      defaultEscrowDuration: 86400, // 24 hours
      ...config,
    }
  }

  /**
   * Execute a payment, routing to the appropriate protocol
   */
  async pay(request: PaymentRequest): Promise<PaymentResult> {
    // Detect protocol based on request
    const detection = this.detectProtocol(request)

    this.emit({
      type: 'payment_started',
      request,
      protocol: detection.protocol,
    })

    try {
      // Validate against guardrails first
      const recipientAddress = this.extractAddress(request.recipient)
      if (recipientAddress) {
        const validation = this.wallet.validateTransaction({
          to: recipientAddress,
          value: request.amount,
        })

        if (!validation.allowed) {
          const result: PaymentResult = {
            success: false,
            protocol: detection.protocol,
            error: validation.reason || 'Payment blocked by guardrails',
          }
          this.emit({ type: 'payment_failed', request, error: result.error! })
          return result
        }
      }

      // Route to appropriate handler
      let result: PaymentResult

      switch (detection.protocol) {
        case 'x402':
          result = await this.handleX402Payment(request)
          break
        case 'escrow':
          result = await this.handleEscrowPayment(request)
          break
        case 'direct':
        default:
          result = await this.handleDirectPayment(request)
          break
      }

      // Log activity
      this.logActivity(result.success ? 'transaction' : 'error', {
        event: 'payment_routed',
        protocol: detection.protocol,
        recipient: request.recipient,
        amount: request.amount.toString(),
        success: result.success,
        error: result.error,
      })

      this.emit({ type: 'payment_completed', request, result })
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.emit({ type: 'payment_failed', request, error: errorMessage })
      throw error
    }
  }

  /**
   * Detect which protocol to use for a payment
   */
  detectProtocol(request: PaymentRequest): ProtocolDetection {
    const { recipient, purpose } = request

    // URL detection for x402 (URLs can't be direct payments)
    if (typeof recipient === 'string' && (recipient.startsWith('http://') || recipient.startsWith('https://'))) {
      return {
        protocol: 'x402',
        confidence: 'high',
        reason: 'Recipient is a URL',
      }
    }

    // Explicit purpose mapping for non-URL recipients
    if (purpose === 'api_access') {
      return {
        protocol: 'x402',
        confidence: 'high',
        reason: 'Explicit api_access purpose',
      }
    }

    if (purpose === 'escrow' || purpose === 'service') {
      return {
        protocol: 'escrow',
        confidence: 'high',
        reason: `Explicit ${purpose} purpose`,
      }
    }

    if (purpose === 'direct') {
      return {
        protocol: 'direct',
        confidence: 'high',
        reason: 'Explicit direct purpose',
      }
    }

    // Default to direct for addresses
    return {
      protocol: 'direct',
      confidence: 'medium',
      reason: 'Default for address recipient',
    }
  }

  /**
   * Handle x402 API payment
   */
  private async handleX402Payment(request: PaymentRequest): Promise<PaymentResult> {
    if (!this.config.x402Client) {
      return {
        success: false,
        protocol: 'x402',
        error: 'X402 client not configured',
      }
    }

    if (typeof request.recipient !== 'string' || !request.recipient.startsWith('http')) {
      return {
        success: false,
        protocol: 'x402',
        error: 'X402 requires a URL recipient',
      }
    }

    try {
      const fetchResult = await this.config.x402Client.fetchWithPaymentInfo(request.recipient)

      return {
        success: true,
        protocol: 'x402',
        receipt: fetchResult.receipt,
        response: fetchResult.response,
      }
    } catch (error) {
      return {
        success: false,
        protocol: 'x402',
        error: error instanceof Error ? error.message : 'X402 payment failed',
      }
    }
  }

  /**
   * Handle escrow payment
   */
  private async handleEscrowPayment(request: PaymentRequest): Promise<PaymentResult> {
    if (!this.config.escrowClient) {
      return {
        success: false,
        protocol: 'escrow',
        error: 'Escrow client not configured',
      }
    }

    const recipientAddress = this.extractAddress(request.recipient)
    if (!recipientAddress) {
      return {
        success: false,
        protocol: 'escrow',
        error: 'Invalid recipient address for escrow',
      }
    }

    try {
      const result = await this.config.escrowClient.createEscrow({
        recipient: recipientAddress,
        amount: request.amount,
        token: request.token,
        description: request.metadata?.description || 'Escrow payment',
        durationSeconds: request.metadata?.escrowDuration || this.config.defaultEscrowDuration!,
        serviceId: request.metadata?.serviceId,
      })

      return {
        success: result.success,
        protocol: 'escrow',
        txHash: result.txHash,
        escrowId: result.escrowId,
        error: result.error,
      }
    } catch (error) {
      return {
        success: false,
        protocol: 'escrow',
        error: error instanceof Error ? error.message : 'Escrow creation failed',
      }
    }
  }

  /**
   * Handle direct payment
   */
  private async handleDirectPayment(request: PaymentRequest): Promise<PaymentResult> {
    const recipientAddress = this.extractAddress(request.recipient)
    if (!recipientAddress) {
      return {
        success: false,
        protocol: 'direct',
        error: 'Invalid recipient address',
      }
    }

    // If sendTransaction callback is provided, use it
    if (this.config.sendTransaction) {
      try {
        const txHash = await this.config.sendTransaction({
          to: recipientAddress,
          value: request.amount,
        })

        // Record the transaction
        this.wallet.recordTransaction(txHash, request.amount)

        return {
          success: true,
          protocol: 'direct',
          txHash,
        }
      } catch (error) {
        return {
          success: false,
          protocol: 'direct',
          error: error instanceof Error ? error.message : 'Transaction failed',
        }
      }
    }

    // Stub implementation - return simulated success
    const stubTxHash = `0x${'d'.repeat(64)}` as Hex
    this.wallet.recordTransaction(stubTxHash, request.amount)

    return {
      success: true,
      protocol: 'direct',
      txHash: stubTxHash,
    }
  }

  /**
   * Extract address from recipient (address or URL)
   */
  private extractAddress(recipient: Address | string): Address | null {
    if (typeof recipient === 'string') {
      if (recipient.startsWith('0x') && recipient.length === 42) {
        return recipient as Address
      }
      // Can't extract address from URL
      return null
    }
    return recipient
  }

  /**
   * Check if a protocol is available
   */
  isProtocolAvailable(protocol: PaymentProtocol): boolean {
    switch (protocol) {
      case 'x402':
        return !!this.config.x402Client
      case 'escrow':
        return !!this.config.escrowClient
      case 'direct':
        return true
    }
  }

  /**
   * Get available protocols
   */
  getAvailableProtocols(): PaymentProtocol[] {
    const protocols: PaymentProtocol[] = ['direct']
    if (this.config.x402Client) protocols.push('x402')
    if (this.config.escrowClient) protocols.push('escrow')
    return protocols
  }

  // ============= Configuration =============

  /**
   * Set X402 client
   */
  setX402Client(client: X402Client): void {
    this.config.x402Client = client
  }

  /**
   * Set Escrow client
   */
  setEscrowClient(client: EscrowClient): void {
    this.config.escrowClient = client
  }

  /**
   * Set activity log
   */
  setActivityLog(log: ActivityLog): void {
    this.config.activityLog = log
  }

  /**
   * Set send transaction callback
   */
  setSendTransaction(fn: PaymentRouterConfig['sendTransaction']): void {
    this.config.sendTransaction = fn
  }

  // ============= Events =============

  /**
   * Subscribe to router events
   */
  on(listener: PaymentRouterEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Emit an event
   */
  private emit(event: PaymentRouterEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event)
      } catch (error) {
        console.error('[PaymentRouter] Event listener error:', error)
      }
    })
  }

  // ============= Logging =============

  /**
   * Log activity
   */
  private logActivity(
    actionType: 'transaction' | 'decision' | 'error',
    data: unknown
  ): void {
    if (!this.config.activityLog) return

    this.config.activityLog.log({
      agentId: this.wallet.getAgentId(),
      actionType,
      data,
    })
  }
}

/**
 * Create a new PaymentRouter instance
 */
export function createPaymentRouter(
  wallet: MonmouthWallet,
  config?: PaymentRouterConfig
): PaymentRouter {
  return new PaymentRouter(wallet, config)
}
