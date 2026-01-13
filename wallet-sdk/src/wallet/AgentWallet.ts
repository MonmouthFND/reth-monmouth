/**
 * AgentWallet - Chain-agnostic agent wallet with guardrails
 *
 * This is the multi-chain version of MonmouthWallet.
 * It uses ChainAdapter to abstract over EVM and Solana chains.
 */

import type { ChainAdapter } from '../core/adapter'
import type {
  ChainType,
  TokenAmount,
  TxResult,
  UniversalAddress,
  UniversalTransaction,
} from '../core/types'

/** Agent types */
export type AgentType = 'research' | 'trading' | 'coordinator' | 'commerce'

/** Agent identity */
export interface AgentIdentityConfig {
  /** Unique agent ID */
  agentId: string
  /** Agent type (determines default policy) */
  agentType: AgentType
  /** Human-readable name */
  name: string
  /** Optional metadata */
  metadata?: Record<string, unknown>
}

/** Full agent identity with DID */
export interface AgentIdentity extends AgentIdentityConfig {
  /** Creation timestamp */
  createdAt: number
  /** Decentralized identifier */
  did?: string
}

/** Spending policy for guardrails */
export interface SpendingPolicy {
  /** Maximum value per transaction (in native token smallest unit) */
  maxPerTransaction: bigint
  /** Maximum daily spending (in native token smallest unit) */
  maxPerDay: bigint
  /** Addresses allowed to receive transactions (empty = all allowed) */
  allowedAddresses: UniversalAddress[]
  /** Addresses explicitly blocked */
  blockedAddresses: UniversalAddress[]
  /** Function selectors allowed (EVM) or instruction discriminators (Solana) */
  allowedSelectors: Uint8Array[]
  /** Session expiry timestamp (unix ms) */
  sessionExpiry: number
  /** Whether the agent can deploy contracts/programs */
  canDeployContracts: boolean
}

/** Policy validation result */
export interface PolicyValidationResult {
  allowed: boolean
  reason?: string
  violatedRule?:
    | 'maxPerTransaction'
    | 'maxPerDay'
    | 'blockedAddress'
    | 'notAllowedAddress'
    | 'notAllowedSelector'
    | 'sessionExpired'
    | 'noContractDeploy'
}

/** Transaction intent for validation */
export interface TransactionIntent {
  to?: UniversalAddress
  value: bigint
  data?: Uint8Array
  isContractDeploy?: boolean
}

/** Wallet events */
export type WalletEvent =
  | { type: 'connected'; address: UniversalAddress }
  | { type: 'disconnected' }
  | { type: 'transaction_blocked'; intent: TransactionIntent; reason: string }
  | { type: 'transaction_sent'; hash: string; chainType: ChainType }
  | { type: 'policy_updated'; policy: SpendingPolicy }
  | { type: 'session_expired' }
  | { type: 'daily_reset' }

export type WalletEventListener = (event: WalletEvent) => void

/** Wallet state */
export interface WalletState {
  identity: AgentIdentity
  policy: SpendingPolicy
  dailySpent: bigint
  lastSpendDay: number
  isConnected: boolean
  chainType: ChainType
}

/** Agent wallet configuration */
export interface AgentWalletConfig {
  /** Chain adapter */
  adapter: ChainAdapter
  /** Agent identity config */
  identity: AgentIdentityConfig
  /** Optional policy overrides */
  policy?: Partial<SpendingPolicy>
}

/** Default policies by agent type */
export const DEFAULT_POLICIES: Record<AgentType, SpendingPolicy> = {
  research: {
    maxPerTransaction: BigInt('100000000000000000'), // 0.1 ETH
    maxPerDay: BigInt('1000000000000000000'), // 1 ETH
    allowedAddresses: [],
    blockedAddresses: [],
    allowedSelectors: [],
    sessionExpiry: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    canDeployContracts: false,
  },
  trading: {
    maxPerTransaction: BigInt('10000000000000000000'), // 10 ETH
    maxPerDay: BigInt('100000000000000000000'), // 100 ETH
    allowedAddresses: [],
    blockedAddresses: [],
    allowedSelectors: [],
    sessionExpiry: Date.now() + 60 * 60 * 1000, // 1 hour
    canDeployContracts: false,
  },
  coordinator: {
    maxPerTransaction: BigInt('10000000000000000'), // 0.01 ETH
    maxPerDay: BigInt('100000000000000000'), // 0.1 ETH
    allowedAddresses: [],
    blockedAddresses: [],
    allowedSelectors: [],
    sessionExpiry: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    canDeployContracts: false,
  },
  commerce: {
    maxPerTransaction: BigInt('1000000000000000000'), // 1 ETH
    maxPerDay: BigInt('10000000000000000000'), // 10 ETH
    allowedAddresses: [],
    blockedAddresses: [],
    allowedSelectors: [],
    sessionExpiry: Date.now() + 4 * 60 * 60 * 1000, // 4 hours
    canDeployContracts: false,
  },
}

