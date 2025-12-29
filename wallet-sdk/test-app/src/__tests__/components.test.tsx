/**
 * Component Tests for Monmouth Wallet SDK Test App
 *
 * These tests verify component logic without full wagmi integration.
 * Full E2E tests would require a browser environment.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  PermissionTemplates,
  createActivityLog,
  MonmouthWallet,
  createMonmouthWallet,
  createAgentIdentity,
  createEscrowClient,
  createPaymentRouter,
} from '../../../src'
import { formatEther } from 'viem'
import type { Address } from 'viem'

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

describe('SDK Integration Tests (Test App Context)', () => {
  let wallet: MonmouthWallet
  const testAddress = '0x1234567890123456789012345678901234567890' as Address

  beforeEach(() => {
    localStorageMock.clear()

    wallet = createMonmouthWallet({
      identity: {
        agentId: 'test-agent',
        agentType: 'commerce',
        name: 'Test Agent',
      },
      policy: PermissionTemplates.commerce,
    })

    wallet.setConnectedAddress(testAddress)
  })

  afterEach(() => {
    wallet.destroy()
  })

  describe('SpendingPolicyConfig logic', () => {
    it('should display correct values from commerce template', () => {
      const policy = wallet.getPolicy()
      const maxTx = formatEther(policy.maxPerTransaction)
      const maxDay = formatEther(policy.maxPerDay)

      expect(maxTx).toBe('1')
      expect(maxDay).toBe('10')
    })

    it('should update policy when template changes', () => {
      wallet.updatePolicy(PermissionTemplates.research)
      const policy = wallet.getPolicy()

      expect(formatEther(policy.maxPerTransaction)).toBe('0.1')
      expect(formatEther(policy.maxPerDay)).toBe('1')
    })

    it('should update policy with custom values', () => {
      wallet.updatePolicy({ maxPerTransaction: BigInt(5e18) })
      const policy = wallet.getPolicy()

      expect(formatEther(policy.maxPerTransaction)).toBe('5')
    })

    it('should track daily spending percentage', () => {
      const policy = wallet.getPolicy()
      const dailySpent = wallet.getDailySpent()
      const percentage = Number((dailySpent * BigInt(100)) / policy.maxPerDay)

      expect(percentage).toBe(0) // Nothing spent yet
    })

    it('should have all template options available', () => {
      expect(PermissionTemplates.research).toBeDefined()
      expect(PermissionTemplates.trading).toBeDefined()
      expect(PermissionTemplates.coordinator).toBeDefined()
      expect(PermissionTemplates.commerce).toBeDefined()
    })
  })

  describe('AgentIdentityDisplay logic', () => {
    it('should generate DID after initialization', async () => {
      const identity = createAgentIdentity(wallet)
      const doc = await identity.initialize()

      expect(doc.id).toMatch(/^did:key:/)
      expect(doc.agentType).toBe('commerce')
      expect(doc.name).toBe('Test Agent')
    })

    it('should include capabilities in identity', async () => {
      const identity = createAgentIdentity(wallet)
      const doc = await identity.initialize(['payments', 'signing', 'x402', 'escrow'])

      expect(doc.capabilities).toContain('payments')
      expect(doc.capabilities).toContain('signing')
      expect(doc.capabilities).toContain('x402')
      expect(doc.capabilities).toContain('escrow')
    })

    it('should export identity as JSON', async () => {
      const identity = createAgentIdentity(wallet)
      await identity.initialize()

      const json = identity.toJSON()
      expect(json).toBeDefined()
      expect(json?.id).toMatch(/^did:key:/)
    })

    it('should truncate DID for display', async () => {
      const identity = createAgentIdentity(wallet)
      const doc = await identity.initialize()

      const truncated = `${doc.id.slice(0, 20)}...${doc.id.slice(-8)}`
      expect(truncated.length).toBeLessThan(doc.id.length)
      expect(truncated).toContain('...')
    })
  })

  describe('ActivityLogViewer logic', () => {
    it('should log activities', () => {
      const activityLog = createActivityLog({ autoSave: false })

      activityLog.log({
        agentId: 'test-agent',
        actionType: 'transaction',
        data: { amount: '1', to: '0x...' },
      })

      const history = activityLog.getHistory('test-agent')
      expect(history).toHaveLength(1)
      expect(history[0].actionType).toBe('transaction')
    })

    it('should filter by action type', () => {
      const activityLog = createActivityLog({ autoSave: false })

      activityLog.log({ agentId: 'test-agent', actionType: 'transaction', data: {} })
      activityLog.log({ agentId: 'test-agent', actionType: 'error', data: {} })
      activityLog.log({ agentId: 'test-agent', actionType: 'transaction', data: {} })

      const history = activityLog.getHistory('test-agent')
      const transactions = history.filter((e) => e.actionType === 'transaction')
      const errors = history.filter((e) => e.actionType === 'error')

      expect(transactions).toHaveLength(2)
      expect(errors).toHaveLength(1)
    })

    it('should export activity log', () => {
      const activityLog = createActivityLog({ autoSave: false })
      activityLog.log({ agentId: 'test-agent', actionType: 'transaction', data: {} })

      const exported = activityLog.export()
      expect(exported).toHaveLength(1)
    })

    it('should clear activity log', () => {
      const activityLog = createActivityLog({ autoSave: false })
      activityLog.log({ agentId: 'test-agent', actionType: 'transaction', data: {} })
      activityLog.clear()

      expect(activityLog.export()).toHaveLength(0)
    })

    it('should format timestamps correctly', () => {
      const timestamp = Date.now()
      const formatted = new Date(timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })

      expect(formatted).toMatch(/\d{2}:\d{2}:\d{2}/)
    })
  })

  describe('X402Demo logic', () => {
    it('should detect x402 protocol for URL recipients', () => {
      const activityLog = createActivityLog({ autoSave: false })
      const router = createPaymentRouter(wallet, { activityLog })

      const detection = router.detectProtocol({
        recipient: 'https://api.example.com/data',
        amount: BigInt(1e16),
        purpose: 'api_access',
      })

      expect(detection.protocol).toBe('x402')
      expect(detection.confidence).toBe('high')
    })

    it('should handle payment amounts correctly', () => {
      const amount = BigInt(1e16) // 0.01 ETH
      const formatted = formatEther(amount)

      expect(formatted).toBe('0.01')
    })

    it('should parse ETH values', () => {
      const eth = '0.01'
      const wei = BigInt(Math.floor(parseFloat(eth) * 1e18))

      expect(wei).toBe(BigInt(1e16))
    })
  })

  describe('GuardrailAlerts logic', () => {
    it('should reject payments exceeding per-tx limit', () => {
      const validation = wallet.validateTransaction({
        to: '0xabcdef1234567890abcdef1234567890abcdef12' as Address,
        value: BigInt(100e18), // 100 ETH - exceeds 1 ETH limit
      })

      expect(validation.allowed).toBe(false)
      expect(validation.reason).toContain('exceeds')
    })

    it('should format alert details correctly', () => {
      const amount = BigInt(100e18)
      const formatted = formatEther(amount)

      expect(formatted).toBe('100')
    })

    it('should calculate time ago correctly', () => {
      const getTimeAgo = (timestamp: number): string => {
        const seconds = Math.floor((Date.now() - timestamp) / 1000)
        if (seconds < 60) return 'just now'
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
        return `${Math.floor(seconds / 86400)}d ago`
      }

      expect(getTimeAgo(Date.now())).toBe('just now')
      expect(getTimeAgo(Date.now() - 5 * 60 * 1000)).toBe('5m ago')
      expect(getTimeAgo(Date.now() - 2 * 60 * 60 * 1000)).toBe('2h ago')
    })
  })

  describe('EscrowClient integration', () => {
    it('should create escrow', async () => {
      const escrowClient = createEscrowClient(wallet)
      const result = await escrowClient.createEscrow({
        recipient: '0xabcdef1234567890abcdef1234567890abcdef12' as Address,
        amount: BigInt(1e18),
        description: 'Test service',
        durationSeconds: 3600,
      })

      expect(result.success).toBe(true)
      expect(result.escrowId).toMatch(/^escrow_/)

      escrowClient.clearEscrows()
    })
  })

  describe('PaymentRouter integration', () => {
    it('should route payments correctly', async () => {
      const activityLog = createActivityLog({ autoSave: false })
      const escrowClient = createEscrowClient(wallet, {}, { activityLog })
      const router = createPaymentRouter(wallet, { escrowClient, activityLog })

      // Direct payment
      const directResult = await router.pay({
        recipient: '0xabcdef1234567890abcdef1234567890abcdef12' as Address,
        amount: BigInt(1e16),
        purpose: 'direct',
      })

      expect(directResult.protocol).toBe('direct')
      expect(directResult.success).toBe(true)

      escrowClient.clearEscrows()
    })

    it('should enforce guardrails on all payment types', async () => {
      const router = createPaymentRouter(wallet, {})

      const result = await router.pay({
        recipient: '0xabcdef1234567890abcdef1234567890abcdef12' as Address,
        amount: BigInt(100e18), // Exceeds limit
        purpose: 'direct',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('exceeds')
    })
  })
})
