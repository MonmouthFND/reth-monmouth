/**
 * Universal Escrow Interface
 *
 * Chain-agnostic escrow operations for trustless agent-to-agent commerce.
 * Implementations vary by chain (Solidity for EVM, Anchor for Solana).
 */

import type { ChainAdapter } from './adapter'
import type {
  ChainType,
  TokenAmount,
  TxResult,
  UniversalAddress,
} from './types'

/** Escrow status */
export type EscrowStatus =
  | 'locked'
  | 'released'
  | 'refunded'
  | 'disputed'
  | 'resolved'
  | 'expired'

/** Escrow identifier */
export interface EscrowId {
  /** Chain type */
  chainType: ChainType
  /** Raw identifier (contract address + id for EVM, PDA for Solana) */
  raw: Uint8Array
  /** Display string */
  display: string
}

/** Parameters for creating an escrow */
export interface CreateEscrowParams {
  /** Address depositing funds */
  depositor: UniversalAddress
  /** Address receiving funds on release */
  recipient: UniversalAddress
  /** Optional arbiter for disputes */
  arbiter?: UniversalAddress
  /** Amount to escrow */
  amount: TokenAmount
  /** Expiry timestamp (unix ms) */
  expiresAt: number
  /** Optional metadata (IPFS hash, service ID, etc.) */
  metadata?: Uint8Array
  /** Optional service ID for linking */
  serviceId?: string
}

/** Escrow state */
export interface EscrowState {
  /** Escrow identifier */
  id: EscrowId
  /** Current status */
  status: EscrowStatus
  /** Creation parameters */
  params: CreateEscrowParams
  /** Creation timestamp */
  createdAt: number
  /** Resolution timestamp (if resolved) */
  resolvedAt?: number
  /** Resolution details */
  resolution?: {
    /** Who received the funds */
    recipient: 'depositor' | 'recipient' | 'split'
    /** Amount to depositor (if split) */
    depositorAmount?: bigint
    /** Amount to recipient (if split) */
    recipientAmount?: bigint
  }
}

/** Dispute details */
export interface DisputeDetails {
  /** Escrow ID */
  escrowId: EscrowId
  /** Who raised the dispute */
  raisedBy: UniversalAddress
  /** Reason for dispute */
  reason: string
  /** Evidence (IPFS hashes, etc.) */
  evidence?: string[]
  /** Timestamp */
  raisedAt: number
}

/** Escrow adapter events */
export type EscrowEvent =
  | { type: 'escrow_created'; escrow: EscrowState }
  | { type: 'escrow_released'; escrow: EscrowState }
  | { type: 'escrow_refunded'; escrow: EscrowState }
  | { type: 'escrow_disputed'; escrow: EscrowState; dispute: DisputeDetails }
  | { type: 'escrow_resolved'; escrow: EscrowState }
  | { type: 'escrow_expired'; escrow: EscrowState }

export type EscrowEventListener = (event: EscrowEvent) => void

/** Universal escrow adapter interface */
export interface EscrowAdapter {
  /** Underlying chain adapter */
  readonly chainAdapter: ChainAdapter

  /** Create a new escrow */
  create(params: CreateEscrowParams): Promise<{ id: EscrowId; tx: TxResult }>

  /** Release funds to recipient */
  release(id: EscrowId): Promise<TxResult>

  /** Refund funds to depositor */
  refund(id: EscrowId): Promise<TxResult>

  /** Raise a dispute (requires arbiter) */
  dispute(id: EscrowId, reason: string, evidence?: string[]): Promise<TxResult>

  /** Resolve a dispute (arbiter only) */
  resolveDispute(
    id: EscrowId,
    resolution: 'depositor' | 'recipient' | { depositorAmount: bigint; recipientAmount: bigint }
  ): Promise<TxResult>

  /** Get escrow state */
  getState(id: EscrowId): Promise<EscrowState | null>

  /** List escrows for an address (as depositor or recipient) */
  listEscrows(
    address: UniversalAddress,
    options?: {
      role?: 'depositor' | 'recipient' | 'arbiter'
      status?: EscrowStatus[]
      limit?: number
      offset?: number
    }
  ): Promise<EscrowState[]>

  /** Check if escrow is expired */
  isExpired(id: EscrowId): Promise<boolean>

  /** Subscribe to escrow events */
  on(listener: EscrowEventListener): () => void

  /** Unsubscribe from escrow events */
  off(listener: EscrowEventListener): void
}

/** Factory for creating escrow adapters */
export type EscrowAdapterFactory = (chainAdapter: ChainAdapter) => EscrowAdapter

/** Generate an escrow ID display string */
export function formatEscrowId(id: EscrowId): string {
  return `escrow:${id.chainType}:${id.display}`
}

/** Parse an escrow ID from display string */
export function parseEscrowId(display: string, raw: Uint8Array): EscrowId {
  const parts = display.split(':')
  if (parts.length !== 3 || parts[0] !== 'escrow') {
    throw new Error(`Invalid escrow ID format: ${display}`)
  }
  return {
    chainType: parts[1] as ChainType,
    raw,
    display: parts[2],
  }
}
