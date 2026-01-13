/**
 * SolanaX402Client - x402 payment client for Solana
 *
 * Handles HTTP 402 (Payment Required) responses with Solana-native signatures
 * using Ed25519 and SPL token payments.
 *
 * @example
 * ```typescript
 * import { Connection, Keypair } from '@solana/web3.js'
 *
 * const client = new SolanaX402Client({
 *   connection: new Connection('https://api.mainnet-beta.solana.com'),
 *   keypair: Keypair.generate(),
 * })
 *
 * const response = await client.fetch('https://api.example.com/paid-endpoint')
 * ```
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js'
import * as ed25519 from '@noble/ed25519'
import bs58 from 'bs58'

// ============= Types =============

/**
 * Configuration for SolanaX402Client
 */
export interface SolanaX402ClientConfig {
  /** Solana connection */
  connection: Connection
  /** Keypair for signing (required if no walletAdapter) */
  keypair?: Keypair
  /** External wallet adapter (Phantom, etc.) */
  walletAdapter?: SolanaWalletAdapter
  /** Timeout for requests in milliseconds */
  timeoutMs?: number
  /** Automatically retry with payment on 402 */
  autoRetry?: boolean
  /** Maximum auto-approve amount in lamports (0 = require confirmation) */
  maxAutoApprove?: bigint
  /** Default headers to include in requests */
  defaultHeaders?: Record<string, string>
  /** Callback when payment is required */
  onPaymentRequired?: (required: SolanaPaymentRequired) => Promise<boolean>
  /** SPL token program ID (defaults to standard) */
  tokenProgramId?: string
}

/**
 * Solana wallet adapter interface (Phantom, Solflare, etc.)
 */
export interface SolanaWalletAdapter {
  publicKey: PublicKey | null
  connected: boolean
  connect(): Promise<void>
  disconnect(): Promise<void>
  signMessage(message: Uint8Array): Promise<Uint8Array>
  signTransaction(transaction: Transaction): Promise<Transaction>
  sendTransaction(transaction: Transaction, connection: Connection): Promise<string>
}

/**
 * Payment required response parsed for Solana
 */
export interface SolanaPaymentRequired {
  /** Recipient wallet address (base58) */
  recipient: string
  /** Amount in lamports (SOL) or token smallest units */
  amount: bigint
  /** Token mint address (null for SOL) */
  tokenMint: string | null
  /** Unique payment nonce */
  nonce: string
  /** Expiration timestamp (Unix seconds) */
  expiry: number
  /** Human-readable description */
  description: string
  /** Solana cluster ('mainnet-beta', 'devnet', 'testnet') */
  cluster: string
}

/**
 * Payment payload sent to server
 */
export interface SolanaPaymentPayload {
  /** Ed25519 signature (base58 encoded) */
  signature: string
  /** Payer public key (base58) */
  payer: string
  /** Payment nonce */
  nonce: string
  /** Transaction signature (if payment was sent on-chain) */
  txSignature?: string
}

/**
 * Payment receipt from server
 */
export interface SolanaPaymentReceipt {
  /** Receipt ID */
  receiptId: string
  /** Verified payer */
  payer: string
  /** Amount paid */
  amount: string
  /** Token mint (null for SOL) */
  tokenMint: string | null
  /** Timestamp */
  timestamp: number
  /** Validity period */
  validUntil?: number
}

/**
 * Fetch result with payment info
 */
export interface SolanaX402FetchResult {
  response: Response
  paymentRequired?: SolanaPaymentRequired
  paymentPayload?: SolanaPaymentPayload
  receipt?: SolanaPaymentReceipt
}

// ============= Constants =============

export const SOLANA_X402_HEADERS = {
  PAYMENT_REQUIRED: 'X-Solana-Payment-Required',
  PAYMENT_PAYLOAD: 'X-Solana-Payment',
  PAYMENT_RECEIPT: 'X-Solana-Payment-Receipt',
} as const

const DEFAULT_CONFIG: Required<Omit<SolanaX402ClientConfig, 'keypair' | 'walletAdapter' | 'onPaymentRequired' | 'tokenProgramId'>> = {
  connection: null as unknown as Connection,
  timeoutMs: 30_000,
  autoRetry: true,
  maxAutoApprove: 0n,
  defaultHeaders: {},
}

// ============= Error =============

export class SolanaX402Error extends Error {
  constructor(
    public readonly code: 'NO_SIGNER' | 'SIGN_REJECTED' | 'PAYMENT_FAILED' | 'EXPIRED' | 'INVALID_RESPONSE',
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'SolanaX402Error'
  }
}

