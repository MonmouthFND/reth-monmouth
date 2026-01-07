/**
 * Monmouth Wallet SDK
 *
 * Agent-aware wallet layer built on Porto (EIP-7702)
 *
 * Features:
 * - Agent identity management with DID support
 * - Spending guardrails (per-transaction, daily limits, allowlists)
 * - Session management
 * - Activity logging with localStorage persistence
 * - Memory client for ExEx integration (stub)
 * - x402 payment protocol for API payments
 * - Payment routing (x402, direct, escrow)
 * - Escrow-based commerce for agent-to-agent transactions
 *
 * @example
 * ```typescript
 * import { createMonmouthWallet, PaymentRouter, createAgentIdentity } from '@monmouth/wallet-sdk'
 *
 * const wallet = createMonmouthWallet({
 *   identity: {
 *     agentId: 'my-commerce-agent',
 *     agentType: 'commerce',
 *     name: 'Shopping Agent',
 *   },
 * })
 *
 * // Initialize decentralized identity
 * const identity = createAgentIdentity(wallet)
 * await identity.initialize()
 *
 * // Create payment router for multi-protocol payments
 * const router = new PaymentRouter(wallet, { x402Client, escrowClient })
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
 * ```
 */

// Main wallet class
export { MonmouthWallet, createMonmouthWallet } from './MonmouthWallet'

// Guardrails
export {
  PolicyEnforcer,
  createEnforcer,
  PermissionTemplates,
  createPolicyFromTemplate,
  createMinimalPolicy,
  getDefaultSessionDuration,
  isPolicyActive,
  eth,
  HOUR,
  DAY,
} from './guardrails'
export type { PermissionTemplate } from './guardrails'

// Memory Layer
export {
  ActivityLog,
  createActivityLog,
  getActivityLog,
  MemoryClient,
  createMemoryClient,
} from './memory'
export type {
  ActivityLogEntry,
  ActivityActionType,
  MemoryClientConfig,
  SearchRequest,
  SearchResult,
  ConnectionState,
  SyncStatus,
  TransactionActivityData,
  SignatureActivityData,
  DecisionActivityData,
  ErrorActivityData,
  EpisodicMemory,
  SemanticMemory,
  ActivityQueryOptions,
  SyncRequest,
  SyncResponse,
  SyncConflict,
  MemoryEvent,
  MemoryEventListener,
} from './memory'

// Payments (x402 + Router)
export {
  X402Client,
  createX402Client,
  X402Error,
  X402_HEADERS,
  X402_PAYMENT_TYPES,
  KNOWN_TOKENS,
  parsePaymentRequired,
  serializePaymentHeader,
  deserializePaymentHeader,
  getTokenAddress,
  isNativeToken,
  PaymentRouter,
  createPaymentRouter,
} from './payments'
export type {
  PaymentToken,
  PaymentRequired,
  PaymentPayload,
  PaymentReceipt,
  X402ErrorCode,
  X402ClientConfig,
  X402FetchResult,
  X402PaymentDomain,
  PaymentProtocol,
  PaymentPurpose,
  PaymentRequest,
  PaymentResult,
  ProtocolDetection,
  PaymentRouterConfig,
  PaymentRouterEvent,
  PaymentRouterEventListener,
} from './payments'

// Identity (DID)
export {
  AgentIdentityManager,
  createAgentIdentity,
  IdentityError,
  IDENTITY_SIGNATURE_TYPES,
} from './identity'
export type {
  DID,
  AgentCapability,
  IdentityDocument,
  SignedIdentity,
  VerificationResult,
  AgentIdentityConfig,
  IdentityEvent,
  IdentityEventListener,
  IdentityErrorCode,
  IdentitySignatureDomain,
} from './identity'

// Commerce (Escrow)
export {
  EscrowClient,
  createEscrowClient,
  EscrowError,
  generateEscrowId,
  isEscrowActive,
  isEscrowExpired,
  getAvailableActions,
} from './commerce'
export type {
  EscrowId,
  EscrowState,
  CreateEscrowParams,
  EscrowRecord,
  EscrowResult,
  EscrowStatus,
  DisputeParams,
  DisputeResolution,
  EscrowClientConfig,
  EscrowEvent,
  EscrowEventListener,
  EscrowErrorCode,
} from './commerce'

// Core Types (legacy EVM-specific)
export type {
  AgentIdentity,
  AgentType,
  SpendingPolicy,
  PolicyValidationResult,
  TransactionIntent,
  WalletState,
  MonmouthWalletConfig,
  WalletEvent,
  WalletEventListener,
  Address,
  Hash,
  Hex,
} from './types'

// ============================================================
// Multi-Chain Support (New)
// ============================================================

// Core - Universal types and interfaces
export {
  EVM_CHAINS,
  SVM_CHAINS,
  formatEscrowId,
  parseEscrowId,
  generateNonce,
  validateX402Request,
  X402_HEADERS as X402_UNIVERSAL_HEADERS,
  // Utilities
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
  isValidAddress as isValidUniversalAddress,
  parseAddress,
  parseTokenAmount,
} from './core'

export type {
  // Types
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
  // Adapter
  AdapterConfig,
  AdapterEvent,
  AdapterEventListener,
  AdapterFactory,
  ChainAdapter,
  ChainAdapterWithEvents,
  // Escrow
  CreateEscrowParams as UniversalCreateEscrowParams,
  DisputeDetails,
  EscrowAdapter,
  EscrowAdapterFactory,
  EscrowEvent as UniversalEscrowEvent,
  EscrowEventListener as UniversalEscrowEventListener,
  EscrowId as UniversalEscrowId,
  EscrowState as UniversalEscrowState,
  EscrowStatus as UniversalEscrowStatus,
  // x402
  X402Adapter,
  X402AdapterFactory,
  X402Event as UniversalX402Event,
  X402EventListener as UniversalX402EventListener,
  X402Payment as UniversalX402Payment,
  X402PaymentRequest as UniversalX402PaymentRequest,
  X402PaymentResult as UniversalX402PaymentResult,
  X402ValidationOptions,
} from './core'

// Chain Adapters
export {
  EvmAdapter,
  createEvmAdapter,
  SolanaAdapter,
  createSolanaAdapter,
} from './adapters'

export type {
  EvmAdapterConfig,
  SolanaAdapterConfig,
  SolanaWalletAdapter,
} from './adapters'

// Multi-chain Agent Wallet
export {
  AgentWallet,
  createAgentWallet,
  DEFAULT_POLICIES,
  AgentIdentityManager as MultiChainIdentityManager,
  createAgentIdentityManager,
} from './wallet'

export type {
  AgentIdentity as MultiChainAgentIdentity,
  AgentIdentityConfig as MultiChainAgentIdentityConfig,
  AgentType as MultiChainAgentType,
  AgentWalletConfig,
  PolicyValidationResult as MultiChainPolicyValidationResult,
  SpendingPolicy as MultiChainSpendingPolicy,
  TransactionIntent as MultiChainTransactionIntent,
  WalletEvent as MultiChainWalletEvent,
  WalletEventListener as MultiChainWalletEventListener,
  WalletState as MultiChainWalletState,
  // Identity
  AgentCapability as MultiChainAgentCapability,
  DID as MultiChainDID,
  IdentityDocument as MultiChainIdentityDocument,
  IdentityEvent as MultiChainIdentityEvent,
  IdentityEventListener as MultiChainIdentityEventListener,
  IdentityManagerConfig,
  SignedIdentity as MultiChainSignedIdentity,
  VerificationResult as MultiChainVerificationResult,
} from './wallet'
