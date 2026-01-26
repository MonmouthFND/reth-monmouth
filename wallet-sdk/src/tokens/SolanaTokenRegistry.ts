/**
 * SolanaTokenRegistry - SPL Token Registry with Metaplex metadata support
 *
 * Provides Solana token information from multiple sources:
 * 1. Local cache (localStorage)
 * 2. Jupiter verified token list
 * 3. On-chain mint info
 * 4. Metaplex metadata
 */

import {
  Connection,
  PublicKey,
} from '@solana/web3.js'

import type {
  MetaplexMetadata,
  SolanaTokenInfo,
  SolanaTokenRegistryConfig,
  TokenRegistryEvent,
  TokenRegistryEventListener,
  TokenSearchOptions,
  TokenSearchResult,
} from './types'

import {
  TokenRegistryError,
  isSolanaAddress,
} from './types'

import {
  COMMON_TOKENS,
  DEFAULT_CACHE_CONFIG,
  DEFAULT_SOLANA_RPC_URLS,
  SOLANA_CLUSTERS,
  SOLANA_TOKEN_LIST_URLS,
} from './constants'

// ============= Constants =============

const STORAGE_KEY_PREFIX = 'monmouth_solana_tokens_'

/**
 * Metaplex Token Metadata Program ID
 */
const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'
)

// ============= Cached Types =============

interface CachedSolanaToken {
  token: SolanaTokenInfo
  cachedAt: number
  expiresAt: number
  source: 'list' | 'onchain' | 'metaplex' | 'custom'
}

// ============= SolanaTokenRegistry Class =============

/**
 * Solana Token Registry
 *
 * Features:
 * - Load SPL token info from Jupiter token list
 * - Fetch on-chain mint info
 * - Fetch Metaplex metadata
 * - Cache tokens in localStorage
 * - Search tokens
 */
export class SolanaTokenRegistry {
  private tokens: Map<string, SolanaTokenInfo> = new Map()
  private tokensByMint: Map<string, SolanaTokenInfo> = new Map()
  private connection: Connection
  private listeners: Set<TokenRegistryEventListener> = new Set()
  private initialized = false

  private readonly config: Required<SolanaTokenRegistryConfig>
  private readonly cluster: string

  constructor(config: SolanaTokenRegistryConfig) {
    this.config = {
      rpcEndpoint: config.rpcEndpoint,
      enableCache: config.enableCache ?? true,
      cacheTTL: config.cacheTTL ?? DEFAULT_CACHE_CONFIG.TOKEN_TTL_MS,
      storagePrefix: config.storagePrefix ?? STORAGE_KEY_PREFIX,
      requestTimeout: config.requestTimeout ?? 10000,
    }

    // Determine cluster from RPC endpoint
    this.cluster = this.getClusterFromEndpoint(config.rpcEndpoint)

    // Create connection
    this.connection = new Connection(config.rpcEndpoint, {
      commitment: 'confirmed',
    })

    // Load common Solana tokens
    this.loadCommonTokens()

    // Load from cache
    if (this.config.enableCache) {
      this.loadFromCache()
    }
  }

  // ============= Initialization =============

  /**
   * Initialize by loading Jupiter token list
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      // Try to load Jupiter strict token list
      const url = SOLANA_TOKEN_LIST_URLS[0]
      await this.loadTokenList(url)
    } catch (error) {
      console.warn('Failed to load Jupiter token list:', error)
    }

    this.initialized = true
  }

  /**
   * Load common Solana tokens
   */
  private loadCommonTokens(): void {
    for (const [symbol, token] of Object.entries(COMMON_TOKENS)) {
      const mintAddress = token.addresses[this.cluster]
      if (!mintAddress) continue

      const solanaToken: SolanaTokenInfo = {
        ...token,
        mintAddress,
      }

      this.tokens.set(symbol.toUpperCase(), solanaToken)
      this.tokensByMint.set(mintAddress, solanaToken)
    }
  }

