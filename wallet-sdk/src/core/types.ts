/**
 * Universal type definitions for multi-chain support
 *
 * These types abstract over EVM and Solana (and future chains)
 * to enable chain-agnostic wallet operations.
 */

/** Supported chain families */
export type ChainType = 'evm' | 'svm'

/** Universal address representation */
export interface UniversalAddress {
  /** Raw bytes of the address */
  raw: Uint8Array
  /** Display string (hex for EVM, base58 for Solana) */
  display: string
  /** Chain family */
  chainType: ChainType
}

/** Universal signature */
export interface UniversalSignature {
  /** Raw signature bytes */
  bytes: Uint8Array
  /** Signing scheme used */
  scheme: 'secp256k1' | 'ed25519'
  /** Recovery ID (EVM only) */
  recoveryId?: number
}

/** Universal transaction hash */
export interface TxHash {
  /** Raw bytes */
  bytes: Uint8Array
  /** Display string */
  display: string
  /** Chain family */
  chainType: ChainType
}

/** Token identifier */
export interface TokenId {
  /** Chain family */
  chainType: ChainType
  /** Token address or 'native' for native token */
  address: UniversalAddress | 'native'
  /** Token symbol */
  symbol: string
  /** Decimal places */
  decimals: number
}

/** Token amount with metadata */
export interface TokenAmount {
  /** Token identifier */
  token: TokenId
  /** Raw amount in smallest unit */
  raw: bigint
  /** Human-readable formatted amount */
  formatted: string
}

/** Universal transaction format */
export interface UniversalTransaction {
  /** Recipient address or program */
  to: UniversalAddress

  /** Native token value to transfer */
  value?: bigint

  /** Encoded call data */
  data?: Uint8Array

  /** Token transfers (non-native) */
  tokenTransfers?: Array<{
    token: TokenId
    to: UniversalAddress
    amount: bigint
  }>

  /** Fee configuration */
  fee?: {
    maxAmount?: bigint
    priority?: 'low' | 'medium' | 'high'
  }

  /** EVM-specific fields */
  evm?: {
    gasLimit?: bigint
    maxFeePerGas?: bigint
    maxPriorityFeePerGas?: bigint
    nonce?: number
  }

  /** Solana-specific fields */
  svm?: {
    computeUnits?: number
    computeUnitPrice?: bigint
    recentBlockhash?: string
    additionalSigners?: Uint8Array[]
  }
}

/** Transaction result */
export interface TxResult {
  /** Transaction hash */
  hash: TxHash
  /** Current status */
  status: 'pending' | 'confirmed' | 'failed'
}

/** Transaction receipt */
export interface TxReceipt {
  /** Transaction hash */
  hash: TxHash
  /** Final status */
  status: 'success' | 'reverted' | 'failed'
  /** Block number */
  blockNumber: bigint
  /** Fee paid */
  fee: TokenAmount
  /** Logs emitted */
  logs: UniversalLog[]
}

/** Universal log/event */
export interface UniversalLog {
  /** Emitting address */
  address: UniversalAddress
  /** Topics (EVM) or keys (Solana) */
  topics: Uint8Array[]
  /** Log data */
  data: Uint8Array
}

/** Typed data domain for EIP-712 style signing */
export interface TypedDataDomain {
  name?: string
  version?: string
  chainId?: number | bigint
  verifyingContract?: string
}

/** Typed data types definition */
export type TypedDataTypes = Record<string, Array<{ name: string; type: string }>>

/** Chain configuration */
export interface ChainConfig {
  /** Chain type */
  chainType: ChainType
  /** Chain ID (number for EVM, string for Solana clusters) */
  chainId: number | string
  /** Human-readable name */
  name: string
  /** RPC endpoint */
  rpcUrl?: string
  /** Block explorer URL */
  explorerUrl?: string
  /** Native token */
  nativeToken: {
    symbol: string
    decimals: number
  }
}

/** Common EVM chains */
export const EVM_CHAINS = {
  ethereum: { chainType: 'evm', chainId: 1, name: 'Ethereum', nativeToken: { symbol: 'ETH', decimals: 18 } },
  base: { chainType: 'evm', chainId: 8453, name: 'Base', nativeToken: { symbol: 'ETH', decimals: 18 } },
  arbitrum: { chainType: 'evm', chainId: 42161, name: 'Arbitrum One', nativeToken: { symbol: 'ETH', decimals: 18 } },
  optimism: { chainType: 'evm', chainId: 10, name: 'Optimism', nativeToken: { symbol: 'ETH', decimals: 18 } },
  monmouth: { chainType: 'evm', chainId: 7750, name: 'Monmouth', nativeToken: { symbol: 'ETH', decimals: 18 } },
  portoOdyssey: { chainType: 'evm', chainId: 911867, name: 'Porto Odyssey', nativeToken: { symbol: 'ETH', decimals: 18 } },
} as const satisfies Record<string, ChainConfig>

/** Common Solana clusters */
export const SVM_CHAINS = {
  mainnet: { chainType: 'svm', chainId: 'mainnet-beta', name: 'Solana Mainnet', nativeToken: { symbol: 'SOL', decimals: 9 } },
  devnet: { chainType: 'svm', chainId: 'devnet', name: 'Solana Devnet', nativeToken: { symbol: 'SOL', decimals: 9 } },
  testnet: { chainType: 'svm', chainId: 'testnet', name: 'Solana Testnet', nativeToken: { symbol: 'SOL', decimals: 9 } },
} as const satisfies Record<string, ChainConfig>
