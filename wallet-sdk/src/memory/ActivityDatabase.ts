/**
 * ActivityDatabase - Dexie-based IndexedDB database for activity logging
 *
 * Provides persistent storage with:
 * - Indexed queries by agentId, actionType, timestamp, txHash
 * - Sync status tracking for ExEx integration
 * - Export/import functionality for backup and restore
 * - Bulk operations for efficient data handling
 */

import Dexie, { type Table } from 'dexie'
import type { ActivityLogEntry, ActivityActionType } from './types'

/**
 * Database schema interface for activities table
 */
export interface ActivityRecord extends ActivityLogEntry {
  id: number
  synced: 0 | 1 // IndexedDB-friendly boolean for indexing
}

/**
 * Time range query options
 */
export interface TimeRangeOptions {
  startTime?: number
  endTime?: number
  limit?: number
  offset?: number
  order?: 'asc' | 'desc'
}

/**
 * Export format for backup/restore
 */
export interface ActivityExport {
  version: number
  exportedAt: number
  entries: ActivityLogEntry[]
}

/**
 * ActivityDatabase class extending Dexie for IndexedDB operations
 */
export class ActivityDatabase extends Dexie {
  activities!: Table<ActivityRecord, number>

  constructor(databaseName: string = 'MonmouthActivityDB') {
    super(databaseName)

    // Define schema with indexed fields
    // ++id: auto-increment primary key
    // agentId, actionType, timestamp, synced, txHash: indexed for queries
    this.version(1).stores({
      activities: '++id, agentId, actionType, timestamp, synced, txHash, [agentId+timestamp], [agentId+actionType]',
    })
  }

  // ============= Query Methods =============

  /**
   * Get all activities for a specific agent
   */
  async getByAgent(
    agentId: string,
    options: { limit?: number; offset?: number; order?: 'asc' | 'desc' } = {}
  ): Promise<ActivityLogEntry[]> {
    const { limit, offset = 0, order = 'desc' } = options

    // Get results and sort by timestamp
    let results = await this.activities
      .where('agentId')
      .equals(agentId)
      .sortBy('timestamp')

    // Apply descending order if needed (sortBy defaults to ascending)
    if (order === 'desc') {
      results = results.reverse()
    }

    // Apply pagination
    if (offset > 0) {
      results = results.slice(offset)
    }

    if (limit !== undefined && limit > 0) {
      results = results.slice(0, limit)
    }

    return results.map(this.recordToEntry)
  }

  /**
   * Get activities within a time range
   */
  async getByTimeRange(options: TimeRangeOptions = {}): Promise<ActivityLogEntry[]> {
    const { startTime, endTime, limit, offset = 0, order = 'desc' } = options

    let collection = this.activities.orderBy('timestamp')

    if (startTime !== undefined && endTime !== undefined) {
      collection = this.activities.where('timestamp').between(startTime, endTime, true, true)
    } else if (startTime !== undefined) {
      collection = this.activities.where('timestamp').aboveOrEqual(startTime)
    } else if (endTime !== undefined) {
      collection = this.activities.where('timestamp').belowOrEqual(endTime)
    }

    let results = await collection.toArray()

    if (order === 'desc') {
      results = results.reverse()
    }

    if (offset > 0) {
      results = results.slice(offset)
    }

    if (limit !== undefined && limit > 0) {
      results = results.slice(0, limit)
    }

    return results.map(this.recordToEntry)
  }

  /**
   * Get all activities pending sync
   */
  async getPendingSync(limit?: number): Promise<ActivityLogEntry[]> {
    let collection = this.activities.where('synced').equals(0)

    if (limit !== undefined && limit > 0) {
      collection = collection.limit(limit)
    }

    const results = await collection.toArray()
    return results.map(this.recordToEntry)
  }

