/**
 * Core type definitions for Monmouth Wallet SDK
 */

import type { Address, Hash, Hex } from 'viem'

// Agent Types
export type AgentType = 'research' | 'trading' | 'coordinator' | 'commerce'

export interface AgentIdentity {
  agentId: string
  agentType: AgentType
  name: string
  createdAt: number
  /** Optional DID for decentralized identity */
  did?: string
}

// Spending Policy / Guardrails
export interface SpendingPolicy {
  /** Maximum value per transaction in wei */
  maxPerTransaction: bigint
  /** Maximum daily spending in wei */
  maxPerDay: bigint
  /** Addresses allowed to receive transactions (empty = all allowed) */
  allowedAddresses: Address[]
  /** Addresses explicitly blocked from receiving transactions */
  blockedAddresses: Address[]
  /** Function selectors allowed to be called (empty = all allowed) */
  allowedSelectors: Hex[]
  /** Session expiry timestamp (unix ms) */
  sessionExpiry: number
  /** Whether the agent can deploy new contracts */
  canDeployContracts: boolean
}

// Activity Logging
export type ActivityActionType = 'transaction' | 'signature' | 'decision' | 'error'

export interface ActivityLogEntry {
  agentId: string
  actionType: ActivityActionType
  txHash?: Hash
  timestamp: number
  /** Arbitrary data associated with this entry */
  data: unknown
}

// Policy Validation
export interface PolicyValidationResult {
  allowed: boolean
  reason?: string
  /** Which rule was violated */
  violatedRule?: 'maxPerTransaction' | 'maxPerDay' | 'blockedAddress' | 'notAllowedAddress' | 'notAllowedSelector' | 'sessionExpired' | 'noContractDeploy'
}

// Transaction Intent (for guardrail checking)
export interface TransactionIntent {
  to?: Address
  value: bigint
  data?: Hex
  /** Whether this is a contract deployment */
  isContractDeploy?: boolean
}

// Wallet State
export interface WalletState {
  identity: AgentIdentity
  policy: SpendingPolicy
  /** Amount spent today in wei */
  dailySpent: bigint
  /** Day of last spend (for daily reset) */
  lastSpendDay: number
  /** Whether the wallet is connected */
  isConnected: boolean
}

// Configuration for creating a MonmouthWallet
export interface MonmouthWalletConfig {
  identity: Omit<AgentIdentity, 'createdAt'>
  policy?: Partial<SpendingPolicy>
}

// Event types emitted by the wallet
export type WalletEvent =
  | { type: 'connected'; address: Address }
  | { type: 'disconnected' }
  | { type: 'transaction_blocked'; intent: TransactionIntent; reason: string }
  | { type: 'transaction_sent'; hash: Hash }
  | { type: 'policy_updated'; policy: SpendingPolicy }
  | { type: 'session_expired' }

export type WalletEventListener = (event: WalletEvent) => void

// Export viem types for convenience
export type { Address, Hash, Hex } from 'viem'
