/**
 * TokenRegistry - EVM Token Registry with caching and on-chain lookup
 *
 * Provides token information from multiple sources:
 * 1. Local cache (localStorage)
 * 2. Loaded token lists (Uniswap Token List format)
 * 3. On-chain metadata (ERC20 name/symbol/decimals)
 * 4. User-added custom tokens
 */

import {
  createPublicClient,
  http,
  type Address,
  type PublicClient,
} from 'viem'

import type {
  CachedToken,
  CachedTokenList,
  TokenInfo,
  TokenList,
  TokenRegistryConfig,
  TokenRegistryEvent,
  TokenRegistryEventListener,
  TokenSafetyResult,
  TokenSearchOptions,
  TokenSearchResult,
} from './types'

import {
  ERC20_METADATA_ABI,
  TokenRegistryError,
  isEvmAddress,
  mergeTokenInfo,
  normalizeTokenAddress,
  tokenListTokenToInfo,
} from './types'

import {
  BLOCKED_TOKENS,
  CHAIN_IDS,
  COMMON_TOKENS,
  DEFAULT_CACHE_CONFIG,
  DEFAULT_RPC_URLS,
  DEFAULT_TOKEN_LIST_URLS,
} from './constants'

// ============= Storage Keys =============

const STORAGE_KEYS = {
  TOKENS: 'tokens',
  LISTS: 'lists',
  CUSTOM: 'custom',
} as const

// ============= TokenRegistry Class =============

/**
 * Token Registry for EVM chains
 *
 * Features:
 * - Load tokens from Uniswap-style token lists
 * - Cache tokens in localStorage with TTL
 * - Fetch on-chain metadata for unknown tokens
 * - Fuzzy search across tokens
 * - Add custom tokens
 * - Token safety checks
 */
export class TokenRegistry {
  private tokens: Map<string, TokenInfo> = new Map()
  private tokensByAddress: Map<string, TokenInfo> = new Map()
  private loadedLists: Map<string, TokenList> = new Map()
  private customTokens: Map<string, TokenInfo> = new Map()
  private clients: Map<number, PublicClient> = new Map()
  private listeners: Set<TokenRegistryEventListener> = new Set()
  private initialized = false

  private readonly config: Required<TokenRegistryConfig>
  private readonly storagePrefix: string

  constructor(config: TokenRegistryConfig = {}) {
    this.config = {
      tokenListUrls: config.tokenListUrls ?? [...DEFAULT_TOKEN_LIST_URLS],
      enableCache: config.enableCache ?? true,
      cacheTTL: config.cacheTTL ?? DEFAULT_CACHE_CONFIG.TOKEN_TTL_MS,
      storagePrefix: config.storagePrefix ?? DEFAULT_CACHE_CONFIG.STORAGE_PREFIX,
      rpcUrls: config.rpcUrls ?? { ...DEFAULT_RPC_URLS },
      autoLoadLists: config.autoLoadLists ?? false,
      requestTimeout: config.requestTimeout ?? 10000,
    }
    this.storagePrefix = this.config.storagePrefix

    // Load common tokens
    this.loadCommonTokens()

    // Load from cache
    if (this.config.enableCache) {
      this.loadFromCache()
    }
  }

  // ============= Initialization =============

  /**
   * Initialize the registry by loading token lists
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    if (this.config.autoLoadLists) {
      const loadPromises = this.config.tokenListUrls.map((url) =>
        this.loadList(url).catch((err) => {
          console.warn(`Failed to load token list ${url}:`, err)
        })
      )
      await Promise.all(loadPromises)
    }

    this.initialized = true
  }

  /**
   * Load common tokens into the registry
   */
  private loadCommonTokens(): void {
    for (const [symbol, token] of Object.entries(COMMON_TOKENS)) {
      this.tokens.set(symbol.toUpperCase(), token)

      // Index by address for each chain
      for (const [chainId, address] of Object.entries(token.addresses)) {
        const key = this.getAddressKey(address, Number(chainId) || chainId)
        this.tokensByAddress.set(key, token)
      }
    }
  }

