/**
 * Global Setup for E2E Tests
 *
 * Runs once before all tests to:
 * - Start Anvil local blockchain
 * - Fund test accounts
 * - Deploy any necessary contracts
 */

import { startAnvil, fundTestAccount, getAnvilRpcUrl } from './anvil'
import { TEST_ACCOUNTS } from './wallets'

async function globalSetup(): Promise<void> {
  console.log('\n[Global Setup] Starting E2E test environment...\n')

  // Start Anvil if not already running (e.g., in external process)
  const anvilUrl = getAnvilRpcUrl()
  let anvilReady = false

  // Check if Anvil is already running externally
  try {
    const response = await fetch(anvilUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 1,
      }),
    })
    if (response.ok) {
      console.log('[Global Setup] Anvil already running externally')
      anvilReady = true
    }
  } catch {
    // Anvil not running, we'll start it
  }

  if (!anvilReady) {
    console.log('[Global Setup] Starting Anvil...')
    await startAnvil({
      port: 8545,
      chainId: 31337,
      accounts: 10,
      balance: 10000,
    })
    console.log('[Global Setup] Anvil started successfully')
  }

  // Fund named test accounts with additional ETH if needed
  console.log('[Global Setup] Verifying test account balances...')
  for (const [name, account] of Object.entries(TEST_ACCOUNTS)) {
    try {
      await fundTestAccount(account.address, 10000)
      console.log(`[Global Setup] Account ${name}: ${account.address} funded`)
    } catch (error) {
      console.warn(`[Global Setup] Could not fund ${name}:`, error)
    }
  }

  console.log('\n[Global Setup] E2E test environment ready\n')
}

export default globalSetup