/** Storage key prefix */
const STORAGE_PREFIX = 'agent_wallet_'

/** AgentWallet - Multi-chain agent wallet with guardrails */
export class AgentWallet {
  private adapter: ChainAdapter
  private identity: AgentIdentity
  private policy: SpendingPolicy
  private dailySpent: bigint = 0n
  private lastSpendDay: number
  private listeners = new Set<WalletEventListener>()
  private sessionCheckInterval: ReturnType<typeof setInterval> | null = null

  constructor(config: AgentWalletConfig) {
    this.adapter = config.adapter

    // Initialize identity
    this.identity = {
      ...config.identity,
      createdAt: Date.now(),
    }

    // Initialize policy with defaults and overrides
    const defaultPolicy = { ...DEFAULT_POLICIES[config.identity.agentType] }
    this.policy = {
      ...defaultPolicy,
      ...config.policy,
      // Ensure arrays are properly initialized
      allowedAddresses: config.policy?.allowedAddresses ?? defaultPolicy.allowedAddresses,
      blockedAddresses: config.policy?.blockedAddresses ?? defaultPolicy.blockedAddresses,
      allowedSelectors: config.policy?.allowedSelectors ?? defaultPolicy.allowedSelectors,
    }

    // Initialize daily tracking
    this.lastSpendDay = this.getCurrentDay()

    // Restore persisted state
    this.restoreState()

    // Start session monitoring
    this.startSessionMonitoring()
  }

  // ============= Identity Methods =============

  getIdentity(): AgentIdentity {
    return { ...this.identity }
  }

  getAgentId(): string {
    return this.identity.agentId
  }

  getAgentType(): AgentType {
    return this.identity.agentType
  }

  getChainType(): ChainType {
    return this.adapter.chainType
  }

  /** Generate DID based on chain type */
  async getDID(): Promise<string> {
    const address = await this.adapter.getAddress()

    // Multicodec prefixes
    const prefix =
      this.adapter.chainType === 'evm'
        ? new Uint8Array([0xe7, 0x01]) // secp256k1-pub
        : new Uint8Array([0xed, 0x01]) // ed25519-pub

    // Combine prefix and public key bytes
    const combined = new Uint8Array(prefix.length + address.raw.length)
    combined.set(prefix)
    combined.set(address.raw, prefix.length)

    // Base58 encode (simplified)
    const encoded = this.base58Encode(combined)

    return `did:key:z${encoded}`
  }

  private base58Encode(bytes: Uint8Array): string {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
    let num = 0n
    for (const byte of bytes) {
      num = num * 256n + BigInt(byte)
    }

    let str = ''
    while (num > 0n) {
      str = ALPHABET[Number(num % 58n)] + str
      num = num / 58n
    }

    // Add leading '1's for zero bytes
    for (const byte of bytes) {
      if (byte === 0) str = '1' + str
      else break
    }

    return str
  }

  // ============= Connection Methods =============

  async connect(): Promise<void> {
    await this.adapter.connect()
    const address = await this.adapter.getAddress()
    this.emit({ type: 'connected', address })
  }

  async disconnect(): Promise<void> {
    await this.adapter.disconnect()
    this.emit({ type: 'disconnected' })
  }

  isConnected(): boolean {
    return this.adapter.isConnected()
  }

  async getAddress(): Promise<UniversalAddress> {
    return this.adapter.getAddress()
  }

  async getBalance(): Promise<TokenAmount> {
    return this.adapter.getNativeBalance()
  }

  // ============= Policy Methods =============

  getPolicy(): SpendingPolicy {
    return { ...this.policy }
  }

  updatePolicy(policy: Partial<SpendingPolicy>): void {
    this.policy = { ...this.policy, ...policy }
    this.persistState()
    this.emit({ type: 'policy_updated', policy: this.policy })
  }

