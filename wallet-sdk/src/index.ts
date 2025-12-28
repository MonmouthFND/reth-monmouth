/**
 * Monmouth Wallet SDK
 *
 * Agent-aware wallet layer built on Porto (EIP-7702)
 *
 * Features:
 * - Agent identity management
 * - Spending guardrails (per-transaction, daily limits, allowlists)
 * - Session management
 * - Activity logging with localStorage persistence
 * - Memory client for ExEx integration (stub)
 * - x402 payment protocol (Phase 3)
 *
 * @example
 * ```typescript
 * import { createMonmouthWallet, PermissionTemplates } from '@monmouth/wallet-sdk'
 *
 * const wallet = createMonmouthWallet({
 *   identity: {
 *     agentId: 'my-research-agent',
 *     agentType: 'research',
 *     name: 'Research Assistant',
 *   },
 *   policy: {
 *     maxPerTransaction: 0.05 ETH, // Custom override
 *   },
 * })
 *
 * // Validate before sending
 * const result = wallet.prepareTransaction({
 *   to: '0x...',
 *   value: parseEther('0.01'),
 * })
 *
 * if (result.allowed) {
 *   // Use wagmi to send the transaction
 *   const hash = await sendTransaction(...)
 *   wallet.recordTransaction(hash, parseEther('0.01'))
 * }
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

// Payments (x402)
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
} from './payments'

// Core Types
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
