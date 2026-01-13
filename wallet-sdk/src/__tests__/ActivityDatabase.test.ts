/**
 * Tests for ActivityDatabase (IndexedDB-based storage)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { ActivityDatabase, createActivityDatabase } from '../memory/ActivityDatabase'
import type { ActivityLogEntry } from '../memory/types'

describe('ActivityDatabase', () => {
  let db: ActivityDatabase

  beforeEach(async () => {
    // Create a unique database name for each test to avoid conflicts
    db = createActivityDatabase(`TestDB_${Date.now()}_${Math.random()}`)
  })

  afterEach(async () => {
    if (db) {
      await db.clearAll()
      db.close()
    }
  })

  describe('add and getById', () => {
    it('should add an entry and retrieve it by ID', async () => {
      const entry: Omit<ActivityLogEntry, 'id'> = {
        agentId: 'test-agent',
        actionType: 'transaction',
        timestamp: Date.now(),
        data: { test: true },
        syncStatus: 'pending',
        version: 1,
      }

      const id = await db.add(entry)
      expect(id).toBeGreaterThan(0)

      const retrieved = await db.getById(id)
      expect(retrieved).toBeDefined()
      expect(retrieved?.agentId).toBe('test-agent')
      expect(retrieved?.actionType).toBe('transaction')
      expect(retrieved?.data).toEqual({ test: true })
    })

    it('should return undefined for non-existent ID', async () => {
      const retrieved = await db.getById(99999)
      expect(retrieved).toBeUndefined()
    })
  })

  describe('getByAgent', () => {
    beforeEach(async () => {
      await db.bulkLog([
        { agentId: 'agent-1', actionType: 'transaction', timestamp: 1000, data: {} },
        { agentId: 'agent-1', actionType: 'signature', timestamp: 2000, data: {} },
        { agentId: 'agent-2', actionType: 'transaction', timestamp: 3000, data: {} },
        { agentId: 'agent-1', actionType: 'error', timestamp: 4000, data: {} },
      ])
    })

    it('should return entries for a specific agent', async () => {
      const entries = await db.getByAgent('agent-1')
      expect(entries).toHaveLength(3)
      expect(entries.every((e) => e.agentId === 'agent-1')).toBe(true)
    })

    it('should respect limit parameter', async () => {
      const entries = await db.getByAgent('agent-1', { limit: 2 })
      expect(entries).toHaveLength(2)
    })

    it('should order by desc by default (newest first)', async () => {
      const entries = await db.getByAgent('agent-1', { order: 'desc' })
      expect(entries[0].timestamp).toBeGreaterThan(entries[entries.length - 1].timestamp)
    })

    it('should support ascending order', async () => {
      const entries = await db.getByAgent('agent-1', { order: 'asc' })
      expect(entries[0].timestamp).toBeLessThan(entries[entries.length - 1].timestamp)
    })

    it('should return empty array for unknown agent', async () => {
      const entries = await db.getByAgent('unknown-agent')
      expect(entries).toHaveLength(0)
    })
  })

  describe('getByTimeRange', () => {
    beforeEach(async () => {
      await db.bulkLog([
        { agentId: 'agent-1', actionType: 'transaction', timestamp: 1000, data: {} },
        { agentId: 'agent-1', actionType: 'signature', timestamp: 2000, data: {} },
        { agentId: 'agent-2', actionType: 'transaction', timestamp: 3000, data: {} },
        { agentId: 'agent-1', actionType: 'error', timestamp: 4000, data: {} },
      ])
    })

    it('should return entries within time range', async () => {
      const entries = await db.getByTimeRange({ startTime: 1500, endTime: 3500 })
      expect(entries).toHaveLength(2)
      expect(entries.every((e) => e.timestamp >= 1500 && e.timestamp <= 3500)).toBe(true)
    })

    it('should return entries after startTime', async () => {
      const entries = await db.getByTimeRange({ startTime: 2500 })
      expect(entries).toHaveLength(2)
      expect(entries.every((e) => e.timestamp >= 2500)).toBe(true)
    })

    it('should return entries before endTime', async () => {
      const entries = await db.getByTimeRange({ endTime: 2500 })
      expect(entries).toHaveLength(2)
      expect(entries.every((e) => e.timestamp <= 2500)).toBe(true)
    })

    it('should support pagination', async () => {
      const page1 = await db.getByTimeRange({ limit: 2, offset: 0 })
      const page2 = await db.getByTimeRange({ limit: 2, offset: 2 })
      expect(page1).toHaveLength(2)
      expect(page2).toHaveLength(2)
      expect(page1[0].id).not.toBe(page2[0].id)
    })
  })

  describe('getPendingSync', () => {
    it('should return only pending entries', async () => {
      const id1 = await db.add({
        agentId: 'agent-1',
        actionType: 'transaction',
        timestamp: Date.now(),
        data: {},
        syncStatus: 'pending',
      })
      await db.add({
        agentId: 'agent-1',
        actionType: 'signature',
        timestamp: Date.now(),
        data: {},
        syncStatus: 'synced',
      })
      await db.add({
        agentId: 'agent-1',
        actionType: 'error',
        timestamp: Date.now(),
        data: {},
        syncStatus: 'pending',
      })

      const pending = await db.getPendingSync()
      expect(pending).toHaveLength(2)
      expect(pending.every((e) => e.syncStatus === 'pending')).toBe(true)
    })

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await db.add({
          agentId: 'agent-1',
          actionType: 'transaction',
          timestamp: Date.now() + i,
          data: {},
          syncStatus: 'pending',
        })
      }

      const pending = await db.getPendingSync(3)
      expect(pending).toHaveLength(3)
    })
  })

  describe('markSynced', () => {
    it('should mark multiple entries as synced', async () => {
      const id1 = await db.add({
        agentId: 'agent-1',
        actionType: 'transaction',
        timestamp: Date.now(),
        data: {},
        syncStatus: 'pending',
      })
      const id2 = await db.add({
        agentId: 'agent-1',
        actionType: 'signature',
        timestamp: Date.now(),
        data: {},
        syncStatus: 'pending',
      })

      await db.markSynced([id1, id2])

      const entry1 = await db.getById(id1)
      const entry2 = await db.getById(id2)

      expect(entry1?.syncStatus).toBe('synced')
      expect(entry2?.syncStatus).toBe('synced')
    })
  })

  describe('bulkLog', () => {
    it('should add multiple entries at once', async () => {
      const entries: Omit<ActivityLogEntry, 'id'>[] = [
        { agentId: 'agent-1', actionType: 'transaction', timestamp: 1000, data: {} },
        { agentId: 'agent-2', actionType: 'signature', timestamp: 2000, data: {} },
        { agentId: 'agent-3', actionType: 'error', timestamp: 3000, data: {} },
      ]

      const ids = await db.bulkLog(entries)
      expect(ids).toHaveLength(3)
      expect(ids.every((id) => id > 0)).toBe(true)

      const count = await db.count()
      expect(count).toBe(3)
    })
  })

  describe('exportJSON and importJSON', () => {
    it('should export all entries', async () => {
      await db.bulkLog([
        { agentId: 'agent-1', actionType: 'transaction', timestamp: 1000, data: { value: 1 } },
        { agentId: 'agent-2', actionType: 'signature', timestamp: 2000, data: { value: 2 } },
      ])

      const exported = await db.exportJSON()

      expect(exported.version).toBe(1)
      expect(exported.exportedAt).toBeGreaterThan(0)
      expect(exported.entries).toHaveLength(2)
    })

    it('should export entries for a specific agent', async () => {
      await db.bulkLog([
        { agentId: 'agent-1', actionType: 'transaction', timestamp: 1000, data: {} },
        { agentId: 'agent-2', actionType: 'signature', timestamp: 2000, data: {} },
        { agentId: 'agent-1', actionType: 'error', timestamp: 3000, data: {} },
      ])

      const exported = await db.exportAgentJSON('agent-1')
      expect(exported.entries).toHaveLength(2)
      expect(exported.entries.every((e) => e.agentId === 'agent-1')).toBe(true)
    })

    it('should import entries and avoid duplicates', async () => {
      // Add initial entry
      await db.add({
        agentId: 'agent-1',
        actionType: 'transaction',
        timestamp: 1000,
        data: {},
      })

      // Import with one duplicate and one new
      const imported = await db.importJSON({
        version: 1,
        exportedAt: Date.now(),
        entries: [
          { agentId: 'agent-1', actionType: 'transaction', timestamp: 1000, data: {} }, // duplicate
          { agentId: 'agent-1', actionType: 'signature', timestamp: 2000, data: {} }, // new
        ],
      })

      expect(imported).toBe(1) // Only the new one should be imported
      expect(await db.count()).toBe(2)
    })
  })

  describe('delete operations', () => {
    it('should delete by ID', async () => {
      const id = await db.add({
        agentId: 'agent-1',
        actionType: 'transaction',
        timestamp: Date.now(),
        data: {},
      })

      await db.deleteById(id)

      const entry = await db.getById(id)
      expect(entry).toBeUndefined()
    })

    it('should delete by agent', async () => {
      await db.bulkLog([
        { agentId: 'agent-1', actionType: 'transaction', timestamp: 1000, data: {} },
        { agentId: 'agent-2', actionType: 'signature', timestamp: 2000, data: {} },
        { agentId: 'agent-1', actionType: 'error', timestamp: 3000, data: {} },
      ])

      const deleted = await db.deleteByAgent('agent-1')
      expect(deleted).toBe(2)

      const remaining = await db.count()
      expect(remaining).toBe(1)
    })

    it('should delete entries older than specified age', async () => {
      const now = Date.now()
      await db.bulkLog([
        { agentId: 'agent-1', actionType: 'transaction', timestamp: now - 100000, data: {} }, // old
        { agentId: 'agent-1', actionType: 'signature', timestamp: now - 50000, data: {} }, // old
        { agentId: 'agent-1', actionType: 'error', timestamp: now, data: {} }, // new
      ])

      const deleted = await db.deleteOlderThan(60000) // 1 minute
      expect(deleted).toBe(1) // Only the oldest one

      const remaining = await db.count()
      expect(remaining).toBe(2)
    })

    it('should clear all entries', async () => {
      await db.bulkLog([
        { agentId: 'agent-1', actionType: 'transaction', timestamp: 1000, data: {} },
        { agentId: 'agent-2', actionType: 'signature', timestamp: 2000, data: {} },
      ])

      await db.clearAll()

      const count = await db.count()
      expect(count).toBe(0)
    })
  })

  describe('count', () => {
    beforeEach(async () => {
      await db.bulkLog([
        { agentId: 'agent-1', actionType: 'transaction', timestamp: 1000, data: {} },
        { agentId: 'agent-1', actionType: 'signature', timestamp: 2000, data: {} },
        { agentId: 'agent-2', actionType: 'transaction', timestamp: 3000, data: {} },
      ])
    })

    it('should return total count', async () => {
      const count = await db.count()
      expect(count).toBe(3)
    })

    it('should return count for specific agent', async () => {
      const count = await db.count('agent-1')
      expect(count).toBe(2)
    })
  })

  describe('getStats', () => {
    it('should return correct stats for an agent', async () => {
      const now = Date.now()
      await db.bulkLog([
        { agentId: 'agent-1', actionType: 'transaction', timestamp: now - 1000, data: {}, syncStatus: 'pending' },
        { agentId: 'agent-1', actionType: 'transaction', timestamp: now - 500, data: {}, syncStatus: 'synced' },
        { agentId: 'agent-1', actionType: 'signature', timestamp: now - 100, data: {}, syncStatus: 'pending' },
        { agentId: 'agent-1', actionType: 'error', timestamp: now, data: {}, syncStatus: 'conflict' },
      ])

      const stats = await db.getStats('agent-1')

      expect(stats.total).toBe(4)
      expect(stats.byActionType.transaction).toBe(2)
      expect(stats.byActionType.signature).toBe(1)
      expect(stats.byActionType.error).toBe(1)
      expect(stats.pending).toBe(2)
      expect(stats.synced).toBe(1)
      expect(stats.conflicts).toBe(1)
      expect(stats.oldestTimestamp).toBe(now - 1000)
      expect(stats.newestTimestamp).toBe(now)
    })

    it('should return empty stats for unknown agent', async () => {
      const stats = await db.getStats('unknown-agent')
      expect(stats.total).toBe(0)
      expect(stats.oldestTimestamp).toBeNull()
      expect(stats.newestTimestamp).toBeNull()
    })
  })

  describe('getByActionType', () => {
    beforeEach(async () => {
      await db.bulkLog([
        { agentId: 'agent-1', actionType: 'transaction', timestamp: 1000, data: {} },
        { agentId: 'agent-1', actionType: 'signature', timestamp: 2000, data: {} },
        { agentId: 'agent-2', actionType: 'transaction', timestamp: 3000, data: {} },
      ])
    })

    it('should return entries by action type', async () => {
      const entries = await db.getByActionType('transaction')
      expect(entries).toHaveLength(2)
      expect(entries.every((e) => e.actionType === 'transaction')).toBe(true)
    })

    it('should filter by agent ID', async () => {
      const entries = await db.getByActionType('transaction', { agentId: 'agent-1' })
      expect(entries).toHaveLength(1)
      expect(entries[0].agentId).toBe('agent-1')
    })

    it('should respect limit parameter', async () => {
      const entries = await db.getByActionType('transaction', { limit: 1 })
      expect(entries).toHaveLength(1)
    })
  })

  describe('getByTxHash', () => {
    it('should return entries by transaction hash', async () => {
      await db.bulkLog([
        { agentId: 'agent-1', actionType: 'transaction', timestamp: 1000, data: {}, txHash: '0x123' as `0x${string}` },
        { agentId: 'agent-1', actionType: 'signature', timestamp: 2000, data: {}, txHash: '0x456' as `0x${string}` },
        { agentId: 'agent-2', actionType: 'transaction', timestamp: 3000, data: {}, txHash: '0x123' as `0x${string}` },
      ])

      const entries = await db.getByTxHash('0x123')
      expect(entries).toHaveLength(2)
      expect(entries.every((e) => e.txHash === '0x123')).toBe(true)
    })
  })

  describe('update', () => {
    it('should update an entry', async () => {
      const id = await db.add({
        agentId: 'agent-1',
        actionType: 'transaction',
        timestamp: Date.now(),
        data: { original: true },
        syncStatus: 'pending',
      })

      const updated = await db.update(id, {
        data: { updated: true },
        syncStatus: 'synced',
      })

      expect(updated).toBe(true)

      const entry = await db.getById(id)
      expect(entry?.data).toEqual({ updated: true })
      expect(entry?.syncStatus).toBe('synced')
    })

    it('should return false for non-existent ID', async () => {
      const updated = await db.update(99999, { syncStatus: 'synced' })
      expect(updated).toBe(false)
    })
  })

  describe('factory functions', () => {
    it('createActivityDatabase should create a new instance', () => {
      const newDb = createActivityDatabase('TestDB')
      expect(newDb).toBeInstanceOf(ActivityDatabase)
      newDb.close()
    })
  })
})
