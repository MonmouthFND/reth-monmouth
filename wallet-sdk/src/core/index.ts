/**
 * Core module - Universal types and utilities for multi-chain support
 */

// Types
export type {
  ChainConfig,
  ChainType,
  TokenAmount,
  TokenId,
  TxHash,
  TxReceipt,
  TxResult,
  TypedDataDomain,
  TypedDataTypes,
  UniversalAddress,
  UniversalLog,
  UniversalSignature,
  UniversalTransaction,
} from './types'

export { EVM_CHAINS, SVM_CHAINS } from './types'

// Adapter interface
export type {
  AdapterConfig,
  AdapterEvent,
  AdapterEventListener,
  AdapterFactory,
  ChainAdapter,
  ChainAdapterWithEvents,
} from './adapter'

// Escrow interface
export type {
  CreateEscrowParams,
  DisputeDetails,
  EscrowAdapter,
  EscrowAdapterFactory,
  EscrowEvent,
  EscrowEventListener,
  EscrowId,
  EscrowState,
  EscrowStatus,
} from './escrow'

export { formatEscrowId, parseEscrowId } from './escrow'

// x402 interface
export type {
  X402Adapter,
  X402AdapterFactory,
  X402Event,
  X402EventListener,
  X402Payment,
  X402PaymentRequest,
  X402PaymentResult,
  X402ValidationOptions,
} from './x402'

export { generateNonce, validateX402Request, X402_HEADERS } from './x402'

// Utilities
export {
  addressEquals,
  base58ToBytes,
  bigIntReplacer,
  bigIntReviver,
  bytesToBase58,
  bytesToHex,
  createAddress,
  createNativeToken,
  createTokenAmount,
  formatTokenAmount,
  getFunctionSelector,
  hexToBytes,
  isContractDeployment,
  isValidAddress,
  parseAddress,
  parseTokenAmount,
} from './utils'
