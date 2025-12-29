/**
 * Payments module - x402 protocol and payment routing
 */

// X402 Client
export { X402Client, createX402Client } from './X402Client'

// Payment Router
export { PaymentRouter, createPaymentRouter } from './PaymentRouter'

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

export type {
  PaymentProtocol,
  PaymentPurpose,
  PaymentRequest,
  PaymentResult,
  ProtocolDetection,
  PaymentRouterConfig,
  PaymentRouterEvent,
  PaymentRouterEventListener,
} from './PaymentRouter'
