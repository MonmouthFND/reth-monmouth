/**
 * MemoryClient - gRPC client stub for ExEx memory service integration
 *
 * This is a stub implementation that will be connected to the actual
 * ExEx memory service via gRPC-web in a future phase.
 *
 * The client handles:
 * - Activity sync with ExEx memory service
 * - Semantic search over activity history
 * - Conflict resolution
 * - Offline-first with background sync
 */

import type {
  ActivityLogEntry,
  SyncRequest,
  SyncResponse,
  MemoryEvent,
  MemoryEventListener,
} from './types'
import type { ActivityLog } from './ActivityLog'

/**
 * Configuration for MemoryClient
 */
export interface MemoryClientConfig {
  /** ExEx service endpoint (e.g., 'http://localhost:50051') */
  endpoint: string
  /** Agent ID for this client */
  agentId: string
  /** ActivityLog instance to sync */
  activityLog: ActivityLog
  /** Sync interval in milliseconds (default: 60000 = 1 minute) */
  syncIntervalMs?: number
  /** Whether to start sync automatically */
  autoSync?: boolean
  /** Timeout for sync requests in milliseconds */
  timeoutMs?: number
}

/**
 * Search request for semantic search
 */
export interface SearchRequest {
  query: string
  topK?: number
  startTime?: number
  endTime?: number
}

/**
 * Search result from semantic search
 */
export interface SearchResult {
  activity: ActivityLogEntry
  similarityScore: number
  summary?: string
}

/**
 * Connection state
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

/**
 * MemoryClient - Stub implementation for ExEx integration
 *
 * NOTE: This is a stub. The actual gRPC-web implementation will be added
 * when the ExEx memory service protobuf definitions are finalized.
 */
export class MemoryClient {
  private config: MemoryClientConfig
  private connectionState: ConnectionState = 'disconnected'
  private syncTimer: ReturnType<typeof setInterval> | number | null = null
  private lastSyncToken: string | null = null
  private listeners: Set<MemoryEventListener> = new Set()

  constructor(config: MemoryClientConfig) {
    this.config = {
      syncIntervalMs: 60_000,
      autoSync: false,
      timeoutMs: 30_000,
      ...config,
    }

    // Load last sync token
    this.loadSyncToken()

    // Start auto-sync if enabled
    if (this.config.autoSync) {
      this.startSync()
    }
  }

  // ============= Connection Management =============

  /**
   * Get current connection state
   */
  getConnectionState(): ConnectionState {
    return this.connectionState
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.connectionState === 'connected'
  }

  /**
   * Connect to the ExEx memory service
   *
   * NOTE: Stub implementation - always succeeds
   */
  async connect(): Promise<void> {
    this.connectionState = 'connecting'
    this.emit({ type: 'sync_started' })

    // TODO: Implement actual gRPC-web connection
    // For now, simulate connection
    await this.simulateNetworkDelay()

    this.connectionState = 'connected'
    console.log(`[MemoryClient] Connected to ${this.config.endpoint} (stub)`)
  }

  /**
   * Disconnect from the ExEx memory service
   */
  disconnect(): void {
    this.stopSync()
    this.connectionState = 'disconnected'
    console.log('[MemoryClient] Disconnected')
  }

  // ============= Sync Operations =============

