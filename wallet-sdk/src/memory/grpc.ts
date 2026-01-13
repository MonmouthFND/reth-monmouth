/**
 * gRPC-Web Client for ExEx Memory Service
 *
 * Lightweight browser-compatible gRPC client using the gRPC-web JSON protocol.
 * This avoids heavy protobuf dependencies while maintaining compatibility
 * with tonic-web on the server side.
 */

import type { ActivityLogEntry, SyncStatus } from './types'

// ============= Protocol Types =============

/**
 * gRPC-web request options
 */
export interface GrpcRequestOptions {
  timeout?: number
  headers?: Record<string, string>
}

/**
 * gRPC-web response
 */
export interface GrpcResponse<T> {
  message: T
  status: number
  statusMessage: string
  trailers?: Record<string, string>
}

// ============= Memory Service Request/Response Types =============

/**
 * Sync request to ExEx memory service
 */
export interface MemorySyncRequest {
  agentId: string
  activities: MemoryActivity[]
  lastSyncToken?: string
  clientVersion: number
}

/**
 * Activity record for sync
 */
export interface MemoryActivity {
  id?: number
  agentId: string
  actionType: string
  timestamp: number
  data: string // JSON-encoded
  txHash?: string
  syncStatus: string
  version: number
}

/**
 * Sync response from ExEx memory service
 */
export interface MemorySyncResponse {
  syncToken: string
  serverActivities: MemoryActivity[]
  conflicts: MemoryConflict[]
  serverVersion: number
}

/**
 * Conflict from sync
 */
export interface MemoryConflict {
  clientActivity: MemoryActivity
  serverActivity: MemoryActivity
  resolution: 'client_wins' | 'server_wins' | 'merge'
}

/**
 * Semantic search request
 */
export interface MemorySearchRequest {
  agentId: string
  query: string
  topK?: number
  startTime?: number
  endTime?: number
  actionTypes?: string[]
}

/**
 * Search result
 */
export interface MemorySearchResponse {
  results: MemorySearchResult[]
  totalMatches: number
  searchTimeMs: number
}

/**
 * Individual search result
 */
export interface MemorySearchResult {
  activity: MemoryActivity
  score: number
  highlights?: string[]
}

/**
 * Health check response
 */
export interface MemoryHealthResponse {
  healthy: boolean
  version: string
  uptimeSeconds: number
  memoryServiceAvailable: boolean
}

// ============= gRPC-Web Client =============

/**
 * GrpcWebClient - Browser-compatible gRPC-web client
 *
 * Uses gRPC-web JSON protocol for easier browser integration.
 * Compatible with tonic-web (Rust) server when configured with JSON encoding.
 */
export class GrpcWebClient {
  private endpoint: string
  private defaultTimeout: number
  private headers: Record<string, string>

  constructor(config: {
    endpoint: string
    timeout?: number
    headers?: Record<string, string>
  }) {
    // Ensure endpoint doesn't end with /
    this.endpoint = config.endpoint.replace(/\/$/, '')
    this.defaultTimeout = config.timeout ?? 30000
    this.headers = {
      'Content-Type': 'application/grpc-web+json',
      'Accept': 'application/grpc-web+json',
      'X-Grpc-Web': '1',
      ...config.headers,
    }
  }

