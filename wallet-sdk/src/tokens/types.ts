/**
 * Token Registry Types
 *
 * Type definitions for the token registry system.
 * Supports both EVM (ERC20) and Solana (SPL) tokens.
 */

import type { Address } from 'viem'

// ============= Token Types =============

/**
 * Token information
 */
export interface TokenInfo {
  /** Token symbol (e.g., "USDC") */
  symbol: string
  /** Token name (e.g., "USD Coin") */
  name: string
  /** Token decimals */
  decimals: number
  /** Logo URI (optional) */
  logoURI?: string
  /** Token addresses by chain ID */
  addresses: Record<number | string, string>
  /** Whether the token is verified */
  verified: boolean
  /** Tags for categorization */
  tags?: string[]
  /** Token extensions (for additional metadata) */
  extensions?: Record<string, unknown>
}

/**
 * Token list following Uniswap Token List standard
 * @see https://tokenlists.org/
 */
export interface TokenList {
  /** Name of the token list */
  name: string
  /** Timestamp of last update */
  timestamp: string
  /** Version of the token list */
  version: {
    major: number
    minor: number
    patch: number
  }
  /** List of tokens */
  tokens: TokenListToken[]
  /** Optional keywords */
  keywords?: string[]
  /** Optional tags definitions */
  tags?: Record<string, { name: string; description: string }>
  /** Optional logo URI for the list */
  logoURI?: string
}

/**
 * Token entry in a token list (Uniswap Token List format)
 */
export interface TokenListToken {
  /** Chain ID */
  chainId: number
  /** Token address */
  address: string
  /** Token name */
  name: string
  /** Token symbol */
  symbol: string
  /** Token decimals */
  decimals: number
  /** Logo URI */
  logoURI?: string
  /** Tags */
  tags?: string[]
  /** Extensions */
  extensions?: Record<string, unknown>
}

// ============= Safety Types =============

/**
 * Token safety level
 */
export type TokenSafetyLevel =
  | 'verified'     // Verified by multiple sources
  | 'trusted'      // On trusted token list
  | 'known'        // Known but not fully verified
  | 'unknown'      // Unknown token
  | 'warning'      // Has warning flags
  | 'blocked'      // Known malicious token

/**
 * Token safety result
 */
export interface TokenSafetyResult {
  /** Safety level */
  level: TokenSafetyLevel
  /** Whether it's safe to interact with */
  isSafe: boolean
  /** Warning messages */
  warnings: string[]
  /** Information about the token */
  info?: TokenInfo
  /** Sources that verified this token */
  sources: string[]
  /** Last checked timestamp */
  checkedAt: number
}

// ============= Registry Types =============

/**
 * Token registry configuration
 */
export interface TokenRegistryConfig {
  /** Default token list URLs */
  tokenListUrls?: string[]
  /** Whether to cache tokens in localStorage */
  enableCache?: boolean
  /** Cache TTL in milliseconds (default: 1 hour) */
  cacheTTL?: number
  /** Storage key prefix */
  storagePrefix?: string
  /** Custom RPC URLs by chain ID */
  rpcUrls?: Record<number, string>
  /** Whether to auto-load default token lists */
  autoLoadLists?: boolean
  /** Request timeout in milliseconds */
  requestTimeout?: number
}

/**
 * Cached token data
 */
export interface CachedToken {
  /** Token info */
  token: TokenInfo
  /** When the cache entry was created */
  cachedAt: number
  /** When the cache entry expires */
  expiresAt: number
  /** Source of the token info */
  source: 'list' | 'onchain' | 'custom'
}

/**
 * Cached token list
 */
export interface CachedTokenList {
  /** The token list */
  list: TokenList
  /** List URL */
  url: string
  /** When the cache entry was created */
  cachedAt: number
  /** When the cache entry expires */
  expiresAt: number
}

// ============= Search Types =============

/**
 * Token search options
 */
export interface TokenSearchOptions {
  /** Chain ID to filter by */
  chainId?: number | string
  /** Maximum number of results */
  limit?: number
  /** Include unverified tokens */
  includeUnverified?: boolean
  /** Tags to filter by */
  tags?: string[]
}

/**
 * Token search result
 */
export interface TokenSearchResult {
  /** Token info */
  token: TokenInfo
  /** Match score (0-1) */
  score: number
  /** Which field matched */
  matchedField: 'symbol' | 'name' | 'address'
}

// ============= Event Types =============

/**
 * Token registry events
 */