// ============= Client =============

/**
 * SolanaX402Client - Handles x402 payments on Solana
 */
export class SolanaX402Client {
  private config: SolanaX402ClientConfig
  private keypair: Keypair | null
  private walletAdapter: SolanaWalletAdapter | null

  constructor(config: SolanaX402ClientConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.keypair = config.keypair ?? null
    this.walletAdapter = config.walletAdapter ?? null

    if (!this.keypair && !this.walletAdapter) {
      console.warn('[SolanaX402Client] No keypair or wallet adapter provided. Signing will fail.')
    }
  }

  /**
   * Fetch with automatic x402 payment handling
   */
  async fetch(
    url: string,
    init?: RequestInit
  ): Promise<SolanaX402FetchResult> {
    const headers = new Headers(init?.headers)
    Object.entries(this.config.defaultHeaders ?? {}).forEach(([k, v]) => {
      if (!headers.has(k)) headers.set(k, v)
    })

    // Include payer address in request
    const payerAddress = await this.getPayerAddress()
    if (payerAddress) {
      headers.set('X-Solana-Payer', payerAddress)
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs)

    try {
      const response = await globalThis.fetch(url, {
        ...init,
        headers,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      // Check for 402 Payment Required
      if (response.status === 402) {
        return this.handlePaymentRequired(response, url, init)
      }

      return { response }
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  /**
   * Handle 402 Payment Required response
   */
  private async handlePaymentRequired(
    response: Response,
    url: string,
    init?: RequestInit
  ): Promise<SolanaX402FetchResult> {
    const paymentHeader = response.headers.get(SOLANA_X402_HEADERS.PAYMENT_REQUIRED)
    if (!paymentHeader) {
      return { response }
    }

    const paymentRequired = this.parsePaymentRequired(paymentHeader)

    // Check expiry
    if (Date.now() / 1000 > paymentRequired.expiry) {
      throw new SolanaX402Error('EXPIRED', 'Payment request has expired')
    }

    // Check if auto-approval allowed
    const autoApprove = this.config.maxAutoApprove && paymentRequired.amount <= this.config.maxAutoApprove

    // If not auto-approve, check callback
    if (!autoApprove && this.config.onPaymentRequired) {
      const approved = await this.config.onPaymentRequired(paymentRequired)
      if (!approved) {
        return { response, paymentRequired }
      }
    }

    // Sign and retry if autoRetry is enabled
    if (!this.config.autoRetry && !autoApprove) {
      return { response, paymentRequired }
    }

    // Create and sign payment
    const paymentPayload = await this.signPayment(paymentRequired)

    // Retry request with payment
    const retryHeaders = new Headers(init?.headers)
    Object.entries(this.config.defaultHeaders ?? {}).forEach(([k, v]) => {
      if (!retryHeaders.has(k)) retryHeaders.set(k, v)
    })
    retryHeaders.set(SOLANA_X402_HEADERS.PAYMENT_PAYLOAD, JSON.stringify(paymentPayload))

    const retryResponse = await globalThis.fetch(url, {
      ...init,
      headers: retryHeaders,
    })

    // Parse receipt
    const receiptHeader = retryResponse.headers.get(SOLANA_X402_HEADERS.PAYMENT_RECEIPT)
    const receipt = receiptHeader ? JSON.parse(receiptHeader) as SolanaPaymentReceipt : undefined

    return {
      response: retryResponse,
      paymentRequired,
      paymentPayload,
      receipt,
    }
  }

  /**
   * Parse payment required header
   */
  private parsePaymentRequired(header: string): SolanaPaymentRequired {
    try {
      const parsed = JSON.parse(header)
      return {
        recipient: parsed.recipient,
        amount: BigInt(parsed.amount),
        tokenMint: parsed.tokenMint ?? null,
        nonce: parsed.nonce,
        expiry: parsed.expiry,
        description: parsed.description ?? 'API access',
        cluster: parsed.cluster ?? 'mainnet-beta',
      }
    } catch {
      throw new SolanaX402Error('INVALID_RESPONSE', 'Failed to parse payment required header')
    }
  }

  /**
   * Sign a payment request
   */
  async signPayment(required: SolanaPaymentRequired): Promise<SolanaPaymentPayload> {
    const payerAddress = await this.getPayerAddress()
    if (!payerAddress) {
      throw new SolanaX402Error('NO_SIGNER', 'No signer available')
    }

    // Create message to sign
    const message = this.createPaymentMessage(required, payerAddress)
    const messageBytes = new TextEncoder().encode(message)

    // Sign message
    let signature: string

    if (this.walletAdapter && this.walletAdapter.connected) {
      const signedBytes = await this.walletAdapter.signMessage(messageBytes)
      signature = bs58.encode(signedBytes)
    } else if (this.keypair) {
      const signedBytes = await ed25519.signAsync(messageBytes, this.keypair.secretKey.slice(0, 32))
      signature = bs58.encode(signedBytes)
    } else {
      throw new SolanaX402Error('NO_SIGNER', 'No signer available')
    }

    return {
      signature,
      payer: payerAddress,
      nonce: required.nonce,
    }
  }

  /**
   * Create payment message for signing
   */
  private createPaymentMessage(required: SolanaPaymentRequired, payer: string): string {
    // Standard x402 Solana message format
    return [
      'x402-solana-payment',
      `recipient:${required.recipient}`,
      `amount:${required.amount.toString()}`,
      `token:${required.tokenMint ?? 'SOL'}`,
      `nonce:${required.nonce}`,
      `expiry:${required.expiry}`,
      `payer:${payer}`,
    ].join('\n')
  }

  /**
   * Get payer address
   */
  async getPayerAddress(): Promise<string | null> {
    if (this.walletAdapter?.publicKey) {
      return this.walletAdapter.publicKey.toBase58()
    }
    if (this.keypair) {
      return this.keypair.publicKey.toBase58()
    }
    return null
  }

  /**
   * Create an on-chain payment transaction (for larger payments)
   */
  async createPaymentTransaction(required: SolanaPaymentRequired): Promise<Transaction> {
    const payerAddress = await this.getPayerAddress()
    if (!payerAddress) {
      throw new SolanaX402Error('NO_SIGNER', 'No signer available')
    }

    const payerPubkey = new PublicKey(payerAddress)
    const recipientPubkey = new PublicKey(required.recipient)

    const transaction = new Transaction()

    if (required.tokenMint) {
      // SPL token transfer (simplified - production would use getAssociatedTokenAddress)
      throw new SolanaX402Error('PAYMENT_FAILED', 'SPL token payments not yet implemented')
    } else {
      // Native SOL transfer
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: payerPubkey,
          toPubkey: recipientPubkey,
          lamports: Number(required.amount),
        })
      )
    }

    // Get recent blockhash
    const { blockhash } = await this.config.connection.getLatestBlockhash()
    transaction.recentBlockhash = blockhash
    transaction.feePayer = payerPubkey

    return transaction
  }

  /**
   * Send payment transaction
   */
  async sendPayment(required: SolanaPaymentRequired): Promise<string> {
    const transaction = await this.createPaymentTransaction(required)

    if (this.walletAdapter && this.walletAdapter.connected) {
      const signedTx = await this.walletAdapter.signTransaction(transaction)
      return await this.walletAdapter.sendTransaction(signedTx, this.config.connection)
    } else if (this.keypair) {
      const signature = await this.config.connection.sendTransaction(transaction, [this.keypair])
      return signature
    }

    throw new SolanaX402Error('NO_SIGNER', 'No signer available')
  }

  /**
   * Verify a payment signature
   */
  async verifyPayment(
    payload: SolanaPaymentPayload,
    required: SolanaPaymentRequired
  ): Promise<boolean> {
    try {
      const message = this.createPaymentMessage(required, payload.payer)
      const messageBytes = new TextEncoder().encode(message)
      const signatureBytes = bs58.decode(payload.signature)
      const publicKeyBytes = bs58.decode(payload.payer)

      return await ed25519.verifyAsync(signatureBytes, messageBytes, publicKeyBytes)
    } catch {
      return false
    }
  }
}

// ============= Factory =============

/**
 * Create a SolanaX402Client
 */
export function createSolanaX402Client(config: SolanaX402ClientConfig): SolanaX402Client {
  return new SolanaX402Client(config)
}

// ============= Utilities =============

/**
 * Convert SOL to lamports
 */
export function solToLamports(sol: number): bigint {
  return BigInt(Math.round(sol * LAMPORTS_PER_SOL))
}

/**
 * Convert lamports to SOL
 */
export function lamportsToSol(lamports: bigint): number {
  return Number(lamports) / LAMPORTS_PER_SOL
}

/**
 * Format lamports for display
 */
export function formatLamports(lamports: bigint, decimals: number = 4): string {
  const sol = lamportsToSol(lamports)
  return `${sol.toFixed(decimals)} SOL`
}
