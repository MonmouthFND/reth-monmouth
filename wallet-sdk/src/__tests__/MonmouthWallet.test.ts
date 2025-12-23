/**
 * Tests for MonmouthWallet
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { MonmouthWallet, createMonmouthWallet } from '../MonmouthWallet'
import { eth, HOUR, DAY } from '../guardrails/templates'
import type { WalletEvent, MonmouthWalletConfig } from '../types'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(global, 'localStorage', { value: localStorageMock })

describe('MonmouthWallet', () => {
  let wallet: MonmouthWallet
  let config: MonmouthWalletConfig

  beforeEach(() => {
    localStorageMock.clear()
    vi.useFakeTimers()

    config = {
      identity: {
        agentId: 'test-agent',
        agentType: 'research',
        name: 'Test Agent',
      },
    }
    wallet = new MonmouthWallet(config)
  })

  afterEach(() => {
    wallet.destroy()
    vi.useRealTimers()
  })

  describe('Wallet initializes with identity and permissions', () => {
    it('should create wallet with correct identity', () => {
      const identity = wallet.getIdentity()

      expect(identity.agentId).toBe('test-agent')
      expect(identity.agentType).toBe('research')
      expect(identity.name).toBe('Test Agent')
      expect(identity.createdAt).toBeGreaterThan(0)
    })

    it('should apply template permissions based on agent type', () => {
      const policy = wallet.getPolicy()

      // Research template defaults
      expect(policy.maxPerTransaction).toBe(eth(0.1))
      expect(policy.maxPerDay).toBe(eth(1))
      expect(policy.canDeployContracts).toBe(false)
    })

    it('should apply custom policy overrides', () => {
      const customWallet = createMonmouthWallet({
        identity: {
          agentId: 'custom-agent',
          agentType: 'research',
          name: 'Custom Agent',
        },
        policy: {
          maxPerTransaction: eth(0.5),
          canDeployContracts: true,
        },
      })

      const policy = customWallet.getPolicy()
      expect(policy.maxPerTransaction).toBe(eth(0.5))
      expect(policy.canDeployContracts).toBe(true)
      expect(policy.maxPerDay).toBe(eth(1)) // Still from template

      customWallet.destroy()
    })
  })

  describe('getIdentity returns correct agent identity', () => {
    it('should return a copy of the identity', () => {
      const identity1 = wallet.getIdentity()
      const identity2 = wallet.getIdentity()

      expect(identity1).toEqual(identity2)
      expect(identity1).not.toBe(identity2) // Different objects
    })

    it('should include createdAt timestamp', () => {
      const identity = wallet.getIdentity()
      expect(typeof identity.createdAt).toBe('number')
      expect(identity.createdAt).toBeLessThanOrEqual(Date.now())
    })
  })

  describe('getPermissions returns current policy', () => {
    it('should return a copy of the policy', () => {
      const policy1 = wallet.getPolicy()
      const policy2 = wallet.getPolicy()

      expect(policy1).toEqual(policy2)
      expect(policy1).not.toBe(policy2) // Different objects
    })

    it('should reflect policy updates', () => {
      wallet.updatePolicy({ maxPerTransaction: eth(0.2) })

      const policy = wallet.getPolicy()
      expect(policy.maxPerTransaction).toBe(eth(0.2))
    })
  })

  describe('sendTransaction enforces guardrails before signing', () => {
    it('should allow transaction within limits', () => {
      const result = wallet.prepareTransaction({
        to: '0x1234567890123456789012345678901234567890',
        value: eth(0.05),
      })

      expect(result.allowed).toBe(true)
    })

    it('should block transaction exceeding per-tx limit', () => {
      const result = wallet.prepareTransaction({
        to: '0x1234567890123456789012345678901234567890',
        value: eth(0.5), // Over 0.1 ETH limit for research
      })

      expect(result.allowed).toBe(false)
      expect(result.violatedRule).toBe('maxPerTransaction')
    })

    it('should emit transaction_blocked event when blocked', () => {
      const events: WalletEvent[] = []
      wallet.on((event) => events.push(event))

      wallet.prepareTransaction({
        to: '0x1234567890123456789012345678901234567890',
        value: eth(0.5),
      })

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('transaction_blocked')
    })

    it('should not emit event for allowed transactions', () => {
      const events: WalletEvent[] = []
      wallet.on((event) => events.push(event))

      wallet.prepareTransaction({
        to: '0x1234567890123456789012345678901234567890',
        value: eth(0.05),
      })

      expect(events).toHaveLength(0)
    })
  })

  describe('sendTransaction updates daily spent tracking', () => {
    it('should track daily spending after recording transaction', () => {
      expect(wallet.getDailySpent()).toBe(0n)

      wallet.recordTransaction(
        '0x1234567890123456789012345678901234567890123456789012345678901234',
        eth(0.05)
      )

      expect(wallet.getDailySpent()).toBe(eth(0.05))
    })

    it('should accumulate daily spending', () => {
      wallet.recordTransaction(
        '0x1111111111111111111111111111111111111111111111111111111111111111',
        eth(0.03)
      )
      wallet.recordTransaction(
        '0x2222222222222222222222222222222222222222222222222222222222222222',
        eth(0.02)
      )

      expect(wallet.getDailySpent()).toBe(eth(0.05))
      expect(wallet.getRemainingDailyBudget()).toBe(eth(0.95))
    })

    it('should emit transaction_sent event', () => {
      const events: WalletEvent[] = []
      wallet.on((event) => events.push(event))

      const hash = '0x1234567890123456789012345678901234567890123456789012345678901234'
      wallet.recordTransaction(hash, eth(0.05))

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('transaction_sent')
      if (events[0].type === 'transaction_sent') {
        expect(events[0].hash).toBe(hash)
      }
    })
  })

  describe('Daily limit resets after 24 hours', () => {
    it('should reset daily spending after crossing midnight', () => {
      // Spend some ETH
      wallet.recordTransaction(
        '0x1234567890123456789012345678901234567890123456789012345678901234',
        eth(0.05)
      )
      expect(wallet.getDailySpent()).toBe(eth(0.05))

      // Advance time by 25 hours
      vi.advanceTimersByTime(25 * 60 * 60 * 1000)

      // Daily spending should reset
      expect(wallet.getDailySpent()).toBe(0n)
      expect(wallet.getRemainingDailyBudget()).toBe(eth(1))
    })

    it('should maintain spending within same day', () => {
      wallet.recordTransaction(
        '0x1234567890123456789012345678901234567890123456789012345678901234',
        eth(0.03)
      )

      // Advance time by 1 hour (definitely still same day)
      vi.advanceTimersByTime(1 * 60 * 60 * 1000)

      // Spending should still be tracked
      expect(wallet.getDailySpent()).toBe(eth(0.03))
    })
  })

  describe('Connection management', () => {
    it('should track connected address', () => {
      expect(wallet.isConnected()).toBe(false)
      expect(wallet.getConnectedAddress()).toBeNull()

      wallet.setConnectedAddress('0x1234567890123456789012345678901234567890')

      expect(wallet.isConnected()).toBe(true)
      expect(wallet.getConnectedAddress()).toBe('0x1234567890123456789012345678901234567890')
    })

    it('should emit events on connect/disconnect', () => {
      const events: WalletEvent[] = []
      wallet.on((event) => events.push(event))

      wallet.setConnectedAddress('0x1234567890123456789012345678901234567890')
      wallet.clearConnection()

      expect(events).toHaveLength(2)
      expect(events[0].type).toBe('connected')
      expect(events[1].type).toBe('disconnected')
    })
  })

  describe('Session management', () => {
    it('should detect session expiry', () => {
      expect(wallet.isSessionExpired()).toBe(false)

      // Advance past session expiry (24h for research)
      vi.advanceTimersByTime(25 * HOUR)

      expect(wallet.isSessionExpired()).toBe(true)
    })

    it('should report correct time remaining', () => {
      const remaining = wallet.getSessionTimeRemaining()
      expect(remaining).toBeGreaterThan(0)
      expect(remaining).toBeLessThanOrEqual(24 * HOUR)
    })

    it('should extend session', () => {
      // Advance time by 20 hours so we're closer to expiry
      vi.advanceTimersByTime(20 * HOUR)

      const timeBeforeExtend = Date.now()

      // Extend by 2 hours from current time
      wallet.extendSession(2 * HOUR)

      const newPolicy = wallet.getPolicy()
      // New expiry should be around 2 hours from now
      expect(newPolicy.sessionExpiry).toBeGreaterThanOrEqual(timeBeforeExtend + 2 * HOUR)
      expect(newPolicy.sessionExpiry).toBeLessThanOrEqual(timeBeforeExtend + 2 * HOUR + 1000)
    })
  })

  describe('State persistence', () => {
    it('should persist and restore spending state', () => {
      // Spend some ETH
      wallet.recordTransaction(
        '0x1234567890123456789012345678901234567890123456789012345678901234',
        eth(0.05)
      )

      // Create a new wallet with same agent ID
      const wallet2 = createMonmouthWallet(config)

      // Should restore the spending
      expect(wallet2.getDailySpent()).toBe(eth(0.05))

      wallet2.destroy()
    })

    it('should clear persisted state', () => {
      wallet.recordTransaction(
        '0x1234567890123456789012345678901234567890123456789012345678901234',
        eth(0.05)
      )
      wallet.clearPersistedState()

      // Create a new wallet
      const wallet2 = createMonmouthWallet(config)

      // Should start fresh
      expect(wallet2.getDailySpent()).toBe(0n)

      wallet2.destroy()
    })
  })

  describe('Event subscription', () => {
    it('should allow unsubscribing from events', () => {
      const events: WalletEvent[] = []
      const unsubscribe = wallet.on((event) => events.push(event))

      wallet.setConnectedAddress('0x1234567890123456789012345678901234567890')
      expect(events).toHaveLength(1)

      unsubscribe()
      wallet.clearConnection()

      // Should not receive disconnect event
      expect(events).toHaveLength(1)
    })

    it('should handle listener errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      wallet.on(() => {
        throw new Error('Test error')
      })

      // Should not throw
      expect(() => {
        wallet.setConnectedAddress('0x1234567890123456789012345678901234567890')
      }).not.toThrow()

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('getState', () => {
    it('should return complete wallet state', () => {
      wallet.setConnectedAddress('0x1234567890123456789012345678901234567890')
      wallet.recordTransaction(
        '0x1234567890123456789012345678901234567890123456789012345678901234',
        eth(0.03)
      )

      const state = wallet.getState()

      expect(state.identity.agentId).toBe('test-agent')
      expect(state.policy.maxPerTransaction).toBe(eth(0.1))
      expect(state.dailySpent).toBe(eth(0.03))
      expect(state.isConnected).toBe(true)
    })
  })

  describe('createMonmouthWallet factory', () => {
    it('should create a wallet instance', () => {
      const factoryWallet = createMonmouthWallet({
        identity: {
          agentId: 'factory-agent',
          agentType: 'trading',
          name: 'Factory Agent',
        },
      })

      expect(factoryWallet).toBeInstanceOf(MonmouthWallet)
      expect(factoryWallet.getIdentity().agentId).toBe('factory-agent')
      expect(factoryWallet.getPolicy().maxPerTransaction).toBe(eth(10)) // Trading template

      factoryWallet.destroy()
    })
  })
})
