/**
 * Tests for ActivityLog
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { ActivityLog, createActivityLog } from '../memory/ActivityLog'
import type { ActivityLogEntry, MemoryEvent } from '../memory/types'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(global, 'localStorage', { value: localStorageMock })

describe('ActivityLog', () => {
  let log: ActivityLog

  beforeEach(() => {
    localStorageMock.clear()
    log = new ActivityLog({ autoSave: true })
  })

  afterEach(() => {
    localStorageMock.clear()
  })

  describe('Log entry adds timestamp automatically', () => {
    it('should add timestamp to new entries', () => {
      const before = Date.now()

      const entry = log.log({
        agentId: 'test-agent',
        actionType: 'transaction',
        data: { test: true },
      })

      const after = Date.now()

      expect(entry.timestamp).toBeGreaterThanOrEqual(before)
      expect(entry.timestamp).toBeLessThanOrEqual(after)
    })

    it('should assign unique IDs to entries', () => {
      const entry1 = log.log({
        agentId: 'test-agent',
        actionType: 'transaction',
        data: {},
      })

      const entry2 = log.log({
        agentId: 'test-agent',
        actionType: 'signature',
        data: {},
      })

      expect(entry1.id).toBeDefined()
      expect(entry2.id).toBeDefined()
      expect(entry1.id).not.toBe(entry2.id)
    })

    it('should set syncStatus to pending by default', () => {
      const entry = log.log({
        agentId: 'test-agent',
        actionType: 'transaction',
        data: {},
      })

      expect(entry.syncStatus).toBe('pending')
    })
  })

  describe('getHistory returns entries for specific agent', () => {
    it('should filter by agent ID', () => {
      log.log({ agentId: 'agent-1', actionType: 'transaction', data: {} })
      log.log({ agentId: 'agent-2', actionType: 'transaction', data: {} })
      log.log({ agentId: 'agent-1', actionType: 'signature', data: {} })

      const history = log.getHistory('agent-1')

      expect(history).toHaveLength(2)
      expect(history.every((e) => e.agentId === 'agent-1')).toBe(true)
    })

    it('should return empty array for unknown agent', () => {
      log.log({ agentId: 'agent-1', actionType: 'transaction', data: {} })

      const history = log.getHistory('unknown-agent')

      expect(history).toHaveLength(0)
    })
  })

  describe('getHistory respects limit parameter', () => {
    it('should limit results when limit is provided', () => {
      for (let i = 0; i < 10; i++) {
        log.log({ agentId: 'agent-1', actionType: 'transaction', data: { index: i } })
      }

      const history = log.getHistory('agent-1', 5)

      expect(history).toHaveLength(5)
    })

    it('should return all entries when limit is larger than count', () => {
      for (let i = 0; i < 3; i++) {
        log.log({ agentId: 'agent-1', actionType: 'transaction', data: {} })
      }

      const history = log.getHistory('agent-1', 10)

      expect(history).toHaveLength(3)
    })
  })

  describe('getHistory returns entries in chronological order', () => {
    it('should return newest first by default', () => {
      vi.useFakeTimers()

      log.log({ agentId: 'agent-1', actionType: 'transaction', data: { order: 1 } })
      vi.advanceTimersByTime(100)
      log.log({ agentId: 'agent-1', actionType: 'transaction', data: { order: 2 } })
      vi.advanceTimersByTime(100)
      log.log({ agentId: 'agent-1', actionType: 'transaction', data: { order: 3 } })

      const history = log.getHistory('agent-1')

      expect((history[0].data as { order: number }).order).toBe(3)
      expect((history[1].data as { order: number }).order).toBe(2)
      expect((history[2].data as { order: number }).order).toBe(1)

      vi.useRealTimers()
    })
  })

  describe('export returns all entries', () => {
    it('should export all entries', () => {
      log.log({ agentId: 'agent-1', actionType: 'transaction', data: {} })
      log.log({ agentId: 'agent-2', actionType: 'signature', data: {} })
      log.log({ agentId: 'agent-1', actionType: 'error', data: {} })

      const exported = log.export()

      expect(exported).toHaveLength(3)
    })

    it('should return a copy, not the original array', () => {
      log.log({ agentId: 'agent-1', actionType: 'transaction', data: {} })

      const exported = log.export()
      exported.push({} as ActivityLogEntry)

      expect(log.export()).toHaveLength(1)
    })
  })

  describe('clear removes all entries', () => {
    it('should clear all entries', () => {
      log.log({ agentId: 'agent-1', actionType: 'transaction', data: {} })
      log.log({ agentId: 'agent-2', actionType: 'signature', data: {} })

      log.clear()

      expect(log.count()).toBe(0)
      expect(log.export()).toHaveLength(0)
    })

    it('should emit storage_cleared event', () => {
      const events: MemoryEvent[] = []
      log.on((event) => events.push(event))

      log.clear()

      expect(events.some((e) => e.type === 'storage_cleared')).toBe(true)
    })
  })

  describe('Log persists across page reloads (localStorage)', () => {
    it('should persist entries to localStorage', () => {
      log.log({ agentId: 'agent-1', actionType: 'transaction', data: { value: 123 } })

      // Create a new log instance (simulating page reload)
      const newLog = new ActivityLog({ autoSave: true })

      const history = newLog.getHistory('agent-1')
      expect(history).toHaveLength(1)
      expect((history[0].data as { value: number }).value).toBe(123)
    })

    it('should restore ID counter correctly', () => {
      log.log({ agentId: 'agent-1', actionType: 'transaction', data: {} })
      log.log({ agentId: 'agent-1', actionType: 'transaction', data: {} })

      const newLog = new ActivityLog({ autoSave: true })
      const entry = newLog.log({ agentId: 'agent-1', actionType: 'transaction', data: {} })

      // New entry should have ID 3
      expect(entry.id).toBe(3)
    })
  })

  describe('Query functionality', () => {
    beforeEach(() => {
      // Add test data
      log.log({ agentId: 'agent-1', actionType: 'transaction', data: {} })
      log.log({ agentId: 'agent-1', actionType: 'signature', data: {} })
      log.log({ agentId: 'agent-2', actionType: 'transaction', data: {} })
      log.log({ agentId: 'agent-1', actionType: 'error', data: {} })
    })

    it('should filter by action type', () => {
      const results = log.query({ actionType: 'transaction' })

      expect(results).toHaveLength(2)
      expect(results.every((e) => e.actionType === 'transaction')).toBe(true)
    })

    it('should filter by agent and action type', () => {
      const results = log.query({
        agentId: 'agent-1',
        actionType: 'transaction',
      })

      expect(results).toHaveLength(1)
    })

    it('should support ascending order', () => {
      const results = log.query({ order: 'asc' })

      for (let i = 1; i < results.length; i++) {
        expect(results[i].timestamp).toBeGreaterThanOrEqual(results[i - 1].timestamp)
      }
    })

    it('should support pagination', () => {
      const page1 = log.query({ limit: 2, offset: 0 })
      const page2 = log.query({ limit: 2, offset: 2 })

      expect(page1).toHaveLength(2)
      expect(page2).toHaveLength(2)
      expect(page1[0].id).not.toBe(page2[0].id)
    })
  })

  describe('Sync status management', () => {
    it('should update sync status', () => {
      const entry = log.log({ agentId: 'agent-1', actionType: 'transaction', data: {} })

      log.updateSyncStatus(entry.id!, 'synced')

      const updated = log.get(entry.id!)
      expect(updated?.syncStatus).toBe('synced')
    })

    it('should get pending sync entries', () => {
      log.log({ agentId: 'agent-1', actionType: 'transaction', data: {} })
      const entry2 = log.log({ agentId: 'agent-1', actionType: 'signature', data: {} })
      log.updateSyncStatus(entry2.id!, 'synced')

      const pending = log.getPendingSync()

      expect(pending).toHaveLength(1)
    })

    it('should mark multiple entries as synced', () => {
      const entry1 = log.log({ agentId: 'agent-1', actionType: 'transaction', data: {} })
      const entry2 = log.log({ agentId: 'agent-1', actionType: 'signature', data: {} })

      log.markSynced([entry1.id!, entry2.id!])

      expect(log.get(entry1.id!)?.syncStatus).toBe('synced')
      expect(log.get(entry2.id!)?.syncStatus).toBe('synced')
    })
  })

  describe('Clear agent data', () => {
    it('should clear only specific agent data', () => {
      log.log({ agentId: 'agent-1', actionType: 'transaction', data: {} })
      log.log({ agentId: 'agent-2', actionType: 'transaction', data: {} })
      log.log({ agentId: 'agent-1', actionType: 'signature', data: {} })

      log.clearAgent('agent-1')

      expect(log.count('agent-1')).toBe(0)
      expect(log.count('agent-2')).toBe(1)
    })
  })

  describe('Delete older than', () => {
    it('should delete entries older than specified age', () => {
      vi.useFakeTimers()

      log.log({ agentId: 'agent-1', actionType: 'transaction', data: { old: true } })

      // Advance time by 1 hour
      vi.advanceTimersByTime(60 * 60 * 1000)

      log.log({ agentId: 'agent-1', actionType: 'transaction', data: { new: true } })

      // Delete entries older than 30 minutes
      const deleted = log.deleteOlderThan(30 * 60 * 1000)

      expect(deleted).toBe(1)
      expect(log.count()).toBe(1)

      vi.useRealTimers()
    })

    it('should only delete synced entries when onlySynced is true', () => {
      vi.useFakeTimers()

      const entry1 = log.log({ agentId: 'agent-1', actionType: 'transaction', data: {} })
      log.updateSyncStatus(entry1.id!, 'synced')
      log.log({ agentId: 'agent-1', actionType: 'transaction', data: {} }) // pending

      vi.advanceTimersByTime(60 * 60 * 1000)

      const deleted = log.deleteOlderThan(30 * 60 * 1000, { onlySynced: true })

      expect(deleted).toBe(1) // Only the synced one

      vi.useRealTimers()
    })
  })

  describe('Stats', () => {
    it('should return correct stats for an agent', () => {
      log.log({ agentId: 'agent-1', actionType: 'transaction', data: {} })
      log.log({ agentId: 'agent-1', actionType: 'transaction', data: {} })
      log.log({ agentId: 'agent-1', actionType: 'signature', data: {} })
      const entry4 = log.log({ agentId: 'agent-1', actionType: 'error', data: {} })
      log.updateSyncStatus(entry4.id!, 'synced')

      const stats = log.getStats('agent-1')

      expect(stats.total).toBe(4)
      expect(stats.byActionType.transaction).toBe(2)
      expect(stats.byActionType.signature).toBe(1)
      expect(stats.byActionType.error).toBe(1)
      expect(stats.pending).toBe(3)
      expect(stats.synced).toBe(1)
    })
  })

  describe('Event emission', () => {
    it('should emit activity_logged event', () => {
      const events: MemoryEvent[] = []
      log.on((event) => events.push(event))

      log.log({ agentId: 'agent-1', actionType: 'transaction', data: {} })

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('activity_logged')
    })

    it('should allow unsubscribing from events', () => {
      const events: MemoryEvent[] = []
      const unsubscribe = log.on((event) => events.push(event))

      log.log({ agentId: 'agent-1', actionType: 'transaction', data: {} })
      unsubscribe()
      log.log({ agentId: 'agent-1', actionType: 'transaction', data: {} })

      expect(events).toHaveLength(1)
    })
  })

  describe('Import functionality', () => {
    it('should import entries without duplicates', () => {
      vi.useFakeTimers()

      log.log({ agentId: 'agent-1', actionType: 'transaction', data: {}, txHash: '0x123' as `0x${string}` })

      // Advance time so the import has a different timestamp
      vi.advanceTimersByTime(100)

      const importData: ActivityLogEntry[] = [
        {
          agentId: 'agent-1',
          actionType: 'transaction',
          timestamp: Date.now(),
          data: {},
          txHash: '0x456' as `0x${string}`,
        },
      ]

      const imported = log.import(importData)

      expect(imported).toBe(1)
      expect(log.count()).toBe(2)

      vi.useRealTimers()
    })
  })

  describe('Factory functions', () => {
    it('createActivityLog should create a new instance', () => {
      const newLog = createActivityLog({ autoSave: false })

      expect(newLog).toBeInstanceOf(ActivityLog)
    })
  })
})
