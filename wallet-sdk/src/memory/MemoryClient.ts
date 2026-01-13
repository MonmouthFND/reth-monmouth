/**
 * MemoryClient - gRPC client for ExEx memory service integration
 *
 * Provides integration with ExEx memory service via gRPC-web:
 * - Activity sync with ExEx memory service
 * - Semantic search over activity history
 * - Conflict resolution
 * - Offline-first with background sync
 *
 * Can run in stub mode (useGrpc: false) for testing or when
 * ExEx service is not available.
 */

import type {
  ActivityLogEntry,
  SyncRequest,
  SyncResponse,
  MemoryEvent,
  MemoryEventListener,
} from './types'
import type { ActivityLog } from './ActivityLog'
import {
  MemoryServiceClient,
  toMemoryActivity,
  fromMemoryActivity,
  type MemorySyncRequest,
  type MemorySearchRequest,
} from './grpc'

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
  /** Use real gRPC client (false = stub mode for testing) */
  useGrpc?: boolean
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
 * MemoryClient - gRPC client for ExEx memory integration
 *
 * Supports two modes:
 * - gRPC mode (useGrpc: true): Real gRPC-web calls to ExEx service
 * - Stub mode (useGrpc: false): Local stub for testing/offline
 */
export class MemoryClient {
  private config: MemoryClientConfig
  private connectionState: ConnectionState = 'disconnected'
  private syncTimer: ReturnType<typeof setInterval> | number | null = null
  private lastSyncToken: string | null = null
  private listeners: Set<MemoryEventListener> = new Set()
  private grpcClient: MemoryServiceClient | null = null

  constructor(config: MemoryClientConfig) {
    this.config = {
      syncIntervalMs: 60_000,
      autoSync: false,
      timeoutMs: 30_000,
      useGrpc: false, // Default to stub mode
      ...config,
    }

    // Initialize gRPC client if enabled
    if (this.config.useGrpc) {
      this.grpcClient = new MemoryServiceClient(this.config.endpoint, {
        timeout: this.config.timeoutMs,
      })
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
   */
  async connect(): Promise<void> {
    this.connectionState = 'connecting'
    this.emit({ type: 'sync_started' })

    if (this.grpcClient) {
      // Use real gRPC connection
      try {
        const response = await this.grpcClient.healthCheck()
        if (response.status === 0 && response.message.healthy) {
          this.connectionState = 'connected'
          console.log(`[MemoryClient] Connected to ${this.config.endpoint}`)
        } else {
          this.connectionState = 'error'
          console.error(`[MemoryClient] Health check failed: ${response.statusMessage}`)
        }
      } catch (error) {
        this.connectionState = 'error'
        console.error('[MemoryClient] Connection failed:', error)
      }
    } else {
      // Stub mode
      await this.simulateNetworkDelay()
      this.connectionState = 'connected'
      console.log(`[MemoryClient] Connected to ${this.config.endpoint} (stub mode)`)
    }
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

    try {
      let response: SyncResponse

      if (this.grpcClient) {
        // Use real gRPC sync
        response = await this.grpcSync(pending)
      } else {
        // Use stub sync
        const request: SyncRequest = {
          activities: pending,
          lastSyncToken: this.lastSyncToken ?? undefined,
        }
        response = await this.stubSyncActivities(request)
      }

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
   * Sync using gRPC client
   */
  private async grpcSync(pending: ActivityLogEntry[]): Promise<SyncResponse> {
    if (!this.grpcClient) {
      throw new Error('gRPC client not initialized')
    }

    const request: MemorySyncRequest = {
      agentId: this.config.agentId,
      activities: pending.map(toMemoryActivity),
      lastSyncToken: this.lastSyncToken ?? undefined,
      clientVersion: 1,
    }

    const grpcResponse = await this.grpcClient.sync(request)

    if (grpcResponse.status !== 0) {
      throw new Error(`Sync failed: ${grpcResponse.statusMessage}`)
    }

    return {
      syncToken: grpcResponse.message.syncToken,
      conflicts: grpcResponse.message.conflicts.map((c) => ({
        localId: c.clientActivity.id ?? 0,
        remoteVersion: fromMemoryActivity(c.serverActivity),
        reason: c.resolution,
      })),
      syncedCount: pending.length - grpcResponse.message.conflicts.length,
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
   * Uses gRPC semantic search when available, falls back to local text search.
   */
  async search(request: SearchRequest): Promise<SearchResult[]> {
    if (this.grpcClient) {
      // Use gRPC semantic search
      return this.grpcSearch(request)
    }

    // Fall back to local text search
    return this.localSearch(request)
  }

  /**
   * Semantic search using gRPC
   */
  private async grpcSearch(request: SearchRequest): Promise<SearchResult[]> {
    if (!this.grpcClient) {
      throw new Error('gRPC client not initialized')
    }

    const grpcRequest: MemorySearchRequest = {
      agentId: this.config.agentId,
      query: request.query,
      topK: request.topK,
      startTime: request.startTime,
      endTime: request.endTime,
    }

    const response = await this.grpcClient.search(grpcRequest)

    if (response.status !== 0) {
      console.warn(`[MemoryClient] gRPC search failed: ${response.statusMessage}, falling back to local`)
      return this.localSearch(request)
    }

    return response.message.results.map((r) => ({
      activity: fromMemoryActivity(r.activity),
      similarityScore: r.score,
      summary: r.highlights?.join(' '),
    }))
  }

  /**
   * Local text search fallback
   */
  private localSearch(request: SearchRequest): SearchResult[] {
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