  getRemainingDailyBudget(): bigint {
    this.checkDayReset()
    const remaining = this.policy.maxPerDay - this.dailySpent
    return remaining > 0n ? remaining : 0n
  }

  getDailySpent(): bigint {
    this.checkDayReset()
    return this.dailySpent
  }

  isSessionExpired(): boolean {
    return Date.now() > this.policy.sessionExpiry
  }

  getSessionTimeRemaining(): number {
    const remaining = this.policy.sessionExpiry - Date.now()
    return remaining > 0 ? remaining : 0
  }

  extendSession(durationMs: number): void {
    this.policy.sessionExpiry = Date.now() + durationMs
    this.persistState()
  }

  // ============= Transaction Methods =============

  /** Validate a transaction against guardrails */
  validateTransaction(intent: TransactionIntent): PolicyValidationResult {
    // Check session expiry
    if (this.isSessionExpired()) {
      return { allowed: false, reason: 'Session expired', violatedRule: 'sessionExpired' }
    }

    // Check contract deployment
    if (intent.isContractDeploy && !this.policy.canDeployContracts) {
      return {
        allowed: false,
        reason: 'Contract deployment not allowed',
        violatedRule: 'noContractDeploy',
      }
    }

    // Check per-transaction limit
    if (intent.value > this.policy.maxPerTransaction) {
      return {
        allowed: false,
        reason: `Value ${intent.value} exceeds max per transaction ${this.policy.maxPerTransaction}`,
        violatedRule: 'maxPerTransaction',
      }
    }

    // Check daily limit
    this.checkDayReset()
    if (this.dailySpent + intent.value > this.policy.maxPerDay) {
      return {
        allowed: false,
        reason: `Would exceed daily limit of ${this.policy.maxPerDay}`,
        violatedRule: 'maxPerDay',
      }
    }

    // Check blocked addresses
    if (intent.to) {
      const isBlocked = this.policy.blockedAddresses.some(
        (addr) => addr.display.toLowerCase() === intent.to!.display.toLowerCase()
      )
      if (isBlocked) {
        return {
          allowed: false,
          reason: `Address ${intent.to.display} is blocked`,
          violatedRule: 'blockedAddress',
        }
      }
    }

    // Check allowed addresses (if non-empty)
    if (intent.to && this.policy.allowedAddresses.length > 0) {
      const isAllowed = this.policy.allowedAddresses.some(
        (addr) => addr.display.toLowerCase() === intent.to!.display.toLowerCase()
      )
      if (!isAllowed) {
        return {
          allowed: false,
          reason: `Address ${intent.to.display} not in allowlist`,
          violatedRule: 'notAllowedAddress',
        }
      }
    }

    // Check allowed selectors (if non-empty and data provided)
    if (intent.data && intent.data.length >= 4 && this.policy.allowedSelectors.length > 0) {
      const selector = intent.data.slice(0, 4)
      const isAllowed = this.policy.allowedSelectors.some(
        (s) => s.length >= 4 && s.every((b, i) => b === selector[i])
      )
      if (!isAllowed) {
        return {
          allowed: false,
          reason: 'Function selector not in allowlist',
          violatedRule: 'notAllowedSelector',
        }
      }
    }

    return { allowed: true }
  }

  /** Send a transaction with guardrail validation */
  async sendTransaction(tx: UniversalTransaction): Promise<TxResult> {
    // Validate against guardrails
    const validation = this.validateTransaction({
      to: tx.to,
      value: tx.value ?? 0n,
      data: tx.data,
      isContractDeploy: tx.to === undefined,
    })

    if (!validation.allowed) {
      this.emit({
        type: 'transaction_blocked',
        intent: { to: tx.to, value: tx.value ?? 0n, data: tx.data },
        reason: validation.reason!,
      })
      throw new Error(`Transaction blocked: ${validation.reason}`)
    }

    // Send transaction
    const result = await this.adapter.sendTransaction(tx)

    // Record spend
    this.recordSpend(tx.value ?? 0n)

    // Emit event
    this.emit({
      type: 'transaction_sent',
      hash: result.hash.display,
      chainType: this.adapter.chainType,
    })

    return result
  }

  /** Record a spend (for external transaction tracking) */
  recordSpend(value: bigint): void {
    this.checkDayReset()
    this.dailySpent += value
    this.persistState()
  }

  // ============= Event Methods =============

