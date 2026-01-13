/**
 * ActivityLog - Local activity tracking for agent wallets
 *
 * Provides persistent activity logging with:
 * - localStorage persistence (default, with IndexedDB-ready structure)
 * - IndexedDB persistence (optional, for larger datasets)
 * - Query and filtering capabilities
 * - Export/import functionality
 * - Sync status tracking for ExEx integration
 * - Automatic migration from localStorage to IndexedDB
 */

import type {
  ActivityLogEntry,
  ActivityQueryOptions,
  MemoryEvent,
  MemoryEventListener,
  SyncStatus,
} from './types'
import { ActivityDatabase, getActivityDatabase } from './ActivityDatabase'
import { autoMigrate, isMigrationComplete } from './migration'

/**
 * Storage mode for ActivityLog
 */
export type StorageMode = 'localStorage' | 'indexedDB'

/**
 * Options for creating an ActivityLog instance
 */
export interface ActivityLogOptions {
  /** Enable auto-save (default: true) */
  autoSave?: boolean
  /** Storage mode (default: 'localStorage' for backward compatibility) */
  storageMode?: StorageMode
  /** Custom database instance for IndexedDB mode */
  database?: ActivityDatabase
  /** Automatically migrate from localStorage to IndexedDB on first use (default: true) */
  autoMigrate?: boolean
}

// Storage key prefix
const STORAGE_KEY = 'monmouth_activity_log'

// JSON serialization helpers for BigInt (if any in data)
function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return { __type: 'bigint', value: value.toString() }
  }
  return value
}

function jsonReviver(_key: string, value: unknown): unknown {
  if (
    value &&
    typeof value === 'object' &&
    '__type' in value &&
    (value as Record<string, unknown>).__type === 'bigint'
  ) {
    return BigInt((value as Record<string, string>).value)
  }
  return value
}

/**
 * ActivityLog class for tracking agent wallet activities
 */
export class ActivityLog {
  private entries: ActivityLogEntry[] = []
  private nextId: number = 1
  private listeners: Set<MemoryEventListener> = new Set()
  private autoSave: boolean
  private storageMode: StorageMode
  private database: ActivityDatabase | null = null
  private migrationPromise: Promise<void> | null = null
  private _initialized: boolean = false

  constructor(options: ActivityLogOptions | { autoSave?: boolean } = {}) {
    const opts = options as ActivityLogOptions
    this.autoSave = opts.autoSave ?? true
    this.storageMode = opts.storageMode ?? 'localStorage'

    if (this.storageMode === 'indexedDB') {
      this.database = opts.database ?? getActivityDatabase()

      // Handle auto-migration if enabled
      if (opts.autoMigrate !== false) {
        this.migrationPromise = this.initializeWithMigration()
      } else {
        this._initialized = true
      }
    } else {
      this.load()
      this._initialized = true
    }
  }

  /**
   * Initialize with automatic migration from localStorage
   */
  private async initializeWithMigration(): Promise<void> {
    try {
      // Check if migration is needed
      if (!isMigrationComplete()) {
        await autoMigrate(this.database ?? undefined)
      }
      this._initialized = true
    } catch (error) {
      console.error('Failed to initialize ActivityLog with migration:', error)
      this._initialized = true
    }
  }

  /**
   * Check if the log is initialized
   */
  get isInitialized(): boolean {
    return this._initialized
  }

  /**
   * Wait for initialization to complete (for async operations)
   */
  async waitForReady(): Promise<void> {
    if (this.migrationPromise) {
      await this.migrationPromise
    }
  }

  /**
   * Check if using IndexedDB mode
   */
  isIndexedDBMode(): boolean {
    return this.storageMode === 'indexedDB'
  }

  /**
   * Get the underlying database (IndexedDB mode only)
   */
  getDatabase(): ActivityDatabase | null {
    return this.database
  }

  // ============= Core Methods =============

