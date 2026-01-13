/**
 * E2E Setup Module Exports
 *
 * Re-exports all setup utilities for convenient importing in tests.
 */

// Anvil helpers
export {
  startAnvil,
  stopAnvil,
  isAnvilRunning,
  getAnvilRpcUrl,
  getTestClient,
  getPublicClient,
  getWalletClient,
  fundTestAccount,
  takeSnapshot,
  revertToSnapshot,
  mineBlocks,
  advanceTime,
  getBlockNumber,
  getBalance,
  waitForTransaction,
  type AnvilConfig,
} from './anvil'

// Wallet helpers
export {
  TEST_MNEMONIC,
  ANVIL_PRIVATE_KEYS,
  ANVIL_ADDRESSES,
  TEST_ACCOUNTS,
  getTestAccount,
  deriveTestAccount,
  getNamedAccount,
  createRandomAccount,
  isKnownTestAccount,
  getPrivateKeyForAddress,
  getAllTestAccounts,
} from './wallets'

// Test fixtures
export {
  test,
  expect,
  waitForWalletConnection,
  connectWallet,
  initializeAgent,
  type MonmouthFixtures,
} from './fixtures'
