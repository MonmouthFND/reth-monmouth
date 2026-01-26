/**
 * Memory Layer Types
 *
 * Type definitions for the activity logging and memory system.
 * Supports both local storage and remote ExEx integration.
 */

import type { Address, Hash, Hex } from 'viem'

// ============= Activity Log Types =============

/**
 * Types of actions that can be logged
 */
export type ActivityActionType = 'transaction' | 'signature' | 'decision' | 'error'

/**
 * Sync status for offline-first architecture
 */
export type SyncStatus = 'pending' | 'synced' | 'conflict'

/**
 * Base activity log entry
 */
export interface ActivityLogEntry {
  /** Unique identifier for this entry */
  id?: number
  /** Agent that performed this action */
  agentId: string
  /** Type of action */
  actionType: ActivityActionType
  /** Transaction hash if applicable */
  txHash?: Hash
  /** When this action occurred */
  timestamp: number
  /** Action-specific data */
  data: unknown
  /** Sync status for ExEx integration */
  syncStatus?: SyncStatus
  /** Version for conflict resolution */
  version?: number
}

// ============= Specific Activity Types =============

/**
 * Transaction activity data
 */
export interface TransactionActivityData {
  from: Address
  to?: Address
  value: string // bigint as string for serialization
  gasUsed?: string
  success: boolean
  /** Human-readable intent description */
  intent?: string
  /** Protocol name (e.g., "uniswap-v3") */
  protocol?: string
  /** Function selector called */
  functionSelector?: Hex
  /** Block number */
  blockNumber?: number
}

/**
 * Signature activity data
 */
export interface SignatureActivityData {
  /** Type of signature */
  messageType: 'eip712' | 'personal_sign' | 'eip7702_authorization'
  /** Domain that requested the signature */
  domain?: string
  /** Purpose of the signature */
  purpose: string
  /** Whether the signature was approved */
  approved: boolean
  /** Whether a session key was used */
  sessionKeyUsed?: boolean
}

/**
 * Decision activity data (guardrail checks, routing decisions)
 */
export interface DecisionActivityData {
  /** Type of decision */
  decisionType: 'policy_check' | 'route_selection' | 'gas_strategy' | 'approval_request'
  /** Context of the decision */
  context: string
  /** Outcome of the decision */
  outcome: 'approved' | 'rejected' | 'modified'
  /** Reasoning for the decision */
  reasoning?: string
  /** Which guardrail was triggered (if any) */
  guardrailTriggered?: string
}

/**
 * Error activity data
 */
export interface ErrorActivityData {
  /** Type of error */
  errorType: 'transaction_failed' | 'signature_rejected' | 'policy_violation' | 'network_error' | 'unknown'
  /** Error message */
  errorMessage: string
  /** Context when error occurred */
  context: string
  /** Whether recovery was attempted */
  recoveryAttempted?: boolean
  /** Stack trace (sanitized) */
  stack?: string
}

// ============= Memory System Types =============

/**
 * Episodic memory - specific experiences
 */
export interface EpisodicMemory {
  id?: number
  agentId: string
  /** Type of episode */
  episodeType: 'successful_swap' | 'failed_transaction' | 'bridge_operation' | 'approval' | 'other'
  timestamp: number
  /** Episode context */
  context: {
    protocol?: string
    amount?: string
    outcome: 'success' | 'failure'
    gasUsed?: string
    errorMessage?: string
  }
  /** Vector embedding for semantic search (optional, for future RAG) */
  embedding?: number[]
}

/**
 * Semantic memory - learned facts and preferences
 */
export interface SemanticMemory {
  id?: number
  agentId: string
  /** Type of fact */
  factType: 'preferred_protocol' | 'gas_strategy' | 'risk_tolerance' | 'time_preference' | 'custom'
  /** Confidence in this fact (0-1) */
  confidence: number
  /** How many episodes support this fact */
  evidenceCount: number
  /** The learned value */
  value: unknown
  /** When this was last updated */
  lastUpdated: number
}

// ============= Query Types =============

/**
 * Options for querying activity history
 */
export interface ActivityQueryOptions {
  /** Filter by agent ID */
  agentId?: string
  /** Filter by action type */
  actionType?: ActivityActionType
  /** Filter by time range */
  startTime?: number
  endTime?: number
  /** Limit number of results */
  limit?: number
  /** Offset for pagination */
  offset?: number
  /** Sort order */
  order?: 'asc' | 'desc'
}

// ============= Sync Types =============

/**
 * Sync request to ExEx memory service
 */
export interface SyncRequest {
  activities: ActivityLogEntry[]
  lastSyncToken?: string
}

/**
 * Sync response from ExEx memory service
 */
export interface SyncResponse {
  syncToken: string
  conflicts: SyncConflict[]
  syncedCount: number
}

/**
 * Conflict between local and remote versions
 */
export interface SyncConflict {
  localId: number
  remoteVersion: ActivityLogEntry
  reason: string
}

// ============= Storage Types =============

/**
 * Storage adapter interface for pluggable backends
 */
export interface StorageAdapter {
  /** Store an activity entry */
  put(entry: ActivityLogEntry): Promise<number>
  /** Get an entry by ID */
  get(id: number): Promise<ActivityLogEntry | undefined>
  /** Get entries matching query */
  query(options: ActivityQueryOptions): Promise<ActivityLogEntry[]>
  /** Delete an entry */
  delete(id: number): Promise<void>
  /** Clear all entries for an agent */
  clearAgent(agentId: string): Promise<void>
  /** Clear all entries */
  clearAll(): Promise<void>
  /** Export all entries */
  exportAll(): Promise<ActivityLogEntry[]>
  /** Get count of entries */
  count(agentId?: string): Promise<number>
}

// ============= Event Types =============

/**
 * Events emitted by the memory system
 */
export type MemoryEvent =
  | { type: 'activity_logged'; entry: ActivityLogEntry }
  | { type: 'sync_started' }
  | { type: 'sync_completed'; syncedCount: number }
  | { type: 'sync_failed'; error: string }
  | { type: 'conflict_detected'; conflict: SyncConflict }
  | { type: 'storage_cleared'; agentId?: string }

export type MemoryEventListener = (event: MemoryEvent) => void