  /**
   * Log a new activity entry
   */
  log(entry: Omit<ActivityLogEntry, 'id' | 'timestamp' | 'syncStatus' | 'version'>): ActivityLogEntry {
    const fullEntry: ActivityLogEntry = {
      ...entry,
      id: this.nextId++,
      timestamp: Date.now(),
      syncStatus: 'pending',
      version: 1,
    }

    this.entries.push(fullEntry)

    if (this.autoSave) {
      this.save()
    }

    this.emit({ type: 'activity_logged', entry: fullEntry })

    return fullEntry
  }

  /**
   * Get activity history for an agent
   */
  getHistory(agentId: string, limit?: number): ActivityLogEntry[] {
    let results = this.entries
      .filter((e) => e.agentId === agentId)
      .sort((a, b) => b.timestamp - a.timestamp) // newest first

    if (limit !== undefined && limit > 0) {
      results = results.slice(0, limit)
    }

    return results
  }

  /**
   * Query activities with filters
   */
  query(options: ActivityQueryOptions = {}): ActivityLogEntry[] {
    let results = [...this.entries]

    // Filter by agent ID
    if (options.agentId) {
      results = results.filter((e) => e.agentId === options.agentId)
    }

    // Filter by action type
    if (options.actionType) {
      results = results.filter((e) => e.actionType === options.actionType)
    }

    // Filter by time range
    if (options.startTime !== undefined) {
      results = results.filter((e) => e.timestamp >= options.startTime!)
    }
    if (options.endTime !== undefined) {
      results = results.filter((e) => e.timestamp <= options.endTime!)
    }

    // Sort
    const order = options.order ?? 'desc'
    results.sort((a, b) =>
      order === 'desc' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp
    )

    // Pagination
    if (options.offset !== undefined && options.offset > 0) {
      results = results.slice(options.offset)
    }
    if (options.limit !== undefined && options.limit > 0) {
      results = results.slice(0, options.limit)
    }

    return results
  }

  /**
   * Get a single entry by ID
   */
  get(id: number): ActivityLogEntry | undefined {
    return this.entries.find((e) => e.id === id)
  }

  /**
   * Update an entry's sync status
   */
  updateSyncStatus(id: number, status: SyncStatus): boolean {
    const entry = this.entries.find((e) => e.id === id)
    if (!entry) return false

    entry.syncStatus = status
    if (status === 'synced') {
      entry.version = (entry.version ?? 1) + 1
    }

    if (this.autoSave) {
      this.save()
    }

    return true
  }

  /**
   * Get entries pending sync
   */
  getPendingSync(): ActivityLogEntry[] {
    return this.entries.filter((e) => e.syncStatus === 'pending')
  }

  /**
   * Get entries with conflicts
   */
  getConflicts(): ActivityLogEntry[] {
    return this.entries.filter((e) => e.syncStatus === 'conflict')
  }

  /**
   * Mark entries as synced
   */
  markSynced(ids: number[]): void {
    for (const id of ids) {
      this.updateSyncStatus(id, 'synced')
    }
  }

  // ============= Export/Import =============

  /**
   * Export all entries
   */
  export(): ActivityLogEntry[] {
    return [...this.entries]
  }

  /**
   * Export entries for a specific agent
   */
  exportAgent(agentId: string): ActivityLogEntry[] {
    return this.entries.filter((e) => e.agentId === agentId)
  }

  /**
   * Import entries (merges with existing, avoiding duplicates)
   */
  import(entries: ActivityLogEntry[]): number {
    let imported = 0

    for (const entry of entries) {
      // Check for duplicate by timestamp + agentId + actionType
      const exists = this.entries.some(
        (e) =>
          e.agentId === entry.agentId &&
          e.timestamp === entry.timestamp &&
          e.actionType === entry.actionType
      )

      if (!exists) {
        const newEntry = {
          ...entry,
          id: this.nextId++,
          syncStatus: entry.syncStatus ?? 'pending',
          version: entry.version ?? 1,
        }
        this.entries.push(newEntry)
        imported++
      }
    }

    if (imported > 0 && this.autoSave) {
      this.save()
    }

    return imported
  }

  // ============= Clear/Delete =============

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries = []
    this.nextId = 1

    if (this.autoSave) {
      this.save()
    }

