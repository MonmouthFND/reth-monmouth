/**
 * Memory module - Activity logging and ExEx integration
 */

// Activity Log
export { ActivityLog, createActivityLog, getActivityLog } from './ActivityLog'

// Memory Client (ExEx stub)
export { MemoryClient, createMemoryClient } from './MemoryClient'
export type { MemoryClientConfig, SearchRequest, SearchResult, ConnectionState } from './MemoryClient'

// Types
export type {
  ActivityActionType,
  SyncStatus,
  ActivityLogEntry,
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
  StorageAdapter,
  MemoryEvent,
  MemoryEventListener,
} from './types'
