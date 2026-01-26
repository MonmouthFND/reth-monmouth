/**
 * Tests for X402Client
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { X402Client, createX402Client } from '../payments/X402Client'
import {
  X402Error,
  X402_HEADERS,
  parsePaymentRequired,
  serializePaymentHeader,
  deserializePaymentHeader,
  isNativeToken,
} from '../payments/types'
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

describe('X402Client', () => {
  let wallet: MonmouthWallet
  let client: X402Client
  let activityLog: ActivityLog

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
        maxPerTransaction: BigInt(1e18), // 1 ETH
        maxPerDay: BigInt(10e18), // 10 ETH
      },
    })

    // Set connected address
    wallet.setConnectedAddress('0x1234567890123456789012345678901234567890' as Address)

    activityLog = new ActivityLog({ autoSave: false })

    client = new X402Client(wallet, { autoRetry: true }, { activityLog })
  })

  afterEach(() => {
    wallet.destroy()
    localStorageMock.clear()
  })

  describe('fetch passes through non-402 responses unchanged', () => {
    it('should return 200 response as-is', async () => {
      const mockResponse = new Response(JSON.stringify({ data: 'test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
      mockFetch.mockResolvedValueOnce(mockResponse)

      const response = await client.fetch('https://api.example.com/data')

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual({ data: 'test' })
    })

    it('should return 404 response as-is', async () => {
      const mockResponse = new Response('Not Found', { status: 404 })
      mockFetch.mockResolvedValueOnce(mockResponse)

      const response = await client.fetch('https://api.example.com/missing')

      expect(response.status).toBe(404)
    })

    it('should return 500 response as-is', async () => {
      const mockResponse = new Response('Server Error', { status: 500 })
      mockFetch.mockResolvedValueOnce(mockResponse)

      const response = await client.fetch('https://api.example.com/error')

      expect(response.status).toBe(500)
    })
  })

  describe('fetch detects 402 response and extracts payment requirements', () => {
    it('should parse payment requirements from headers', async () => {
      const headers = new Headers({
        [X402_HEADERS.RECIPIENT]: '0xRecipient000000000000000000000000000000',
        [X402_HEADERS.AMOUNT]: '1000000000000000000', // 1 ETH
        [X402_HEADERS.TOKEN]: 'ETH',
        [X402_HEADERS.CHAIN_ID]: '7750',
        [X402_HEADERS.NONCE]: 'unique-nonce-123',
        [X402_HEADERS.EXPIRY]: String(Math.floor(Date.now() / 1000) + 3600),
        [X402_HEADERS.DESCRIPTION]: 'API access fee',
      })

      const mock402 = new Response('Payment Required', { status: 402, headers })
      const mock200 = new Response(JSON.stringify({ success: true }), { status: 200 })

      mockFetch.mockResolvedValueOnce(mock402).mockResolvedValueOnce(mock200)

      const result = await client.fetchWithPaymentInfo('https://api.example.com/paid')

      expect(result.paymentMade).toBe(true)
      expect(result.payment).toBeDefined()
      expect(result.payment?.paymentRequired.recipient).toBe(
        '0xRecipient000000000000000000000000000000'
      )
      expect(result.payment?.paymentRequired.amount).toBe(BigInt('1000000000000000000'))
    })

    it('should throw on missing required headers', async () => {
      const headers = new Headers({
        [X402_HEADERS.RECIPIENT]: '0xRecipient000000000000000000000000000000',
        // Missing AMOUNT
      })

      const mock402 = new Response('Payment Required', { status: 402, headers })
      mockFetch.mockResolvedValueOnce(mock402)

      await expect(client.fetch('https://api.example.com/paid')).rejects.toThrow(X402Error)
    })
  })

  describe('fetch creates payment with correct amount and recipient', () => {
    it('should create payment with matching values', async () => {
      const recipient = '0xRecipient000000000000000000000000000000' as Address
      const amount = BigInt('500000000000000000') // 0.5 ETH

      const headers = new Headers({
        [X402_HEADERS.RECIPIENT]: recipient,
        [X402_HEADERS.AMOUNT]: amount.toString(),
        [X402_HEADERS.TOKEN]: 'ETH',
        [X402_HEADERS.CHAIN_ID]: '7750',
        [X402_HEADERS.NONCE]: 'nonce-456',
        [X402_HEADERS.EXPIRY]: String(Math.floor(Date.now() / 1000) + 3600),
      })

      const mock402 = new Response('Payment Required', { status: 402, headers })
      const mock200 = new Response('OK', { status: 200 })

      mockFetch.mockResolvedValueOnce(mock402).mockResolvedValueOnce(mock200)

      const result = await client.fetchWithPaymentInfo('https://api.example.com/paid')

      expect(result.payment?.paymentRequired.recipient).toBe(recipient)
      expect(result.payment?.paymentRequired.amount).toBe(amount)
      expect(result.payment?.payer).toBe(wallet.getConnectedAddress())
    })
  })

  describe('fetch retries request with X-Payment header after payment', () => {
    it('should include X-Payment header in retry', async () => {
      const headers = new Headers({
        [X402_HEADERS.RECIPIENT]: '0xRecipient000000000000000000000000000000',
        [X402_HEADERS.AMOUNT]: '100000000000000000',
        [X402_HEADERS.TOKEN]: 'ETH',
        [X402_HEADERS.CHAIN_ID]: '7750',
        [X402_HEADERS.NONCE]: 'nonce-789',
        [X402_HEADERS.EXPIRY]: String(Math.floor(Date.now() / 1000) + 3600),
      })

      const mock402 = new Response('Payment Required', { status: 402, headers })
      const mock200 = new Response('Success', { status: 200 })

      mockFetch.mockResolvedValueOnce(mock402).mockResolvedValueOnce(mock200)

      await client.fetch('https://api.example.com/paid')

      // Check second call had X-Payment header
      expect(mockFetch).toHaveBeenCalledTimes(2)
      const secondCall = mockFetch.mock.calls[1]
      const requestHeaders = secondCall[1]?.headers as Headers
      expect(requestHeaders.has(X402_HEADERS.PAYMENT)).toBe(true)
    })
  })

  describe('fetch enforces guardrails before making payment', () => {
    it('should reject payment exceeding per-transaction limit', async () => {
      // Create wallet with low limit
      const lowLimitWallet = new MonmouthWallet({
        identity: {
          agentId: 'low-limit-agent',
          agentType: 'research',
          name: 'Low Limit Agent',
        },
        policy: {
          maxPerTransaction: BigInt(1e16), // 0.01 ETH
          maxPerDay: BigInt(1e17), // 0.1 ETH
        },
      })
      lowLimitWallet.setConnectedAddress('0x1234567890123456789012345678901234567890' as Address)

      const lowLimitClient = new X402Client(lowLimitWallet, { autoRetry: true })

      const headers = new Headers({
        [X402_HEADERS.RECIPIENT]: '0xRecipient000000000000000000000000000000',
        [X402_HEADERS.AMOUNT]: '100000000000000000', // 0.1 ETH - exceeds limit
        [X402_HEADERS.TOKEN]: 'ETH',
        [X402_HEADERS.CHAIN_ID]: '7750',
        [X402_HEADERS.NONCE]: 'nonce-limit',
        [X402_HEADERS.EXPIRY]: String(Math.floor(Date.now() / 1000) + 3600),
      })

      const mock402 = new Response('Payment Required', { status: 402, headers })
      mockFetch.mockResolvedValueOnce(mock402)

      try {
        await lowLimitClient.fetch('https://api.example.com/paid')
        expect.fail('Should have thrown X402Error')
      } catch (error) {
        expect(error).toBeInstanceOf(X402Error)
        expect((error as X402Error).code).toBe('GUARDRAIL_REJECTED')
      }

      lowLimitWallet.destroy()
    })

    it('should reject payment to blocked address', async () => {
      const blockedAddress = '0xBlocked0000000000000000000000000000000' as Address

      wallet.updatePolicy({
        blockedAddresses: [blockedAddress],
      })

      const headers = new Headers({
        [X402_HEADERS.RECIPIENT]: blockedAddress,
        [X402_HEADERS.AMOUNT]: '100000000000000000',
        [X402_HEADERS.TOKEN]: 'ETH',
        [X402_HEADERS.CHAIN_ID]: '7750',
        [X402_HEADERS.NONCE]: 'nonce-blocked',
        [X402_HEADERS.EXPIRY]: String(Math.floor(Date.now() / 1000) + 3600),
      })

      const mock402 = new Response('Payment Required', { status: 402, headers })
      mockFetch.mockResolvedValueOnce(mock402)

      await expect(client.fetch('https://api.example.com/paid')).rejects.toThrow(X402Error)
    })
  })

  describe('fetch rejects payment exceeding spending limits', () => {
    it('should reject when daily limit exceeded', async () => {
      // Spend most of daily limit first
      wallet.recordTransaction('0x' + '1'.repeat(64) as Hex, BigInt(9e18)) // 9 ETH

      const headers = new Headers({
        [X402_HEADERS.RECIPIENT]: '0xRecipient000000000000000000000000000000',
        [X402_HEADERS.AMOUNT]: '2000000000000000000', // 2 ETH - would exceed 10 ETH limit
        [X402_HEADERS.TOKEN]: 'ETH',
        [X402_HEADERS.CHAIN_ID]: '7750',
        [X402_HEADERS.NONCE]: 'nonce-daily',
        [X402_HEADERS.EXPIRY]: String(Math.floor(Date.now() / 1000) + 3600),
      })

      const mock402 = new Response('Payment Required', { status: 402, headers })
      mockFetch.mockResolvedValueOnce(mock402)

      await expect(client.fetch('https://api.example.com/paid')).rejects.toThrow(X402Error)
    })
  })

  describe('createPayment generates valid signature', () => {
    it('should create payment with signature', async () => {
      const paymentRequired = {
        recipient: '0xRecipient000000000000000000000000000000' as Address,
        amount: BigInt('100000000000000000'),
        token: 'ETH' as const,
        chainId: 7750,
        nonce: 'test-nonce',
        expiry: Math.floor(Date.now() / 1000) + 3600,
      }

      const payment = await client.createPayment(paymentRequired)

      expect(payment.signature).toBeDefined()
      expect(payment.signature.startsWith('0x')).toBe(true)
      expect(payment.payer).toBe(wallet.getConnectedAddress())
      expect(payment.createdAt).toBeGreaterThan(0)
    })

    it('should reject expired payment requirements', async () => {
      const paymentRequired = {
        recipient: '0xRecipient000000000000000000000000000000' as Address,
        amount: BigInt('100000000000000000'),
        token: 'ETH' as const,
        chainId: 7750,
        nonce: 'expired-nonce',
        expiry: Math.floor(Date.now() / 1000) - 100, // Expired
      }

      await expect(client.createPayment(paymentRequired)).rejects.toThrow(X402Error)
    })

    it('should reject when wallet not connected', async () => {
      wallet.clearConnection()

      const paymentRequired = {
        recipient: '0xRecipient000000000000000000000000000000' as Address,
        amount: BigInt('100000000000000000'),
        token: 'ETH' as const,
        chainId: 7750,
        nonce: 'no-connect-nonce',
        expiry: Math.floor(Date.now() / 1000) + 3600,
      }

      await expect(client.createPayment(paymentRequired)).rejects.toThrow(X402Error)
    })
  })

  describe('createPayment includes correct chain ID and expiry', () => {
    it('should preserve chain ID and expiry in payment', async () => {
      const chainId = 7750
      const expiry = Math.floor(Date.now() / 1000) + 7200

      const paymentRequired = {
        recipient: '0xRecipient000000000000000000000000000000' as Address,
        amount: BigInt('100000000000000000'),
        token: 'ETH' as const,
        chainId,
        nonce: 'chain-nonce',
        expiry,
      }

      const payment = await client.createPayment(paymentRequired)

      expect(payment.paymentRequired.chainId).toBe(chainId)
      expect(payment.paymentRequired.expiry).toBe(expiry)
    })
  })

  describe('Activity logging', () => {
    it('should log payment decisions', async () => {
      const headers = new Headers({
        [X402_HEADERS.RECIPIENT]: '0xRecipient000000000000000000000000000000',
        [X402_HEADERS.AMOUNT]: '100000000000000000',
        [X402_HEADERS.TOKEN]: 'ETH',
        [X402_HEADERS.CHAIN_ID]: '7750',
        [X402_HEADERS.NONCE]: 'log-nonce',
        [X402_HEADERS.EXPIRY]: String(Math.floor(Date.now() / 1000) + 3600),
      })

      const mock402 = new Response('Payment Required', { status: 402, headers })
      const mock200 = new Response('OK', { status: 200 })

      mockFetch.mockResolvedValueOnce(mock402).mockResolvedValueOnce(mock200)

      await client.fetch('https://api.example.com/paid')

      const history = activityLog.getHistory('test-agent')
      expect(history.length).toBeGreaterThan(0)

      const events = history.map((e) => (e.data as { event: string }).event)
      expect(events).toContain('payment_required')
      expect(events).toContain('payment_made')
    })
  })

  describe('Auto-retry configuration', () => {
    it('should not retry when autoRetry is false', async () => {
      const noRetryClient = new X402Client(wallet, { autoRetry: false })

      const headers = new Headers({
        [X402_HEADERS.RECIPIENT]: '0xRecipient000000000000000000000000000000',
        [X402_HEADERS.AMOUNT]: '100000000000000000',
        [X402_HEADERS.TOKEN]: 'ETH',
        [X402_HEADERS.CHAIN_ID]: '7750',
        [X402_HEADERS.NONCE]: 'no-retry-nonce',
        [X402_HEADERS.EXPIRY]: String(Math.floor(Date.now() / 1000) + 3600),
      })

      const mock402 = new Response('Payment Required', { status: 402, headers })
      mockFetch.mockResolvedValueOnce(mock402)

      const result = await noRetryClient.fetchWithPaymentInfo('https://api.example.com/paid')

      expect(result.response.status).toBe(402)
      expect(result.paymentMade).toBe(false)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('Factory function', () => {
    it('createX402Client should create a new instance', () => {
      const newClient = createX402Client(wallet)
      expect(newClient).toBeInstanceOf(X402Client)
    })
  })
})

describe('x402 Types', () => {
  describe('parsePaymentRequired', () => {
    it('should parse valid headers', () => {
      const headers = new Headers({
        [X402_HEADERS.RECIPIENT]: '0xRecipient000000000000000000000000000000',
        [X402_HEADERS.AMOUNT]: '1000000000000000000',
        [X402_HEADERS.TOKEN]: 'ETH',
        [X402_HEADERS.CHAIN_ID]: '7750',
        [X402_HEADERS.NONCE]: 'test-nonce',
        [X402_HEADERS.EXPIRY]: String(Math.floor(Date.now() / 1000) + 3600),
        [X402_HEADERS.DESCRIPTION]: 'Test payment',
      })

      const result = parsePaymentRequired(headers)

      expect(result.recipient).toBe('0xRecipient000000000000000000000000000000')
      expect(result.amount).toBe(BigInt('1000000000000000000'))
      expect(result.token).toBe('ETH')
      expect(result.chainId).toBe(7750)
      expect(result.nonce).toBe('test-nonce')
      expect(result.description).toBe('Test payment')
    })

    it('should throw on missing recipient', () => {
      const headers = new Headers({
        [X402_HEADERS.AMOUNT]: '1000000000000000000',
        [X402_HEADERS.CHAIN_ID]: '7750',
        [X402_HEADERS.NONCE]: 'test-nonce',
        [X402_HEADERS.EXPIRY]: String(Math.floor(Date.now() / 1000) + 3600),
      })

      expect(() => parsePaymentRequired(headers)).toThrow(X402Error)
    })

    it('should throw on expired payment', () => {
      const headers = new Headers({
        [X402_HEADERS.RECIPIENT]: '0xRecipient000000000000000000000000000000',
        [X402_HEADERS.AMOUNT]: '1000000000000000000',
        [X402_HEADERS.CHAIN_ID]: '7750',
        [X402_HEADERS.NONCE]: 'test-nonce',
        [X402_HEADERS.EXPIRY]: String(Math.floor(Date.now() / 1000) - 100),
      })

      expect(() => parsePaymentRequired(headers)).toThrow(X402Error)
    })
  })

  describe('serializePaymentHeader / deserializePaymentHeader', () => {
    it('should round-trip payment payload', () => {
      const payload = {
        paymentRequired: {
          recipient: '0xRecipient000000000000000000000000000000' as Address,
          amount: BigInt('500000000000000000'),
          token: 'ETH' as const,
          chainId: 7750,
          nonce: 'roundtrip-nonce',
          expiry: Math.floor(Date.now() / 1000) + 3600,
        },
        signature: '0x1234567890abcdef' as Hex,
        payer: '0xPayer00000000000000000000000000000000' as Address,
        createdAt: Date.now(),
      }

      const serialized = serializePaymentHeader(payload)
      expect(typeof serialized).toBe('string')

      const deserialized = deserializePaymentHeader(serialized)
      expect(deserialized.paymentRequired.recipient).toBe(payload.paymentRequired.recipient)
      expect(deserialized.paymentRequired.amount).toBe(payload.paymentRequired.amount)
      expect(deserialized.paymentRequired.chainId).toBe(payload.paymentRequired.chainId)
      expect(deserialized.signature).toBe(payload.signature)
      expect(deserialized.payer).toBe(payload.payer)
    })

    it('should throw on invalid header', () => {
      expect(() => deserializePaymentHeader('not-valid-base64!@#')).toThrow(X402Error)
    })
  })

  describe('isNativeToken', () => {
    it('should identify ETH as native', () => {
      expect(isNativeToken('ETH')).toBe(true)
    })

    it('should identify zero address as native', () => {
      expect(isNativeToken('0x0000000000000000000000000000000000000000')).toBe(true)
    })

    it('should identify USDC as not native', () => {
      expect(isNativeToken('USDC')).toBe(false)
    })

    it('should identify token address as not native', () => {
      expect(isNativeToken('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')).toBe(false)
    })
  })
})
