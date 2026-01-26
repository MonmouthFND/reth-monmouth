/**
 * Solana Adapter tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Keypair } from '@solana/web3.js'
import { SolanaAdapter, createSolanaAdapter } from '../adapters/solana'
import { SVM_CHAINS } from '../core/types'

describe('Solana Adapter', () => {
  let adapter: SolanaAdapter
  let keypair: Keypair

  beforeEach(() => {
    keypair = Keypair.generate()
    adapter = createSolanaAdapter({
      chain: SVM_CHAINS.devnet,
      rpcUrl: 'https://api.devnet.solana.com',
      keypair,
    })
  })

  describe('Initialization', () => {
    it('should create adapter with correct chain type', () => {
      expect(adapter.chainType).toBe('svm')
    })

    it('should have correct chain ID', () => {
      expect(adapter.chainId).toBe('devnet')
    })

    it('should have correct config', () => {
      expect(adapter.config.name).toBe('Solana Devnet')
      expect(adapter.config.nativeToken.symbol).toBe('SOL')
      expect(adapter.config.nativeToken.decimals).toBe(9)
    })

    it('should create adapter from secret key bytes', () => {
      const secretKey = Keypair.generate().secretKey
      const adapter2 = createSolanaAdapter({
        chain: SVM_CHAINS.devnet,
        rpcUrl: 'https://api.devnet.solana.com',
        secretKey,
      })

      expect(adapter2.chainType).toBe('svm')
    })

    it('should reject invalid secret key length', () => {
      expect(() => {
        createSolanaAdapter({
          chain: SVM_CHAINS.devnet,
          rpcUrl: 'https://api.devnet.solana.com',
          secretKey: new Uint8Array(32), // Should be 64 bytes
        })
      }).toThrow('Solana secret key must be 64 bytes')
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

    it('should throw when connecting without keypair', async () => {
      const adapterNoKey = createSolanaAdapter({
        chain: SVM_CHAINS.devnet,
        rpcUrl: 'https://api.devnet.solana.com',
      })

      await expect(adapterNoKey.connect()).rejects.toThrow(
        'No keypair or wallet adapter configured'
      )
    })
  })

  describe('Address Management', () => {
    beforeEach(async () => {
      await adapter.connect()
    })

    it('should return address after connection', async () => {
      const address = await adapter.getAddress()

      expect(address.chainType).toBe('svm')
      expect(address.raw.length).toBe(32) // Solana public keys are 32 bytes
      expect(address.display.length).toBeGreaterThan(30) // Base58 encoded
    })

    it('should return consistent address', async () => {
      const addr1 = await adapter.getAddress()
      const addr2 = await adapter.getAddress()

      expect(addr1.display).toBe(addr2.display)
    })

    it('should match keypair public key', async () => {
      const address = await adapter.getAddress()
      expect(address.display).toBe(keypair.publicKey.toBase58())
    })

    it('should normalize addresses', () => {
      const input = keypair.publicKey.toBase58()
      const normalized = adapter.normalizeAddress(input)

      expect(normalized.display).toBe(input)
      expect(normalized.chainType).toBe('svm')
    })

    it('should validate addresses', () => {
      expect(adapter.isValidAddress(keypair.publicKey.toBase58())).toBe(true)
      expect(adapter.isValidAddress('invalid')).toBe(false)
      expect(adapter.isValidAddress('0x' + '00'.repeat(20))).toBe(false) // EVM format
    })
  })

  describe('Signing', () => {
    beforeEach(async () => {
      await adapter.connect()
    })

    it('should sign raw bytes', async () => {
      const message = new TextEncoder().encode('test message')
      const signature = await adapter.sign(message)

      expect(signature.scheme).toBe('ed25519')
      expect(signature.bytes.length).toBe(64) // Ed25519 signatures are 64 bytes
    })

    it('should sign string message', async () => {
      const signature = await adapter.signMessage('Hello, Solana!')

      expect(signature.scheme).toBe('ed25519')
      expect(signature.bytes.length).toBe(64)
    })

    it('should throw on typed data signing', async () => {
      const domain = { name: 'Test' }
      const types = { Message: [{ name: 'content', type: 'string' }] }
      const value = { content: 'Hello' }

      await expect(adapter.signTypedData(domain, types, value)).rejects.toThrow(
        'Typed data signing not supported on Solana'
      )
    })
  })

  describe('Raw Client Access', () => {
    it('should provide raw client', () => {
      const raw = adapter.getRawClient<{
        connection: unknown
        keypair: unknown
        walletAdapter: unknown
      }>()

      expect(raw.connection).toBeDefined()
      expect(raw.keypair).toBeDefined()
      expect(raw.walletAdapter).toBeNull()
    })
  })

  describe('Static Helpers', () => {
    it('should generate keypair', () => {
      const kp = SolanaAdapter.generateKeypair()
      expect(kp.publicKey).toBeDefined()
      expect(kp.secretKey.length).toBe(64)
    })

    it('should create keypair from secret key', () => {
      const original = Keypair.generate()
      const restored = SolanaAdapter.keypairFromSecretKey(original.secretKey)

      expect(restored.publicKey.toBase58()).toBe(original.publicKey.toBase58())
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
      expect(events.filter((e) => e === 'disconnected').length).toBe(0)
    })
  })
})

describe('Solana Chains Configuration', () => {
  it('should have correct mainnet config', () => {
    expect(SVM_CHAINS.mainnet.chainId).toBe('mainnet-beta')
    expect(SVM_CHAINS.mainnet.name).toBe('Solana Mainnet')
    expect(SVM_CHAINS.mainnet.chainType).toBe('svm')
  })

  it('should have correct devnet config', () => {
    expect(SVM_CHAINS.devnet.chainId).toBe('devnet')
    expect(SVM_CHAINS.devnet.name).toBe('Solana Devnet')
  })

  it('should have correct testnet config', () => {
    expect(SVM_CHAINS.testnet.chainId).toBe('testnet')
    expect(SVM_CHAINS.testnet.name).toBe('Solana Testnet')
  })
})