  // ============= Token Lookup =============

  /**
   * Get token by address or symbol
   *
   * Lookup order:
   * 1. Cache
   * 2. Loaded token lists
   * 3. On-chain metadata
   */
  async getToken(
    addressOrSymbol: string,
    chainId: number = CHAIN_IDS.ETHEREUM
  ): Promise<TokenInfo | undefined> {
    // Check if it's an address
    if (isEvmAddress(addressOrSymbol)) {
      return this.getTokenByAddress(addressOrSymbol, chainId)
    }

    // It's a symbol
    return this.getTokenBySymbol(addressOrSymbol, chainId)
  }

  /**
   * Get token by symbol
   */
  getTokenBySymbol(symbol: string, chainId?: number): TokenInfo | undefined {
    const upperSymbol = symbol.toUpperCase()

    // Check tokens map
    const token = this.tokens.get(upperSymbol)
    if (token) {
      // If chainId specified, verify token exists on that chain
      if (chainId !== undefined && !token.addresses[chainId]) {
        return undefined
      }
      return token
    }

    // Check custom tokens
    const customToken = this.customTokens.get(upperSymbol)
    if (customToken) {
      if (chainId !== undefined && !customToken.addresses[chainId]) {
        return undefined
      }
      return customToken
    }

    return undefined
  }

  /**
   * Get token by address
   */
  async getTokenByAddress(
    address: string,
    chainId: number = CHAIN_IDS.ETHEREUM
  ): Promise<TokenInfo | undefined> {
    const normalizedAddress = normalizeTokenAddress(address)
    const key = this.getAddressKey(normalizedAddress, chainId)

    // Check indexed tokens
    const cached = this.tokensByAddress.get(key)
    if (cached) {
      return cached
    }

    // Check custom tokens
    for (const token of this.customTokens.values()) {
      if (
        token.addresses[chainId] &&
        normalizeTokenAddress(token.addresses[chainId]) === normalizedAddress
      ) {
        return token
      }
    }

    // Fetch from on-chain
    try {
      const onChainToken = await this.fetchOnChainMetadata(address as Address, chainId)
      if (onChainToken) {
        // Cache the result
        this.cacheToken(onChainToken, 'onchain')
        return onChainToken
      }
    } catch (error) {
      // Token fetch failed, return undefined
      console.debug(`Failed to fetch on-chain metadata for ${address}:`, error)
    }

    return undefined
  }

  // ============= On-Chain Metadata =============

  /**
   * Fetch token metadata from on-chain (ERC20)
   */
  async fetchOnChainMetadata(
    address: Address,
    chainId: number
  ): Promise<TokenInfo | undefined> {
    const client = this.getClient(chainId)
    if (!client) {
      throw new TokenRegistryError(
        'UNSUPPORTED_CHAIN',
        `No RPC configured for chain ${chainId}`
      )
    }

    try {
      // Fetch name, symbol, decimals in parallel
      const [name, symbol, decimals] = await Promise.all([
        client.readContract({
          address,
          abi: ERC20_METADATA_ABI,
          functionName: 'name',
        }).catch(() => undefined),
        client.readContract({
          address,
          abi: ERC20_METADATA_ABI,
          functionName: 'symbol',
        }).catch(() => undefined),
        client.readContract({
          address,
          abi: ERC20_METADATA_ABI,
          functionName: 'decimals',
        }).catch(() => 18), // Default to 18 decimals
      ])

      // If we couldn't get name or symbol, the token may not be ERC20 compliant
      if (!name && !symbol) {
        return undefined
      }

      const token: TokenInfo = {
        symbol: (symbol as string) || 'UNKNOWN',
        name: (name as string) || 'Unknown Token',
        decimals: decimals as number,
        addresses: { [chainId]: address },
        verified: false, // On-chain tokens are not verified
        tags: ['onchain'],
      }

      return token
    } catch (error) {
      throw new TokenRegistryError(
        'ONCHAIN_FETCH_FAILED',
        `Failed to fetch on-chain metadata for ${address}`,
        error
      )
    }
  }

  // ============= Custom Tokens =============

