/**
 * Solana Adapter - Solana chain support
 */

export { SolanaAdapter, createSolanaAdapter } from './adapter'
export type { SolanaAdapterConfig, SolanaWalletAdapter } from './adapter'

// Re-export Solana types for convenience
export { Keypair, PublicKey, Connection } from '@solana/web3.js'
