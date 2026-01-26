/**
 * x402 Payment Protocol Types
 *
 * Types for the x402 payment protocol which enables agents
 * to automatically pay for API access using HTTP 402 responses.
 *
 * @see https://www.x402.org/
 */

import type { Address, Hex } from 'viem'

/**
 * Supported payment tokens
 */
export type PaymentToken = 'ETH' | 'USDC' | 'USDT' | 'DAI' | Address

/**
 * Payment requirements extracted from a 402 response
 *
 * These values come from the WWW-Authenticate and X-Payment-* headers
 */
export interface PaymentRequired {
  /** Recipient address to receive payment */
  recipient: Address
  /** Amount in smallest unit (wei for ETH, 6 decimals for USDC) */
  amount: bigint
  /** Token to pay with (address or symbol) */
  token: PaymentToken
  /** Chain ID for the payment */
  chainId: number
  /** Unique nonce to prevent replay attacks */
  nonce: string
  /** Expiry timestamp (unix seconds) */
  expiry: number
  /** Human-readable description of what's being paid for */
  description?: string
  /** Optional: specific payment scheme version */
  version?: string
  /** Optional: extra data required by the server */
  extra?: Record<string, unknown>
}

/**
 * Signed payment payload to include in retry request
 */
export interface PaymentPayload {
  /** The original payment requirements */
  paymentRequired: PaymentRequired
  /** EIP-712 signature authorizing the payment */
  signature: Hex
  /** Address of the payer */
  payer: Address
  /** Timestamp when payment was created */
  createdAt: number
}

/**
 * Receipt returned after successful payment
 */
export interface PaymentReceipt {
  /** Transaction hash if on-chain settlement */
  txHash?: Hex
  /** Payment ID from the server */
  paymentId: string
  /** Amount paid */
  amount: bigint
  /** Recipient */
  recipient: Address
  /** Token used */
  token: PaymentToken
  /** Timestamp of payment */
  timestamp: number
}

/**
 * x402 error types
 */
export type X402ErrorCode =
  | 'INVALID_PAYMENT_REQUIRED'    // Malformed 402 response
  | 'PAYMENT_EXPIRED'             // Payment requirements expired
  | 'INSUFFICIENT_BALANCE'        // Not enough funds
  | 'GUARDRAIL_REJECTED'          // Spending limits exceeded
  | 'SIGNATURE_FAILED'            // Could not sign payment
  | 'PAYMENT_REJECTED'            // Server rejected payment
  | 'NETWORK_MISMATCH'            // Wrong chain
  | 'UNSUPPORTED_TOKEN'           // Token not supported
  | 'TIMEOUT'                     // Request timed out

/**
 * x402 error class
 */
export class X402Error extends Error {
  constructor(
    public readonly code: X402ErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'X402Error'
  }
}

/**
 * Configuration for X402Client
 */
export interface X402ClientConfig {
  /** Default timeout for requests in milliseconds */
  timeoutMs?: number
  /** Whether to automatically retry with payment on 402 */
  autoRetry?: boolean
  /** Maximum payment amount to auto-approve (in wei equivalent) */
  maxAutoApprove?: bigint
  /** Custom headers to include in requests */
  defaultHeaders?: Record<string, string>
  /** Callback before making a payment (for UI confirmation) */
  onPaymentRequired?: (required: PaymentRequired) => Promise<boolean>
}

/**
 * Result of a fetch that may have involved payment
 */
export interface X402FetchResult {
  /** The final response */
  response: Response
  /** Whether a payment was made */
  paymentMade: boolean
  /** Payment details if payment was made */
  payment?: PaymentPayload
  /** Receipt if payment was confirmed */
  receipt?: PaymentReceipt
}

/**
 * EIP-712 domain for x402 payments
 */
export interface X402PaymentDomain {
  name: string
  version: string
  chainId: number
  verifyingContract?: Address
}

/**
 * EIP-712 typed data for x402 payment signature
 */
export const X402_PAYMENT_TYPES = {
  Payment: [
    { name: 'recipient', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'token', type: 'address' },
    { name: 'nonce', type: 'string' },
    { name: 'expiry', type: 'uint256' },
    { name: 'description', type: 'string' },
  ],
} as const

/**
 * Header names used in x402 protocol
 */
export const X402_HEADERS = {
  // Request headers
  PAYMENT: 'X-Payment',
  PAYMENT_TOKEN: 'X-Payment-Token',

  // Response headers (402)
  RECIPIENT: 'X-Payment-Recipient',
  AMOUNT: 'X-Payment-Amount',
  TOKEN: 'X-Payment-Asset',
  CHAIN_ID: 'X-Payment-Chain',
  NONCE: 'X-Payment-Nonce',
  EXPIRY: 'X-Payment-Expiry',
  DESCRIPTION: 'X-Payment-Description',
  VERSION: 'X-Payment-Version',
} as const