    this.emit({ type: 'storage_cleared' })
  }

  /**
   * Clear entries for a specific agent
   */
  clearAgent(agentId: string): void {
    this.entries = this.entries.filter((e) => e.agentId !== agentId)

    if (this.autoSave) {
      this.save()
    }

    this.emit({ type: 'storage_cleared', agentId })
  }

  /**
   * Delete a specific entry
   */
  delete(id: number): boolean {
    const index = this.entries.findIndex((e) => e.id === id)
    if (index === -1) return false

    this.entries.splice(index, 1)

    if (this.autoSave) {
      this.save()
    }

    return true
  }

  /**
   * Delete entries older than a given age (for retention policy)
   */
  deleteOlderThan(maxAgeMs: number, options?: { agentId?: string; onlySynced?: boolean }): number {
    const cutoff = Date.now() - maxAgeMs
    const beforeCount = this.entries.length

    this.entries = this.entries.filter((e) => {
      // Keep if newer than cutoff
      if (e.timestamp >= cutoff) return true

      // Apply additional filters
      if (options?.agentId && e.agentId !== options.agentId) return true
      if (options?.onlySynced && e.syncStatus !== 'synced') return true

      return false
    })

    const deletedCount = beforeCount - this.entries.length

    if (deletedCount > 0 && this.autoSave) {
      this.save()
    }

    return deletedCount
  }

  // ============= Stats =============

  /**
   * Get count of entries
   */
  count(agentId?: string): number {
    if (agentId) {
      return this.entries.filter((e) => e.agentId === agentId).length
    }
    return this.entries.length
  }

  /**
   * Get stats for an agent
   */
  getStats(agentId: string): {
    total: number
    byActionType: Record<string, number>
    pending: number
    synced: number
    conflicts: number
    oldestTimestamp: number | null
    newestTimestamp: number | null
  } {
    const agentEntries = this.entries.filter((e) => e.agentId === agentId)

    const byActionType: Record<string, number> = {}
    let pending = 0
    let synced = 0
    let conflicts = 0
    let oldest: number | null = null
    let newest: number | null = null

    for (const entry of agentEntries) {
      // Count by action type
      byActionType[entry.actionType] = (byActionType[entry.actionType] ?? 0) + 1

      // Count by sync status
      if (entry.syncStatus === 'pending') pending++
      else if (entry.syncStatus === 'synced') synced++
      else if (entry.syncStatus === 'conflict') conflicts++

      // Track timestamps
      if (oldest === null || entry.timestamp < oldest) oldest = entry.timestamp
      if (newest === null || entry.timestamp > newest) newest = entry.timestamp
    }

    return {
      total: agentEntries.length,
      byActionType,
      pending,
      synced,
      conflicts,
      oldestTimestamp: oldest,
      newestTimestamp: newest,
    }
  }

  // ============= Async Methods (IndexedDB Mode) =============

  /**
   * Log a new activity entry (async version for IndexedDB)
   */
  async logAsync(
    entry: Omit<ActivityLogEntry, 'id' | 'timestamp' | 'syncStatus' | 'version'>
  ): Promise<ActivityLogEntry> {
    if (this.storageMode === 'localStorage' || !this.database) {
      return this.log(entry)
    }

    await this.waitForReady()

    const fullEntry: Omit<ActivityLogEntry, 'id'> = {
      ...entry,
      timestamp: Date.now(),
      syncStatus: 'pending',
      version: 1,
    }

    const id = await this.database.add(fullEntry)
    const result: ActivityLogEntry = { ...fullEntry, id }

    this.emit({ type: 'activity_logged', entry: result })

    return result
  }

  /**
   * Get activity history for an agent (async version for IndexedDB)
   */
  async getHistoryAsync(agentId: string, limit?: number): Promise<ActivityLogEntry[]> {
    if (this.storageMode === 'localStorage' || !this.database) {
      return this.getHistory(agentId, limit)
    }

    await this.waitForReady()
    return this.database.getByAgent(agentId, { limit, order: 'desc' })
  }

  /**
   * Query activities with filters (async version for IndexedDB)
   */
  async queryAsync(options: ActivityQueryOptions = {}): Promise<ActivityLogEntry[]> {
    if (this.storageMode === 'localStorage' || !this.database) {
      return this.query(options)
    }

    await this.waitForReady()

    // For IndexedDB, we need to build the query based on available indexes
    let results: ActivityLogEntry[]

    if (options.agentId && options.actionType) {
      results = await this.database.getByActionType(options.actionType, {
        agentId: options.agentId,
      })
    } else if (options.agentId) {
      results = await this.database.getByAgent(options.agentId)
    } else if (options.actionType) {
      results = await this.database.getByActionType(options.actionType)
    } else if (options.startTime !== undefined || options.endTime !== undefined) {
      results = await this.database.getByTimeRange({
        startTime: options.startTime,
        endTime: options.endTime,
      })
    } else {
      const exported = await this.database.exportJSON()
      results = exported.entries
    }

    // Apply time filters if not already applied
    if (options.startTime !== undefined && !options.agentId && !options.actionType) {
      results = results.filter((e) => e.timestamp >= options.startTime!)
    }
    if (options.endTime !== undefined && !options.agentId && !options.actionType) {
      results = results.filter((e) => e.timestamp <= options.endTime!)
    }

    // Sort
    const order = options.order ?? 'desc'
    results.sort((a, b) =>
      order === 'desc' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp
    )

    // Pagination
    if (options.offset !== undefined && options.offset > 0) {
      results = results.slice(options.offset)
    }
    if (options.limit !== undefined && options.limit > 0) {
      results = results.slice(0, options.limit)
    }

    return results
  }

  /**
   * Get a single entry by ID (async version for IndexedDB)
   */
  async getAsync(id: number): Promise<ActivityLogEntry | undefined> {
    if (this.storageMode === 'localStorage' || !this.database) {
      return this.get(id)
    }

    await this.waitForReady()
    return this.database.getById(id)
  }

  /**
   * Update an entry's sync status (async version for IndexedDB)
   */
  async updateSyncStatusAsync(id: number, status: SyncStatus): Promise<boolean> {
    if (this.storageMode === 'localStorage' || !this.database) {
      return this.updateSyncStatus(id, status)
    }

    await this.waitForReady()

    const entry = await this.database.getById(id)
    if (!entry) return false

    const newVersion = status === 'synced' ? (entry.version ?? 1) + 1 : entry.version

    return this.database.update(id, { syncStatus: status, version: newVersion })
  }

  /**
   * Get entries pending sync (async version for IndexedDB)
   */
  async getPendingSyncAsync(): Promise<ActivityLogEntry[]> {
    if (this.storageMode === 'localStorage' || !this.database) {
      return this.getPendingSync()
    }

    await this.waitForReady()
    return this.database.getPendingSync()
  }

  /**
   * Mark entries as synced (async version for IndexedDB)
   */
  async markSyncedAsync(ids: number[]): Promise<void> {
    if (this.storageMode === 'localStorage' || !this.database) {
      this.markSynced(ids)
      return
    }

    await this.waitForReady()
    await this.database.markSynced(ids)
  }

  /**
   * Export all entries (async version for IndexedDB)
   */
  async exportAsync(): Promise<ActivityLogEntry[]> {
    if (this.storageMode === 'localStorage' || !this.database) {
      return this.export()
    }

    await this.waitForReady()
    const exported = await this.database.exportJSON()
    return exported.entries
  }

  /**
   * Import entries (async version for IndexedDB)
   */
  async importAsync(entries: ActivityLogEntry[]): Promise<number> {
    if (this.storageMode === 'localStorage' || !this.database) {
      return this.import(entries)
    }

    await this.waitForReady()
    return this.database.importJSON({
      version: 1,
      exportedAt: Date.now(),
      entries,
    })
  }

  /**
   * Clear all entries (async version for IndexedDB)
   */
  async clearAsync(): Promise<void> {
    if (this.storageMode === 'localStorage' || !this.database) {
      this.clear()
      return
    }

    await this.waitForReady()
    await this.database.clearAll()
    this.emit({ type: 'storage_cleared' })
  }

  /**
   * Clear entries for a specific agent (async version for IndexedDB)
   */
  async clearAgentAsync(agentId: string): Promise<void> {
    if (this.storageMode === 'localStorage' || !this.database) {
      this.clearAgent(agentId)
      return
    }

    await this.waitForReady()
    await this.database.deleteByAgent(agentId)
    this.emit({ type: 'storage_cleared', agentId })
  }

  /**
   * Delete a specific entry (async version for IndexedDB)
   */
  async deleteAsync(id: number): Promise<boolean> {
    if (this.storageMode === 'localStorage' || !this.database) {
      return this.delete(id)
    }

    await this.waitForReady()
    const entry = await this.database.getById(id)
    if (!entry) return false

    await this.database.deleteById(id)
    return true
  }

  /**
   * Delete entries older than a given age (async version for IndexedDB)
   */
  async deleteOlderThanAsync(
    maxAgeMs: number,
    options?: { agentId?: string; onlySynced?: boolean }
  ): Promise<number> {
    if (this.storageMode === 'localStorage' || !this.database) {
      return this.deleteOlderThan(maxAgeMs, options)
    }

    await this.waitForReady()
    return this.database.deleteOlderThan(maxAgeMs, options)
  }

  /**
   * Get count of entries (async version for IndexedDB)
   */
  async countAsync(agentId?: string): Promise<number> {
    if (this.storageMode === 'localStorage' || !this.database) {
      return this.count(agentId)
    }

    await this.waitForReady()
    return this.database.count(agentId)
  }

  /**
   * Get stats for an agent (async version for IndexedDB)
   */
  async getStatsAsync(agentId: string): Promise<{
    total: number
    byActionType: Record<string, number>
    pending: number
    synced: number
    conflicts: number
    oldestTimestamp: number | null
    newestTimestamp: number | null
  }> {
    if (this.storageMode === 'localStorage' || !this.database) {
      return this.getStats(agentId)
    }

    await this.waitForReady()
    return this.database.getStats(agentId)
  }

  // ============= Persistence =============

  /**
   * Save to localStorage
   */
  private save(): void {
    // Only save to localStorage in localStorage mode
    if (this.storageMode !== 'localStorage') return
    if (typeof localStorage === 'undefined') return

    try {
      const data = {
        entries: this.entries,
        nextId: this.nextId,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data, jsonReplacer))
    } catch (error) {
      console.error('Failed to save activity log:', error)
    }
  }

  /**
   * Load from localStorage
   */
  private load(): void {
    if (typeof localStorage === 'undefined') return

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) return

      const data = JSON.parse(stored, jsonReviver)
      this.entries = data.entries ?? []
      this.nextId = data.nextId ?? 1
    } catch (error) {
      console.error('Failed to load activity log:', error)
      this.entries = []
      this.nextId = 1
    }
  }

  /**
   * Force save (if autoSave is disabled)
   */
  forceSave(): void {
    this.save()
  }

  /**
   * Force reload from storage
   */
  reload(): void {
    this.load()
  }

  // ============= Events =============

  /**
   * Subscribe to memory events
   */
  on(listener: MemoryEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Emit an event
   */
  private emit(event: MemoryEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event)
      } catch (error) {
        console.error('Memory event listener error:', error)
      }
    })
  }
}

/**
 * Create a new ActivityLog instance
 */
export function createActivityLog(options?: ActivityLogOptions): ActivityLog {
  return new ActivityLog(options)
}

/**
 * Create an ActivityLog instance with IndexedDB storage
 */
export function createIndexedDBActivityLog(options?: Omit<ActivityLogOptions, 'storageMode'>): ActivityLog {
  return new ActivityLog({
    ...options,
    storageMode: 'indexedDB',
  })
}

/**
 * Singleton instance for convenience
 */
let defaultInstance: ActivityLog | null = null
let defaultIndexedDBInstance: ActivityLog | null = null

export function getActivityLog(): ActivityLog {
  if (!defaultInstance) {
    defaultInstance = new ActivityLog()
  }
  return defaultInstance
}

/**
 * Get or create a singleton IndexedDB ActivityLog instance
 */
export function getIndexedDBActivityLog(): ActivityLog {
  if (!defaultIndexedDBInstance) {
    defaultIndexedDBInstance = new ActivityLog({ storageMode: 'indexedDB' })
  }
  return defaultIndexedDBInstance
}
