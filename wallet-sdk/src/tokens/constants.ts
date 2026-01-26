/**
 * Token Registry Constants
 *
 * Default token lists, common tokens, and chain configurations.
 */

import type { TokenInfo } from './types'

// ============= Default Token Lists =============

/**
 * Default token list URLs (Uniswap Token List format)
 */
export const DEFAULT_TOKEN_LIST_URLS = [
  // Uniswap default list
  'https://tokens.uniswap.org',
  // Coingecko list
  'https://tokens.coingecko.com/uniswap/all.json',
] as const

/**
 * Solana token list URLs
 */
export const SOLANA_TOKEN_LIST_URLS = [
  // Jupiter verified tokens
  'https://token.jup.ag/strict',
  // Solana Labs token list
  'https://raw.githubusercontent.com/solana-labs/token-list/main/src/tokens/solana.tokenlist.json',
] as const

// ============= Chain IDs =============

/**
 * Common EVM chain IDs
 */
export const CHAIN_IDS = {
  // Mainnets
  ETHEREUM: 1,
  OPTIMISM: 10,
  BSC: 56,
  POLYGON: 137,
  ARBITRUM: 42161,
  AVALANCHE: 43114,
  BASE: 8453,
  MONMOUTH: 7750,

  // Testnets
  SEPOLIA: 11155111,
  GOERLI: 5,
  MUMBAI: 80001,
  ARBITRUM_SEPOLIA: 421614,
  BASE_SEPOLIA: 84532,
} as const

/**
 * Solana cluster identifiers
 */
export const SOLANA_CLUSTERS = {
  MAINNET: 'mainnet-beta',
  TESTNET: 'testnet',
  DEVNET: 'devnet',
} as const

// ============= Common Tokens =============

/**
 * Common tokens with multi-chain addresses
 */