  /**
   * Start background sync
   */
  startSync(): void {
    if (this.syncTimer) return

    this.syncTimer = setInterval(async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        console.log('[MemoryClient] Offline, skipping sync')
        return
      }

      try {
        await this.sync()
      } catch (error) {
        console.error('[MemoryClient] Sync failed:', error)
        this.emit({ type: 'sync_failed', error: String(error) })
      }
    }, this.config.syncIntervalMs)

    // Also listen for online events
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.sync())
    }

    console.log(`[MemoryClient] Background sync started (interval: ${this.config.syncIntervalMs}ms)`)
  }

  /**
   * Stop background sync
   */
  stopSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
      this.syncTimer = null
    }
  }

  /**
   * Sync pending activities with ExEx
   *
   * NOTE: Stub implementation - simulates sync
   */
  async sync(): Promise<SyncResponse> {
    const pending = this.config.activityLog.getPendingSync()

    if (pending.length === 0) {
      return {
        syncToken: this.lastSyncToken ?? '',
        conflicts: [],
        syncedCount: 0,
      }
    }

    this.emit({ type: 'sync_started' })

    const request: SyncRequest = {
      activities: pending,
      lastSyncToken: this.lastSyncToken ?? undefined,
    }

    try {
      // TODO: Replace with actual gRPC-web call
      const response = await this.stubSyncActivities(request)

      // Handle conflicts
      for (const conflict of response.conflicts) {
        this.emit({ type: 'conflict_detected', conflict })
      }

      // Mark non-conflicting entries as synced
      const syncedIds = pending
        .filter((p) => !response.conflicts.some((c) => c.localId === p.id))
        .map((p) => p.id!)
        .filter((id) => id !== undefined)

      this.config.activityLog.markSynced(syncedIds)

      // Save sync token
      this.lastSyncToken = response.syncToken
      this.saveSyncToken()

      this.emit({ type: 'sync_completed', syncedCount: response.syncedCount })

      return response
    } catch (error) {
      this.emit({ type: 'sync_failed', error: String(error) })
      throw error
    }
  }

  /**
   * Force immediate sync
   */
  async forceSync(): Promise<SyncResponse> {
    return this.sync()
  }

  // ============= Search Operations =============

  /**
   * Semantic search over activity history
   *
   * NOTE: Stub implementation - falls back to local text search
   */
  async search(request: SearchRequest): Promise<SearchResult[]> {
    // TODO: Replace with actual gRPC-web call to ExEx RAG service

    // For now, do a simple local search
    const activities = this.config.activityLog.query({
      agentId: this.config.agentId,
      startTime: request.startTime,
      endTime: request.endTime,
      limit: request.topK ?? 10,
    })

    // Simple text matching (placeholder for semantic search)
    const queryLower = request.query.toLowerCase()
    const results: SearchResult[] = activities
      .map((activity) => {
        const dataStr = JSON.stringify(activity.data).toLowerCase()
        const actionType = activity.actionType.toLowerCase()

        // Simple relevance scoring
        let score = 0
        if (dataStr.includes(queryLower)) score += 0.5
        if (actionType.includes(queryLower)) score += 0.3
        if (activity.txHash?.toLowerCase().includes(queryLower)) score += 0.2

        return {
          activity,
          similarityScore: score,
        }
      })
      .filter((r) => r.similarityScore > 0)
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, request.topK ?? 10)

    return results
  }

  // ============= Stub Implementations =============

  /**
   * Stub: Sync activities with ExEx
   * This will be replaced with actual gRPC-web call
   */
  private async stubSyncActivities(request: SyncRequest): Promise<SyncResponse> {
    await this.simulateNetworkDelay()

    // Simulate successful sync with no conflicts
    const newToken = `sync_${Date.now()}_${Math.random().toString(36).slice(2)}`

    return {
      syncToken: newToken,
      conflicts: [],
      syncedCount: request.activities.length,
    }
  }

  /**
   * Simulate network delay for stub implementations
   */
  private async simulateNetworkDelay(): Promise<void> {
    const delay = 50 + Math.random() * 100 // 50-150ms
    await new Promise((resolve) => setTimeout(resolve, delay))
  }

  // ============= Token Persistence =============

  private saveSyncToken(): void {
    if (typeof localStorage === 'undefined') return

    try {
      localStorage.setItem(
        `monmouth_sync_token_${this.config.agentId}`,
        this.lastSyncToken ?? ''
      )
    } catch (error) {
      console.error('[MemoryClient] Failed to save sync token:', error)
    }
  }

  private loadSyncToken(): void {
    if (typeof localStorage === 'undefined') return

    try {
      this.lastSyncToken =
        localStorage.getItem(`monmouth_sync_token_${this.config.agentId}`) || null
    } catch (error) {
      console.error('[MemoryClient] Failed to load sync token:', error)
    }
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
        console.error('[MemoryClient] Event listener error:', error)
      }
    })
  }

  // ============= Cleanup =============

  /**
   * Destroy the client and clean up resources
   */
  destroy(): void {
    this.stopSync()
    this.listeners.clear()
    this.connectionState = 'disconnected'
  }
}

/**
 * Create a new MemoryClient instance
 */
export function createMemoryClient(config: MemoryClientConfig): MemoryClient {
  return new MemoryClient(config)
}
