/**
 * Anvil Local Chain Helpers
 *
 * Provides utilities for spawning and managing a local Anvil node
 * for E2E testing. Includes helpers for funding test accounts and
 * creating viem test clients.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import {
  createTestClient,
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  type Address,
  type TestClient,
  type PublicClient,
  type WalletClient,
} from 'viem'
import { foundry } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'

/**
 * Anvil configuration
 */
export interface AnvilConfig {
  /** Port to run Anvil on */
  port?: number
  /** Chain ID to use */
  chainId?: number
  /** Block time in seconds (0 for auto-mine) */
  blockTime?: number
  /** Number of accounts to generate */
  accounts?: number
  /** Balance for each account in ETH */
  balance?: number
  /** Fork URL (optional) */
  forkUrl?: string
  /** Fork block number (optional) */
  forkBlockNumber?: number
}

/**
 * Default Anvil configuration
 */
const DEFAULT_CONFIG: Required<Omit<AnvilConfig, 'forkUrl' | 'forkBlockNumber'>> = {
  port: 8545,
  chainId: 31337,
  blockTime: 0,
  accounts: 10,
  balance: 10000,
}

let anvilProcess: ChildProcess | null = null

/**
 * Start an Anvil local blockchain instance
 *
 * @param config - Anvil configuration options
 * @returns Promise that resolves when Anvil is ready
 */
export async function startAnvil(config: AnvilConfig = {}): Promise<void> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }

  if (anvilProcess) {
    console.log('[Anvil] Already running, skipping start')
    return
  }

  const args = [
    '--port',
    mergedConfig.port.toString(),
    '--chain-id',
    mergedConfig.chainId.toString(),
    '--accounts',
    mergedConfig.accounts.toString(),
    '--balance',
    mergedConfig.balance.toString(),
  ]

  if (mergedConfig.blockTime > 0) {
    args.push('--block-time', mergedConfig.blockTime.toString())
  }

  if (config.forkUrl) {
    args.push('--fork-url', config.forkUrl)
    if (config.forkBlockNumber) {
      args.push('--fork-block-number', config.forkBlockNumber.toString())
    }
  }

  return new Promise((resolve, reject) => {
    console.log('[Anvil] Starting with args:', args.join(' '))

    anvilProcess = spawn('anvil', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    })

    let started = false
    const timeout = setTimeout(() => {
      if (!started) {
        reject(new Error('[Anvil] Failed to start within 30 seconds'))
        stopAnvil()
      }
    }, 30_000)

    anvilProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString()
      console.log('[Anvil]', output.trim())

      // Anvil outputs "Listening on..." when ready
      if (output.includes('Listening on')) {
        started = true
        clearTimeout(timeout)
        // Give it a moment to fully initialize
        setTimeout(resolve, 500)
      }
    })

    anvilProcess.stderr?.on('data', (data: Buffer) => {
      console.error('[Anvil Error]', data.toString().trim())
    })

    anvilProcess.on('error', (error) => {
      clearTimeout(timeout)
      console.error('[Anvil] Process error:', error)
      reject(error)
    })

    anvilProcess.on('exit', (code) => {
      if (!started) {
        clearTimeout(timeout)
        reject(new Error(`[Anvil] Process exited with code ${code}`))
      }
      anvilProcess = null
    })
  })
}

/**
 * Stop the running Anvil instance
 */
export function stopAnvil(): void {
  if (anvilProcess) {
    console.log('[Anvil] Stopping...')
    anvilProcess.kill('SIGTERM')
    anvilProcess = null
  }
}

/**
 * Check if Anvil is running
 */
export function isAnvilRunning(): boolean {
  return anvilProcess !== null
}

/**
 * Get the Anvil RPC URL
 */
export function getAnvilRpcUrl(port: number = DEFAULT_CONFIG.port): string {
  return `http://127.0.0.1:${port}`
}

/**
 * Get a viem test client connected to Anvil
 *
 * Test client provides special methods like:
 * - mine() - Mine blocks
 * - setBalance() - Set account balance
 * - impersonateAccount() - Impersonate accounts
 * - snapshot/revert() - State snapshots
 */