  /**
   * Load token list from URL (Jupiter format)
   */
  private async loadTokenList(url: string): Promise<number> {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(
        () => controller.abort(),
        this.config.requestTimeout
      )

      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
      clearTimeout(timeout)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const tokens = (await response.json()) as JupiterToken[]

      for (const jupToken of tokens) {
        const token: SolanaTokenInfo = {
          symbol: jupToken.symbol,
          name: jupToken.name,
          decimals: jupToken.decimals,
          logoURI: jupToken.logoURI,
          mintAddress: jupToken.address,
          addresses: { [this.cluster]: jupToken.address },
          verified: true,
          tags: jupToken.tags ?? [],
        }

        this.tokens.set(token.symbol.toUpperCase(), token)
        this.tokensByMint.set(token.mintAddress, token)
      }

      this.emit({ type: 'list_loaded', url, count: tokens.length })
      return tokens.length
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this.emit({ type: 'list_failed', url, error: message })
      throw new TokenRegistryError(
        'LIST_FETCH_FAILED',
        `Failed to load Solana token list: ${message}`
      )
    }
  }

  // ============= Token Lookup =============

  /**
   * Get token by mint address or symbol
   */
  async getToken(mintOrSymbol: string): Promise<SolanaTokenInfo | undefined> {
    // Check if it's a mint address
    if (isSolanaAddress(mintOrSymbol)) {
      return this.getTokenByMint(mintOrSymbol)
    }

    // It's a symbol
    return this.getTokenBySymbol(mintOrSymbol)
  }

  /**
   * Get token by symbol
   */
  getTokenBySymbol(symbol: string): SolanaTokenInfo | undefined {
    return this.tokens.get(symbol.toUpperCase())
  }

  /**
   * Get token by mint address
   */
  async getTokenByMint(mintAddress: string): Promise<SolanaTokenInfo | undefined> {
    // Check cache
    const cached = this.tokensByMint.get(mintAddress)
    if (cached) {
      return cached
    }

    // Fetch from on-chain
    try {
      const mintInfo = await this.getMintInfo(mintAddress)
      if (mintInfo) {
        this.cacheToken(mintInfo)
        return mintInfo
      }
    } catch (error) {
      console.debug(`Failed to fetch mint info for ${mintAddress}:`, error)
    }

    return undefined
  }

  // ============= On-Chain Data =============

  /**
   * Get mint info from on-chain
   */
  async getMintInfo(mintAddress: string): Promise<SolanaTokenInfo | undefined> {
    try {
      const mintPubkey = new PublicKey(mintAddress)

      // Get mint account info
      const mintAccountInfo = await this.connection.getAccountInfo(mintPubkey)
      if (!mintAccountInfo) {
        return undefined
      }

      // Parse mint data (simplified - in production use @solana/spl-token)
      // Mint layout: [36 bytes mintAuthority, 8 bytes supply, 1 byte decimals, 1 byte isInitialized, 36 bytes freezeAuthority]
      const data = mintAccountInfo.data
      if (data.length < 82) {
        return undefined
      }

      const decimals = data[44]
      const isInitialized = data[45] === 1

      if (!isInitialized) {
        return undefined
      }

      // Try to get Metaplex metadata for name/symbol
      const metadata = await this.getMetaplexMetadata(mintAddress)

      const token: SolanaTokenInfo = {
        symbol: metadata?.symbol ?? 'UNKNOWN',
        name: metadata?.name ?? 'Unknown Token',
        decimals,
        mintAddress,
        addresses: { [this.cluster]: mintAddress },
        verified: false,
        isInitialized: true,
        tags: ['onchain'],
      }

      // Get mint/freeze authority if present
      const mintAuthorityOption = data[0]
      if (mintAuthorityOption === 1) {
        token.mintAuthority = new PublicKey(data.slice(4, 36)).toBase58()
      }

      const freezeAuthorityOption = data[46]
      if (freezeAuthorityOption === 1) {
        token.freezeAuthority = new PublicKey(data.slice(50, 82)).toBase58()
      }

      return token
    } catch (error) {
      throw new TokenRegistryError(
        'ONCHAIN_FETCH_FAILED',
        `Failed to fetch mint info for ${mintAddress}`,
        error
      )
    }
  }

  /**
   * Get Metaplex metadata for a token
   */
  async getMetaplexMetadata(mintAddress: string): Promise<MetaplexMetadata | undefined> {
    try {
      const mintPubkey = new PublicKey(mintAddress)

      // Derive metadata PDA
      const [metadataPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('metadata'),
          TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          mintPubkey.toBuffer(),
        ],
        TOKEN_METADATA_PROGRAM_ID
      )

      // Get metadata account
      const metadataAccount = await this.connection.getAccountInfo(metadataPDA)
      if (!metadataAccount) {
        return undefined
      }

      // Parse metadata (simplified parsing)
      const data = metadataAccount.data
      if (data.length < 1) {
        return undefined
      }

      // Metaplex metadata layout is complex, here's a simplified version
      // In production, use @metaplex-foundation/mpl-token-metadata
      const metadata = this.parseMetaplexData(data)
      return metadata
    } catch {
      // Metadata not found or parsing failed
      return undefined
    }
  }

  /**
   * Parse Metaplex metadata data
   * This is a simplified parser - in production use the official library
   */
  private parseMetaplexData(data: Buffer): MetaplexMetadata | undefined {
    try {
      // Skip first byte (key)
      let offset = 1

      // Skip update authority (32 bytes)
      offset += 32

      // Skip mint (32 bytes)
      offset += 32

      // Read name (4 bytes length + string)
      const nameLength = data.readUInt32LE(offset)
      offset += 4
      const name = data.slice(offset, offset + nameLength).toString('utf8').replace(/\0/g, '').trim()
      offset += nameLength

      // Read symbol (4 bytes length + string)
      const symbolLength = data.readUInt32LE(offset)
      offset += 4
      const symbol = data.slice(offset, offset + symbolLength).toString('utf8').replace(/\0/g, '').trim()
      offset += symbolLength

      // Read uri (4 bytes length + string)
      const uriLength = data.readUInt32LE(offset)
      offset += 4
      const uri = data.slice(offset, offset + uriLength).toString('utf8').replace(/\0/g, '').trim()
      offset += uriLength

      // Read seller fee basis points
      const sellerFeeBasisPoints = data.readUInt16LE(offset)

      return {
        name,
        symbol,
        uri,
        sellerFeeBasisPoints,
      }
    } catch {
      return undefined
    }
  }

  // ============= Search =============

  /**
   * Search tokens
   */
  searchTokens(query: string, options: TokenSearchOptions = {}): TokenSearchResult[] {
    const { limit = 20, includeUnverified = true } = options

    const normalizedQuery = query.toLowerCase().trim()
    if (!normalizedQuery) return []

    const results: TokenSearchResult[] = []

    for (const token of this.tokens.values()) {
      if (!includeUnverified && !token.verified) {
        continue
      }

      const result = this.matchToken(token, normalizedQuery)
      if (result) {
        results.push(result)
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  /**
   * Match a token against a query
   */
  private matchToken(
    token: SolanaTokenInfo,
    query: string
  ): TokenSearchResult | null {
    const symbolLower = token.symbol.toLowerCase()
    const nameLower = token.name.toLowerCase()

    // Exact symbol match
    if (symbolLower === query) {
      return { token, score: 1.0, matchedField: 'symbol' }
    }

    // Symbol starts with query
    if (symbolLower.startsWith(query)) {
      return { token, score: 0.9, matchedField: 'symbol' }
    }

    // Symbol contains query
    if (symbolLower.includes(query)) {
      return { token, score: 0.7, matchedField: 'symbol' }
    }

    // Name match
    if (nameLower.startsWith(query)) {
      return { token, score: 0.6, matchedField: 'name' }
    }

    if (nameLower.includes(query)) {
      return { token, score: 0.4, matchedField: 'name' }
    }

    // Mint address match
    if (isSolanaAddress(query) && token.mintAddress === query) {
      return { token, score: 1.0, matchedField: 'address' }
    }

    if (token.mintAddress.toLowerCase().includes(query.toLowerCase())) {
      return { token, score: 0.5, matchedField: 'address' }
    }

    return null
  }

  // ============= Custom Tokens =============

  /**
   * Add a custom token
   */
  addCustomToken(token: SolanaTokenInfo): void {
    const customToken: SolanaTokenInfo = {
      ...token,
      verified: false,
      tags: [...(token.tags ?? []), 'custom'],
    }

    this.tokens.set(token.symbol.toUpperCase(), customToken)
    this.tokensByMint.set(token.mintAddress, customToken)

    this.saveToCache()
    this.emit({ type: 'token_added', token: customToken })
  }

  /**
   * Remove a custom token
   */
  removeCustomToken(symbol: string): boolean {
    const token = this.tokens.get(symbol.toUpperCase())
    if (!token || token.verified) {
      return false
    }

    this.tokens.delete(symbol.toUpperCase())
    this.tokensByMint.delete(token.mintAddress)

    this.saveToCache()
    this.emit({ type: 'token_removed', symbol })
    return true
  }

  // ============= Cache =============

  /**
   * Cache a token
   */
  private cacheToken(token: SolanaTokenInfo): void {
    this.tokens.set(token.symbol.toUpperCase(), token)
    this.tokensByMint.set(token.mintAddress, token)
    this.saveToCache()
  }

  /**
   * Load tokens from cache
   */
  private loadFromCache(): void {
    if (typeof localStorage === 'undefined') return

    try {
      const key = `${this.config.storagePrefix}${this.cluster}`
      const stored = localStorage.getItem(key)
      if (!stored) return

      const cached = JSON.parse(stored) as CachedSolanaToken[]
      const now = Date.now()

      for (const entry of cached) {
        if (entry.expiresAt > now) {
          this.tokens.set(entry.token.symbol.toUpperCase(), entry.token)
          this.tokensByMint.set(entry.token.mintAddress, entry.token)
        }
      }
    } catch {
      // Cache load failed
    }
  }

  /**
   * Save tokens to cache
   */
  private saveToCache(): void {
    if (!this.config.enableCache || typeof localStorage === 'undefined') {
      return
    }

    try {
      const key = `${this.config.storagePrefix}${this.cluster}`
      const now = Date.now()

      const cached: CachedSolanaToken[] = []
      for (const token of this.tokens.values()) {
        cached.push({
          token,
          cachedAt: now,
          expiresAt: now + this.config.cacheTTL,
          source: token.verified ? 'list' : 'onchain',
        })
      }

      localStorage.setItem(key, JSON.stringify(cached))
    } catch {
      // Cache save failed
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    if (typeof localStorage === 'undefined') return

    try {
      const key = `${this.config.storagePrefix}${this.cluster}`
      localStorage.removeItem(key)

      // Keep only common tokens
      this.tokens.clear()
      this.tokensByMint.clear()
      this.loadCommonTokens()

      this.emit({ type: 'cache_cleared' })
    } catch {
      // Cache clear failed
    }
  }

  // ============= Utilities =============

  /**
   * Get cluster from RPC endpoint
   */
  private getClusterFromEndpoint(endpoint: string): string {
    if (endpoint.includes('mainnet')) return SOLANA_CLUSTERS.MAINNET
    if (endpoint.includes('devnet')) return SOLANA_CLUSTERS.DEVNET
    if (endpoint.includes('testnet')) return SOLANA_CLUSTERS.TESTNET
    return SOLANA_CLUSTERS.MAINNET
  }

  /**
   * Get all tokens
   */
  getAllTokens(): SolanaTokenInfo[] {
    return Array.from(this.tokens.values())
  }

  /**
   * Get token count
   */
  getTokenCount(): { total: number; verified: number } {
    const verified = Array.from(this.tokens.values()).filter((t) => t.verified).length
    return {
      total: this.tokens.size,
      verified,
    }
  }

  /**
   * Get connection
   */
  getConnection(): Connection {
    return this.connection
  }

  // ============= Events =============

  /**
   * Subscribe to events
   */
  on(listener: TokenRegistryEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Emit an event
   */
  private emit(event: TokenRegistryEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event)
      } catch (error) {
        console.error('Solana token registry event listener error:', error)
      }
    })
  }
}

// ============= Types =============

/**
 * Jupiter token format
 */
interface JupiterToken {
  address: string
  symbol: string
  name: string
  decimals: number
  logoURI?: string
  tags?: string[]
  extensions?: Record<string, unknown>
}

// ============= Factory Functions =============

/**
 * Create a new SolanaTokenRegistry instance
 */
export function createSolanaTokenRegistry(
  config: SolanaTokenRegistryConfig
): SolanaTokenRegistry {
  return new SolanaTokenRegistry(config)
}

/**
 * Create a Solana token registry for mainnet
 */
export function createMainnetSolanaRegistry(): SolanaTokenRegistry {
  return new SolanaTokenRegistry({
    rpcEndpoint: DEFAULT_SOLANA_RPC_URLS[SOLANA_CLUSTERS.MAINNET],
  })
}

/**
 * Create a Solana token registry for devnet
 */
export function createDevnetSolanaRegistry(): SolanaTokenRegistry {
  return new SolanaTokenRegistry({
    rpcEndpoint: DEFAULT_SOLANA_RPC_URLS[SOLANA_CLUSTERS.DEVNET],
  })
}
