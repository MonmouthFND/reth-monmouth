/**
 * Universal x402 Payment Protocol Interface
 *
 * Chain-agnostic interface for HTTP 402 payment handling.
 * Supports both EIP-712 (EVM) and custom signed messages (Solana).
 */

import type { ChainAdapter } from './adapter'
import type {
  ChainType,
  TokenAmount,
  TokenId,
  UniversalAddress,
  UniversalSignature,
} from './types'

/** x402 payment request (from server's 402 response) */
export interface X402PaymentRequest {
  /** Recipient address */
  recipient: UniversalAddress
  /** Amount required */
  amount: TokenAmount
  /** Resource being accessed */
  resource: string
  /** Payment valid until (unix ms) */
  validUntil: number
  /** Server-provided nonce */
  nonce?: string
  /** Supported chain types */
  acceptedChains?: ChainType[]
  /** Additional metadata */
  metadata?: Record<string, unknown>
}

/** x402 payment (to send to server) */
export interface X402Payment {
  /** Base64 encoded payment for X-Payment header */
  header: string
  /** Chain type used */
  chainType: ChainType
  /** Chain ID */
  chainId: number | string
  /** Payer address */
  from: UniversalAddress
  /** Recipient address */
  to: UniversalAddress
  /** Payment amount */
  amount: bigint
  /** Token used */
  token: TokenId
  /** Resource being paid for */
  resource: string
  /** Validity timestamp */
  validUntil: number
  /** Nonce */
  nonce: string
  /** Signature */
  signature: UniversalSignature
}

/** Result of an x402 payment attempt */
export interface X402PaymentResult {
  /** Whether payment was successful */
  success: boolean
  /** The payment that was sent */
  payment?: X402Payment
  /** Response from server after payment */
  response?: Response
  /** Error if payment failed */
  error?: string
}

/** x402 adapter events */
export type X402Event =
  | { type: 'payment_required'; request: X402PaymentRequest; url: string }
  | { type: 'payment_created'; payment: X402Payment }
  | { type: 'payment_sent'; payment: X402Payment; url: string }
  | { type: 'payment_accepted'; payment: X402Payment; url: string }
  | { type: 'payment_rejected'; payment: X402Payment; url: string; reason: string }
  | { type: 'payment_error'; url: string; error: string }

export type X402EventListener = (event: X402Event) => void

/** Universal x402 adapter interface */
export interface X402Adapter {
  /** Underlying chain adapter */
  readonly chainAdapter: ChainAdapter

  /** Create an x402 payment from a request */
  createPayment(request: X402PaymentRequest): Promise<X402Payment>

  /** Parse a 402 response into a payment request */
  parsePaymentRequired(response: Response): Promise<X402PaymentRequest | null>

  /** Verify a payment signature (for servers) */
  verifyPayment(payment: X402Payment): Promise<boolean>

  /** Encode payment for X-Payment header */
  encodePaymentHeader(payment: X402Payment): string

  /** Decode payment from X-Payment header */
  decodePaymentHeader(header: string): X402Payment

  /** Fetch wrapper that handles 402 responses automatically */
  fetch(url: string, options?: RequestInit): Promise<X402PaymentResult>

  /** Subscribe to x402 events */
  on(listener: X402EventListener): () => void

  /** Unsubscribe from x402 events */
  off(listener: X402EventListener): void
}

/** Factory for creating x402 adapters */
export type X402AdapterFactory = (chainAdapter: ChainAdapter) => X402Adapter

/** x402 payment validation options */
export interface X402ValidationOptions {
  /** Maximum amount allowed per payment */
  maxAmount?: bigint
  /** Allowed recipient addresses */
  allowedRecipients?: UniversalAddress[]
  /** Blocked recipient addresses */
  blockedRecipients?: UniversalAddress[]
  /** Allowed resources (URL patterns) */
  allowedResources?: string[]
  /** Minimum validity period (ms) */
  minValidityPeriod?: number
}

/** Validate a payment request against options */
export function validateX402Request(
  request: X402PaymentRequest,
  options: X402ValidationOptions
): { valid: boolean; reason?: string } {
  // Check amount
  if (options.maxAmount !== undefined && request.amount.raw > options.maxAmount) {
    return { valid: false, reason: `Amount ${request.amount.formatted} exceeds maximum` }
  }

  // Check recipient allowlist
  if (options.allowedRecipients && options.allowedRecipients.length > 0) {
    const isAllowed = options.allowedRecipients.some(
      (addr) => addr.display === request.recipient.display
    )
    if (!isAllowed) {
      return { valid: false, reason: `Recipient ${request.recipient.display} not in allowlist` }
    }
  }

  // Check recipient blocklist
  if (options.blockedRecipients) {
    const isBlocked = options.blockedRecipients.some(
      (addr) => addr.display === request.recipient.display
    )
    if (isBlocked) {
      return { valid: false, reason: `Recipient ${request.recipient.display} is blocked` }
    }
  }

  // Check resource patterns
  if (options.allowedResources && options.allowedResources.length > 0) {
    const isAllowed = options.allowedResources.some((pattern) => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'))
      return regex.test(request.resource)
    })
    if (!isAllowed) {
      return { valid: false, reason: `Resource ${request.resource} not in allowed patterns` }
    }
  }

  // Check validity period
  if (options.minValidityPeriod !== undefined) {
    const validityPeriod = request.validUntil - Date.now()
    if (validityPeriod < options.minValidityPeriod) {
      return { valid: false, reason: `Validity period too short` }
    }
  }

  return { valid: true }
}

/** Standard x402 response headers */
export const X402_HEADERS = {
  /** Payment required header */
  PAYMENT_REQUIRED: 'X-Payment-Required',
  /** Payment header (in request) */
  PAYMENT: 'X-Payment',
  /** Payment accepted header */
  PAYMENT_ACCEPTED: 'X-Payment-Accepted',
  /** Payment rejected reason */
  PAYMENT_REJECTED: 'X-Payment-Rejected',
} as const

/** Generate a random nonce */
export function generateNonce(): string {
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