export type TokenRegistryEvent =
  | { type: 'token_added'; token: TokenInfo }
  | { type: 'token_removed'; symbol: string }
  | { type: 'list_loaded'; url: string; count: number }
  | { type: 'list_failed'; url: string; error: string }
  | { type: 'cache_cleared' }
  | { type: 'cache_expired'; count: number }

/**
 * Token registry event listener
 */
export type TokenRegistryEventListener = (event: TokenRegistryEvent) => void

// ============= Error Types =============

/**
 * Token registry error codes
 */
export type TokenRegistryErrorCode =
  | 'TOKEN_NOT_FOUND'        // Token not found in registry
  | 'INVALID_ADDRESS'        // Invalid token address
  | 'LIST_FETCH_FAILED'      // Failed to fetch token list
  | 'ONCHAIN_FETCH_FAILED'   // Failed to fetch on-chain metadata
  | 'INVALID_LIST_FORMAT'    // Token list has invalid format
  | 'UNSUPPORTED_CHAIN'      // Chain not supported
  | 'STORAGE_ERROR'          // Failed to read/write storage

/**
 * Token registry error class
 */
export class TokenRegistryError extends Error {
  constructor(
    public readonly code: TokenRegistryErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'TokenRegistryError'
  }
}

// ============= Solana Types =============

/**
 * Solana SPL token info
 */
export interface SolanaTokenInfo extends TokenInfo {
  /** Mint address */
  mintAddress: string
  /** Freeze authority (optional) */
  freezeAuthority?: string
  /** Mint authority (optional) */
  mintAuthority?: string
  /** Supply (optional) */
  supply?: string
  /** Is initialized */
  isInitialized?: boolean
}

/**
 * Metaplex metadata
 */
export interface MetaplexMetadata {
  /** Token name */
  name: string
  /** Token symbol */
  symbol: string
  /** URI to off-chain metadata */
  uri: string
  /** Seller fee basis points */
  sellerFeeBasisPoints: number
  /** Creators */
  creators?: Array<{
    address: string
    verified: boolean
    share: number
  }>
  /** Collection */
  collection?: {
    verified: boolean
    key: string
  }
  /** Uses */
  uses?: {
    useMethod: number
    remaining: bigint
    total: bigint
  }
}

/**
 * Solana token registry config
 */
export interface SolanaTokenRegistryConfig {
  /** RPC endpoint */
  rpcEndpoint: string
  /** Whether to cache tokens */
  enableCache?: boolean
  /** Cache TTL in milliseconds */
  cacheTTL?: number
  /** Storage key prefix */
  storagePrefix?: string
  /** Request timeout in milliseconds */
  requestTimeout?: number
}

// ============= ERC20 ABI =============

/**
 * Minimal ERC20 ABI for reading token metadata
 */
export const ERC20_METADATA_ABI = [
  {
    name: 'name',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    name: 'symbol',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    name: 'decimals',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
] as const

// ============= Helper Functions =============

/**
 * Normalize token address for consistent lookup
 */
export function normalizeTokenAddress(address: string): string {
  // For EVM addresses, lowercase (handle both 0x and 0X prefixes)
  if (address.toLowerCase().startsWith('0x')) {
    return address.toLowerCase()
  }
  // For Solana, keep as-is
  return address
}

/**
 * Check if an address is a valid EVM address
 */
export function isEvmAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address)
}

/**
 * Check if an address is a valid Solana address
 */
export function isSolanaAddress(address: string): boolean {
  // Base58 encoded, 32-44 characters
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
}

/**
 * Get address for a specific chain from TokenInfo
 */
export function getTokenAddressForChain(
  token: TokenInfo,
  chainId: number | string
): Address | string | undefined {
  return token.addresses[chainId]
}

/**
 * Convert TokenListToken to TokenInfo
 */
export function tokenListTokenToInfo(token: TokenListToken): TokenInfo {
  return {
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    logoURI: token.logoURI,
    addresses: { [token.chainId]: token.address },
    verified: true, // Tokens from lists are considered verified
    tags: token.tags,
    extensions: token.extensions,
  }
}

/**
 * Merge token info, preferring newer/more complete data
 */
export function mergeTokenInfo(existing: TokenInfo, update: TokenInfo): TokenInfo {
  return {
    ...existing,
    ...update,
    addresses: {
      ...existing.addresses,
      ...update.addresses,
    },
    tags: [...new Set([...(existing.tags ?? []), ...(update.tags ?? [])])],
    extensions: {
      ...existing.extensions,
      ...update.extensions,
    },
    // Keep verified status if either is verified
    verified: existing.verified || update.verified,
  }
}