export const COMMON_TOKENS: Record<string, TokenInfo> = {
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
    addresses: {
      [CHAIN_IDS.ETHEREUM]: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      [CHAIN_IDS.OPTIMISM]: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
      [CHAIN_IDS.POLYGON]: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
      [CHAIN_IDS.ARBITRUM]: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      [CHAIN_IDS.BASE]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      [CHAIN_IDS.AVALANCHE]: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
      [CHAIN_IDS.MONMOUTH]: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      [CHAIN_IDS.SEPOLIA]: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      // Solana
      [SOLANA_CLUSTERS.MAINNET]: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    },
    verified: true,
    tags: ['stablecoin', 'defi'],
  },

  USDT: {
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png',
    addresses: {
      [CHAIN_IDS.ETHEREUM]: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      [CHAIN_IDS.OPTIMISM]: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
      [CHAIN_IDS.POLYGON]: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      [CHAIN_IDS.ARBITRUM]: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      [CHAIN_IDS.BSC]: '0x55d398326f99059fF775485246999027B3197955',
      [CHAIN_IDS.AVALANCHE]: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
      // Solana
      [SOLANA_CLUSTERS.MAINNET]: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    },
    verified: true,
    tags: ['stablecoin', 'defi'],
  },

  DAI: {
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    decimals: 18,
    logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EescdeCB5BE3d09/logo.png',
    addresses: {
      [CHAIN_IDS.ETHEREUM]: '0x6B175474E89094C44Da98b954EedfcDeCB5BE3d09',
      [CHAIN_IDS.OPTIMISM]: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
      [CHAIN_IDS.POLYGON]: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
      [CHAIN_IDS.ARBITRUM]: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
      [CHAIN_IDS.BASE]: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
      [CHAIN_IDS.AVALANCHE]: '0xd586E7F844cEa2F87f50152665BCbc2C279D8d70',
    },
    verified: true,
    tags: ['stablecoin', 'defi'],
  },

  WETH: {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
    addresses: {
      [CHAIN_IDS.ETHEREUM]: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      [CHAIN_IDS.OPTIMISM]: '0x4200000000000000000000000000000000000006',
      [CHAIN_IDS.POLYGON]: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      [CHAIN_IDS.ARBITRUM]: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      [CHAIN_IDS.BASE]: '0x4200000000000000000000000000000000000006',
      [CHAIN_IDS.AVALANCHE]: '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB',
      [CHAIN_IDS.SEPOLIA]: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    },
    verified: true,
    tags: ['defi', 'wrapped'],
  },

  WBTC: {
    symbol: 'WBTC',
    name: 'Wrapped BTC',
    decimals: 8,
    logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599/logo.png',
    addresses: {
      [CHAIN_IDS.ETHEREUM]: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      [CHAIN_IDS.OPTIMISM]: '0x68f180fcCe6836688e9084f035309E29Bf0A2095',
      [CHAIN_IDS.POLYGON]: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
      [CHAIN_IDS.ARBITRUM]: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
      [CHAIN_IDS.AVALANCHE]: '0x50b7545627a5162F82A992c33b87aDc75187B218',
    },
    verified: true,
    tags: ['defi', 'wrapped'],
  },

  LINK: {
    symbol: 'LINK',
    name: 'Chainlink',
    decimals: 18,
    logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x514910771AF9Ca656af840dff83E8264EcF986CA/logo.png',
    addresses: {
      [CHAIN_IDS.ETHEREUM]: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
      [CHAIN_IDS.OPTIMISM]: '0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6',
      [CHAIN_IDS.POLYGON]: '0xb0897686c545045aFc77CF20eC7A532E3120E0F1',
      [CHAIN_IDS.ARBITRUM]: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4',
      [CHAIN_IDS.BASE]: '0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196',
      [CHAIN_IDS.AVALANCHE]: '0x5947BB275c521040051D82396192181b413227A3',
    },
    verified: true,
    tags: ['defi', 'oracle'],
  },

  UNI: {
    symbol: 'UNI',
    name: 'Uniswap',
    decimals: 18,
    logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984/logo.png',
    addresses: {
      [CHAIN_IDS.ETHEREUM]: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
      [CHAIN_IDS.OPTIMISM]: '0x6fd9d7AD17242c41f7131d257212c54A0e816691',
      [CHAIN_IDS.POLYGON]: '0xb33EaAd8d922B1083446DC23f610c2567fB5180f',
      [CHAIN_IDS.ARBITRUM]: '0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0',
      [CHAIN_IDS.BASE]: '0xc3De830EA07524a0761646a6a4e4be0e114a3C83',
    },
    verified: true,
    tags: ['defi', 'governance'],
  },

  // Solana native tokens
  SOL: {
    symbol: 'SOL',
    name: 'Solana',
    decimals: 9,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    addresses: {
      [SOLANA_CLUSTERS.MAINNET]: 'So11111111111111111111111111111111111111112',
      [SOLANA_CLUSTERS.DEVNET]: 'So11111111111111111111111111111111111111112',
      [SOLANA_CLUSTERS.TESTNET]: 'So11111111111111111111111111111111111111112',
    },
    verified: true,
    tags: ['native'],
  },

  WSOL: {
    symbol: 'WSOL',
    name: 'Wrapped SOL',
    decimals: 9,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    addresses: {
      [SOLANA_CLUSTERS.MAINNET]: 'So11111111111111111111111111111111111111112',
    },
    verified: true,
    tags: ['wrapped'],
  },
}

// ============= Native Tokens =============

/**
 * Native token symbols by chain ID
 */
export const NATIVE_TOKENS: Record<number, { symbol: string; name: string; decimals: number }> = {
  [CHAIN_IDS.ETHEREUM]: { symbol: 'ETH', name: 'Ether', decimals: 18 },
  [CHAIN_IDS.OPTIMISM]: { symbol: 'ETH', name: 'Ether', decimals: 18 },
  [CHAIN_IDS.BSC]: { symbol: 'BNB', name: 'BNB', decimals: 18 },
  [CHAIN_IDS.POLYGON]: { symbol: 'MATIC', name: 'MATIC', decimals: 18 },
  [CHAIN_IDS.ARBITRUM]: { symbol: 'ETH', name: 'Ether', decimals: 18 },
  [CHAIN_IDS.AVALANCHE]: { symbol: 'AVAX', name: 'Avalanche', decimals: 18 },
  [CHAIN_IDS.BASE]: { symbol: 'ETH', name: 'Ether', decimals: 18 },
  [CHAIN_IDS.MONMOUTH]: { symbol: 'ETH', name: 'Ether', decimals: 18 },
  [CHAIN_IDS.SEPOLIA]: { symbol: 'ETH', name: 'Sepolia Ether', decimals: 18 },
  [CHAIN_IDS.GOERLI]: { symbol: 'ETH', name: 'Goerli Ether', decimals: 18 },
}

