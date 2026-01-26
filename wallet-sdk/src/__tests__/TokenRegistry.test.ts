/**
 * Tests for TokenRegistry
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  TokenRegistry,
  createTokenRegistry,
  getTokenRegistry,
  CHAIN_IDS,
  COMMON_TOKENS,
  TokenRegistryError,
  normalizeTokenAddress,
  isEvmAddress,
  isSolanaAddress,
  tokenListTokenToInfo,
  mergeTokenInfo,
} from '../tokens'
import type {
  TokenInfo,
  TokenList,
  TokenListToken,
  TokenRegistryEvent,
} from '../tokens'

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

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('TokenRegistry', () => {
  let registry: TokenRegistry

  beforeEach(() => {
    localStorageMock.clear()
    mockFetch.mockReset()
    registry = new TokenRegistry({ enableCache: true })
  })

  afterEach(() => {
    localStorageMock.clear()
    mockFetch.mockReset()
  })

  describe('Common Tokens', () => {
    it('should load common tokens on initialization', () => {
      const usdc = registry.getTokenBySymbol('USDC')

      expect(usdc).toBeDefined()
      expect(usdc?.symbol).toBe('USDC')
      expect(usdc?.name).toBe('USD Coin')
      expect(usdc?.decimals).toBe(6)
      expect(usdc?.verified).toBe(true)
    })

    it('should have USDC addresses for multiple chains', () => {
      const usdc = registry.getTokenBySymbol('USDC')

      expect(usdc?.addresses[CHAIN_IDS.ETHEREUM]).toBeDefined()
      expect(usdc?.addresses[CHAIN_IDS.POLYGON]).toBeDefined()
      expect(usdc?.addresses[CHAIN_IDS.ARBITRUM]).toBeDefined()
    })

    it('should return undefined for non-existent token', () => {
      const token = registry.getTokenBySymbol('NONEXISTENT')
      expect(token).toBeUndefined()
    })

    it('should be case-insensitive for symbol lookup', () => {
      const usdc1 = registry.getTokenBySymbol('usdc')
      const usdc2 = registry.getTokenBySymbol('USDC')
      const usdc3 = registry.getTokenBySymbol('Usdc')

      expect(usdc1).toBeDefined()
      expect(usdc2).toBeDefined()
      expect(usdc3).toBeDefined()
      expect(usdc1).toEqual(usdc2)
      expect(usdc2).toEqual(usdc3)
    })

    it('should filter by chain when chainId is specified', () => {
      const usdc = registry.getTokenBySymbol('USDC', CHAIN_IDS.ETHEREUM)
      expect(usdc).toBeDefined()

      // USDC should not exist on a random chain ID
      const usdcUnknown = registry.getTokenBySymbol('USDC', 999999)
      expect(usdcUnknown).toBeUndefined()
    })
  })

  describe('Token Lookup by Address', () => {
    it('should find token by address', async () => {
      const usdcAddress = COMMON_TOKENS.USDC.addresses[CHAIN_IDS.ETHEREUM]
      const token = await registry.getTokenByAddress(usdcAddress, CHAIN_IDS.ETHEREUM)

      expect(token).toBeDefined()
      expect(token?.symbol).toBe('USDC')
    })

    it('should be case-insensitive for address lookup', async () => {
      const usdcAddress = COMMON_TOKENS.USDC.addresses[CHAIN_IDS.ETHEREUM]
      const token1 = await registry.getTokenByAddress(usdcAddress.toLowerCase(), CHAIN_IDS.ETHEREUM)
      const token2 = await registry.getTokenByAddress(usdcAddress.toUpperCase(), CHAIN_IDS.ETHEREUM)

      expect(token1).toBeDefined()
      expect(token2).toBeDefined()
    })
  })

  describe('Custom Tokens', () => {
    it('should add custom token', () => {
      const customToken: TokenInfo = {
        symbol: 'MYTOKEN',
        name: 'My Custom Token',
        decimals: 18,
        addresses: { [CHAIN_IDS.ETHEREUM]: '0x1234567890123456789012345678901234567890' },
        verified: false,
      }

      registry.addCustomToken(customToken)

      const retrieved = registry.getTokenBySymbol('MYTOKEN')
      expect(retrieved).toBeDefined()
      expect(retrieved?.symbol).toBe('MYTOKEN')
      expect(retrieved?.verified).toBe(false)
      expect(retrieved?.tags).toContain('custom')
    })

    it('should emit event when custom token is added', () => {
      const events: TokenRegistryEvent[] = []
      registry.on((event) => events.push(event))

      registry.addCustomToken({
        symbol: 'TEST',
        name: 'Test Token',
        decimals: 18,
        addresses: { 1: '0x1234567890123456789012345678901234567890' },
        verified: false,
      })

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('token_added')
    })

    it('should remove custom token', () => {
      registry.addCustomToken({
        symbol: 'REMOVEME',
        name: 'Remove Me',
        decimals: 18,
        addresses: { 1: '0x1234567890123456789012345678901234567890' },
        verified: false,
      })

      expect(registry.getTokenBySymbol('REMOVEME')).toBeDefined()

      const removed = registry.removeCustomToken('REMOVEME')
      expect(removed).toBe(true)
      expect(registry.getTokenBySymbol('REMOVEME')).toBeUndefined()
    })

    it('should emit event when custom token is removed', () => {
      registry.addCustomToken({
        symbol: 'TEST',
        name: 'Test Token',
        decimals: 18,
        addresses: { 1: '0x1234567890123456789012345678901234567890' },
        verified: false,
      })

      const events: TokenRegistryEvent[] = []
      registry.on((event) => events.push(event))

      registry.removeCustomToken('TEST')

      expect(events.some((e) => e.type === 'token_removed')).toBe(true)
    })

    it('should return all custom tokens', () => {
      registry.addCustomToken({
        symbol: 'TOKEN1',
        name: 'Token 1',
        decimals: 18,
        addresses: { 1: '0x1111111111111111111111111111111111111111' },
        verified: false,
      })

      registry.addCustomToken({
        symbol: 'TOKEN2',
        name: 'Token 2',
        decimals: 18,
        addresses: { 1: '0x2222222222222222222222222222222222222222' },
        verified: false,
      })

      const customTokens = registry.getCustomTokens()
      expect(customTokens).toHaveLength(2)
    })
  })

  describe('Token Search', () => {
    it('should find tokens by symbol', () => {
      const results = registry.searchTokens('usdc')

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].token.symbol).toBe('USDC')
      expect(results[0].matchedField).toBe('symbol')
    })

    it('should find tokens by partial symbol', () => {
      const results = registry.searchTokens('usd')

      expect(results.length).toBeGreaterThan(0)
      // Should include USDC, USDT
      const symbols = results.map((r) => r.token.symbol)
      expect(symbols.some((s) => s.includes('USD'))).toBe(true)
    })

    it('should find tokens by name', () => {
      const results = registry.searchTokens('coin')

      expect(results.length).toBeGreaterThan(0)
      // Should match "USD Coin" (USDC)
      expect(results.some((r) => r.token.symbol === 'USDC')).toBe(true)
    })

    it('should rank exact matches higher', () => {
      const results = registry.searchTokens('uni')

      // UNI (exact) should rank higher than tokens that just contain "uni"
      const uniIndex = results.findIndex((r) => r.token.symbol === 'UNI')
      expect(uniIndex).toBe(0)
      expect(results[0].score).toBeGreaterThan(0.8)
    })

    it('should limit results', () => {
      const results = registry.searchTokens('e', { limit: 3 })

      expect(results.length).toBeLessThanOrEqual(3)
    })

    it('should filter by chain', () => {
      const results = registry.searchTokens('usdc', { chainId: CHAIN_IDS.ETHEREUM })

      expect(results.length).toBeGreaterThan(0)
      // All results should have Ethereum address
      for (const result of results) {
        expect(result.token.addresses[CHAIN_IDS.ETHEREUM]).toBeDefined()
      }
    })

    it('should return empty array for empty query', () => {
      const results = registry.searchTokens('')
      expect(results).toHaveLength(0)
    })

    it('should include custom tokens in search', () => {
      registry.addCustomToken({
        symbol: 'SEARCHME',
        name: 'Search Me Token',
        decimals: 18,
        addresses: { 1: '0x1234567890123456789012345678901234567890' },
        verified: false,
      })

      const results = registry.searchTokens('searchme')

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].token.symbol).toBe('SEARCHME')
    })

    it('should exclude unverified tokens when includeUnverified is false', () => {
      registry.addCustomToken({
        symbol: 'UNVERIFIED',
        name: 'Unverified Token',
        decimals: 18,
        addresses: { 1: '0x1234567890123456789012345678901234567890' },
        verified: false,
      })

      const results = registry.searchTokens('unverified', { includeUnverified: false })

      expect(results).toHaveLength(0)
    })
  })

  describe('Token Lists', () => {
    it('should load token list from URL', async () => {
      const mockList: TokenList = {
        name: 'Test List',
        timestamp: new Date().toISOString(),
        version: { major: 1, minor: 0, patch: 0 },
        tokens: [
          {
            chainId: 1,
            address: '0x1234567890123456789012345678901234567890',
            name: 'Test Token',
            symbol: 'TEST',
            decimals: 18,
          },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockList,
      })

      const count = await registry.loadList('https://example.com/tokens.json')

      expect(count).toBe(1)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('should emit event when list is loaded', async () => {
      const mockList: TokenList = {
        name: 'Test List',
        timestamp: new Date().toISOString(),
        version: { major: 1, minor: 0, patch: 0 },
        tokens: [],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockList,
      })

      const events: TokenRegistryEvent[] = []
      registry.on((event) => events.push(event))

      await registry.loadList('https://example.com/tokens.json')

      expect(events.some((e) => e.type === 'list_loaded')).toBe(true)
    })

    it('should throw error for failed fetch', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })

      await expect(registry.loadList('https://example.com/tokens.json')).rejects.toThrow()
    })

    it('should emit event when list fetch fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Error',
      })

      const events: TokenRegistryEvent[] = []
      registry.on((event) => events.push(event))

      try {
        await registry.loadList('https://example.com/tokens.json')
      } catch {
        // Expected
      }

      expect(events.some((e) => e.type === 'list_failed')).toBe(true)
    })

    it('should merge tokens with same symbol', async () => {
      const mockList: TokenList = {
        name: 'Test List',
        timestamp: new Date().toISOString(),
        version: { major: 1, minor: 0, patch: 0 },
        tokens: [
          {
            chainId: 999,
            address: '0x9999999999999999999999999999999999999999',
            name: 'USD Coin',
            symbol: 'USDC',
            decimals: 6,
          },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockList,
      })

      await registry.loadList('https://example.com/tokens.json')

      const usdc = registry.getTokenBySymbol('USDC')
      // Should have both original and new chain address
      expect(usdc?.addresses[CHAIN_IDS.ETHEREUM]).toBeDefined()
      expect(usdc?.addresses[999]).toBeDefined()
    })
  })

  describe('Token Safety', () => {
    it('should return verified for common tokens', () => {
      const result = registry.checkTokenSafety(
        COMMON_TOKENS.USDC.addresses[CHAIN_IDS.ETHEREUM],
        CHAIN_IDS.ETHEREUM
      )

      expect(result.level).toBe('verified')
      expect(result.isSafe).toBe(true)
      expect(result.warnings).toHaveLength(0)
    })

    it('should return unknown for unrecognized tokens', () => {
      const result = registry.checkTokenSafety(
        '0x0000000000000000000000000000000000000001',
        CHAIN_IDS.ETHEREUM
      )

      expect(result.level).toBe('unknown')
      expect(result.isSafe).toBe(false)
      expect(result.warnings.length).toBeGreaterThan(0)
    })
  })

  describe('Cache Management', () => {
    it('should persist custom tokens to localStorage', () => {
      registry.addCustomToken({
        symbol: 'CACHED',
        name: 'Cached Token',
        decimals: 18,
        addresses: { 1: '0x1234567890123456789012345678901234567890' },
        verified: false,
      })

      // Create new registry and check if token is loaded
      const newRegistry = new TokenRegistry({ enableCache: true })
      const token = newRegistry.getTokenBySymbol('CACHED')

      expect(token).toBeDefined()
      expect(token?.symbol).toBe('CACHED')
    })

    it('should clear cache', () => {
      registry.addCustomToken({
        symbol: 'CLEARME',
        name: 'Clear Me',
        decimals: 18,
        addresses: { 1: '0x1234567890123456789012345678901234567890' },
        verified: false,
      })

      registry.clearCache()

      // Custom tokens should be cleared
      expect(registry.getCustomTokens()).toHaveLength(0)
    })

    it('should emit event when cache is cleared', () => {
      const events: TokenRegistryEvent[] = []
      registry.on((event) => events.push(event))

      registry.clearCache()

      expect(events.some((e) => e.type === 'cache_cleared')).toBe(true)
    })
  })

  describe('Chain-specific Operations', () => {
    it('should get tokens for specific chain', () => {
      const ethereumTokens = registry.getTokensForChain(CHAIN_IDS.ETHEREUM)

      expect(ethereumTokens.length).toBeGreaterThan(0)
      // All tokens should have Ethereum address
      for (const token of ethereumTokens) {
        expect(token.addresses[CHAIN_IDS.ETHEREUM]).toBeDefined()
      }
    })

    it('should return empty array for unknown chain', () => {
      const tokens = registry.getTokensForChain(999999)
      expect(tokens).toHaveLength(0)
    })

    it('should set RPC URL for chain', () => {
      registry.setRpcUrl(CHAIN_IDS.ETHEREUM, 'https://custom-rpc.example.com')
      // No error should be thrown
    })
  })

  describe('Token Count', () => {
    it('should return correct token counts', () => {
      const counts = registry.getTokenCount()

      expect(counts.total).toBeGreaterThan(0)
      expect(counts.verified).toBeGreaterThan(0)
      expect(counts.custom).toBe(0)
    })

    it('should update counts when custom token is added', () => {
      const beforeCounts = registry.getTokenCount()

      registry.addCustomToken({
        symbol: 'COUNTME',
        name: 'Count Me',
        decimals: 18,
        addresses: { 1: '0x1234567890123456789012345678901234567890' },
        verified: false,
      })

      const afterCounts = registry.getTokenCount()

      expect(afterCounts.custom).toBe(beforeCounts.custom + 1)
      expect(afterCounts.total).toBe(beforeCounts.total + 1)
    })
  })

  describe('Event Handling', () => {
    it('should allow subscribing to events', () => {
      const events: TokenRegistryEvent[] = []
      const unsubscribe = registry.on((event) => events.push(event))

      registry.addCustomToken({
        symbol: 'EVENT',
        name: 'Event Token',
        decimals: 18,
        addresses: { 1: '0x1234567890123456789012345678901234567890' },
        verified: false,
      })

      expect(events).toHaveLength(1)

      unsubscribe()

      registry.addCustomToken({
        symbol: 'EVENT2',
        name: 'Event Token 2',
        decimals: 18,
        addresses: { 1: '0x2222222222222222222222222222222222222222' },
        verified: false,
      })

      // Should not have new events after unsubscribe
      expect(events).toHaveLength(1)
    })
  })
})

describe('Factory Functions', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  it('createTokenRegistry should create new instance', () => {
    const registry = createTokenRegistry()
    expect(registry).toBeInstanceOf(TokenRegistry)
  })

  it('getTokenRegistry should return singleton', () => {
    const registry1 = getTokenRegistry()
    const registry2 = getTokenRegistry()
    expect(registry1).toBe(registry2)
  })
})

describe('Helper Functions', () => {
  describe('normalizeTokenAddress', () => {
    it('should lowercase EVM addresses', () => {
      const address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
      expect(normalizeTokenAddress(address)).toBe(address.toLowerCase())
    })

    it('should keep Solana addresses unchanged', () => {
      const address = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
      expect(normalizeTokenAddress(address)).toBe(address)
    })
  })

  describe('isEvmAddress', () => {
    it('should return true for valid EVM addresses', () => {
      expect(isEvmAddress('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')).toBe(true)
      expect(isEvmAddress('0x0000000000000000000000000000000000000000')).toBe(true)
    })

    it('should return false for invalid addresses', () => {
      expect(isEvmAddress('0x123')).toBe(false)
      expect(isEvmAddress('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toBe(false)
      expect(isEvmAddress('not an address')).toBe(false)
    })
  })

  describe('isSolanaAddress', () => {
    it('should return true for valid Solana addresses', () => {
      expect(isSolanaAddress('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toBe(true)
      expect(isSolanaAddress('So11111111111111111111111111111111111111112')).toBe(true)
    })

    it('should return false for invalid addresses', () => {
      expect(isSolanaAddress('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')).toBe(false)
      expect(isSolanaAddress('short')).toBe(false)
    })
  })

  describe('tokenListTokenToInfo', () => {
    it('should convert TokenListToken to TokenInfo', () => {
      const listToken: TokenListToken = {
        chainId: 1,
        address: '0x1234567890123456789012345678901234567890',
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        logoURI: 'https://example.com/logo.png',
        tags: ['defi'],
      }

      const info = tokenListTokenToInfo(listToken)

      expect(info.symbol).toBe('TEST')
      expect(info.name).toBe('Test Token')
      expect(info.decimals).toBe(18)
      expect(info.addresses[1]).toBe('0x1234567890123456789012345678901234567890')
      expect(info.verified).toBe(true)
      expect(info.logoURI).toBe('https://example.com/logo.png')
    })
  })

  describe('mergeTokenInfo', () => {
    it('should merge token info', () => {
      const existing: TokenInfo = {
        symbol: 'TEST',
        name: 'Test Token',
        decimals: 18,
        addresses: { 1: '0x1111111111111111111111111111111111111111' },
        verified: true,
        tags: ['defi'],
      }

      const update: TokenInfo = {
        symbol: 'TEST',
        name: 'Test Token Updated',
        decimals: 18,
        addresses: { 137: '0x2222222222222222222222222222222222222222' },
        verified: false,
        tags: ['stablecoin'],
      }

      const merged = mergeTokenInfo(existing, update)

      expect(merged.name).toBe('Test Token Updated')
      expect(merged.addresses[1]).toBe('0x1111111111111111111111111111111111111111')
      expect(merged.addresses[137]).toBe('0x2222222222222222222222222222222222222222')
      expect(merged.verified).toBe(true) // Should keep verified if either is verified
      expect(merged.tags).toContain('defi')
      expect(merged.tags).toContain('stablecoin')
    })
  })
})

describe('TokenRegistryError', () => {
  it('should create error with code and message', () => {
    const error = new TokenRegistryError('TOKEN_NOT_FOUND', 'Token not found')

    expect(error.code).toBe('TOKEN_NOT_FOUND')
    expect(error.message).toBe('Token not found')
    expect(error.name).toBe('TokenRegistryError')
  })

  it('should include details when provided', () => {
    const error = new TokenRegistryError('ONCHAIN_FETCH_FAILED', 'Failed', { reason: 'timeout' })

    expect(error.details).toEqual({ reason: 'timeout' })
  })
})
