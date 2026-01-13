/**
 * Payments module - x402 protocol and payment routing
 */

// X402 Clients
export { X402Client, createX402Client } from './X402Client'
export {
  SolanaX402Client,
  createSolanaX402Client,
  SolanaX402Error,
  SOLANA_X402_HEADERS,
  solToLamports,
  lamportsToSol,
  formatLamports,
} from './SolanaX402Client'

// Payment Router
export { PaymentRouter, createPaymentRouter } from './PaymentRouter'

// Types (EVM)
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

// Types (Solana)
export type {
  SolanaX402ClientConfig,
  SolanaWalletAdapter,
  SolanaPaymentRequired,
  SolanaPaymentPayload,
  SolanaPaymentReceipt,
  SolanaX402FetchResult,
} from './SolanaX402Client'

// Payment Router
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
