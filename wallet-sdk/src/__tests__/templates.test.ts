/**
 * Tests for Permission Templates
 */

import { describe, it, expect } from 'vitest'
import {
  PermissionTemplates,
  createPolicyFromTemplate,
  createMinimalPolicy,
  getDefaultSessionDuration,
  isPolicyActive,
  eth,
  HOUR,
  DAY,
} from '../guardrails/templates'

describe('Permission Templates', () => {
  describe('RESEARCH template has correct values', () => {
    it('should have conservative limits for research agents', () => {
      const template = PermissionTemplates.research

      expect(template.maxPerTransaction).toBe(eth(0.1))
      expect(template.maxPerDay).toBe(eth(1))
      expect(template.sessionDuration).toBe(24 * HOUR)
      expect(template.canDeployContracts).toBe(false)
    })
  })

  describe('TRADING template has correct values', () => {
    it('should have higher limits with short sessions for trading agents', () => {
      const template = PermissionTemplates.trading

      expect(template.maxPerTransaction).toBe(eth(10))
      expect(template.maxPerDay).toBe(eth(100))
      expect(template.sessionDuration).toBe(1 * HOUR)
      expect(template.canDeployContracts).toBe(false)
    })
  })

  describe('COORDINATOR template has correct values', () => {
    it('should have minimal spending with long sessions for coordinators', () => {
      const template = PermissionTemplates.coordinator

      expect(template.maxPerTransaction).toBe(eth(0.01))
      expect(template.maxPerDay).toBe(eth(0.1))
      expect(template.sessionDuration).toBe(7 * DAY)
      expect(template.canDeployContracts).toBe(false)
    })
  })

  describe('COMMERCE template has correct values', () => {
    it('should have moderate limits for commerce agents', () => {
      const template = PermissionTemplates.commerce

      expect(template.maxPerTransaction).toBe(eth(1))
      expect(template.maxPerDay).toBe(eth(10))
      expect(template.sessionDuration).toBe(4 * HOUR)
      expect(template.canDeployContracts).toBe(false)
    })
  })

  describe('createPolicyFromTemplate', () => {
    it('should create policy with template defaults', () => {
      const policy = createPolicyFromTemplate('research')

      expect(policy.maxPerTransaction).toBe(eth(0.1))
      expect(policy.maxPerDay).toBe(eth(1))
      expect(policy.allowedAddresses).toEqual([])
      expect(policy.blockedAddresses).toEqual([])
      expect(policy.allowedSelectors).toEqual([])
      expect(policy.canDeployContracts).toBe(false)
      expect(policy.sessionExpiry).toBeGreaterThan(Date.now())
    })

    it('should apply overrides', () => {
      const policy = createPolicyFromTemplate('research', {
        maxPerTransaction: eth(0.5),
        canDeployContracts: true,
        blockedAddresses: ['0x1234567890123456789012345678901234567890'],
      })

      expect(policy.maxPerTransaction).toBe(eth(0.5)) // Override
      expect(policy.maxPerDay).toBe(eth(1)) // Template default
      expect(policy.canDeployContracts).toBe(true) // Override
      expect(policy.blockedAddresses).toHaveLength(1)
    })

    it('should set session expiry based on template', () => {
      const beforeCreate = Date.now()
      const policy = createPolicyFromTemplate('trading')
      const afterCreate = Date.now()

      // Session should expire ~1 hour from now (trading template)
      const expectedExpiry = beforeCreate + HOUR
      expect(policy.sessionExpiry).toBeGreaterThanOrEqual(expectedExpiry)
      expect(policy.sessionExpiry).toBeLessThanOrEqual(afterCreate + HOUR)
    })
  })

  describe('createMinimalPolicy', () => {
    it('should create a completely restrictive policy', () => {
      const policy = createMinimalPolicy()

      expect(policy.maxPerTransaction).toBe(0n)
      expect(policy.maxPerDay).toBe(0n)
      expect(policy.allowedAddresses).toEqual([])
      expect(policy.blockedAddresses).toEqual([])
      expect(policy.allowedSelectors).toEqual([])
      expect(policy.sessionExpiry).toBeLessThanOrEqual(Date.now())
      expect(policy.canDeployContracts).toBe(false)
    })
  })

  describe('getDefaultSessionDuration', () => {
    it('should return correct duration for each agent type', () => {
      expect(getDefaultSessionDuration('research')).toBe(24 * HOUR)
      expect(getDefaultSessionDuration('trading')).toBe(1 * HOUR)
      expect(getDefaultSessionDuration('coordinator')).toBe(7 * DAY)
      expect(getDefaultSessionDuration('commerce')).toBe(4 * HOUR)
    })
  })

  describe('isPolicyActive', () => {
    it('should return true for active policy', () => {
      const policy = createPolicyFromTemplate('research')
      expect(isPolicyActive(policy)).toBe(true)
    })

    it('should return false when maxPerTransaction is 0', () => {
      const policy = createPolicyFromTemplate('research', {
        maxPerTransaction: 0n,
      })
      expect(isPolicyActive(policy)).toBe(false)
    })

    it('should return false when maxPerDay is 0', () => {
      const policy = createPolicyFromTemplate('research', {
        maxPerDay: 0n,
      })
      expect(isPolicyActive(policy)).toBe(false)
    })

    it('should return false when session expired', () => {
      const policy = createPolicyFromTemplate('research', {
        sessionExpiry: Date.now() - 1000,
      })
      expect(isPolicyActive(policy)).toBe(false)
    })

    it('should return false for minimal policy', () => {
      const policy = createMinimalPolicy()
      expect(isPolicyActive(policy)).toBe(false)
    })
  })

  describe('eth helper', () => {
    it('should convert ETH to wei correctly', () => {
      expect(eth(1)).toBe(1000000000000000000n)
      expect(eth(0.1)).toBe(100000000000000000n)
      expect(eth(0.01)).toBe(10000000000000000n)
      expect(eth(10)).toBe(10000000000000000000n)
    })
  })

  describe('Time constants', () => {
    it('should have correct HOUR value', () => {
      expect(HOUR).toBe(60 * 60 * 1000)
    })

    it('should have correct DAY value', () => {
      expect(DAY).toBe(24 * 60 * 60 * 1000)
    })
  })
})
