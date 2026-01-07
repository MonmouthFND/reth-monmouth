/**
 * Chain Adapters - Multi-chain support for the wallet SDK
 */

// EVM Adapter
export { EvmAdapter, createEvmAdapter } from './evm'
export type { EvmAdapterConfig } from './evm'

// Solana Adapter
export { SolanaAdapter, createSolanaAdapter } from './solana'
export type { SolanaAdapterConfig, SolanaWalletAdapter } from './solana'
