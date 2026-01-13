/**
 * Global Teardown for E2E Tests
 *
 * Runs once after all tests to:
 * - Stop Anvil local blockchain
 * - Clean up any resources
 */

import { stopAnvil, isAnvilRunning } from './anvil'

async function globalTeardown(): Promise<void> {
  console.log('\n[Global Teardown] Cleaning up E2E test environment...\n')

  // Stop Anvil if we started it
  if (isAnvilRunning()) {
    console.log('[Global Teardown] Stopping Anvil...')
    stopAnvil()
    console.log('[Global Teardown] Anvil stopped')
  } else {
    console.log('[Global Teardown] Anvil was running externally, leaving it running')
  }

  console.log('\n[Global Teardown] Cleanup complete\n')
}

export default globalTeardown
