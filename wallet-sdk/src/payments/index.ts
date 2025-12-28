/**
 * Payments module - x402 protocol integration
 */

// X402 Client
export { X402Client, createX402Client } from './X402Client'

// Types
export {
  X402Error,
  X402_HEADERS,
  X402_PAYMENT_TYPES,
  KNOWN_TOKENS,
  parsePaymentRequired,
  serializePaymentHeader,
  deserializePaymentHeader,
  getTokenAddress,
  isNativeToken,
} from './types'

export type {
  PaymentToken,
  PaymentRequired,
  PaymentPayload,
  PaymentReceipt,
  X402ErrorCode,
  X402ClientConfig,
  X402FetchResult,
  X402PaymentDomain,
} from './types'
