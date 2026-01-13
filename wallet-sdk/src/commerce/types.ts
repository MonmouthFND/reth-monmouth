/**
 * Commerce Types - Escrow and agent-to-agent transactions
 *
 * Types for escrow-based commerce between agents.
 * Supports the Circle Refund Protocol pattern.
 */

import type { Address, Hex } from 'viem'
import type { PaymentToken } from '../payments/types'

/**
 * Unique escrow identifier
 */
export type EscrowId = `escrow_${string}`

/**
 * Escrow states
 */
export type EscrowState =
  | 'pending'     // Created but not yet funded
  | 'locked'      // Funds locked in escrow
  | 'released'    // Funds released to recipient
  | 'refunded'    // Funds returned to payer
  | 'disputed'    // Dispute initiated
  | 'resolved'    // Dispute resolved
  | 'expired'     // Escrow expired without action

/**
 * Parameters for creating an escrow
 */
export interface CreateEscrowParams {
  /** Recipient address */
  recipient: Address
  /** Amount to escrow */
  amount: bigint
  /** Token to use (default: ETH) */
  token?: PaymentToken
  /** Description of the service/goods */
  description: string
  /** Escrow duration in seconds */
  durationSeconds: number
  /** Optional: Service ID for tracking */
  serviceId?: string
  /** Optional: Arbiter address for disputes */
  arbiter?: Address
  /** Optional: Additional metadata */
  metadata?: Record<string, unknown>
}

/**
 * Escrow record
 */
export interface EscrowRecord {
  /** Unique escrow ID */
  id: EscrowId
  /** Payer (creator) address */
  payer: Address
  /** Recipient address */
  recipient: Address
  /** Escrowed amount */
  amount: bigint
  /** Token type */
  token: PaymentToken
  /** Description */
  description: string
  /** Current state */
  state: EscrowState
  /** Creation timestamp */
  createdAt: number
  /** Expiry timestamp */
  expiresAt: number
  /** Release timestamp (if released) */
  releasedAt?: number
  /** Refund timestamp (if refunded) */
  refundedAt?: number
  /** Transaction hash for state changes */
  txHash?: Hex
  /** Service ID */
  serviceId?: string
  /** Arbiter address */
  arbiter?: Address
  /** Dispute reason (if disputed) */
  disputeReason?: string
  /** Resolution details (if resolved) */
  resolution?: {
    winner: 'payer' | 'recipient'
    amount: bigint
    reason: string
  }
}

/**
 * Result of escrow operation
 */
export interface EscrowResult {
  /** Whether operation succeeded */
  success: boolean
  /** Escrow ID */
  escrowId: EscrowId
  /** Transaction hash */
  txHash?: Hex
  /** Error message if failed */
  error?: string
  /** Updated escrow record */
  escrow?: EscrowRecord
}

/**
 * Escrow status query result
 */
export interface EscrowStatus {
  /** The escrow record */
  escrow: EscrowRecord
  /** Time remaining until expiry (ms) */
  timeRemaining: number
  /** Whether escrow is active (can be released/refunded) */
  isActive: boolean
  /** Whether escrow has expired */
  isExpired: boolean
  /** Available actions for current user */
  availableActions: ('release' | 'refund' | 'dispute')[]
}

/**
 * Dispute parameters
 */
export interface DisputeParams {
  /** Escrow ID */
  escrowId: EscrowId
  /** Reason for dispute */
  reason: string
  /** Evidence (optional) */
  evidence?: string
}

/**
 * Dispute resolution
 */
export interface DisputeResolution {
  /** Escrow ID */
  escrowId: EscrowId
  /** Winner of dispute */
  winner: 'payer' | 'recipient'
  /** Amount to award winner */
  amount: bigint
  /** Resolution reason */
  reason: string
  /** Arbiter who resolved */
  resolvedBy: Address
  /** Resolution timestamp */
  resolvedAt: number
}

/**
 * Configuration for EscrowClient
 */
export interface EscrowClientConfig {
  /** Escrow contract address (if using on-chain escrow) */
  contractAddress?: Address
  /** Default escrow duration in seconds */
  defaultDurationSeconds?: number
  /** Default arbiter address */
  defaultArbiter?: Address
  /** Chain ID */
  chainId?: number
}

/**
 * Escrow event types
 */
export type EscrowEvent =
  | { type: 'escrow_created'; escrow: EscrowRecord }
  | { type: 'escrow_funded'; escrowId: EscrowId; txHash: Hex }
  | { type: 'escrow_released'; escrowId: EscrowId; txHash: Hex }
  | { type: 'escrow_refunded'; escrowId: EscrowId; txHash: Hex }
  | { type: 'escrow_disputed'; escrowId: EscrowId; reason: string }
  | { type: 'escrow_resolved'; escrowId: EscrowId; resolution: DisputeResolution }
  | { type: 'escrow_expired'; escrowId: EscrowId }

/**
 * Escrow event listener
 */
export type EscrowEventListener = (event: EscrowEvent) => void

/**
 * Error codes for escrow operations
 */
export type EscrowErrorCode =
  | 'NOT_FOUND'           // Escrow doesn't exist
  | 'ALREADY_EXISTS'      // Escrow with this ID exists
  | 'INVALID_STATE'       // Operation not valid for current state
  | 'INSUFFICIENT_FUNDS'  // Not enough funds to create escrow
  | 'UNAUTHORIZED'        // Caller not authorized for operation
  | 'EXPIRED'             // Escrow has expired
  | 'DISPUTE_PENDING'     // Cannot perform action during dispute
  | 'CONTRACT_ERROR'      // Smart contract error

/**
 * Escrow error class
 */
export class EscrowError extends Error {
  constructor(
    public readonly code: EscrowErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'EscrowError'
  }
}

/**
 * Generate a unique escrow ID
 */
export function generateEscrowId(): EscrowId {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 10)
  return `escrow_${timestamp}_${random}` as EscrowId
}

/**
 * Check if an escrow is active (can be modified)
 */
export function isEscrowActive(escrow: EscrowRecord): boolean {
  return escrow.state === 'locked' && Date.now() < escrow.expiresAt
}

/**
 * Check if an escrow has expired
 */
export function isEscrowExpired(escrow: EscrowRecord): boolean {
  return Date.now() >= escrow.expiresAt && escrow.state === 'locked'
}

/**
 * Get available actions for an escrow
 */
export function getAvailableActions(
  escrow: EscrowRecord,
  userAddress: Address
): ('release' | 'refund' | 'dispute')[] {
  const actions: ('release' | 'refund' | 'dispute')[] = []

  if (escrow.state !== 'locked') {
    return actions
  }

  if (Date.now() >= escrow.expiresAt) {
    // Expired - only payer can refund
    if (userAddress.toLowerCase() === escrow.payer.toLowerCase()) {
      actions.push('refund')
    }
    return actions
  }

  // Active escrow
  if (userAddress.toLowerCase() === escrow.payer.toLowerCase()) {
    actions.push('release', 'dispute')
  }

  if (userAddress.toLowerCase() === escrow.recipient.toLowerCase()) {
    actions.push('dispute')
  }

  return actions
}