  /**
   * Get activities by action type
   */
  async getByActionType(
    actionType: ActivityActionType,
    options: { agentId?: string; limit?: number } = {}
  ): Promise<ActivityLogEntry[]> {
    const { agentId, limit } = options

    let results: ActivityRecord[]

    if (agentId) {
      results = await this.activities
        .where('[agentId+actionType]')
        .equals([agentId, actionType])
        .toArray()
    } else {
      results = await this.activities.where('actionType').equals(actionType).toArray()
    }

    if (limit !== undefined && limit > 0) {
      results = results.slice(0, limit)
    }

    return results.map(this.recordToEntry)
  }

  /**
   * Get a single activity by ID
   */
  async getById(id: number): Promise<ActivityLogEntry | undefined> {
    const record = await this.activities.get(id)
    return record ? this.recordToEntry(record) : undefined
  }

  /**
   * Get activities by transaction hash
   */
  async getByTxHash(txHash: string): Promise<ActivityLogEntry[]> {
    const results = await this.activities.where('txHash').equals(txHash).toArray()
    return results.map(this.recordToEntry)
  }

  // ============= Mutation Methods =============

  /**
   * Add a single activity entry
   */
  async add(entry: Omit<ActivityLogEntry, 'id'>): Promise<number> {
    const record = this.entryToRecord(entry)
    return await this.activities.add(record as ActivityRecord)
  }

  /**
   * Bulk log multiple activities
   */
  async bulkLog(entries: Omit<ActivityLogEntry, 'id'>[]): Promise<number[]> {
    const records = entries.map((entry) => this.entryToRecord(entry) as ActivityRecord)
    const ids = await this.activities.bulkAdd(records, { allKeys: true })
    return ids as number[]
  }

  /**
   * Update an activity entry
   */
  async update(id: number, changes: Partial<ActivityLogEntry>): Promise<boolean> {
    const updateData: Partial<ActivityRecord> = { ...changes }

    // Convert syncStatus to synced flag for indexing
    if (changes.syncStatus !== undefined) {
      updateData.synced = changes.syncStatus === 'synced' ? 1 : 0
    }

    const updated = await this.activities.update(id, updateData)
    return updated > 0
  }

  /**
   * Mark activities as synced
   */
  async markSynced(ids: number[]): Promise<void> {
    await this.transaction('rw', this.activities, async () => {
      for (const id of ids) {
        await this.activities.update(id, { syncStatus: 'synced', synced: 1 })
      }
    })
  }

  /**
   * Mark a single activity as synced
   */
  async markOneSynced(id: number): Promise<boolean> {
    const updated = await this.activities.update(id, { syncStatus: 'synced', synced: 1 })
    return updated > 0
  }

  /**
   * Delete an activity by ID
   */
  async deleteById(id: number): Promise<void> {
    await this.activities.delete(id)
  }

  /**
   * Delete all activities for an agent
   */
  async deleteByAgent(agentId: string): Promise<number> {
    return await this.activities.where('agentId').equals(agentId).delete()
  }

  /**
   * Delete activities older than a given timestamp
   */
  async deleteOlderThan(
    maxAgeMs: number,
    options?: { agentId?: string; onlySynced?: boolean }
  ): Promise<number> {
    const cutoff = Date.now() - maxAgeMs

    let collection = this.activities.where('timestamp').below(cutoff)

    if (options?.onlySynced) {
      // Need to filter after getting results since IndexedDB doesn't support complex AND queries well
      const records = await collection.toArray()
      const toDelete = records.filter((r) => {
        if (options.agentId && r.agentId !== options.agentId) return false
        if (options.onlySynced && r.syncStatus !== 'synced') return false
        return true
      })

      const ids = toDelete.map((r) => r.id)
      await this.activities.bulkDelete(ids)
      return ids.length
    }

    if (options?.agentId) {
      const records = await collection.toArray()
      const toDelete = records.filter((r) => r.agentId === options.agentId)
      const ids = toDelete.map((r) => r.id)
      await this.activities.bulkDelete(ids)
      return ids.length
    }

    return await collection.delete()
  }

  /**
   * Clear all activities
   */
  async clearAll(): Promise<void> {
    await this.activities.clear()
  }

