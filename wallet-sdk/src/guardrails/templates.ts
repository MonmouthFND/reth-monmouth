/**
 * Permission templates for different agent types
 *
 * These templates provide sensible defaults for different agent use cases.
 * All values can be customized when creating a MonmouthWallet.
 */

import type { AgentType, SpendingPolicy } from '../types'

// Constants for time durations in milliseconds
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

// ETH to wei conversion helper
const eth = (amount: number): bigint => BigInt(amount * 1e18)

/**
 * Permission template configurations
 */
export interface PermissionTemplate {
  maxPerTransaction: bigint
  maxPerDay: bigint
  sessionDuration: number
  canDeployContracts: boolean
  description: string
}

/**
 * Pre-built permission templates for common agent types
 */
export const PermissionTemplates: Record<AgentType, PermissionTemplate> = {
  /**
   * RESEARCH agents - Used for data gathering, testing, and exploration
   * Low risk tolerance with conservative limits
   */
  research: {
    maxPerTransaction: eth(0.1),  // 0.1 ETH max per transaction
    maxPerDay: eth(1),            // 1 ETH daily limit
    sessionDuration: 24 * HOUR,   // 24 hour sessions
    canDeployContracts: false,
    description: 'Research agent - conservative limits for data gathering and testing',
  },

  /**
   * TRADING agents - Used for DEX interactions, DeFi operations
   * Higher limits for active trading but short sessions for security
   */
  trading: {
    maxPerTransaction: eth(10),   // 10 ETH max per transaction
    maxPerDay: eth(100),          // 100 ETH daily limit
    sessionDuration: 1 * HOUR,    // 1 hour sessions (re-auth frequently)
    canDeployContracts: false,
    description: 'Trading agent - higher limits for DeFi with short sessions',
  },

  /**
   * COORDINATOR agents - Used for orchestrating other agents
   * Very low limits as they primarily send commands, not value
   */
  coordinator: {
    maxPerTransaction: eth(0.01), // 0.01 ETH max per transaction
    maxPerDay: eth(0.1),          // 0.1 ETH daily limit
    sessionDuration: 7 * DAY,     // 7 day sessions (stable orchestration)
    canDeployContracts: false,
    description: 'Coordinator agent - minimal spending for agent orchestration',
  },

  /**
   * COMMERCE agents - Used for shopping, services, and payments
   * Moderate limits for purchasing with reasonable session duration
   */
  commerce: {
    maxPerTransaction: eth(1),    // 1 ETH max per transaction
    maxPerDay: eth(10),           // 10 ETH daily limit
    sessionDuration: 4 * HOUR,    // 4 hour sessions
    canDeployContracts: false,
    description: 'Commerce agent - moderate limits for shopping and payments',
  },
}

/**
 * Create a SpendingPolicy from a template and optional customizations
 */
export function createPolicyFromTemplate(
  agentType: AgentType,
  overrides?: Partial<SpendingPolicy>
): SpendingPolicy {
  const template = PermissionTemplates[agentType]

  return {
    maxPerTransaction: overrides?.maxPerTransaction ?? template.maxPerTransaction,
    maxPerDay: overrides?.maxPerDay ?? template.maxPerDay,
    allowedAddresses: overrides?.allowedAddresses ?? [],
    blockedAddresses: overrides?.blockedAddresses ?? [],
    allowedSelectors: overrides?.allowedSelectors ?? [],
    sessionExpiry: overrides?.sessionExpiry ?? (Date.now() + template.sessionDuration),
    canDeployContracts: overrides?.canDeployContracts ?? template.canDeployContracts,
  }
}

/**
 * Create a minimal policy with very restrictive defaults
 */
export function createMinimalPolicy(): SpendingPolicy {
  return {
    maxPerTransaction: 0n,
    maxPerDay: 0n,
    allowedAddresses: [],
    blockedAddresses: [],
    allowedSelectors: [],
    sessionExpiry: Date.now(), // Already expired
    canDeployContracts: false,
  }
}

/**
 * Get the default session duration for an agent type
 */
export function getDefaultSessionDuration(agentType: AgentType): number {
  return PermissionTemplates[agentType].sessionDuration
}

/**
 * Check if a policy allows any spending at all
 */
export function isPolicyActive(policy: SpendingPolicy): boolean {
  return (
    policy.maxPerTransaction > 0n &&
    policy.maxPerDay > 0n &&
    policy.sessionExpiry > Date.now()
  )
}

export { eth, HOUR, DAY }
