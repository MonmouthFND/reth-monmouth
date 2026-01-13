/**
 * Token Registry Module
 *
 * Multi-chain token registry with caching and on-chain lookup.
 *
 * @example
 * ```typescript
 * import {
 *   TokenRegistry,
 *   SolanaTokenRegistry,
 *   COMMON_TOKENS,
 *   CHAIN_IDS,
 * } from '@monmouth/wallet-sdk/tokens'
 *
 * // EVM token registry
 * const evmRegistry = new TokenRegistry({
 *   autoLoadLists: true,
 *   enableCache: true,
 * })
 *
 * await evmRegistry.initialize()
 *
 * // Get USDC on Ethereum
 * const usdc = await evmRegistry.getToken('USDC', CHAIN_IDS.ETHEREUM)
 * console.log(usdc?.addresses[1]) // 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
 *
 * // Search for tokens
 * const results = evmRegistry.searchTokens('uni', { chainId: 1, limit: 5 })
 *
 * // Add custom token
 * evmRegistry.addCustomToken({
 *   symbol: 'MYTOKEN',
 *   name: 'My Token',
 *   decimals: 18,
 *   addresses: { 1: '0x...' },
 *   verified: false,
 * })
 *
 * // Solana token registry
 * const solanaRegistry = new SolanaTokenRegistry({
 *   rpcEndpoint: 'https://api.mainnet-beta.solana.com',
 * })
 *
 * await solanaRegistry.initialize()
 *
 * // Get token by mint
 * const solToken = await solanaRegistry.getToken('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
 * ```
 */

// ============= Main Classes =============

export {
  TokenRegistry,
  createTokenRegistry,
  getTokenRegistry,
} from './TokenRegistry'

export {
  SolanaTokenRegistry,
  createSolanaTokenRegistry,
  createMainnetSolanaRegistry,
  createDevnetSolanaRegistry,
} from './SolanaTokenRegistry'

// ============= Types =============

export type {
  // Token types
  TokenInfo,
  TokenList,
  TokenListToken,
  SolanaTokenInfo,
  MetaplexMetadata,

  // Safety types
  TokenSafetyLevel,
  TokenSafetyResult,

  // Config types
  TokenRegistryConfig,
  SolanaTokenRegistryConfig,

  // Cache types
  CachedToken,
  CachedTokenList,

  // Search types
  TokenSearchOptions,
  TokenSearchResult,

  // Event types
  TokenRegistryEvent,
  TokenRegistryEventListener,

  // Error types
  TokenRegistryErrorCode,
} from './types'

// Error class
export { TokenRegistryError } from './types'

// Helper functions
export {
  ERC20_METADATA_ABI,
  normalizeTokenAddress,
  isEvmAddress,
  isSolanaAddress,
  getTokenAddressForChain,
  tokenListTokenToInfo,
  mergeTokenInfo,
} from './types'

// ============= Constants =============

export {
  // Token lists
  DEFAULT_TOKEN_LIST_URLS,
  SOLANA_TOKEN_LIST_URLS,

  // Chain IDs
  CHAIN_IDS,
  SOLANA_CLUSTERS,

  // Common tokens
  COMMON_TOKENS,
  NATIVE_TOKENS,

  // RPC URLs
  DEFAULT_RPC_URLS,
  DEFAULT_SOLANA_RPC_URLS,

  // Cache config
  DEFAULT_CACHE_CONFIG,

  // Safety
  BLOCKED_TOKENS,

  // Tags
  TOKEN_TAGS,

  // Helpers
  getChainName,
  isTestnet,
} from './constants'
