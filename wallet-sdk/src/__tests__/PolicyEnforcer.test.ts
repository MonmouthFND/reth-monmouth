/**
 * Tests for PolicyEnforcer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PolicyEnforcer } from '../guardrails/PolicyEnforcer'
import { eth } from '../guardrails/templates'
import type { SpendingPolicy, TransactionIntent } from '../types'

describe('PolicyEnforcer', () => {
  let policy: SpendingPolicy
  let enforcer: PolicyEnforcer

  beforeEach(() => {
    // Reset to a clean policy for each test
    policy = {
      maxPerTransaction: eth(1), // 1 ETH
      maxPerDay: eth(10),        // 10 ETH
      allowedAddresses: [],
      blockedAddresses: [],
      allowedSelectors: [],
      sessionExpiry: Date.now() + 24 * 60 * 60 * 1000, // 24 hours from now
      canDeployContracts: false,
    }
    enforcer = new PolicyEnforcer(policy)
  })

  describe('Transaction within limits passes', () => {
    it('should allow transaction within per-tx limit', () => {
      const intent: TransactionIntent = {
        to: '0x1234567890123456789012345678901234567890',
        value: eth(0.5), // 0.5 ETH, under 1 ETH limit
      }

      const result = enforcer.validate(intent)
      expect(result.allowed).toBe(true)
      expect(result.reason).toBeUndefined()
    })

    it('should allow transaction exactly at per-tx limit', () => {
      const intent: TransactionIntent = {
        to: '0x1234567890123456789012345678901234567890',
        value: eth(1), // Exactly 1 ETH
      }

      const result = enforcer.validate(intent)
      expect(result.allowed).toBe(true)
    })
  })

  describe('Transaction exceeding per-tx limit blocked', () => {
    it('should block transaction exceeding per-tx limit', () => {
      const intent: TransactionIntent = {
        to: '0x1234567890123456789012345678901234567890',
        value: eth(1.5), // 1.5 ETH, over 1 ETH limit
      }

      const result = enforcer.validate(intent)
      expect(result.allowed).toBe(false)
      expect(result.violatedRule).toBe('maxPerTransaction')
      expect(result.reason).toContain('per-transaction limit')
    })
  })

  describe('Transaction exceeding daily limit blocked', () => {
    it('should block transaction that would exceed daily limit', () => {
      // First, spend 9.5 ETH (multiple transactions within per-tx limit)
      enforcer.recordSpend(eth(9.5))

      // Try to spend 1 more ETH (would make 10.5 ETH, over 10 ETH daily limit)
      // Note: 1 ETH is within per-tx limit but exceeds remaining daily budget
      const intent: TransactionIntent = {
        to: '0x1234567890123456789012345678901234567890',
        value: eth(1),
      }

      const result = enforcer.validate(intent)
      expect(result.allowed).toBe(false)
      expect(result.violatedRule).toBe('maxPerDay')
      expect(result.reason).toContain('daily limit')
    })

    it('should allow transaction that keeps within daily limit', () => {
      // First, spend 8 ETH
      enforcer.recordSpend(eth(8))

      // Try to spend 1 more ETH (would make 9 ETH, under 10 ETH limit)
      const intent: TransactionIntent = {
        to: '0x1234567890123456789012345678901234567890',
        value: eth(1),
      }

      const result = enforcer.validate(intent)
      expect(result.allowed).toBe(true)
    })
  })

  describe('Transaction to blocked address rejected', () => {
    it('should reject transaction to blocked address', () => {
      const blockedAddress = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
      policy.blockedAddresses = [blockedAddress]
      enforcer = new PolicyEnforcer(policy)

      const intent: TransactionIntent = {
        to: blockedAddress,
        value: eth(0.1),
      }

      const result = enforcer.validate(intent)
      expect(result.allowed).toBe(false)
      expect(result.violatedRule).toBe('blockedAddress')
      expect(result.reason).toContain('blocked')
    })

    it('should reject blocked address case-insensitively', () => {
      policy.blockedAddresses = ['0xDeAdBeEfDeAdBeEfDeAdBeEfDeAdBeEfDeAdBeEf']
      enforcer = new PolicyEnforcer(policy)

      const intent: TransactionIntent = {
        to: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', // lowercase
        value: eth(0.1),
      }

      const result = enforcer.validate(intent)
      expect(result.allowed).toBe(false)
      expect(result.violatedRule).toBe('blockedAddress')
    })
  })

  describe('Transaction to non-allowed address rejected (when allowlist set)', () => {
    it('should reject transaction to non-allowlisted address', () => {
      const allowedAddress = '0x1111111111111111111111111111111111111111'
      policy.allowedAddresses = [allowedAddress]
      enforcer = new PolicyEnforcer(policy)

      const intent: TransactionIntent = {
        to: '0x2222222222222222222222222222222222222222',
        value: eth(0.1),
      }

      const result = enforcer.validate(intent)
      expect(result.allowed).toBe(false)
      expect(result.violatedRule).toBe('notAllowedAddress')
      expect(result.reason).toContain('not in the allowlist')
    })

    it('should allow transaction to allowlisted address', () => {
      const allowedAddress = '0x1111111111111111111111111111111111111111'
      policy.allowedAddresses = [allowedAddress]
      enforcer = new PolicyEnforcer(policy)

      const intent: TransactionIntent = {
        to: allowedAddress,
        value: eth(0.1),
      }

      const result = enforcer.validate(intent)
      expect(result.allowed).toBe(true)
    })

    it('should allow all addresses when allowlist is empty', () => {
      policy.allowedAddresses = [] // Empty = all allowed
      enforcer = new PolicyEnforcer(policy)

      const intent: TransactionIntent = {
        to: '0xanything1234567890123456789012345678901234',
        value: eth(0.1),
      }

      const result = enforcer.validate(intent)
      expect(result.allowed).toBe(true)
    })
  })

  describe('Function selector not in allowlist rejected', () => {
    it('should reject transaction with non-allowlisted selector', () => {
      const allowedSelector = '0xa9059cbb' // transfer(address,uint256)
      policy.allowedSelectors = [allowedSelector]
      enforcer = new PolicyEnforcer(policy)

      const intent: TransactionIntent = {
        to: '0x1234567890123456789012345678901234567890',
        value: 0n,
        data: '0x095ea7b3000000000000000000000000...', // approve selector
      }

      const result = enforcer.validate(intent)
      expect(result.allowed).toBe(false)
      expect(result.violatedRule).toBe('notAllowedSelector')
      expect(result.reason).toContain('selector')
    })

    it('should allow transaction with allowlisted selector', () => {
      const allowedSelector = '0xa9059cbb' // transfer(address,uint256)
      policy.allowedSelectors = [allowedSelector]
      enforcer = new PolicyEnforcer(policy)

      const intent: TransactionIntent = {
        to: '0x1234567890123456789012345678901234567890',
        value: 0n,
        data: '0xa9059cbb000000000000000000000000...', // transfer selector
      }

      const result = enforcer.validate(intent)
      expect(result.allowed).toBe(true)
    })

    it('should allow all selectors when allowlist is empty', () => {
      policy.allowedSelectors = []
      enforcer = new PolicyEnforcer(policy)

      const intent: TransactionIntent = {
        to: '0x1234567890123456789012345678901234567890',
        value: 0n,
        data: '0xanything000000000000000000000000...',
      }

      const result = enforcer.validate(intent)
      expect(result.allowed).toBe(true)
    })
  })

  describe('Contract deployment blocked when canDeployContracts=false', () => {
    it('should block contract deployment when not allowed', () => {
      policy.canDeployContracts = false
      enforcer = new PolicyEnforcer(policy)

      const intent: TransactionIntent = {
        value: 0n,
        isContractDeploy: true,
      }

      const result = enforcer.validate(intent)
      expect(result.allowed).toBe(false)
      expect(result.violatedRule).toBe('noContractDeploy')
      expect(result.reason).toContain('Contract deployment')
    })

    it('should allow contract deployment when permitted', () => {
      policy.canDeployContracts = true
      enforcer = new PolicyEnforcer(policy)

      const intent: TransactionIntent = {
        value: 0n,
        isContractDeploy: true,
      }

      const result = enforcer.validate(intent)
      expect(result.allowed).toBe(true)
    })
  })

  describe('Session expiry enforced', () => {
    it('should block transaction when session expired', () => {
      policy.sessionExpiry = Date.now() - 1000 // Expired 1 second ago
      enforcer = new PolicyEnforcer(policy)

      const intent: TransactionIntent = {
        to: '0x1234567890123456789012345678901234567890',
        value: eth(0.1),
      }

      const result = enforcer.validate(intent)
      expect(result.allowed).toBe(false)
      expect(result.violatedRule).toBe('sessionExpired')
      expect(result.reason).toContain('expired')
    })

    it('should allow transaction when session is active', () => {
      policy.sessionExpiry = Date.now() + 60000 // Expires in 1 minute
      enforcer = new PolicyEnforcer(policy)

      const intent: TransactionIntent = {
        to: '0x1234567890123456789012345678901234567890',
        value: eth(0.1),
      }

      const result = enforcer.validate(intent)
      expect(result.allowed).toBe(true)
    })

    it('should report correct session time remaining', () => {
      const expiresIn = 3600000 // 1 hour
      policy.sessionExpiry = Date.now() + expiresIn
      enforcer = new PolicyEnforcer(policy)

      const remaining = enforcer.getSessionTimeRemaining()
      expect(remaining).toBeGreaterThan(0)
      expect(remaining).toBeLessThanOrEqual(expiresIn)
    })
  })

  describe('Daily limit resets after 24 hours', () => {
    it('should reset daily spending on new day', () => {
      // Simulate spending from yesterday
      const yesterday = Math.floor(Date.now() / (24 * 60 * 60 * 1000)) - 1
      const enforcerWithHistory = new PolicyEnforcer(policy, eth(9), yesterday)

      // Should have reset, so full daily budget available
      const remaining = enforcerWithHistory.getRemainingDaily()
      expect(remaining).toBe(eth(10))
    })

    it('should maintain spending within same day', () => {
      enforcer.recordSpend(eth(3))
      expect(enforcer.getDailySpent()).toBe(eth(3))

      enforcer.recordSpend(eth(2))
      expect(enforcer.getDailySpent()).toBe(eth(5))

      expect(enforcer.getRemainingDaily()).toBe(eth(5))
    })
  })

  describe('Serialization', () => {
    it('should serialize and deserialize correctly', () => {
      enforcer.recordSpend(eth(5))

      const json = enforcer.toJSON()
      const restored = PolicyEnforcer.fromJSON(json)

      expect(restored.getDailySpent()).toBe(eth(5))
      expect(restored.getPolicy()).toEqual(policy)
    })
  })
})
