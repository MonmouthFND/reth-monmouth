/**
 * MonmouthWallet - Agent-aware wallet built on Porto (EIP-7702)
 *
 * This is the main entry point for the Monmouth Wallet SDK.
 * It wraps Porto/wagmi functionality with:
 * - Agent identity management
 * - Spending guardrails enforcement
 * - Activity logging
 */

import type {
  Address,
  AgentIdentity,
  Hash,
  MonmouthWalletConfig,
  PolicyValidationResult,
  SpendingPolicy,
  TransactionIntent,
  WalletEvent,
  WalletEventListener,
  WalletState,
} from './types'
import { PolicyEnforcer } from './guardrails/PolicyEnforcer'
import { createPolicyFromTemplate } from './guardrails/templates'

// Storage key prefix for persistence
const STORAGE_PREFIX = 'monmouth_wallet_'

// JSON serialization helpers for BigInt
function bigIntReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return { __type: 'bigint', value: value.toString() }
  }
  return value
}

function bigIntReviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && '__type' in value && (value as Record<string, unknown>).__type === 'bigint') {
    return BigInt((value as Record<string, string>).value)
  }
  return value
}

/**
 * MonmouthWallet - Main wallet class with guardrails
 */
export class MonmouthWallet {
  private identity: AgentIdentity
  private enforcer: PolicyEnforcer
  private connectedAddress: Address | null = null
  private listeners: Set<WalletEventListener> = new Set()
  private sessionCheckInterval: ReturnType<typeof setInterval> | null = null

  constructor(config: MonmouthWalletConfig) {
    // Create identity with timestamp
    this.identity = {
      ...config.identity,
      createdAt: Date.now(),
    }

    // Create policy from template with overrides
    const policy = createPolicyFromTemplate(config.identity.agentType, config.policy)

    // Initialize the policy enforcer
    this.enforcer = new PolicyEnforcer(policy)

    // Try to restore persisted state
    this.restoreState()

    // Start session monitoring
    this.startSessionMonitoring()
  }

  // ============= Identity Methods =============

  /**
   * Get the agent identity
   */
  getIdentity(): AgentIdentity {
    return { ...this.identity }
  }

  /**
   * Get the agent ID
   */
  getAgentId(): string {
    return this.identity.agentId
  }

  /**
   * Get the agent type
   */
  getAgentType(): AgentIdentity['agentType'] {
    return this.identity.agentType
  }

  // ============= Policy / Guardrails Methods =============

  /**
   * Get the current spending policy
   */
  getPolicy(): SpendingPolicy {
    return this.enforcer.getPolicy()
  }

  /**
   * Update the spending policy
   */
  updatePolicy(policy: Partial<SpendingPolicy>): void {
    const currentPolicy = this.enforcer.getPolicy()
    const newPolicy = { ...currentPolicy, ...policy }
    this.enforcer.updatePolicy(newPolicy)
    this.persistState()
    this.emit({ type: 'policy_updated', policy: newPolicy })
  }

  /**
   * Validate a transaction intent against guardrails
   */
  validateTransaction(intent: TransactionIntent): PolicyValidationResult {
    return this.enforcer.validate(intent)
  }

  /**
   * Get remaining daily budget
   */
  getRemainingDailyBudget(): bigint {
    return this.enforcer.getRemainingDaily()
  }

  /**
   * Get amount spent today
   */
  getDailySpent(): bigint {
    return this.enforcer.getDailySpent()
  }

  /**
   * Check if the session has expired
   */
  isSessionExpired(): boolean {
    return this.enforcer.isSessionExpired()
  }

  /**
   * Get time remaining in session (milliseconds)
   */
  getSessionTimeRemaining(): number {
    return this.enforcer.getSessionTimeRemaining()
  }

  /**
   * Extend the session by a given duration
   */
  extendSession(durationMs: number): void {
    const policy = this.enforcer.getPolicy()
    policy.sessionExpiry = Date.now() + durationMs
    this.enforcer.updatePolicy(policy)
    this.persistState()
  }

  // ============= Connection Methods =============

  /**
   * Set the connected address (called after wagmi/Porto connection)
   */
  setConnectedAddress(address: Address): void {
    this.connectedAddress = address
    this.emit({ type: 'connected', address })
    this.persistState()
  }

  /**
   * Clear the connected address (called after disconnect)
   */
  clearConnection(): void {
    this.connectedAddress = null
    this.emit({ type: 'disconnected' })
    this.persistState()
  }

