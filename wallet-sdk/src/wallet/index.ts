/**
 * Wallet module - Multi-chain agent wallet
 */

export {
  AgentWallet,
  createAgentWallet,
  DEFAULT_POLICIES,
} from './AgentWallet'

export type {
  AgentIdentity,
  AgentIdentityConfig,
  AgentType,
  AgentWalletConfig,
  PolicyValidationResult,
  SpendingPolicy,
  TransactionIntent,
  WalletEvent,
  WalletEventListener,
  WalletState,
} from './AgentWallet'

export {
  AgentIdentityManager,
  createAgentIdentityManager,
} from './AgentIdentityManager'

export type {
  AgentCapability,
  DID,
  IdentityDocument,
  IdentityEvent,
  IdentityEventListener,
  IdentityManagerConfig,
  SignedIdentity,
  VerificationResult,
} from './AgentIdentityManager'
