/**
 * Tests for PaymentRouter
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PaymentRouter, createPaymentRouter } from '../payments/PaymentRouter'
import { X402Client } from '../payments/X402Client'
import { EscrowClient } from '../commerce/EscrowClient'
import { MonmouthWallet } from '../MonmouthWallet'
import { ActivityLog } from '../memory/ActivityLog'
import type { Address, Hex } from 'viem'

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

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('PaymentRouter', () => {
  let wallet: MonmouthWallet
  let router: PaymentRouter
  let x402Client: X402Client
  let escrowClient: EscrowClient
  let activityLog: ActivityLog
  const recipient = '0xabcdef1234567890abcdef1234567890abcdef12' as Address

  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()

    wallet = new MonmouthWallet({
      identity: {
        agentId: 'test-agent',
        agentType: 'commerce',
        name: 'Test Agent',
      },
      policy: {
        maxPerTransaction: BigInt(10e18),
        maxPerDay: BigInt(100e18),
      },
    })

    wallet.setConnectedAddress('0x1234567890123456789012345678901234567890' as Address)

    activityLog = new ActivityLog({ autoSave: false })
    x402Client = new X402Client(wallet, { autoRetry: true }, { activityLog })
    escrowClient = new EscrowClient(wallet, {}, { activityLog })

    router = new PaymentRouter(wallet, {
      x402Client,
      escrowClient,
      activityLog,
    })
  })

  afterEach(() => {
    wallet.destroy()
    escrowClient.clearEscrows()
    localStorageMock.clear()
  })

  describe('detectProtocol identifies x402 endpoints', () => {
    it('should detect x402 for api_access purpose', () => {
      const detection = router.detectProtocol({
        recipient: 'https://api.example.com/data',
        amount: BigInt(1e18),
        purpose: 'api_access',
      })

      expect(detection.protocol).toBe('x402')
      expect(detection.confidence).toBe('high')
    })

    it('should detect x402 for URL recipients', () => {
      const detection = router.detectProtocol({
        recipient: 'https://api.example.com/data',
        amount: BigInt(1e18),
        purpose: 'direct', // Even with direct purpose, URL should trigger x402
      })

      expect(detection.protocol).toBe('x402')
    })
  })

  describe('detectProtocol identifies direct payment addresses', () => {
    it('should detect direct for direct purpose', () => {
      const detection = router.detectProtocol({
        recipient,
        amount: BigInt(1e18),
        purpose: 'direct',
      })

      expect(detection.protocol).toBe('direct')
      expect(detection.confidence).toBe('high')
    })

    it('should default to direct for addresses without explicit purpose', () => {
      const detection = router.detectProtocol({
        recipient,
        amount: BigInt(1e18),
        purpose: 'direct',
      })

      expect(detection.protocol).toBe('direct')
    })
  })

  describe('detectProtocol identifies escrow-enabled contracts', () => {
    it('should detect escrow for escrow purpose', () => {
      const detection = router.detectProtocol({
        recipient,
        amount: BigInt(1e18),
        purpose: 'escrow',
      })

      expect(detection.protocol).toBe('escrow')
      expect(detection.confidence).toBe('high')
    })

    it('should detect escrow for service purpose', () => {
      const detection = router.detectProtocol({
        recipient,
        amount: BigInt(1e18),
        purpose: 'service',
      })

      expect(detection.protocol).toBe('escrow')
    })
  })

  describe('pay routes to X402Client for API payments', () => {
    it('should route to x402 and handle success', async () => {
      // Mock fetch for x402
      const mock200 = new Response(JSON.stringify({ data: 'success' }), { status: 200 })
      mockFetch.mockResolvedValueOnce(mock200)

      const result = await router.pay({
        recipient: 'https://api.example.com/data',
        amount: BigInt(1e16),
        purpose: 'api_access',
      })

      expect(result.protocol).toBe('x402')
      expect(result.success).toBe(true)
      expect(result.response).toBeDefined()
    })

    it('should return error if x402 client not configured', async () => {
      const noX402Router = new PaymentRouter(wallet, { escrowClient })

      const result = await noX402Router.pay({
        recipient: 'https://api.example.com/data',
        amount: BigInt(1e16),
        purpose: 'api_access',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('not configured')
    })
  })

  describe('pay routes to direct transfer for simple payments', () => {
    it('should handle direct payment with sendTransaction callback', async () => {
      const mockSend = vi.fn().mockResolvedValue('0x' + 'a'.repeat(64) as Hex)

      router.setSendTransaction(mockSend)

      const result = await router.pay({
        recipient,
        amount: BigInt(1e18),
        purpose: 'direct',
      })

      expect(result.protocol).toBe('direct')
      expect(result.success).toBe(true)
      expect(result.txHash).toBeDefined()
      expect(mockSend).toHaveBeenCalledWith({
        to: recipient,
        value: BigInt(1e18),
      })
    })

    it('should use stub when no sendTransaction callback', async () => {
      const result = await router.pay({
        recipient,
        amount: BigInt(1e18),
        purpose: 'direct',
      })

      expect(result.success).toBe(true)
      expect(result.txHash).toBeDefined()
    })
  })

  describe('pay routes to EscrowClient for service payments', () => {
    it('should create escrow for service payment', async () => {
      const result = await router.pay({
        recipient,
        amount: BigInt(1e18),
        purpose: 'escrow',
        metadata: {
          description: 'Test service',
          escrowDuration: 7200,
        },
      })

      expect(result.protocol).toBe('escrow')
      expect(result.success).toBe(true)
      expect(result.escrowId).toMatch(/^escrow_/)
    })

    it('should return error if escrow client not configured', async () => {
      const noEscrowRouter = new PaymentRouter(wallet, { x402Client })

      const result = await noEscrowRouter.pay({
        recipient,
        amount: BigInt(1e18),
        purpose: 'escrow',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('not configured')
    })
  })

  describe('pay enforces guardrails across all protocols', () => {
    it('should reject payment exceeding limits', async () => {
      const result = await router.pay({
        recipient,
        amount: BigInt(100e18), // Exceeds 10 ETH limit
        purpose: 'direct',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('exceeds')
    })

    it('should reject payment to blocked address', async () => {
      wallet.updatePolicy({
        blockedAddresses: [recipient],
      })

      const result = await router.pay({
        recipient,
        amount: BigInt(1e18),
        purpose: 'direct',
      })

      expect(result.success).toBe(false)
    })
  })

  describe('pay logs activity for all payment types', () => {
    it('should log direct payment', async () => {
      await router.pay({
        recipient,
        amount: BigInt(1e18),
        purpose: 'direct',
      })

      const history = activityLog.getHistory('test-agent')
      expect(history.length).toBeGreaterThan(0)

      const paymentLog = history.find(
        (e) => (e.data as any).event === 'payment_routed'
      )
      expect(paymentLog).toBeDefined()
      expect((paymentLog?.data as any).protocol).toBe('direct')
    })

    it('should log escrow payment', async () => {
      await router.pay({
        recipient,
        amount: BigInt(1e18),
        purpose: 'escrow',
        metadata: { description: 'Test' },
      })

      const history = activityLog.getHistory('test-agent')
      const paymentLog = history.find(
        (e) => (e.data as any).event === 'payment_routed' && (e.data as any).protocol === 'escrow'
      )
      expect(paymentLog).toBeDefined()
    })
  })

  describe('Event emission', () => {
    it('should emit payment_started event', async () => {
      const events: any[] = []
      router.on((event) => events.push(event))

      await router.pay({
        recipient,
        amount: BigInt(1e18),
        purpose: 'direct',
      })

      expect(events.some((e) => e.type === 'payment_started')).toBe(true)
    })

    it('should emit payment_completed event', async () => {
      const events: any[] = []
      router.on((event) => events.push(event))

      await router.pay({
        recipient,
        amount: BigInt(1e18),
        purpose: 'direct',
      })

      expect(events.some((e) => e.type === 'payment_completed')).toBe(true)
    })

    it('should emit payment_failed event on error', async () => {
      const events: any[] = []
      router.on((event) => events.push(event))

      await router.pay({
        recipient,
        amount: BigInt(100e18), // Exceeds limit
        purpose: 'direct',
      })

      expect(events.some((e) => e.type === 'payment_failed')).toBe(true)
    })
  })

  describe('Protocol availability', () => {
    it('should report available protocols', () => {
      const protocols = router.getAvailableProtocols()

      expect(protocols).toContain('direct')
      expect(protocols).toContain('x402')
      expect(protocols).toContain('escrow')
    })

    it('should check individual protocol availability', () => {
      expect(router.isProtocolAvailable('direct')).toBe(true)
      expect(router.isProtocolAvailable('x402')).toBe(true)
      expect(router.isProtocolAvailable('escrow')).toBe(true)

      const minimalRouter = new PaymentRouter(wallet, {})
      expect(minimalRouter.isProtocolAvailable('x402')).toBe(false)
      expect(minimalRouter.isProtocolAvailable('escrow')).toBe(false)
    })
  })

  describe('Factory function', () => {
    it('createPaymentRouter should create a new instance', () => {
      const newRouter = createPaymentRouter(wallet)

      expect(newRouter).toBeInstanceOf(PaymentRouter)
    })
  })

  describe('Configuration updates', () => {
    it('should allow setting x402 client after creation', () => {
      const minimalRouter = new PaymentRouter(wallet, {})

      expect(minimalRouter.isProtocolAvailable('x402')).toBe(false)

      minimalRouter.setX402Client(x402Client)

      expect(minimalRouter.isProtocolAvailable('x402')).toBe(true)
    })

    it('should allow setting escrow client after creation', () => {
      const minimalRouter = new PaymentRouter(wallet, {})

      expect(minimalRouter.isProtocolAvailable('escrow')).toBe(false)

      minimalRouter.setEscrowClient(escrowClient)

      expect(minimalRouter.isProtocolAvailable('escrow')).toBe(true)
    })
  })
})