/**
 * Known token addresses by chain
 */
export const KNOWN_TOKENS: Record<number, Record<string, Address>> = {
  // Monmouth L2 (7750)
  7750: {
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // Placeholder
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // Placeholder
    DAI: '0x6B175474E89094C44Da98b954EescdeCB5BE3d09', // Placeholder
  },
  // Ethereum Mainnet (1)
  1: {
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    DAI: '0x6B175474E89094C44Da98b954EedfcDeCB5BE3d09',
  },
  // Sepolia (11155111)
  11155111: {
    USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  },
}

/**
 * Get token address from symbol
 */
export function getTokenAddress(token: PaymentToken, chainId: number): Address {
  // If already an address, return it
  if (token.startsWith('0x')) {
    return token as Address
  }

  // Look up by symbol
  const chainTokens = KNOWN_TOKENS[chainId]
  if (!chainTokens) {
    throw new X402Error('UNSUPPORTED_TOKEN', `Unknown chain ID: ${chainId}`)
  }

  const address = chainTokens[token]
  if (!address) {
    throw new X402Error('UNSUPPORTED_TOKEN', `Unknown token ${token} on chain ${chainId}`)
  }

  return address
}

/**
 * Check if token represents native ETH
 */
export function isNativeToken(token: PaymentToken): boolean {
  return token === 'ETH' || token === '0x0000000000000000000000000000000000000000'
}

/**
 * Parse payment requirements from 402 response headers
 */
export function parsePaymentRequired(headers: Headers): PaymentRequired {
  const recipient = headers.get(X402_HEADERS.RECIPIENT)
  const amountStr = headers.get(X402_HEADERS.AMOUNT)
  const token = headers.get(X402_HEADERS.TOKEN) || 'ETH'
  const chainIdStr = headers.get(X402_HEADERS.CHAIN_ID)
  const nonce = headers.get(X402_HEADERS.NONCE)
  const expiryStr = headers.get(X402_HEADERS.EXPIRY)
  const description = headers.get(X402_HEADERS.DESCRIPTION) || undefined
  const version = headers.get(X402_HEADERS.VERSION) || undefined

  // Validate required fields
  if (!recipient) {
    throw new X402Error('INVALID_PAYMENT_REQUIRED', 'Missing X-Payment-Recipient header')
  }
  if (!amountStr) {
    throw new X402Error('INVALID_PAYMENT_REQUIRED', 'Missing X-Payment-Amount header')
  }
  if (!chainIdStr) {
    throw new X402Error('INVALID_PAYMENT_REQUIRED', 'Missing X-Payment-Chain header')
  }
  if (!nonce) {
    throw new X402Error('INVALID_PAYMENT_REQUIRED', 'Missing X-Payment-Nonce header')
  }
  if (!expiryStr) {
    throw new X402Error('INVALID_PAYMENT_REQUIRED', 'Missing X-Payment-Expiry header')
  }

  // Parse values
  const amount = BigInt(amountStr)
  const chainId = parseInt(chainIdStr, 10)
  const expiry = parseInt(expiryStr, 10)

  // Validate expiry
  if (expiry < Math.floor(Date.now() / 1000)) {
    throw new X402Error('PAYMENT_EXPIRED', 'Payment requirements have expired')
  }

  return {
    recipient: recipient as Address,
    amount,
    token: token as PaymentToken,
    chainId,
    nonce,
    expiry,
    description,
    version,
  }
}

/**
 * Serialize payment payload for X-Payment header
 */
export function serializePaymentHeader(payload: PaymentPayload): string {
  const data = {
    r: payload.paymentRequired.recipient,
    a: payload.paymentRequired.amount.toString(),
    t: payload.paymentRequired.token,
    c: payload.paymentRequired.chainId,
    n: payload.paymentRequired.nonce,
    e: payload.paymentRequired.expiry,
    s: payload.signature,
    p: payload.payer,
  }
  return Buffer.from(JSON.stringify(data)).toString('base64')
}

/**
 * Deserialize payment payload from X-Payment header
 */
export function deserializePaymentHeader(header: string): PaymentPayload {
  try {
    const json = Buffer.from(header, 'base64').toString('utf-8')
    const data = JSON.parse(json)

    return {
      paymentRequired: {
        recipient: data.r as Address,
        amount: BigInt(data.a),
        token: data.t as PaymentToken,
        chainId: data.c,
        nonce: data.n,
        expiry: data.e,
      },
      signature: data.s as Hex,
      payer: data.p as Address,
      createdAt: Date.now(),
    }
  } catch {
    throw new X402Error('INVALID_PAYMENT_REQUIRED', 'Invalid X-Payment header format')
  }
}
