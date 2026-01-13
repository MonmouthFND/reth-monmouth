/**
 * Tests for AgentIdentityManager
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { AgentIdentityManager, createAgentIdentity } from '../identity/AgentIdentity'
import { IdentityError } from '../identity/types'
import { MonmouthWallet } from '../MonmouthWallet'
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

describe('AgentIdentityManager', () => {
  let wallet: MonmouthWallet
  let identity: AgentIdentityManager

  beforeEach(() => {
    localStorageMock.clear()

    wallet = new MonmouthWallet({
      identity: {
        agentId: 'test-agent',
        agentType: 'commerce',
        name: 'Test Commerce Agent',
      },
    })

    wallet.setConnectedAddress('0x1234567890123456789012345678901234567890' as Address)

    identity = new AgentIdentityManager(wallet)
  })

  afterEach(() => {
    wallet.destroy()
    localStorageMock.clear()
  })

  describe('generateDID creates valid did:key identifier', () => {
    it('should generate a DID from address', () => {
      const address = '0x1234567890123456789012345678901234567890' as Address
      const did = identity.generateDID(address)

      expect(did).toMatch(/^did:key:z[a-km-zA-HJ-NP-Z1-9]+$/)
    })

    it('should generate deterministic DIDs', () => {
      const address = '0xabcdef1234567890abcdef1234567890abcdef12' as Address
      const did1 = identity.generateDID(address)
      const did2 = identity.generateDID(address)

      expect(did1).toBe(did2)
    })

    it('should generate different DIDs for different addresses', () => {
      const address1 = '0x1111111111111111111111111111111111111111' as Address
      const address2 = '0x2222222222222222222222222222222222222222' as Address

      const did1 = identity.generateDID(address1)
      const did2 = identity.generateDID(address2)

      expect(did1).not.toBe(did2)
    })
  })

  describe('Identity includes correct agent type metadata', () => {
    it('should include agent type from wallet', async () => {
      const doc = await identity.initialize()

      expect(doc.agentType).toBe('commerce')
    })

    it('should include agent name from wallet', async () => {
      const doc = await identity.initialize()

      expect(doc.name).toBe('Test Commerce Agent')
    })

    it('should include controller address', async () => {
      const doc = await identity.initialize()

      expect(doc.controller).toBe('0x1234567890123456789012345678901234567890')
    })

    it('should include default capabilities', async () => {
      const doc = await identity.initialize()

      expect(doc.capabilities).toContain('payments')
      expect(doc.capabilities).toContain('signing')
    })

    it('should allow custom capabilities', async () => {
      const doc = await identity.initialize(['payments', 'escrow', 'trading'])

      expect(doc.capabilities).toContain('escrow')
      expect(doc.capabilities).toContain('trading')
    })
  })

  describe('signMessage creates verifiable signature', () => {
    it('should sign a message with DID', async () => {
      await identity.initialize()

      const result = await identity.signMessage('Hello, World!')

      expect(result.message).toBe('Hello, World!')
      expect(result.signature).toMatch(/^0x[a-fA-F0-9]+$/)
      expect(result.did).toMatch(/^did:key:/)
    })

    it('should throw if not initialized', async () => {
      await expect(identity.signMessage('test')).rejects.toThrow(IdentityError)
    })
  })

  describe('verifyIdentity validates signature and DID', () => {
    it('should verify a valid signed identity', async () => {
      await identity.initialize()
      const signed = await identity.signIdentity()

      const result = await identity.verifyIdentity(signed)

      expect(result.valid).toBe(true)
      expect(result.identity).toBeDefined()
      expect(result.identity?.id).toBe(signed.document.id)
    })

    it('should reject invalid DID format', async () => {
      const invalidSigned = {
        document: {
          id: 'invalid:did:format' as any,
          controller: '0x1234567890123456789012345678901234567890' as Address,
          agentType: 'commerce',
          name: 'Test',
          capabilities: ['payments' as const],
          created: Date.now(),
          updated: Date.now(),
        },
        signature: '0x1234' as any,
        signedAt: Date.now(),
      }

      const result = await identity.verifyIdentity(invalidSigned)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('Invalid DID format')
    })

    it('should reject expired signature', async () => {
      await identity.initialize()
      const signed = await identity.signIdentity()

      // Backdate the signature
      signed.signedAt = Date.now() - 25 * 60 * 60 * 1000 // 25 hours ago

      const result = await identity.verifyIdentity(signed)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('expired')
    })

    it('should reject mismatched controller', async () => {
      await identity.initialize()
      const signed = await identity.signIdentity()

      // Change the controller
      signed.document.controller = '0x9999999999999999999999999999999999999999' as Address

      const result = await identity.verifyIdentity(signed)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('does not match')
    })
  })

  describe('Identity persists across sessions', () => {
    it('should persist identity to localStorage', async () => {
      await identity.initialize()

      const stored = localStorage.getItem('monmouth_identity_0x1234567890123456789012345678901234567890')
      expect(stored).toBeTruthy()

      const parsed = JSON.parse(stored!)
      expect(parsed.agentType).toBe('commerce')
    })

    it('should restore identity on new instance', async () => {
      await identity.initialize()
      const originalDID = identity.getDID()

      // Create new instance
      const newIdentity = new AgentIdentityManager(wallet)

      expect(newIdentity.isInitialized()).toBe(true)
      expect(newIdentity.getDID()).toBe(originalDID)
    })

    it('should clear identity when requested', async () => {
      await identity.initialize()
      expect(identity.isInitialized()).toBe(true)

      identity.clearIdentity()

      expect(identity.isInitialized()).toBe(false)
      expect(identity.getDID()).toBeNull()
    })
  })

  describe('DID extraction', () => {
    it('should extract address from valid DID', async () => {
      const address = '0x1234567890123456789012345678901234567890' as Address
      const did = identity.generateDID(address)

      const extracted = identity.extractAddressFromDID(did)

      expect(extracted?.toLowerCase()).toBe(address.toLowerCase())
    })

    it('should return null for invalid DID', () => {
      const extracted = identity.extractAddressFromDID('did:key:invalid' as any)

      expect(extracted).toBeNull()
    })
  })

  describe('Capability updates', () => {
    it('should update capabilities', async () => {
      await identity.initialize(['payments'])

      identity.updateCapabilities(['payments', 'escrow', 'x402'])

      const doc = identity.getIdentity()
      expect(doc?.capabilities).toContain('escrow')
      expect(doc?.capabilities).toContain('x402')
    })

    it('should throw if not initialized', () => {
      expect(() => identity.updateCapabilities(['payments'])).toThrow(IdentityError)
    })
  })

  describe('Metadata updates', () => {
    it('should update metadata', async () => {
      await identity.initialize()

      identity.updateMetadata({ customField: 'value', score: 100 })

      const doc = identity.getIdentity()
      expect(doc?.metadata?.customField).toBe('value')
      expect(doc?.metadata?.score).toBe(100)
    })
  })

  describe('Event emission', () => {
    it('should emit identity_created event', async () => {
      const events: any[] = []
      identity.on((event) => events.push(event))

      await identity.initialize()

      expect(events.some((e) => e.type === 'identity_created')).toBe(true)
    })

    it('should emit identity_signed event', async () => {
      const events: any[] = []
      identity.on((event) => events.push(event))

      await identity.initialize()
      await identity.signIdentity()

      expect(events.some((e) => e.type === 'identity_signed')).toBe(true)
    })
  })

  describe('Factory function', () => {
    it('createAgentIdentity should create a new instance', () => {
      const newIdentity = createAgentIdentity(wallet)

      expect(newIdentity).toBeInstanceOf(AgentIdentityManager)
    })
  })

  describe('JSON export', () => {
    it('should export identity as JSON', async () => {
      await identity.initialize()

      const json = identity.toJSON()

      expect(json).toBeDefined()
      expect(json?.id).toMatch(/^did:key:/)
      expect(json?.agentType).toBe('commerce')
    })

    it('should return null if not initialized', () => {
      const json = identity.toJSON()

      expect(json).toBeNull()
    })
  })
})
