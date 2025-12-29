/**
 * Commerce module - Escrow and agent-to-agent transactions
 */

// Escrow Client
export { EscrowClient, createEscrowClient } from './EscrowClient'

// Types and utilities
export {
  EscrowError,
  generateEscrowId,
  isEscrowActive,
  isEscrowExpired,
  getAvailableActions,
} from './types'

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
} from './types'