export function getTestClient(port: number = DEFAULT_CONFIG.port): TestClient {
  return createTestClient({
    chain: foundry,
    mode: 'anvil',
    transport: http(getAnvilRpcUrl(port)),
  })
}

/**
 * Get a viem public client connected to Anvil
 *
 * Public client provides read-only methods like:
 * - getBalance()
 * - getBlock()
 * - readContract()
 */
export function getPublicClient(port: number = DEFAULT_CONFIG.port): PublicClient {
  return createPublicClient({
    chain: foundry,
    transport: http(getAnvilRpcUrl(port)),
  })
}

/**
 * Get a viem wallet client connected to Anvil
 *
 * Wallet client provides write methods like:
 * - sendTransaction()
 * - signMessage()
 * - writeContract()
 */
export function getWalletClient(
  privateKey: `0x${string}`,
  port: number = DEFAULT_CONFIG.port
): WalletClient {
  const account = privateKeyToAccount(privateKey)
  return createWalletClient({
    account,
    chain: foundry,
    transport: http(getAnvilRpcUrl(port)),
  })
}

/**
 * Fund a test account with ETH
 *
 * @param address - Address to fund
 * @param amount - Amount in ETH (default: 100)
 * @param port - Anvil port
 */
export async function fundTestAccount(
  address: Address,
  amount: number | bigint = 100,
  port: number = DEFAULT_CONFIG.port
): Promise<void> {
  const testClient = getTestClient(port)
  const value = typeof amount === 'bigint' ? amount : parseEther(amount.toString())

  await testClient.setBalance({
    address,
    value,
  })

  console.log(`[Anvil] Funded ${address} with ${amount} ETH`)
}

/**
 * Take a state snapshot (returns snapshot ID)
 */
export async function takeSnapshot(port: number = DEFAULT_CONFIG.port): Promise<string> {
  const testClient = getTestClient(port)
  const snapshot = await testClient.snapshot()
  console.log(`[Anvil] Snapshot taken: ${snapshot}`)
  return snapshot
}

/**
 * Revert to a state snapshot
 */
export async function revertToSnapshot(
  snapshotId: string,
  port: number = DEFAULT_CONFIG.port
): Promise<void> {
  const testClient = getTestClient(port)
  await testClient.revert({ id: snapshotId as `0x${string}` })
  console.log(`[Anvil] Reverted to snapshot: ${snapshotId}`)
}

/**
 * Mine a specified number of blocks
 */
export async function mineBlocks(
  blocks: number = 1,
  port: number = DEFAULT_CONFIG.port
): Promise<void> {
  const testClient = getTestClient(port)
  await testClient.mine({ blocks })
  console.log(`[Anvil] Mined ${blocks} blocks`)
}

/**
 * Advance time by a specified number of seconds
 */
export async function advanceTime(
  seconds: number,
  port: number = DEFAULT_CONFIG.port
): Promise<void> {
  const testClient = getTestClient(port)
  await testClient.increaseTime({ seconds })
  await testClient.mine({ blocks: 1 })
  console.log(`[Anvil] Advanced time by ${seconds} seconds`)
}

/**
 * Get the current block number
 */
export async function getBlockNumber(port: number = DEFAULT_CONFIG.port): Promise<bigint> {
  const publicClient = getPublicClient(port)
  return publicClient.getBlockNumber()
}

/**
 * Get the balance of an address
 */
export async function getBalance(
  address: Address,
  port: number = DEFAULT_CONFIG.port
): Promise<bigint> {
  const publicClient = getPublicClient(port)
  return publicClient.getBalance({ address })
}

/**
 * Wait for a transaction to be mined
 */
export async function waitForTransaction(
  hash: `0x${string}`,
  port: number = DEFAULT_CONFIG.port
): Promise<void> {
  const publicClient = getPublicClient(port)
  await publicClient.waitForTransactionReceipt({ hash })
}
