/**
 * PolicyEnforcer - Pre-transaction validation against spending policies
 *
 * This module enforces guardrails before any transaction is sent,
 * ensuring agents operate within their defined boundaries.
 */

import type {
  Address,
  Hex,
  PolicyValidationResult,
  SpendingPolicy,
  TransactionIntent,
} from '../types'

/**
 * Enforces spending policies on transaction intents
 */
export class PolicyEnforcer {
  private policy: SpendingPolicy
  private dailySpent: bigint
  private lastSpendDay: number

  constructor(
    policy: SpendingPolicy,
    dailySpent: bigint = 0n,
    lastSpendDay?: number
  ) {
    this.policy = policy
    this.dailySpent = dailySpent
    this.lastSpendDay = lastSpendDay ?? this.getCurrentDay()
  }

  /**
   * Validate a transaction intent against the current policy
   */
  validate(intent: TransactionIntent): PolicyValidationResult {
    // Check session expiry first
    if (this.isSessionExpired()) {
      return {
        allowed: false,
        reason: 'Session has expired',
        violatedRule: 'sessionExpired',
      }
    }

    // Check contract deployment permission
    if (intent.isContractDeploy && !this.policy.canDeployContracts) {
      return {
        allowed: false,
        reason: 'Contract deployment not allowed',
        violatedRule: 'noContractDeploy',
      }
    }

    // Check if destination is blocked
    if (intent.to && this.isAddressBlocked(intent.to)) {
      return {
        allowed: false,
        reason: `Address ${intent.to} is blocked`,
        violatedRule: 'blockedAddress',
      }
    }

    // Check if destination is in allowlist (if allowlist is set)
    if (intent.to && !this.isAddressAllowed(intent.to)) {
      return {
        allowed: false,
        reason: `Address ${intent.to} is not in the allowlist`,
        violatedRule: 'notAllowedAddress',
      }
    }

    // Check function selector (if data is provided)
    if (intent.data && intent.data.length >= 10) {
      const selector = intent.data.slice(0, 10) as Hex
      if (!this.isSelectorAllowed(selector)) {
        return {
          allowed: false,
          reason: `Function selector ${selector} is not allowed`,
          violatedRule: 'notAllowedSelector',
        }
      }
    }

    // Check per-transaction limit
    if (intent.value > this.policy.maxPerTransaction) {
      return {
        allowed: false,
        reason: `Transaction value ${intent.value} exceeds per-transaction limit of ${this.policy.maxPerTransaction}`,
        violatedRule: 'maxPerTransaction',
      }
    }

    // Reset daily tracking if new day
    this.maybeResetDaily()

    // Check daily limit
    const projectedDaily = this.dailySpent + intent.value
    if (projectedDaily > this.policy.maxPerDay) {
      return {
        allowed: false,
        reason: `Transaction would exceed daily limit. Spent: ${this.dailySpent}, Intent: ${intent.value}, Limit: ${this.policy.maxPerDay}`,
        violatedRule: 'maxPerDay',
      }
    }

    return { allowed: true }
  }

  /**
   * Record a successful spend against the daily limit
   */
  recordSpend(amount: bigint): void {
    this.maybeResetDaily()
    this.dailySpent += amount
  }

  /**
   * Get the remaining daily budget
   */
  getRemainingDaily(): bigint {
    this.maybeResetDaily()
    const remaining = this.policy.maxPerDay - this.dailySpent
    return remaining > 0n ? remaining : 0n
  }

  /**
   * Get the current daily spent amount
   */
  getDailySpent(): bigint {
    this.maybeResetDaily()
    return this.dailySpent
  }

  /**
   * Check if the session has expired
   */
  isSessionExpired(): boolean {
    return Date.now() >= this.policy.sessionExpiry
  }

  /**
   * Get time remaining in the session (milliseconds)
   */
  getSessionTimeRemaining(): number {
    const remaining = this.policy.sessionExpiry - Date.now()
    return remaining > 0 ? remaining : 0
  }

  /**
   * Update the policy
   */
  updatePolicy(policy: SpendingPolicy): void {
    this.policy = policy
  }

  /**
   * Get the current policy
   */
  getPolicy(): SpendingPolicy {
    return { ...this.policy }
  }

  /**
   * Get the current day number (for daily reset tracking)
   */
  private getCurrentDay(): number {
    return Math.floor(Date.now() / (24 * 60 * 60 * 1000))
  }

  /**
   * Reset daily spending if it's a new day
   */
  private maybeResetDaily(): void {
    const currentDay = this.getCurrentDay()
    if (currentDay > this.lastSpendDay) {
      this.dailySpent = 0n
      this.lastSpendDay = currentDay
    }
  }

  /**
   * Check if an address is in the blocklist
   */
  private isAddressBlocked(address: Address): boolean {
    const normalizedAddress = address.toLowerCase()
    return this.policy.blockedAddresses.some(
      (blocked) => blocked.toLowerCase() === normalizedAddress
    )
  }

  /**
   * Check if an address is allowed
   * Returns true if allowlist is empty (all addresses allowed)
   * or if address is in the allowlist
   */
  private isAddressAllowed(address: Address): boolean {
    // If no allowlist, all addresses are allowed
    if (this.policy.allowedAddresses.length === 0) {
      return true
    }

    const normalizedAddress = address.toLowerCase()
    return this.policy.allowedAddresses.some(
      (allowed) => allowed.toLowerCase() === normalizedAddress
    )
  }

  /**
   * Check if a function selector is allowed
   * Returns true if allowlist is empty (all selectors allowed)
   * or if selector is in the allowlist
   */
  private isSelectorAllowed(selector: Hex): boolean {
    // If no allowlist, all selectors are allowed
    if (this.policy.allowedSelectors.length === 0) {
      return true
    }

    const normalizedSelector = selector.toLowerCase()
    return this.policy.allowedSelectors.some(
      (allowed) => allowed.toLowerCase() === normalizedSelector
    )
  }

  /**
   * Serialize the enforcer state for persistence
   */
  toJSON(): {
    policy: SpendingPolicy
    dailySpent: string
    lastSpendDay: number
  } {
    return {
      policy: this.policy,
      dailySpent: this.dailySpent.toString(),
      lastSpendDay: this.lastSpendDay,
    }
  }

  /**
   * Create a PolicyEnforcer from serialized state
   */
  static fromJSON(data: {
    policy: SpendingPolicy
    dailySpent: string
    lastSpendDay: number
  }): PolicyEnforcer {
    return new PolicyEnforcer(
      data.policy,
      BigInt(data.dailySpent),
      data.lastSpendDay
    )
  }
}

/**
 * Create a PolicyEnforcer with default settings
 */
export function createEnforcer(
  policy: SpendingPolicy,
  dailySpent?: bigint,
  lastSpendDay?: number
): PolicyEnforcer {
  return new PolicyEnforcer(policy, dailySpent, lastSpendDay)
}
