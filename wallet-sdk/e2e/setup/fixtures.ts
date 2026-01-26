/**
 * E2E Test Fixtures
 *
 * Provides shared test context including:
 * - Page fixtures with mocked wallet
 * - Chain interaction helpers
 * - Test account access
 */

import { test as base, type Page, type BrowserContext } from '@playwright/test'
import { getTestClient, getPublicClient, takeSnapshot, revertToSnapshot } from './anvil'
import { TEST_ACCOUNTS, getTestAccount, type TEST_MNEMONIC } from './wallets'
import type { TestClient, PublicClient, Address, Hex } from 'viem'

/**
 * Extended test fixtures for Monmouth Wallet SDK E2E tests
 */
export interface MonmouthFixtures {
  /** Test client for Anvil manipulation */
  testClient: TestClient

  /** Public client for reading chain state */
  publicClient: PublicClient

  /** Named test accounts */
  accounts: typeof TEST_ACCOUNTS

  /** Helper to get account by index */
  getAccount: typeof getTestAccount

  /** Page with mocked wallet provider */
  walletPage: Page

  /** Snapshot ID for state isolation */
  snapshotId: string
}

/**
 * Mock wallet provider injected into the page
 * Simulates wallet connection without actual browser extension
 */
async function injectMockWalletProvider(page: Page, accountIndex: number = 0): Promise<void> {
  const account = getTestAccount(accountIndex)

  await page.addInitScript(
    ({ address, chainId }) => {
      // Mock ethereum provider
      const mockProvider = {
        isMetaMask: true,
        isConnected: () => true,
        selectedAddress: address,
        chainId: `0x${chainId.toString(16)}`,

        request: async ({ method, params }: { method: string; params?: unknown[] }) => {
          switch (method) {
            case 'eth_requestAccounts':
            case 'eth_accounts':
              return [address]

            case 'eth_chainId':
              return `0x${chainId.toString(16)}`

            case 'net_version':
              return chainId.toString()

            case 'wallet_switchEthereumChain':
              return null

            case 'eth_getBalance':
              // Return a mock balance (10000 ETH in wei)
              return '0x' + (BigInt(10000) * BigInt(10 ** 18)).toString(16)

            case 'eth_sendTransaction':
              // Return mock transaction hash
              return '0x' + '0'.repeat(64)

            case 'personal_sign':
            case 'eth_signTypedData_v4':
              // Return mock signature
              return '0x' + '0'.repeat(130)

            default:
              console.warn(`[Mock Wallet] Unhandled method: ${method}`, params)
              throw new Error(`Method ${method} not supported by mock wallet`)
          }
        },

        on: (event: string, callback: (data: unknown) => void) => {
          console.log(`[Mock Wallet] Event listener registered: ${event}`)
          // Store callbacks for potential use
          if (event === 'accountsChanged') {
            // Could trigger callback([address]) when needed
          }
          if (event === 'chainChanged') {
            // Could trigger callback(chainId) when needed
          }
        },

        removeListener: (event: string) => {
          console.log(`[Mock Wallet] Event listener removed: ${event}`)
        },

        removeAllListeners: () => {
          console.log('[Mock Wallet] All listeners removed')
        },
      }

      // @ts-expect-error - Injecting into window
      window.ethereum = mockProvider
    },
    { address: account.address, chainId: 31337 }
  )
}

/**
 * Extended test with Monmouth fixtures
 */
export const test = base.extend<MonmouthFixtures>({
  // Test client for Anvil manipulation
  testClient: async ({}, use) => {
    const client = getTestClient()
    await use(client)
  },

  // Public client for reading chain state
  publicClient: async ({}, use) => {
    const client = getPublicClient()
    await use(client)
  },

  // Named test accounts
  accounts: async ({}, use) => {
    await use(TEST_ACCOUNTS)
  },

  // Helper function
  getAccount: async ({}, use) => {
    await use(getTestAccount)
  },

  // Snapshot for state isolation between tests
  snapshotId: async ({ testClient }, use) => {
    const snapshotId = await takeSnapshot()
    await use(snapshotId)
    // Revert after test
    await revertToSnapshot(snapshotId)
  },

  // Page with mocked wallet provider
  walletPage: async ({ page }, use) => {
    // Inject mock wallet before navigation
    await injectMockWalletProvider(page, 1) // Use Alice account by default
    await use(page)
  },
})

/**
 * Re-export expect for convenience
 */
export { expect } from '@playwright/test'

/**
 * Helper to wait for wallet connection in the UI
 */
export async function waitForWalletConnection(page: Page, timeout = 10000): Promise<void> {
  // Wait for a common indicator that wallet is connected
  // Adjust selectors based on your test app's UI
  await page.waitForSelector('[data-testid="connected-address"], .wallet-connected', {
    state: 'visible',
    timeout,
  })
}

/**
 * Helper to connect wallet via UI
 */
export async function connectWallet(page: Page): Promise<void> {
  // Click connect button - adjust selector based on test app
  const connectButton = page.locator(
    '[data-testid="connect-wallet"], button:has-text("Connect"), button:has-text("Connect Wallet")'
  )
  await connectButton.first().click()

  // Wait for connection
  await waitForWalletConnection(page)
}

/**
 * Helper to initialize agent via UI
 */
export async function initializeAgent(
  page: Page,
  options: {
    agentId?: string
    agentType?: string
    agentName?: string
  } = {}
): Promise<void> {
  const { agentId = 'test-agent', agentType = 'research', agentName = 'Test Agent' } = options

  // Fill agent initialization form - adjust selectors based on test app
  const agentIdInput = page.locator('[data-testid="agent-id"], input[name="agentId"]')
  if (await agentIdInput.isVisible()) {
    await agentIdInput.fill(agentId)
  }

  const agentTypeSelect = page.locator('[data-testid="agent-type"], select[name="agentType"]')
  if (await agentTypeSelect.isVisible()) {
    await agentTypeSelect.selectOption(agentType)
  }

  const agentNameInput = page.locator('[data-testid="agent-name"], input[name="agentName"]')
  if (await agentNameInput.isVisible()) {
    await agentNameInput.fill(agentName)
  }

  // Submit initialization
  const initButton = page.locator(
    '[data-testid="initialize-agent"], button:has-text("Initialize")'
  )
  await initButton.click()

  // Wait for initialization to complete
  await page.waitForSelector('[data-testid="agent-initialized"], .agent-ready', {
    state: 'visible',
    timeout: 10000,
  })
}