  /**
   * Add a custom token (user-added)
   */
  addCustomToken(token: TokenInfo): void {
    // Mark as unverified
    const customToken: TokenInfo = {
      ...token,
      verified: false,
      tags: [...(token.tags ?? []), 'custom'],
    }

    this.customTokens.set(token.symbol.toUpperCase(), customToken)

    // Index by addresses
    for (const [chainId, address] of Object.entries(token.addresses)) {
      const key = this.getAddressKey(address, Number(chainId) || chainId)
      this.tokensByAddress.set(key, customToken)
    }

    // Save to cache
    this.saveCustomTokens()

    this.emit({ type: 'token_added', token: customToken })
  }

  /**
   * Remove a custom token
   */
  removeCustomToken(symbol: string): boolean {
    const upperSymbol = symbol.toUpperCase()
    const token = this.customTokens.get(upperSymbol)

    if (!token) return false

    // Remove from address index
    for (const [chainId, address] of Object.entries(token.addresses)) {
      const key = this.getAddressKey(address, Number(chainId) || chainId)
      this.tokensByAddress.delete(key)
    }

    this.customTokens.delete(upperSymbol)
    this.saveCustomTokens()

    this.emit({ type: 'token_removed', symbol: upperSymbol })
    return true
  }

  /**
   * Get all custom tokens
   */
  getCustomTokens(): TokenInfo[] {
    return Array.from(this.customTokens.values())
  }

  // ============= Token Search =============