  // ============= Export/Import Methods =============

  /**
   * Export all activities as JSON
   */
  async exportJSON(): Promise<ActivityExport> {
    const records = await this.activities.toArray()
    return {
      version: 1,
      exportedAt: Date.now(),
      entries: records.map(this.recordToEntry),
    }
  }

  /**
   * Export activities for a specific agent
   */
  async exportAgentJSON(agentId: string): Promise<ActivityExport> {
    const records = await this.activities.where('agentId').equals(agentId).toArray()
    return {
      version: 1,
      exportedAt: Date.now(),
      entries: records.map(this.recordToEntry),
    }
  }

  /**
   * Import activities from JSON
   * Avoids duplicates based on agentId + timestamp + actionType
   */
  async importJSON(data: ActivityExport): Promise<number> {
    let imported = 0

    await this.transaction('rw', this.activities, async () => {
      for (const entry of data.entries) {
        // Check for existing entry with same agentId + timestamp + actionType
        const existing = await this.activities
          .where('[agentId+timestamp]')
          .equals([entry.agentId, entry.timestamp])
          .first()

        if (!existing || existing.actionType !== entry.actionType) {
          const record = this.entryToRecord(entry)
          await this.activities.add(record as ActivityRecord)
          imported++
        }
      }
    })

    return imported
  }

  // ============= Stats Methods =============

  /**
   * Get count of all activities
   */
  async count(agentId?: string): Promise<number> {
    if (agentId) {
      return await this.activities.where('agentId').equals(agentId).count()
    }
    return await this.activities.count()
  }

  /**
   * Get stats for an agent
   */
  async getStats(agentId: string): Promise<{
    total: number
    byActionType: Record<string, number>
    pending: number
    synced: number
    conflicts: number
    oldestTimestamp: number | null
    newestTimestamp: number | null
  }> {
    const entries = await this.activities.where('agentId').equals(agentId).toArray()

    const byActionType: Record<string, number> = {}
    let pending = 0
    let synced = 0
    let conflicts = 0
    let oldest: number | null = null
    let newest: number | null = null

    for (const entry of entries) {
      byActionType[entry.actionType] = (byActionType[entry.actionType] ?? 0) + 1

      if (entry.syncStatus === 'pending') pending++
      else if (entry.syncStatus === 'synced') synced++
      else if (entry.syncStatus === 'conflict') conflicts++

      if (oldest === null || entry.timestamp < oldest) oldest = entry.timestamp
      if (newest === null || entry.timestamp > newest) newest = entry.timestamp
    }

    return {
      total: entries.length,
      byActionType,
      pending,
      synced,
      conflicts,
      oldestTimestamp: oldest,
      newestTimestamp: newest,
    }
  }

  // ============= Helper Methods =============

  /**
   * Convert entry to database record
   */
  private entryToRecord(entry: Omit<ActivityLogEntry, 'id'> | ActivityLogEntry): Omit<ActivityRecord, 'id'> {
    const record: Omit<ActivityRecord, 'id'> = {
      agentId: entry.agentId,
      actionType: entry.actionType,
      timestamp: entry.timestamp,
      data: entry.data,
      syncStatus: entry.syncStatus ?? 'pending',
      synced: entry.syncStatus === 'synced' ? 1 : 0,
      version: entry.version ?? 1,
      txHash: entry.txHash,
    }
    return record
  }

  /**
   * Convert database record to entry
   */
  private recordToEntry = (record: ActivityRecord): ActivityLogEntry => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { synced, ...entry } = record
    return entry
  }
}

/**
 * Create a new ActivityDatabase instance
 */
export function createActivityDatabase(name?: string): ActivityDatabase {
  return new ActivityDatabase(name)
}

/**
 * Singleton instance for convenience
 */
let defaultDatabase: ActivityDatabase | null = null

export function getActivityDatabase(): ActivityDatabase {
  if (!defaultDatabase) {
    defaultDatabase = new ActivityDatabase()
  }
  return defaultDatabase
}