  /**
   * Get the connected address
   */
  getConnectedAddress(): Address | null {
    return this.connectedAddress
  }

  /**
   * Check if the wallet is connected
   */
  isConnected(): boolean {
    return this.connectedAddress !== null
  }

  // ============= Transaction Methods =============

  /**
   * Prepare a transaction for sending (validates against guardrails)
   *
   * This method validates the transaction intent and returns a result
   * indicating whether it can be sent. It does NOT send the transaction -
   * that should be done via wagmi's sendTransaction hook.
   *
   * @returns PolicyValidationResult with allowed status and reason if blocked
   */
  prepareTransaction(intent: TransactionIntent): PolicyValidationResult {
    const result = this.enforcer.validate(intent)

    if (!result.allowed) {
      this.emit({
        type: 'transaction_blocked',
        intent,
        reason: result.reason || 'Unknown',
      })
    }

    return result
  }

  /**
   * Record a successful transaction
   *
   * Call this after wagmi's sendTransaction succeeds to:
   * - Update daily spending tracking
   * - Persist state
   */
  recordTransaction(hash: Hash, value: bigint): void {
    this.enforcer.recordSpend(value)
    this.emit({ type: 'transaction_sent', hash })
    this.persistState()
  }

  // ============= Event Methods =============

  /**
   * Subscribe to wallet events
   */
  on(listener: WalletEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Emit an event to all listeners
   */
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

  /**
   * Get the current wallet state
   */
  getState(): WalletState {
    return {
      identity: this.getIdentity(),
      policy: this.getPolicy(),
      dailySpent: this.getDailySpent(),
      lastSpendDay: Math.floor(Date.now() / (24 * 60 * 60 * 1000)),
      isConnected: this.isConnected(),
    }
  }

  /**
   * Persist state to localStorage
   */
  private persistState(): void {
    if (typeof localStorage === 'undefined') return

    const key = `${STORAGE_PREFIX}${this.identity.agentId}`
    const state = {
      identity: this.identity,
      enforcer: this.enforcer.toJSON(),
      connectedAddress: this.connectedAddress,
    }

    try {
      // Use custom replacer to handle BigInt serialization
      localStorage.setItem(key, JSON.stringify(state, bigIntReplacer))
    } catch (error) {
      console.error('Failed to persist wallet state:', error)
    }
  }

  /**
   * Restore state from localStorage
   */
  private restoreState(): void {
    if (typeof localStorage === 'undefined') return

    const key = `${STORAGE_PREFIX}${this.identity.agentId}`

    try {
      const stored = localStorage.getItem(key)
      if (!stored) return

      const state = JSON.parse(stored, bigIntReviver)

      // Restore enforcer state (keeps spending tracking across page reloads)
      if (state.enforcer) {
        // Create a new enforcer with the restored state but current policy
        // (policy might have changed in config)
        const currentPolicy = this.enforcer.getPolicy()
        this.enforcer = new PolicyEnforcer(
          currentPolicy,
          BigInt(state.enforcer.dailySpent),
          state.enforcer.lastSpendDay
        )
      }

      // Restore connection state
      if (state.connectedAddress) {
        this.connectedAddress = state.connectedAddress
      }
    } catch (error) {
      console.error('Failed to restore wallet state:', error)
    }
  }

  /**
   * Clear all persisted state
   */
  clearPersistedState(): void {
    if (typeof localStorage === 'undefined') return

    const key = `${STORAGE_PREFIX}${this.identity.agentId}`
    localStorage.removeItem(key)
  }

  // ============= Session Monitoring =============

  /**
   * Start monitoring for session expiry
   */
  private startSessionMonitoring(): void {
    // Check every minute
    this.sessionCheckInterval = setInterval(() => {
      if (this.isSessionExpired()) {
        this.emit({ type: 'session_expired' })
      }
    }, 60_000)
  }

  /**
   * Stop session monitoring (call on cleanup)
   */
  destroy(): void {
    if (this.sessionCheckInterval) {
      clearInterval(this.sessionCheckInterval)
      this.sessionCheckInterval = null
    }
    this.listeners.clear()
  }
}

/**
 * Create a new MonmouthWallet instance
 */
export function createMonmouthWallet(config: MonmouthWalletConfig): MonmouthWallet {
  return new MonmouthWallet(config)
}
