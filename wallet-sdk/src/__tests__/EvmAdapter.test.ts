/**
 * EVM Adapter tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { EvmAdapter, createEvmAdapter } from '../adapters/evm'
import { EVM_CHAINS } from '../core/types'

// Test private key (DO NOT USE IN PRODUCTION)
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

describe('EVM Adapter', () => {
  let adapter: EvmAdapter

  beforeEach(() => {
    const account = privateKeyToAccount(TEST_PRIVATE_KEY)
    adapter = createEvmAdapter({
      chain: EVM_CHAINS.monmouth,
      account,
      rpcUrl: 'http://localhost:8545', // Would need a real RPC for integration tests
    })
  })

  describe('Initialization', () => {
    it('should create adapter with correct chain type', () => {
      expect(adapter.chainType).toBe('evm')
    })

    it('should have correct chain ID', () => {
      expect(adapter.chainId).toBe(7750) // Monmouth chain ID
    })

    it('should have correct config', () => {
      expect(adapter.config.name).toBe('Monmouth')
      expect(adapter.config.nativeToken.symbol).toBe('ETH')
      expect(adapter.config.nativeToken.decimals).toBe(18)
    })
  })

  describe('Connection', () => {
    it('should not be connected initially', () => {
      expect(adapter.isConnected()).toBe(false)
    })

    it('should connect successfully', async () => {
      await adapter.connect()
      expect(adapter.isConnected()).toBe(true)
    })

    it('should disconnect successfully', async () => {
      await adapter.connect()
      await adapter.disconnect()
      expect(adapter.isConnected()).toBe(false)
    })

    it('should emit connected event', async () => {
      let eventReceived = false
      adapter.on((event) => {
        if (event.type === 'connected') {
          eventReceived = true
        }
      })
      await adapter.connect()
      expect(eventReceived).toBe(true)
    })

    it('should emit disconnected event', async () => {
      await adapter.connect()

      let eventReceived = false
      adapter.on((event) => {
        if (event.type === 'disconnected') {
          eventReceived = true
        }
      })
      await adapter.disconnect()
      expect(eventReceived).toBe(true)
    })
  })

  describe('Address Management', () => {
    beforeEach(async () => {
      await adapter.connect()
    })

    it('should return address after connection', async () => {
      const address = await adapter.getAddress()

      expect(address.chainType).toBe('evm')
      expect(address.display.startsWith('0x')).toBe(true)
      expect(address.display.length).toBe(42)
      expect(address.raw.length).toBe(20)
    })

    it('should return consistent address', async () => {
      const addr1 = await adapter.getAddress()
      const addr2 = await adapter.getAddress()

      expect(addr1.display).toBe(addr2.display)
    })

    it('should normalize addresses', () => {
      const input = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
      const normalized = adapter.normalizeAddress(input)

      expect(normalized.display.toLowerCase()).toBe(input.toLowerCase())
      expect(normalized.chainType).toBe('evm')
    })

    it('should validate addresses', () => {
      expect(adapter.isValidAddress('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')).toBe(true)
      expect(adapter.isValidAddress('0x' + '00'.repeat(20))).toBe(true)
      expect(adapter.isValidAddress('invalid')).toBe(false)
      expect(adapter.isValidAddress('0x' + '00'.repeat(19))).toBe(false)
    })
  })

  describe('Signing', () => {
    beforeEach(async () => {
      await adapter.connect()
    })

    it('should sign raw bytes', async () => {
      const message = new TextEncoder().encode('test message')
      const signature = await adapter.sign(message)

      expect(signature.scheme).toBe('secp256k1')
      expect(signature.bytes.length).toBeGreaterThan(0)
      expect(signature.recoveryId).toBeDefined()
    })

    it('should sign string message', async () => {
      const signature = await adapter.signMessage('Hello, World!')

      expect(signature.scheme).toBe('secp256k1')
      expect(signature.bytes.length).toBeGreaterThan(0)
    })

    it('should sign typed data', async () => {
      const domain = {
        name: 'Test',
        version: '1',
        chainId: 7750,
      }

      const types = {
        Message: [{ name: 'content', type: 'string' }],
      }

      const value = { content: 'Hello' }

      const signature = await adapter.signTypedData(domain, types, value)

      expect(signature.scheme).toBe('secp256k1')
      expect(signature.bytes.length).toBeGreaterThan(0)
    })
  })

  describe('Raw Client Access', () => {
    it('should provide raw client', () => {
      const raw = adapter.getRawClient<{
        publicClient: unknown
        walletClient: unknown
      }>()

      expect(raw.publicClient).toBeDefined()
      expect(raw.walletClient).toBeDefined()
    })
  })

  describe('Event Subscription', () => {
    it('should allow subscribing to events', () => {
      const events: string[] = []
      const unsubscribe = adapter.on((event) => {
        events.push(event.type)
      })

      expect(typeof unsubscribe).toBe('function')
    })

    it('should allow unsubscribing', async () => {
      const events: string[] = []
      const unsubscribe = adapter.on((event) => {
        events.push(event.type)
      })

      await adapter.connect()
      expect(events).toContain('connected')

      unsubscribe()

      await adapter.disconnect()
      // Should not receive disconnected event after unsubscribe
      expect(events.filter((e) => e === 'disconnected').length).toBe(0)
    })
  })
})

describe('EVM Chains Configuration', () => {
  it('should have correct Monmouth config', () => {
    expect(EVM_CHAINS.monmouth.chainId).toBe(7750)
    expect(EVM_CHAINS.monmouth.name).toBe('Monmouth')
    expect(EVM_CHAINS.monmouth.chainType).toBe('evm')
  })

  it('should have correct Base config', () => {
    expect(EVM_CHAINS.base.chainId).toBe(8453)
    expect(EVM_CHAINS.base.name).toBe('Base')
  })

  it('should have correct Ethereum config', () => {
    expect(EVM_CHAINS.ethereum.chainId).toBe(1)
    expect(EVM_CHAINS.ethereum.name).toBe('Ethereum')
  })
})