  on(listener: WalletEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: WalletEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event)
      } catch (error) {
        console.error('Wallet event listener error:', error)
      }
    })
  }

  // ============= State Methods =============

  getState(): WalletState {
    return {
      identity: this.getIdentity(),
      policy: this.getPolicy(),
      dailySpent: this.getDailySpent(),
      lastSpendDay: this.lastSpendDay,
      isConnected: this.isConnected(),
      chainType: this.adapter.chainType,
    }
  }

  /** Get underlying chain adapter */
  getAdapter(): ChainAdapter {
    return this.adapter
  }

  private getCurrentDay(): number {
    return Math.floor(Date.now() / (24 * 60 * 60 * 1000))
  }

  private checkDayReset(): void {
    const currentDay = this.getCurrentDay()
    if (currentDay !== this.lastSpendDay) {
      this.dailySpent = 0n
      this.lastSpendDay = currentDay
      this.persistState()
      this.emit({ type: 'daily_reset' })
    }
  }

  private persistState(): void {
    if (typeof localStorage === 'undefined') return

    const key = `${STORAGE_PREFIX}${this.identity.agentId}_${this.adapter.chainType}`
    const state = {
      dailySpent: this.dailySpent.toString(),
      lastSpendDay: this.lastSpendDay,
      policy: {
        ...this.policy,
        maxPerTransaction: this.policy.maxPerTransaction.toString(),
        maxPerDay: this.policy.maxPerDay.toString(),
        allowedAddresses: this.policy.allowedAddresses.map((a) => ({
          raw: Array.from(a.raw),
          display: a.display,
          chainType: a.chainType,
        })),
        blockedAddresses: this.policy.blockedAddresses.map((a) => ({
          raw: Array.from(a.raw),
          display: a.display,
          chainType: a.chainType,
        })),
        allowedSelectors: this.policy.allowedSelectors.map((s) => Array.from(s)),
      },
    }

    try {
      localStorage.setItem(key, JSON.stringify(state))
    } catch (error) {
      console.error('Failed to persist wallet state:', error)
    }
  }

  private restoreState(): void {
    if (typeof localStorage === 'undefined') return

    const key = `${STORAGE_PREFIX}${this.identity.agentId}_${this.adapter.chainType}`

    try {
      const stored = localStorage.getItem(key)
      if (!stored) return

      const state = JSON.parse(stored)

      if (state.dailySpent) {
        this.dailySpent = BigInt(state.dailySpent)
      }
      if (state.lastSpendDay) {
        this.lastSpendDay = state.lastSpendDay
      }
      if (state.policy) {
        this.policy = {
          ...this.policy,
          maxPerTransaction: BigInt(state.policy.maxPerTransaction),
          maxPerDay: BigInt(state.policy.maxPerDay),
          sessionExpiry: state.policy.sessionExpiry,
          canDeployContracts: state.policy.canDeployContracts,
          allowedAddresses: state.policy.allowedAddresses?.map((a: Record<string, unknown>) => ({
            raw: new Uint8Array(a.raw as number[]),
            display: a.display as string,
            chainType: a.chainType as ChainType,
          })) ?? [],
          blockedAddresses: state.policy.blockedAddresses?.map((a: Record<string, unknown>) => ({
            raw: new Uint8Array(a.raw as number[]),
            display: a.display as string,
            chainType: a.chainType as ChainType,
          })) ?? [],
          allowedSelectors: state.policy.allowedSelectors?.map(
            (s: number[]) => new Uint8Array(s)
          ) ?? [],
        }
      }
    } catch (error) {
      console.error('Failed to restore wallet state:', error)
    }
  }

  clearPersistedState(): void {
    if (typeof localStorage === 'undefined') return
    const key = `${STORAGE_PREFIX}${this.identity.agentId}_${this.adapter.chainType}`
    localStorage.removeItem(key)
  }

  private startSessionMonitoring(): void {
    this.sessionCheckInterval = setInterval(() => {
      if (this.isSessionExpired()) {
        this.emit({ type: 'session_expired' })
      }
    }, 60_000)
  }

  destroy(): void {
    if (this.sessionCheckInterval) {
      clearInterval(this.sessionCheckInterval)
      this.sessionCheckInterval = null
    }
    this.listeners.clear()
  }
}

/** Create an AgentWallet */
export function createAgentWallet(config: AgentWalletConfig): AgentWallet {
  return new AgentWallet(config)
}
