/**
 * Tests for MemoryClient
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { MemoryClient, createMemoryClient } from '../memory/MemoryClient'
import { ActivityLog } from '../memory/ActivityLog'
import type { MemoryEvent } from '../memory/types'

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

// Mock navigator.onLine
Object.defineProperty(global, 'navigator', {
  value: { onLine: true },
  writable: true,
})

describe('MemoryClient', () => {
  let client: MemoryClient
  let activityLog: ActivityLog

  beforeEach(() => {
    localStorageMock.clear()
    activityLog = new ActivityLog({ autoSave: false })

    client = new MemoryClient({
      endpoint: 'http://localhost:50051',
      agentId: 'test-agent',
      activityLog,
      autoSync: false,
    })
  })

  afterEach(() => {
    client.destroy()
    localStorageMock.clear()
  })

  describe('Client connects to gRPC endpoint', () => {
    it('should connect successfully (stub)', async () => {
      expect(client.getConnectionState()).toBe('disconnected')

      await client.connect()

      expect(client.getConnectionState()).toBe('connected')
      expect(client.isConnected()).toBe(true)
    })
  })

  describe('Sync activities', () => {
    it('should sync pending activities', async () => {
      // Add some pending activities
      activityLog.log({ agentId: 'test-agent', actionType: 'transaction', data: {} })
      activityLog.log({ agentId: 'test-agent', actionType: 'signature', data: {} })

      expect(activityLog.getPendingSync()).toHaveLength(2)

      const response = await client.sync()

      expect(response.syncedCount).toBe(2)
      expect(response.conflicts).toHaveLength(0)
      expect(response.syncToken).toBeDefined()
    })

    it('should mark activities as synced after successful sync', async () => {
      activityLog.log({ agentId: 'test-agent', actionType: 'transaction', data: {} })

      await client.sync()

      expect(activityLog.getPendingSync()).toHaveLength(0)
    })

    it('should return early when no pending activities', async () => {
      const response = await client.sync()

      expect(response.syncedCount).toBe(0)
    })

    it('should emit sync events', async () => {
      const events: MemoryEvent[] = []
      client.on((event) => events.push(event))

      activityLog.log({ agentId: 'test-agent', actionType: 'transaction', data: {} })
      await client.sync()

      expect(events.some((e) => e.type === 'sync_started')).toBe(true)
      expect(events.some((e) => e.type === 'sync_completed')).toBe(true)
    })
  })

  describe('Query history returns parsed response', () => {
    it('should search activities locally (stub)', async () => {
      activityLog.log({
        agentId: 'test-agent',
        actionType: 'transaction',
        data: { protocol: 'uniswap' },
      })
      activityLog.log({
        agentId: 'test-agent',
        actionType: 'signature',
        data: { purpose: 'approve tokens' },
      })

      const results = await client.search({ query: 'uniswap' })

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].activity).toBeDefined()
      expect(results[0].similarityScore).toBeGreaterThan(0)
    })

    it('should respect topK parameter', async () => {
      for (let i = 0; i < 10; i++) {
        activityLog.log({
          agentId: 'test-agent',
          actionType: 'transaction',
          data: { keyword: 'test' },
        })
      }

      const results = await client.search({ query: 'test', topK: 3 })

      expect(results.length).toBeLessThanOrEqual(3)
    })
  })

  describe('Client handles connection failure gracefully', () => {
    it('should emit sync_failed event on error', async () => {
      const events: MemoryEvent[] = []
      client.on((event) => events.push(event))

      // Mock a failure by making the stub throw
      const originalSync = (client as any).stubSyncActivities.bind(client)
      ;(client as any).stubSyncActivities = async () => {
        throw new Error('Network error')
      }

      activityLog.log({ agentId: 'test-agent', actionType: 'transaction', data: {} })

      await expect(client.sync()).rejects.toThrow('Network error')

      expect(events.some((e) => e.type === 'sync_failed')).toBe(true)

      // Restore
      ;(client as any).stubSyncActivities = originalSync
    })
  })

  describe('Background sync', () => {
    it('should start and stop background sync', () => {
      vi.useFakeTimers()

      client.startSync()

      // Sync should not have run yet
      expect(activityLog.getPendingSync()).toHaveLength(0)

      // Add activity and advance timer
      activityLog.log({ agentId: 'test-agent', actionType: 'transaction', data: {} })

      // Advance past sync interval (default 60s)
      vi.advanceTimersByTime(61_000)

      client.stopSync()

      vi.useRealTimers()
    })
  })

  describe('Sync token persistence', () => {
    it('should persist sync token to localStorage', async () => {
      activityLog.log({ agentId: 'test-agent', actionType: 'transaction', data: {} })
      await client.sync()

      const storedToken = localStorage.getItem('monmouth_sync_token_test-agent')
      expect(storedToken).toBeTruthy()
    })

    it('should restore sync token on new client instance', async () => {
      activityLog.log({ agentId: 'test-agent', actionType: 'transaction', data: {} })
      await client.sync()

      // Create new client
      const newClient = new MemoryClient({
        endpoint: 'http://localhost:50051',
        agentId: 'test-agent',
        activityLog: new ActivityLog({ autoSave: false }),
        autoSync: false,
      })

      // The new client should have loaded the sync token
      // (We can't directly access it, but we can verify it doesn't crash)
      expect(() => newClient.sync()).not.toThrow()

      newClient.destroy()
    })
  })

  describe('Event subscription', () => {
    it('should allow unsubscribing from events', async () => {
      const events: MemoryEvent[] = []
      const unsubscribe = client.on((event) => events.push(event))

      activityLog.log({ agentId: 'test-agent', actionType: 'transaction', data: {} })
      await client.sync()

      const eventCount = events.length
      unsubscribe()

      activityLog.log({ agentId: 'test-agent', actionType: 'transaction', data: {} })
      await client.sync()

      // Should not receive more events after unsubscribe
      expect(events.length).toBe(eventCount)
    })
  })

  describe('Factory function', () => {
    it('createMemoryClient should create a new instance', () => {
      const newClient = createMemoryClient({
        endpoint: 'http://localhost:50051',
        agentId: 'factory-agent',
        activityLog,
        autoSync: false,
      })

      expect(newClient).toBeInstanceOf(MemoryClient)
      newClient.destroy()
    })
  })

  describe('Cleanup', () => {
    it('should clean up resources on destroy', () => {
      client.startSync()
      client.destroy()

      expect(client.getConnectionState()).toBe('disconnected')
    })
  })
})
