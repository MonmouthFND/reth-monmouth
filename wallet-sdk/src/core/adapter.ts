/**
 * ChainAdapter - Universal interface for blockchain interactions
 *
 * This interface abstracts over EVM and Solana chains,
 * allowing the wallet SDK to work with any supported chain.
 */

import type {
  ChainConfig,
  ChainType,
  TokenAmount,
  TokenId,
  TxHash,
  TxReceipt,
  TxResult,
  TypedDataDomain,
  TypedDataTypes,
  UniversalAddress,
  UniversalSignature,
  UniversalTransaction,
} from './types'

/** Chain adapter interface */
export interface ChainAdapter {
  /** Chain identification */
  readonly chainType: ChainType
  readonly chainId: number | string
  readonly config: ChainConfig

  /** Connection state */
  isConnected(): boolean
  connect(): Promise<void>
  disconnect(): Promise<void>

  /** Address management */
  getAddress(): Promise<UniversalAddress>
  normalizeAddress(input: string): UniversalAddress
  isValidAddress(input: string): boolean

  /** Signing */
  sign(message: Uint8Array): Promise<UniversalSignature>
  signMessage(message: string): Promise<UniversalSignature>
  signTypedData?(
    domain: TypedDataDomain,
    types: TypedDataTypes,
    value: Record<string, unknown>
  ): Promise<UniversalSignature>

  /** Balances */
  getNativeBalance(): Promise<TokenAmount>
  getTokenBalance(token: TokenId): Promise<TokenAmount>

  /** Transactions */
  estimateFee(tx: UniversalTransaction): Promise<TokenAmount>
  sendTransaction(tx: UniversalTransaction): Promise<TxResult>
  waitForConfirmation(hash: TxHash, confirmations?: number): Promise<TxReceipt>
  getTransaction(hash: TxHash): Promise<TxReceipt | null>

  /** Chain-specific escape hatch */
  getRawClient<T>(): T
}

/** Event emitter for adapter events */
export type AdapterEvent =
  | { type: 'connected'; address: UniversalAddress }
  | { type: 'disconnected' }
  | { type: 'chainChanged'; chainId: number | string }
  | { type: 'accountChanged'; address: UniversalAddress }

export type AdapterEventListener = (event: AdapterEvent) => void

/** Extended adapter with event support */
export interface ChainAdapterWithEvents extends ChainAdapter {
  on(listener: AdapterEventListener): () => void
  off(listener: AdapterEventListener): void
}

/** Configuration for creating an adapter */
export interface AdapterConfig {
  /** Chain configuration */
  chain: ChainConfig
  /** RPC URL override */
  rpcUrl?: string
}

/** Factory function type for creating adapters */
export type AdapterFactory<TConfig extends AdapterConfig = AdapterConfig> = (
  config: TConfig
) => ChainAdapter
