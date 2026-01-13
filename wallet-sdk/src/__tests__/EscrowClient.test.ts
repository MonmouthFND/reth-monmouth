/**
 * Tests for EscrowClient
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EscrowClient, createEscrowClient } from '../commerce/EscrowClient'
import { EscrowError, generateEscrowId, isEscrowActive, isEscrowExpired } from '../commerce/types'
import { MonmouthWallet } from '../MonmouthWallet'
import { ActivityLog } from '../memory/ActivityLog'
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

describe('EscrowClient', () => {
  let wallet: MonmouthWallet
  let escrow: EscrowClient
  let activityLog: ActivityLog
  const recipient = '0xabcdef1234567890abcdef1234567890abcdef12' as Address

  beforeEach(() => {
    localStorageMock.clear()

    wallet = new MonmouthWallet({
      identity: {
        agentId: 'test-agent',
        agentType: 'commerce',
        name: 'Test Agent',
      },
      policy: {
        maxPerTransaction: BigInt(10e18), // 10 ETH
        maxPerDay: BigInt(100e18), // 100 ETH
      },
    })

    wallet.setConnectedAddress('0x1234567890123456789012345678901234567890' as Address)

    activityLog = new ActivityLog({ autoSave: false })
    escrow = new EscrowClient(wallet, {}, { activityLog })
  })

  afterEach(() => {
    wallet.destroy()
    escrow.clearEscrows()
    localStorageMock.clear()
  })

  describe('createEscrow locks funds with correct parameters', () => {
    it('should create escrow with correct values', async () => {
      const result = await escrow.createEscrow({
        recipient,
        amount: BigInt(1e18), // 1 ETH
        description: 'Test service',
        durationSeconds: 3600,
      })

      expect(result.success).toBe(true)
      expect(result.escrowId).toMatch(/^escrow_/)
      expect(result.escrow?.recipient).toBe(recipient)
      expect(result.escrow?.amount).toBe(BigInt(1e18))
      expect(result.escrow?.state).toBe('locked')
    })

    it('should set correct expiry time', async () => {
      const before = Date.now()

      const result = await escrow.createEscrow({
        recipient,
        amount: BigInt(1e18),
        description: 'Test',
        durationSeconds: 3600, // 1 hour
      })

      const after = Date.now()

      expect(result.escrow?.expiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000)
      expect(result.escrow?.expiresAt).toBeLessThanOrEqual(after + 3600 * 1000)
    })

    it('should store service ID if provided', async () => {
      const result = await escrow.createEscrow({
        recipient,
        amount: BigInt(1e18),
        description: 'Test',
        durationSeconds: 3600,
        serviceId: 'service-123',
      })

      expect(result.escrow?.serviceId).toBe('service-123')
    })

    it('should reject if exceeds spending limits', async () => {
      const result = await escrow.createEscrow({
        recipient,
        amount: BigInt(100e18), // 100 ETH - exceeds per-tx limit
        description: 'Test',
        durationSeconds: 3600,
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('exceeds')
    })
  })

  describe('releaseEscrow transfers funds to recipient', () => {
    it('should release funds successfully', async () => {
      const createResult = await escrow.createEscrow({
        recipient,
        amount: BigInt(1e18),
        description: 'Test',
        durationSeconds: 3600,
      })

      const releaseResult = await escrow.releaseEscrow(createResult.escrowId)

      expect(releaseResult.success).toBe(true)
      expect(releaseResult.escrow?.state).toBe('released')
      expect(releaseResult.escrow?.releasedAt).toBeDefined()
    })

    it('should throw if escrow not found', async () => {
      await expect(escrow.releaseEscrow('escrow_nonexistent' as any)).rejects.toThrow(EscrowError)
    })

    it('should throw if not payer', async () => {
      const createResult = await escrow.createEscrow({
        recipient,
        amount: BigInt(1e18),
        description: 'Test',
        durationSeconds: 3600,
      })

      // Change connected address
      wallet.setConnectedAddress('0x9999999999999999999999999999999999999999' as Address)

      await expect(escrow.releaseEscrow(createResult.escrowId)).rejects.toThrow('Only payer')
    })

    it('should throw if already released', async () => {
      const createResult = await escrow.createEscrow({
        recipient,
        amount: BigInt(1e18),
        description: 'Test',
        durationSeconds: 3600,
      })

      await escrow.releaseEscrow(createResult.escrowId)

      await expect(escrow.releaseEscrow(createResult.escrowId)).rejects.toThrow('Cannot release')
    })
  })

  describe('refundEscrow returns funds to sender', () => {
    it('should refund successfully', async () => {
      const createResult = await escrow.createEscrow({
        recipient,
        amount: BigInt(1e18),
        description: 'Test',
        durationSeconds: 3600,
      })

      const refundResult = await escrow.refundEscrow(createResult.escrowId)

      expect(refundResult.success).toBe(true)
      expect(refundResult.escrow?.state).toBe('refunded')
      expect(refundResult.escrow?.refundedAt).toBeDefined()
    })

    it('should throw if not payer', async () => {
      const createResult = await escrow.createEscrow({
        recipient,
        amount: BigInt(1e18),
        description: 'Test',
        durationSeconds: 3600,
      })

      wallet.setConnectedAddress('0x9999999999999999999999999999999999999999' as Address)

      await expect(escrow.refundEscrow(createResult.escrowId)).rejects.toThrow('Only payer')
    })
  })

  describe('disputeEscrow initiates dispute process', () => {
    it('should initiate dispute successfully', async () => {
      const createResult = await escrow.createEscrow({
        recipient,
        amount: BigInt(1e18),
        description: 'Test',
        durationSeconds: 3600,
      })

      const disputeResult = await escrow.disputeEscrow({
        escrowId: createResult.escrowId,
        reason: 'Service not delivered',
      })

      expect(disputeResult.success).toBe(true)
      expect(disputeResult.escrow?.state).toBe('disputed')
      expect(disputeResult.escrow?.disputeReason).toBe('Service not delivered')
    })

    it('should allow recipient to dispute', async () => {
      const createResult = await escrow.createEscrow({
        recipient,
        amount: BigInt(1e18),
        description: 'Test',
        durationSeconds: 3600,
      })

      // Switch to recipient
      wallet.setConnectedAddress(recipient)

      const disputeResult = await escrow.disputeEscrow({
        escrowId: createResult.escrowId,
        reason: 'Payment too low',
      })

      expect(disputeResult.success).toBe(true)
    })

    it('should throw if not party to escrow', async () => {
      const createResult = await escrow.createEscrow({
        recipient,
        amount: BigInt(1e18),
        description: 'Test',
        durationSeconds: 3600,
      })

      wallet.setConnectedAddress('0x9999999999999999999999999999999999999999' as Address)

      await expect(
        escrow.disputeEscrow({
          escrowId: createResult.escrowId,
          reason: 'Test',
        })
      ).rejects.toThrow('Only escrow parties')
    })
  })

  describe('getEscrowStatus returns correct state', () => {
    it('should return active status for locked escrow', async () => {
      const createResult = await escrow.createEscrow({
        recipient,
        amount: BigInt(1e18),
        description: 'Test',
        durationSeconds: 3600,
      })

      const status = escrow.getEscrowStatus(createResult.escrowId)

      expect(status.isActive).toBe(true)
      expect(status.isExpired).toBe(false)
      expect(status.timeRemaining).toBeGreaterThan(0)
      expect(status.availableActions).toContain('release')
      expect(status.availableActions).toContain('dispute')
    })

    it('should return correct actions for recipient', async () => {
      const createResult = await escrow.createEscrow({
        recipient,
        amount: BigInt(1e18),
        description: 'Test',
        durationSeconds: 3600,
      })

      wallet.setConnectedAddress(recipient)

      const status = escrow.getEscrowStatus(createResult.escrowId)

      expect(status.availableActions).toContain('dispute')
      expect(status.availableActions).not.toContain('release')
    })

    it('should throw for nonexistent escrow', () => {
      expect(() => escrow.getEscrowStatus('escrow_nonexistent' as any)).toThrow(EscrowError)
    })
  })

  describe('getMyEscrows', () => {
    it('should return escrows for current user', async () => {
      await escrow.createEscrow({
        recipient,
        amount: BigInt(1e18),
        description: 'Test 1',
        durationSeconds: 3600,
      })

      await escrow.createEscrow({
        recipient: '0x9999999999999999999999999999999999999999' as Address,
        amount: BigInt(2e18),
        description: 'Test 2',
        durationSeconds: 3600,
      })

      const myEscrows = escrow.getMyEscrows()

      expect(myEscrows).toHaveLength(2)
    })
  })

  describe('Event emission', () => {
    it('should emit escrow_created event', async () => {
      const events: any[] = []
      escrow.on((event) => events.push(event))

      await escrow.createEscrow({
        recipient,
        amount: BigInt(1e18),
        description: 'Test',
        durationSeconds: 3600,
      })

      expect(events.some((e) => e.type === 'escrow_created')).toBe(true)
    })

    it('should emit escrow_released event', async () => {
      const events: any[] = []
      escrow.on((event) => events.push(event))

      const result = await escrow.createEscrow({
        recipient,
        amount: BigInt(1e18),
        description: 'Test',
        durationSeconds: 3600,
      })

      await escrow.releaseEscrow(result.escrowId)

      expect(events.some((e) => e.type === 'escrow_released')).toBe(true)
    })
  })

  describe('Persistence', () => {
    it('should persist escrows to localStorage', async () => {
      await escrow.createEscrow({
        recipient,
        amount: BigInt(1e18),
        description: 'Test',
        durationSeconds: 3600,
      })

      const stored = localStorage.getItem('monmouth_escrows')
      expect(stored).toBeTruthy()
    })

    it('should restore escrows on new instance', async () => {
      await escrow.createEscrow({
        recipient,
        amount: BigInt(1e18),
        description: 'Test',
        durationSeconds: 3600,
      })

      const newEscrow = new EscrowClient(wallet)

      expect(newEscrow.count()).toBe(1)
    })
  })

  describe('Factory function', () => {
    it('createEscrowClient should create a new instance', () => {
      const newEscrow = createEscrowClient(wallet)

      expect(newEscrow).toBeInstanceOf(EscrowClient)
    })
  })

  describe('Utility functions', () => {
    it('generateEscrowId should create unique IDs', () => {
      const id1 = generateEscrowId()
      const id2 = generateEscrowId()

      expect(id1).toMatch(/^escrow_/)
      expect(id2).toMatch(/^escrow_/)
      expect(id1).not.toBe(id2)
    })

    it('isEscrowActive should return correct value', async () => {
      const result = await escrow.createEscrow({
        recipient,
        amount: BigInt(1e18),
        description: 'Test',
        durationSeconds: 3600,
      })

      expect(isEscrowActive(result.escrow!)).toBe(true)

      await escrow.releaseEscrow(result.escrowId)
      const status = escrow.getEscrowStatus(result.escrowId)

      expect(isEscrowActive(status.escrow)).toBe(false)
    })

    it('isEscrowExpired should return correct value', async () => {
      const result = await escrow.createEscrow({
        recipient,
        amount: BigInt(1e18),
        description: 'Test',
        durationSeconds: 3600,
      })

      expect(isEscrowExpired(result.escrow!)).toBe(false)
    })
  })
})
