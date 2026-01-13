/**
 * Identity module - Agent DID and verification
 */

// Agent Identity Manager
export { AgentIdentityManager, createAgentIdentity } from './AgentIdentity'

// Types
export {
  IdentityError,
  IDENTITY_SIGNATURE_TYPES,
  MULTIBASE_BASE58BTC_PREFIX,
  MULTICODEC_SECP256K1_PREFIX,
} from './types'

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
} from './types'