  /**
   * Search tokens by query (fuzzy search)
   */
  searchTokens(query: string, options: TokenSearchOptions = {}): TokenSearchResult[] {
    const {
      chainId,
      limit = 20,
      includeUnverified = true,
      tags,
    } = options

    const normalizedQuery = query.toLowerCase().trim()
    if (!normalizedQuery) return []

    const results: TokenSearchResult[] = []

    // Search all token sources
    const allTokens = [
      ...this.tokens.values(),
      ...(includeUnverified ? this.customTokens.values() : []),
    ]

    for (const token of allTokens) {
      // Filter by chain if specified
      if (chainId !== undefined && !token.addresses[chainId]) {
        continue
      }

      // Filter by verification status
      if (!includeUnverified && !token.verified) {
        continue
      }

      // Filter by tags
      if (tags && tags.length > 0) {
        const tokenTags = token.tags ?? []
        if (!tags.some((tag) => tokenTags.includes(tag))) {
          continue
        }
      }

      // Calculate match score
      const result = this.matchToken(token, normalizedQuery, chainId)
      if (result) {
        results.push(result)
      }
    }

    // Sort by score (descending) and limit
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  /**
   * Match a token against a query
   */
  private matchToken(
    token: TokenInfo,
    query: string,
    chainId?: number | string
  ): TokenSearchResult | null {
    const symbolLower = token.symbol.toLowerCase()
    const nameLower = token.name.toLowerCase()

    // Exact symbol match (highest score)
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

    // Name starts with query
    if (nameLower.startsWith(query)) {
      return { token, score: 0.6, matchedField: 'name' }
    }

    // Name contains query
    if (nameLower.includes(query)) {
      return { token, score: 0.4, matchedField: 'name' }
    }

    // Address match (if query looks like an address)
    if (isEvmAddress(query) && chainId !== undefined) {
      const address = token.addresses[chainId]
      if (address && normalizeTokenAddress(address) === normalizeTokenAddress(query)) {
        return { token, score: 1.0, matchedField: 'address' }
      }
    }

    // Partial address match
    if (query.startsWith('0x') && query.length > 4) {
      for (const address of Object.values(token.addresses)) {
        if (normalizeTokenAddress(address).includes(query.toLowerCase())) {
          return { token, score: 0.5, matchedField: 'address' }
        }
      }
    }

    return null
  }

  // ============= Token Lists =============

  /**
   * Load a token list from URL
   */
  async loadList(url: string): Promise<number> {
    // Check cache first
    const cachedList = this.getCachedList(url)
    if (cachedList) {
      this.processTokenList(cachedList, url)
      return cachedList.tokens.length
    }

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
        throw new TokenRegistryError(
          'LIST_FETCH_FAILED',
          `Failed to fetch token list: ${response.status} ${response.statusText}`
        )
      }

      const list = (await response.json()) as TokenList

      // Validate list format
      if (!list.tokens || !Array.isArray(list.tokens)) {
        throw new TokenRegistryError(
          'INVALID_LIST_FORMAT',
          'Token list must have a tokens array'
        )
      }

      // Process and cache
      this.processTokenList(list, url)
      this.cacheList(url, list)

      this.emit({ type: 'list_loaded', url, count: list.tokens.length })
      return list.tokens.length
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this.emit({ type: 'list_failed', url, error: message })
      throw error
    }
  }

  /**
   * Process a token list and add tokens to registry
   */
  private processTokenList(list: TokenList, url: string): void {
    this.loadedLists.set(url, list)

    for (const listToken of list.tokens) {
      const token = tokenListTokenToInfo(listToken)

      // Check if we already have this token
      const existing = this.tokens.get(token.symbol.toUpperCase())
      if (existing) {
        // Merge addresses
        const merged = mergeTokenInfo(existing, token)
        this.tokens.set(token.symbol.toUpperCase(), merged)

        // Update address index
        for (const [chainId, address] of Object.entries(token.addresses)) {
          const key = this.getAddressKey(address, Number(chainId) || chainId)
          this.tokensByAddress.set(key, merged)
        }
      } else {
        this.tokens.set(token.symbol.toUpperCase(), token)

        // Index by address
        for (const [chainId, address] of Object.entries(token.addresses)) {
          const key = this.getAddressKey(address, Number(chainId) || chainId)
          this.tokensByAddress.set(key, token)
        }
      }
    }
  }

  /**
   * Get all loaded lists
   */
  getLoadedLists(): TokenList[] {
    return Array.from(this.loadedLists.values())
  }

  // ============= Token Safety =============

  /**
   * Check token safety
   */
  checkTokenSafety(address: string, chainId: number): TokenSafetyResult {
    const normalizedAddress = normalizeTokenAddress(address)
    const warnings: string[] = []
    const sources: string[] = []

    // Check blocked list
    const blockedSet = BLOCKED_TOKENS[chainId]
    if (blockedSet?.has(normalizedAddress)) {
      return {
        level: 'blocked',
        isSafe: false,
        warnings: ['This token has been flagged as malicious'],
        sources: ['blocklist'],
        checkedAt: Date.now(),
      }
    }

    // Check if in common tokens
    for (const token of Object.values(COMMON_TOKENS)) {
      if (
        token.addresses[chainId] &&
        normalizeTokenAddress(token.addresses[chainId]) === normalizedAddress
      ) {
        return {
          level: 'verified',
          isSafe: true,
          warnings: [],
          info: token,
          sources: ['common_tokens'],
          checkedAt: Date.now(),
        }
      }
    }

    // Check if in loaded lists
    const key = this.getAddressKey(normalizedAddress, chainId)
    const indexedToken = this.tokensByAddress.get(key)
    if (indexedToken?.verified) {
      sources.push('token_list')
      return {
        level: 'trusted',
        isSafe: true,
        warnings: [],
        info: indexedToken,
        sources,
        checkedAt: Date.now(),
      }
    }

    // Check custom tokens
    const customToken = this.customTokens.get(indexedToken?.symbol.toUpperCase() ?? '')
    if (customToken) {
      warnings.push('This is a user-added custom token')
      return {
        level: 'known',
        isSafe: true,
        warnings,
        info: customToken,
        sources: ['custom'],
        checkedAt: Date.now(),
      }
    }

    // Unknown token
    return {
      level: 'unknown',
      isSafe: false,
      warnings: [
        'This token is not recognized. Proceed with caution.',
        'Verify the contract address before interacting.',
      ],
      sources: [],
      checkedAt: Date.now(),
    }
  }

  // ============= Cache Management =============

  /**
   * Cache a token
   */
  private cacheToken(token: TokenInfo, source: 'list' | 'onchain' | 'custom'): void {
    if (!this.config.enableCache || typeof localStorage === 'undefined') {
      return
    }

    try {
      const key = this.getStorageKey(STORAGE_KEYS.TOKENS)
      const stored = localStorage.getItem(key)
      const cache: Record<string, CachedToken> = stored ? JSON.parse(stored) : {}

      const now = Date.now()
      for (const [chainId, address] of Object.entries(token.addresses)) {
        const cacheKey = this.getAddressKey(address, Number(chainId) || chainId)
        cache[cacheKey] = {
          token,
          cachedAt: now,
          expiresAt: now + this.config.cacheTTL,
          source,
        }
      }

      localStorage.setItem(key, JSON.stringify(cache))
    } catch {
      // Cache write failed
    }
  }

  /**
   * Get cached token list
   */
  private getCachedList(url: string): TokenList | undefined {
    if (!this.config.enableCache || typeof localStorage === 'undefined') {
      return undefined
    }

    try {
      const key = this.getStorageKey(STORAGE_KEYS.LISTS)
      const stored = localStorage.getItem(key)
      if (!stored) return undefined

      const cache = JSON.parse(stored) as Record<string, CachedTokenList>
      const cached = cache[url]

      if (cached && cached.expiresAt > Date.now()) {
        return cached.list
      }
    } catch {
      // Cache read failed
    }

    return undefined
  }

  /**
   * Cache a token list
   */
  private cacheList(url: string, list: TokenList): void {
    if (!this.config.enableCache || typeof localStorage === 'undefined') {
      return
    }

    try {
      const key = this.getStorageKey(STORAGE_KEYS.LISTS)
      const stored = localStorage.getItem(key)
      const cache: Record<string, CachedTokenList> = stored ? JSON.parse(stored) : {}

      const now = Date.now()
      cache[url] = {
        list,
        url,
        cachedAt: now,
        expiresAt: now + DEFAULT_CACHE_CONFIG.LIST_TTL_MS,
      }

      // Limit number of cached lists
      const urls = Object.keys(cache)
      if (urls.length > DEFAULT_CACHE_CONFIG.MAX_CACHED_LISTS) {
        // Remove oldest entries
        const sorted = urls.sort((a, b) => cache[a].cachedAt - cache[b].cachedAt)
        for (let i = 0; i < sorted.length - DEFAULT_CACHE_CONFIG.MAX_CACHED_LISTS; i++) {
          delete cache[sorted[i]]
        }
      }

      localStorage.setItem(key, JSON.stringify(cache))
    } catch {
      // Cache write failed
    }
  }

  /**
   * Load tokens from cache
   */
  private loadFromCache(): void {
    if (typeof localStorage === 'undefined') return

    // Load custom tokens
    try {
      const key = this.getStorageKey(STORAGE_KEYS.CUSTOM)
      const stored = localStorage.getItem(key)
      if (stored) {
        const customTokens = JSON.parse(stored) as TokenInfo[]
        for (const token of customTokens) {
          this.customTokens.set(token.symbol.toUpperCase(), token)

          // Index by address
          for (const [chainId, address] of Object.entries(token.addresses)) {
            const addrKey = this.getAddressKey(address, Number(chainId) || chainId)
            this.tokensByAddress.set(addrKey, token)
          }
        }
      }
    } catch {
      // Cache load failed
    }
  }

  /**
   * Save custom tokens to cache
   */
  private saveCustomTokens(): void {
    if (!this.config.enableCache || typeof localStorage === 'undefined') {
      return
    }

    try {
      const key = this.getStorageKey(STORAGE_KEYS.CUSTOM)
      const tokens = Array.from(this.customTokens.values())
      localStorage.setItem(key, JSON.stringify(tokens))
    } catch {
      // Cache write failed
    }
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    if (typeof localStorage === 'undefined') return

    try {
      localStorage.removeItem(this.getStorageKey(STORAGE_KEYS.TOKENS))
      localStorage.removeItem(this.getStorageKey(STORAGE_KEYS.LISTS))
      localStorage.removeItem(this.getStorageKey(STORAGE_KEYS.CUSTOM))

      this.customTokens.clear()
      this.emit({ type: 'cache_cleared' })
    } catch {
      // Cache clear failed
    }
  }

  /**
   * Clean expired cache entries
   */
  cleanExpiredCache(): number {
    if (!this.config.enableCache || typeof localStorage === 'undefined') {
      return 0
    }

    let expiredCount = 0
    const now = Date.now()

    try {
      // Clean token cache
      const tokenKey = this.getStorageKey(STORAGE_KEYS.TOKENS)
      const tokenStored = localStorage.getItem(tokenKey)
      if (tokenStored) {
        const cache = JSON.parse(tokenStored) as Record<string, CachedToken>
        for (const [key, cached] of Object.entries(cache)) {
          if (cached.expiresAt <= now) {
            delete cache[key]
            expiredCount++
          }
        }
        localStorage.setItem(tokenKey, JSON.stringify(cache))
      }

      // Clean list cache
      const listKey = this.getStorageKey(STORAGE_KEYS.LISTS)
      const listStored = localStorage.getItem(listKey)
      if (listStored) {
        const cache = JSON.parse(listStored) as Record<string, CachedTokenList>
        for (const [key, cached] of Object.entries(cache)) {
          if (cached.expiresAt <= now) {
            delete cache[key]
            expiredCount++
          }
        }
        localStorage.setItem(listKey, JSON.stringify(cache))
      }

      if (expiredCount > 0) {
        this.emit({ type: 'cache_expired', count: expiredCount })
      }
    } catch {
      // Cache clean failed
    }

    return expiredCount
  }

  // ============= RPC Client Management =============

  /**
   * Get or create a public client for a chain
   */
  private getClient(chainId: number): PublicClient | undefined {
    if (this.clients.has(chainId)) {
      return this.clients.get(chainId)
    }

    const rpcUrl = this.config.rpcUrls[chainId]
    if (!rpcUrl) {
      return undefined
    }

    const client = createPublicClient({
      transport: http(rpcUrl),
    })

    this.clients.set(chainId, client)
    return client
  }

  /**
   * Set RPC URL for a chain
   */
  setRpcUrl(chainId: number, rpcUrl: string): void {
    this.config.rpcUrls[chainId] = rpcUrl
    this.clients.delete(chainId) // Force recreation of client
  }

  // ============= Utilities =============

  /**
   * Get storage key
   */
  private getStorageKey(type: string): string {
    return `${this.storagePrefix}${type}`
  }

  /**
   * Get address lookup key
   */
  private getAddressKey(address: string, chainId: number | string): string {
    return `${chainId}:${normalizeTokenAddress(address)}`
  }

  /**
   * Get all tokens for a specific chain
   */
  getTokensForChain(chainId: number): TokenInfo[] {
    const tokens: TokenInfo[] = []

    for (const token of this.tokens.values()) {
      if (token.addresses[chainId]) {
        tokens.push(token)
      }
    }

    for (const token of this.customTokens.values()) {
      if (token.addresses[chainId]) {
        tokens.push(token)
      }
    }

    return tokens
  }

  /**
   * Get token count
   */
  getTokenCount(): { total: number; verified: number; custom: number } {
    const verified = Array.from(this.tokens.values()).filter((t) => t.verified).length
    return {
      total: this.tokens.size + this.customTokens.size,
      verified,
      custom: this.customTokens.size,
    }
  }

  // ============= Events =============

  /**
   * Subscribe to registry events
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
        console.error('Token registry event listener error:', error)
      }
    })
  }
}

// ============= Factory Function =============

/**
 * Create a new TokenRegistry instance
 */
export function createTokenRegistry(config?: TokenRegistryConfig): TokenRegistry {
  return new TokenRegistry(config)
}

/**
 * Singleton instance for convenience
 */
let defaultInstance: TokenRegistry | null = null

/**
 * Get the default TokenRegistry instance
 */
export function getTokenRegistry(): TokenRegistry {
  if (!defaultInstance) {
    defaultInstance = new TokenRegistry()
  }
  return defaultInstance
}