  /**
   * Make a unary gRPC call
   */
  async call<TReq, TRes>(
    service: string,
    method: string,
    request: TReq,
    options?: GrpcRequestOptions
  ): Promise<GrpcResponse<TRes>> {
    const url = `${this.endpoint}/${service}/${method}`
    const timeout = options?.timeout ?? this.defaultTimeout

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      // gRPC-web JSON uses base64-encoded frames
      const requestBody = this.encodeRequest(request)

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...this.headers,
          ...options?.headers,
        },
        body: requestBody,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const grpcStatus = response.headers.get('grpc-status') ?? '2'
        const grpcMessage = response.headers.get('grpc-message') ?? 'Unknown error'
        return {
          message: {} as TRes,
          status: parseInt(grpcStatus, 10),
          statusMessage: decodeURIComponent(grpcMessage),
        }
      }

      const responseBody = await response.text()
      const message = this.decodeResponse<TRes>(responseBody)

      return {
        message,
        status: 0, // OK
        statusMessage: 'OK',
        trailers: this.parseTrailers(response.headers),
      }
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof Error && error.name === 'AbortError') {
        return {
          message: {} as TRes,
          status: 4, // DEADLINE_EXCEEDED
          statusMessage: 'Request timeout',
        }
      }

      return {
        message: {} as TRes,
        status: 14, // UNAVAILABLE
        statusMessage: error instanceof Error ? error.message : 'Connection failed',
      }
    }
  }

  /**
   * Encode request for gRPC-web JSON
   */
  private encodeRequest<T>(request: T): string {
    // gRPC-web JSON: 5-byte header (1 byte flag + 4 bytes length) + JSON body
    const json = JSON.stringify(request)
    const length = json.length

    // Create header: 0x00 (uncompressed) + 4-byte big-endian length
    const header = new Uint8Array(5)
    header[0] = 0x00 // Not compressed
    header[1] = (length >> 24) & 0xff
    header[2] = (length >> 16) & 0xff
    header[3] = (length >> 8) & 0xff
    header[4] = length & 0xff

    // Combine header and body
    const combined = new Uint8Array(5 + length)
    combined.set(header)
    new TextEncoder().encode(json).forEach((byte, i) => {
      combined[5 + i] = byte
    })

    // Base64 encode
    return btoa(String.fromCharCode(...combined))
  }

  /**
   * Decode response from gRPC-web JSON
   */
  private decodeResponse<T>(body: string): T {
    try {
      // Base64 decode
      const binary = atob(body)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }

      // Skip 5-byte header
      if (bytes.length < 5) {
        throw new Error('Invalid response: too short')
      }

      const length =
        (bytes[1] << 24) | (bytes[2] << 16) | (bytes[3] << 8) | bytes[4]
      const jsonBytes = bytes.slice(5, 5 + length)
      const json = new TextDecoder().decode(jsonBytes)

      return JSON.parse(json) as T
    } catch {
      // Try parsing as plain JSON (some servers don't frame)
      try {
        return JSON.parse(body) as T
      } catch {
        return {} as T
      }
    }
  }

  /**
   * Parse trailer headers
   */
  private parseTrailers(headers: Headers): Record<string, string> {
    const trailers: Record<string, string> = {}
    headers.forEach((value, key) => {
      if (key.startsWith('grpc-')) {
        trailers[key] = value
      }
    })
    return trailers
  }
}

// ============= Memory Service Client =============

/**
 * MemoryServiceClient - High-level client for ExEx memory service
 */
export class MemoryServiceClient {
  private client: GrpcWebClient
  private serviceName = 'exex.MemoryService'

  constructor(endpoint: string, options?: { timeout?: number }) {
    this.client = new GrpcWebClient({
      endpoint,
      timeout: options?.timeout,
    })
  }

  /**
   * Sync activities with server
   */
  async sync(request: MemorySyncRequest): Promise<GrpcResponse<MemorySyncResponse>> {
    return this.client.call<MemorySyncRequest, MemorySyncResponse>(
      this.serviceName,
      'Sync',
      request
    )
  }

  /**
   * Semantic search over activities
   */
  async search(request: MemorySearchRequest): Promise<GrpcResponse<MemorySearchResponse>> {
    return this.client.call<MemorySearchRequest, MemorySearchResponse>(
      this.serviceName,
      'Search',
      request
    )
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<GrpcResponse<MemoryHealthResponse>> {
    return this.client.call<Record<string, never>, MemoryHealthResponse>(
      this.serviceName,
      'HealthCheck',
      {}
    )
  }

  /**
   * Get activity by ID
   */
  async getActivity(
    agentId: string,
    activityId: number
  ): Promise<GrpcResponse<{ activity?: MemoryActivity }>> {
    return this.client.call(
      this.serviceName,
      'GetActivity',
      { agentId, activityId }
    )
  }
}

// ============= Conversion Utilities =============

/**
 * Convert ActivityLogEntry to MemoryActivity for sync
 */
export function toMemoryActivity(entry: ActivityLogEntry): MemoryActivity {
  return {
    id: entry.id,
    agentId: entry.agentId,
    actionType: entry.actionType,
    timestamp: entry.timestamp,
    data: JSON.stringify(entry.data),
    txHash: entry.txHash,
    syncStatus: entry.syncStatus ?? 'pending',
    version: entry.version ?? 1,
  }
}

/**
 * Convert MemoryActivity to ActivityLogEntry
 */
export function fromMemoryActivity(activity: MemoryActivity): ActivityLogEntry {
  return {
    id: activity.id,
    agentId: activity.agentId,
    actionType: activity.actionType as ActivityLogEntry['actionType'],
    timestamp: activity.timestamp,
    data: JSON.parse(activity.data),
    txHash: activity.txHash as `0x${string}` | undefined,
    syncStatus: activity.syncStatus as SyncStatus,
    version: activity.version,
  }
}