// ============= Default RPC URLs =============

/**
 * Default public RPC URLs by chain ID
 * Note: For production, use private RPC endpoints
 */
export const DEFAULT_RPC_URLS: Record<number, string> = {
  [CHAIN_IDS.ETHEREUM]: 'https://eth.llamarpc.com',
  [CHAIN_IDS.OPTIMISM]: 'https://mainnet.optimism.io',
  [CHAIN_IDS.BSC]: 'https://bsc-dataseed.binance.org',
  [CHAIN_IDS.POLYGON]: 'https://polygon-rpc.com',
  [CHAIN_IDS.ARBITRUM]: 'https://arb1.arbitrum.io/rpc',
  [CHAIN_IDS.AVALANCHE]: 'https://api.avax.network/ext/bc/C/rpc',
  [CHAIN_IDS.BASE]: 'https://mainnet.base.org',
  [CHAIN_IDS.MONMOUTH]: 'http://localhost:8545',
  [CHAIN_IDS.SEPOLIA]: 'https://rpc.sepolia.org',
}

/**
 * Default Solana RPC endpoints
 */
export const DEFAULT_SOLANA_RPC_URLS: Record<string, string> = {
  [SOLANA_CLUSTERS.MAINNET]: 'https://api.mainnet-beta.solana.com',
  [SOLANA_CLUSTERS.DEVNET]: 'https://api.devnet.solana.com',
  [SOLANA_CLUSTERS.TESTNET]: 'https://api.testnet.solana.com',
}

// ============= Cache Configuration =============

/**
 * Default cache configuration
 */
export const DEFAULT_CACHE_CONFIG = {
  /** Default TTL for cached tokens (1 hour) */
  TOKEN_TTL_MS: 60 * 60 * 1000,
  /** Default TTL for cached token lists (24 hours) */
  LIST_TTL_MS: 24 * 60 * 60 * 1000,
  /** Storage key prefix */
  STORAGE_PREFIX: 'monmouth_tokens_',
  /** Maximum number of cached custom tokens */
  MAX_CUSTOM_TOKENS: 100,
  /** Maximum number of cached lists */
  MAX_CACHED_LISTS: 10,
} as const

// ============= Known Malicious Tokens =============

/**
 * Known malicious token addresses (for safety checks)
 * This is a minimal list - in production, use an API service
 */
export const BLOCKED_TOKENS: Record<number, Set<string>> = {
  [CHAIN_IDS.ETHEREUM]: new Set([
    // Add known scam tokens here
  ]),
}

// ============= Token Tags =============

/**
 * Standard token tags
 */
export const TOKEN_TAGS = {
  STABLECOIN: 'stablecoin',
  DEFI: 'defi',
  GOVERNANCE: 'governance',
  WRAPPED: 'wrapped',
  NATIVE: 'native',
  MEME: 'meme',
  NFT: 'nft',
  GAMING: 'gaming',
  ORACLE: 'oracle',
  BRIDGE: 'bridge',
} as const

/**
 * Get chain name from chain ID
 */
export function getChainName(chainId: number): string {
  const names: Record<number, string> = {
    [CHAIN_IDS.ETHEREUM]: 'Ethereum',
    [CHAIN_IDS.OPTIMISM]: 'Optimism',
    [CHAIN_IDS.BSC]: 'BNB Chain',
    [CHAIN_IDS.POLYGON]: 'Polygon',
    [CHAIN_IDS.ARBITRUM]: 'Arbitrum One',
    [CHAIN_IDS.AVALANCHE]: 'Avalanche',
    [CHAIN_IDS.BASE]: 'Base',
    [CHAIN_IDS.MONMOUTH]: 'Monmouth',
    [CHAIN_IDS.SEPOLIA]: 'Sepolia',
    [CHAIN_IDS.GOERLI]: 'Goerli',
  }
  return names[chainId] ?? `Chain ${chainId}`
}

/**
 * Check if a chain ID is a testnet
 */
export function isTestnet(chainId: number): boolean {
  const testnets: number[] = [
    CHAIN_IDS.SEPOLIA,
    CHAIN_IDS.GOERLI,
    CHAIN_IDS.MUMBAI,
    CHAIN_IDS.ARBITRUM_SEPOLIA,
    CHAIN_IDS.BASE_SEPOLIA,
  ]
  return testnets.includes(chainId)
}
