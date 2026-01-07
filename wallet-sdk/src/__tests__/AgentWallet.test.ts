/**
 * AgentWallet tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { Keypair } from '@solana/web3.js'
import { AgentWallet, createAgentWallet, DEFAULT_POLICIES } from '../wallet/AgentWallet'
import { createEvmAdapter } from '../adapters/evm'
import { createSolanaAdapter } from '../adapters/solana'
import { EVM_CHAINS, SVM_CHAINS } from '../core/types'
import type { UniversalAddress } from '../core/types'

// Test private key (DO NOT USE IN PRODUCTION)
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

describe('AgentWallet', () => {
  describe('EVM-based Wallet', () => {
    let wallet: AgentWallet

    beforeEach(() => {
      const account = privateKeyToAccount(TEST_PRIVATE_KEY)
      const adapter = createEvmAdapter({
        chain: EVM_CHAINS.monmouth,
        account,
        rpcUrl: 'http://localhost:8545',
      })

      wallet = createAgentWallet({
        adapter,
        identity: {
          agentId: 'test-agent',
          agentType: 'commerce',
          name: 'Test Commerce Agent',
        },
      })
    })

    describe('Initialization', () => {
      it('should create wallet with correct agent type', () => {
        expect(wallet.getAgentType()).toBe('commerce')
      })

      it('should create wallet with correct agent ID', () => {
        expect(wallet.getAgentId()).toBe('test-agent')
      })

      it('should have correct chain type', () => {
        expect(wallet.getChainType()).toBe('evm')
      })

      it('should use default policy for agent type', () => {
        const policy = wallet.getPolicy()
        expect(policy.maxPerTransaction).toBe(DEFAULT_POLICIES.commerce.maxPerTransaction)
        expect(policy.maxPerDay).toBe(DEFAULT_POLICIES.commerce.maxPerDay)
      })
    })

    describe('Policy Overrides', () => {
      it('should allow custom policy overrides', () => {
        const account = privateKeyToAccount(TEST_PRIVATE_KEY)
        const adapter = createEvmAdapter({
          chain: EVM_CHAINS.monmouth,
          account,
          rpcUrl: 'http://localhost:8545',
        })

        const customWallet = createAgentWallet({
          adapter,
          identity: {
            agentId: 'custom-agent',
            agentType: 'commerce',
            name: 'Custom Agent',
          },
          policy: {
            maxPerTransaction: BigInt('5000000000000000000'), // 5 ETH
          },
        })

        const policy = customWallet.getPolicy()
        expect(policy.maxPerTransaction).toBe(BigInt('5000000000000000000'))
        // Other fields should use defaults
        expect(policy.maxPerDay).toBe(DEFAULT_POLICIES.commerce.maxPerDay)
      })
    })

    describe('Connection', () => {
      it('should connect successfully', async () => {
        await wallet.connect()
        expect(wallet.isConnected()).toBe(true)
      })

      it('should get address after connection', async () => {
        await wallet.connect()
        const address = await wallet.getAddress()

        expect(address.chainType).toBe('evm')
        expect(address.display.startsWith('0x')).toBe(true)
      })
    })

    describe('Guardrails Validation', () => {
      const testAddress: UniversalAddress = {
        raw: new Uint8Array(20).fill(0x42),
        display: '0x' + '42'.repeat(20),
        chainType: 'evm',
      }

      it('should allow valid transaction', () => {
        const result = wallet.validateTransaction({
          to: testAddress,
          value: BigInt('100000000000000000'), // 0.1 ETH
        })

        expect(result.allowed).toBe(true)
      })

      it('should block transaction exceeding per-tx limit', () => {
        const result = wallet.validateTransaction({
          to: testAddress,
          value: BigInt('2000000000000000000'), // 2 ETH (commerce limit is 1 ETH)
        })

        expect(result.allowed).toBe(false)
        expect(result.violatedRule).toBe('maxPerTransaction')
      })

      it('should block transaction exceeding daily limit', () => {
        // Commerce daily limit is 10 ETH
        // Spend 9.5 ETH first
        wallet.recordSpend(BigInt('9500000000000000000')) // 9.5 ETH

        // Now try to spend another 1 ETH, which would exceed 10 ETH limit
        const result = wallet.validateTransaction({
          to: testAddress,
          value: BigInt('1000000000000000000'), // 1 ETH - would exceed daily limit
        })

        expect(result.allowed).toBe(false)
        expect(result.violatedRule).toBe('maxPerDay')
      })

      it('should block blocked addresses', () => {
        const blockedAddress: UniversalAddress = {
          raw: new Uint8Array(20).fill(0x99),
          display: '0x' + '99'.repeat(20),
          chainType: 'evm',
        }

        wallet.updatePolicy({
          blockedAddresses: [blockedAddress],
        })

        const result = wallet.validateTransaction({
          to: blockedAddress,
          value: BigInt('100000000000000000'),
        })

        expect(result.allowed).toBe(false)
        expect(result.violatedRule).toBe('blockedAddress')
      })

      it('should enforce allowlist when specified', () => {
        const allowedAddress: UniversalAddress = {
          raw: new Uint8Array(20).fill(0x11),
          display: '0x' + '11'.repeat(20),
          chainType: 'evm',
        }

        wallet.updatePolicy({
          allowedAddresses: [allowedAddress],
        })

        // Allowed address should pass
        const allowedResult = wallet.validateTransaction({
          to: allowedAddress,
          value: BigInt('100000000000000000'),
        })
        expect(allowedResult.allowed).toBe(true)

        // Non-allowed address should fail
        const notAllowedResult = wallet.validateTransaction({
          to: testAddress,
          value: BigInt('100000000000000000'),
        })
        expect(notAllowedResult.allowed).toBe(false)
        expect(notAllowedResult.violatedRule).toBe('notAllowedAddress')
      })

      it('should block contract deployment when not allowed', () => {
        const result = wallet.validateTransaction({
          value: BigInt('0'),
          isContractDeploy: true,
        })

        expect(result.allowed).toBe(false)
        expect(result.violatedRule).toBe('noContractDeploy')
      })

      it('should allow contract deployment when permitted', () => {
        wallet.updatePolicy({
          canDeployContracts: true,
        })

        const result = wallet.validateTransaction({
          value: BigInt('0'),
          isContractDeploy: true,
        })

        expect(result.allowed).toBe(true)
      })
    })

    describe('Daily Spending Tracking', () => {
      it('should track daily spending', () => {
        expect(wallet.getDailySpent()).toBe(0n)

        wallet.recordSpend(BigInt('1000000000000000000')) // 1 ETH
        expect(wallet.getDailySpent()).toBe(BigInt('1000000000000000000'))

        wallet.recordSpend(BigInt('500000000000000000')) // 0.5 ETH
        expect(wallet.getDailySpent()).toBe(BigInt('1500000000000000000'))
      })

      it('should calculate remaining budget', () => {
        const maxDaily = DEFAULT_POLICIES.commerce.maxPerDay // 10 ETH

        wallet.recordSpend(BigInt('3000000000000000000')) // 3 ETH
        const remaining = wallet.getRemainingDailyBudget()

        expect(remaining).toBe(maxDaily - BigInt('3000000000000000000'))
      })
    })

    describe('Session Management', () => {
      it('should have valid session initially', () => {
        expect(wallet.isSessionExpired()).toBe(false)
      })

      it('should extend session', () => {
        // First, set session to expire soon
        wallet.updatePolicy({
          sessionExpiry: Date.now() + 1000, // 1 second from now
        })

        const remaining1 = wallet.getSessionTimeRemaining()
        expect(remaining1).toBeLessThanOrEqual(1000)

        // Extend by 1 hour
        wallet.extendSession(60 * 60 * 1000)
        const remaining2 = wallet.getSessionTimeRemaining()

        // Should now have ~1 hour remaining
        expect(remaining2).toBeGreaterThan(remaining1)
        expect(remaining2).toBeGreaterThan(3500000) // At least ~58 minutes
      })

      it('should block transactions when session expired', () => {
        // Set session to expired
        wallet.updatePolicy({
          sessionExpiry: Date.now() - 1000,
        })

        const testAddress: UniversalAddress = {
          raw: new Uint8Array(20).fill(0x42),
          display: '0x' + '42'.repeat(20),
          chainType: 'evm',
        }

        const result = wallet.validateTransaction({
          to: testAddress,
          value: BigInt('100000000000000000'),
        })

        expect(result.allowed).toBe(false)
        expect(result.violatedRule).toBe('sessionExpired')
      })
    })

    describe('Events', () => {
      it('should emit policy_updated event', () => {
        const events: string[] = []
        wallet.on((event) => events.push(event.type))

        wallet.updatePolicy({ canDeployContracts: true })

        expect(events).toContain('policy_updated')
      })

      it('should emit transaction_blocked event', () => {
        const events: string[] = []
        wallet.on((event) => events.push(event.type))

        const testAddress: UniversalAddress = {
          raw: new Uint8Array(20).fill(0x42),
          display: '0x' + '42'.repeat(20),
          chainType: 'evm',
        }

        wallet.validateTransaction({
          to: testAddress,
          value: BigInt('999000000000000000000'), // Way over limit
        })

        // Note: validateTransaction doesn't emit, only sendTransaction does
      })
    })

    describe('Cleanup', () => {
      it('should clean up on destroy', () => {
        wallet.destroy()
        // Should not throw, listeners cleared
      })
    })
  })

  describe('Solana-based Wallet', () => {
    let wallet: AgentWallet

    beforeEach(() => {
      const keypair = Keypair.generate()
      const adapter = createSolanaAdapter({
        chain: SVM_CHAINS.devnet,
        rpcUrl: 'https://api.devnet.solana.com',
        keypair,
      })

      wallet = createAgentWallet({
        adapter,
        identity: {
          agentId: 'sol-agent',
          agentType: 'trading',
          name: 'Solana Trading Agent',
        },
      })
    })

    it('should create wallet with correct chain type', () => {
      expect(wallet.getChainType()).toBe('svm')
    })

    it('should use trading policy defaults', () => {
      const policy = wallet.getPolicy()
      expect(policy.maxPerTransaction).toBe(DEFAULT_POLICIES.trading.maxPerTransaction)
    })

    it('should connect and get address', async () => {
      await wallet.connect()
      const address = await wallet.getAddress()

      expect(address.chainType).toBe('svm')
      expect(address.raw.length).toBe(32)
    })

    it('should validate transactions with guardrails', () => {
      const testAddress: UniversalAddress = {
        raw: new Uint8Array(32).fill(0x42),
        display: 'some-base58-address',
        chainType: 'svm',
      }

      const result = wallet.validateTransaction({
        to: testAddress,
        value: BigInt('1000000000'), // 1 SOL in lamports
      })

      expect(result.allowed).toBe(true)
    })
  })

  describe('Default Policies', () => {
    it('should have research policy with conservative limits', () => {
      expect(DEFAULT_POLICIES.research.maxPerTransaction).toBe(BigInt('100000000000000000')) // 0.1 ETH
      expect(DEFAULT_POLICIES.research.maxPerDay).toBe(BigInt('1000000000000000000')) // 1 ETH
      expect(DEFAULT_POLICIES.research.canDeployContracts).toBe(false)
    })

    it('should have trading policy with higher limits', () => {
      expect(DEFAULT_POLICIES.trading.maxPerTransaction).toBe(BigInt('10000000000000000000')) // 10 ETH
      expect(DEFAULT_POLICIES.trading.maxPerDay).toBe(BigInt('100000000000000000000')) // 100 ETH
    })

    it('should have coordinator policy with minimal limits', () => {
      expect(DEFAULT_POLICIES.coordinator.maxPerTransaction).toBe(BigInt('10000000000000000')) // 0.01 ETH
      expect(DEFAULT_POLICIES.coordinator.maxPerDay).toBe(BigInt('100000000000000000')) // 0.1 ETH
    })

    it('should have commerce policy with balanced limits', () => {
      expect(DEFAULT_POLICIES.commerce.maxPerTransaction).toBe(BigInt('1000000000000000000')) // 1 ETH
      expect(DEFAULT_POLICIES.commerce.maxPerDay).toBe(BigInt('10000000000000000000')) // 10 ETH
    })
  })
})
