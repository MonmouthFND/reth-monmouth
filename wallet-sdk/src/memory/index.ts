/**
 * Memory module - Activity logging and ExEx integration
 */

// Activity Log
export {
  ActivityLog,
  createActivityLog,
  getActivityLog,
  createIndexedDBActivityLog,
  getIndexedDBActivityLog,
} from './ActivityLog'
export type { StorageMode, ActivityLogOptions } from './ActivityLog'

// Activity Database (IndexedDB)
export {
  ActivityDatabase,
  createActivityDatabase,
  getActivityDatabase,
} from './ActivityDatabase'
export type { ActivityRecord, TimeRangeOptions, ActivityExport } from './ActivityDatabase'

// Migration utilities
export {
  migrateToIndexedDB,
  isMigrationComplete,
  hasLocalStorageData,
  getLocalStorageEntryCount,
  rollbackMigration,
  cleanupOldBackups,
  getBackupInfo,
  clearMigrationStatus,
  deleteBackup,
  autoMigrate,
} from './migration'
export type { MigrationResult } from './migration'

// Memory Client (ExEx integration)
export { MemoryClient, createMemoryClient } from './MemoryClient'
export type { MemoryClientConfig, SearchRequest, SearchResult, ConnectionState } from './MemoryClient'

// gRPC Client (for direct access if needed)
export {
  GrpcWebClient,
  MemoryServiceClient,
  toMemoryActivity,
  fromMemoryActivity,
} from './grpc'
export type {
  GrpcRequestOptions,
  GrpcResponse,
  MemorySyncRequest,
  MemorySyncResponse,
  MemoryActivity,
  MemoryConflict,
  MemorySearchRequest,
  MemorySearchResponse,
  MemorySearchResult,
  MemoryHealthResponse,
} from './grpc'

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
