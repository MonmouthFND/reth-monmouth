/**
 * Test Wallet Management
 *
 * Provides deterministic test accounts derived from a known mnemonic
 * for consistent and reproducible E2E tests.
 */

import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts'
import type { Address, Hex, PrivateKeyAccount, HDAccount } from 'viem'

/**
 * Standard Anvil/Hardhat test mnemonic
 * DO NOT use this mnemonic with real funds
 */
export const TEST_MNEMONIC =
  'test test test test test test test test test test test junk'

/**
 * Pre-generated Anvil default private keys (first 10 accounts)
 * These correspond to the TEST_MNEMONIC above
 */
export const ANVIL_PRIVATE_KEYS: readonly Hex[] = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
  '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
  '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e',
  '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356',
  '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97',
  '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6',
] as const

/**
 * Pre-generated Anvil default addresses (first 10 accounts)
 */
export const ANVIL_ADDRESSES: readonly Address[] = [
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
  '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
  '0x976EA74026E726554dB657fA54763abd0C3a0aa9',
  '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955',
  '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f',
  '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720',
] as const

/**
 * Named test accounts for better test readability
 */
export const TEST_ACCOUNTS = {
  /** Deployer account - use for contract deployments */
  deployer: { index: 0, address: ANVIL_ADDRESSES[0], privateKey: ANVIL_PRIVATE_KEYS[0] },
  /** Alice - primary test user */
  alice: { index: 1, address: ANVIL_ADDRESSES[1], privateKey: ANVIL_PRIVATE_KEYS[1] },
  /** Bob - secondary test user */
  bob: { index: 2, address: ANVIL_ADDRESSES[2], privateKey: ANVIL_PRIVATE_KEYS[2] },
  /** Charlie - third test user */
  charlie: { index: 3, address: ANVIL_ADDRESSES[3], privateKey: ANVIL_PRIVATE_KEYS[3] },
  /** Arbiter - for escrow dispute resolution */
  arbiter: { index: 4, address: ANVIL_ADDRESSES[4], privateKey: ANVIL_PRIVATE_KEYS[4] },
  /** Agent - AI agent test account */
  agent: { index: 5, address: ANVIL_ADDRESSES[5], privateKey: ANVIL_PRIVATE_KEYS[5] },
  /** Service provider account */
  serviceProvider: { index: 6, address: ANVIL_ADDRESSES[6], privateKey: ANVIL_PRIVATE_KEYS[6] },
  /** Merchant account */
  merchant: { index: 7, address: ANVIL_ADDRESSES[7], privateKey: ANVIL_PRIVATE_KEYS[7] },
  /** Reserve account */
  reserve1: { index: 8, address: ANVIL_ADDRESSES[8], privateKey: ANVIL_PRIVATE_KEYS[8] },
  reserve2: { index: 9, address: ANVIL_ADDRESSES[9], privateKey: ANVIL_PRIVATE_KEYS[9] },
} as const

/**
 * Get a test account by index (0-9 for Anvil defaults)
 *
 * @param index - Account index (0-9)
 * @returns Account details including address and private key
 */
export function getTestAccount(index: number): {
  index: number
  address: Address
  privateKey: Hex
  account: PrivateKeyAccount
} {
  if (index < 0 || index > 9) {
    throw new Error(`Invalid account index ${index}. Must be 0-9 for Anvil defaults.`)
  }

  return {
    index,
    address: ANVIL_ADDRESSES[index],
    privateKey: ANVIL_PRIVATE_KEYS[index],
    account: privateKeyToAccount(ANVIL_PRIVATE_KEYS[index]),
  }
}

/**
 * Derive a test account from the mnemonic at a specific index
 * Useful for generating accounts beyond the first 10
 *
 * @param index - Account index in the HD derivation path
 * @returns HD account derived from the mnemonic
 */
export function deriveTestAccount(index: number): HDAccount {
  return mnemonicToAccount(TEST_MNEMONIC, {
    addressIndex: index,
  })
}

/**
 * Get a named test account
 *
 * @param name - Account name (deployer, alice, bob, etc.)
 * @returns Account details
 */
export function getNamedAccount(
  name: keyof typeof TEST_ACCOUNTS
): (typeof TEST_ACCOUNTS)[typeof name] & { account: PrivateKeyAccount } {
  const accountInfo = TEST_ACCOUNTS[name]
  return {
    ...accountInfo,
    account: privateKeyToAccount(accountInfo.privateKey),
  }
}

/**
 * Create a random test account
 * Useful for testing with unknown addresses
 */
export function createRandomAccount(): PrivateKeyAccount {
  const randomBytes = new Uint8Array(32)
  crypto.getRandomValues(randomBytes)
  const privateKey = `0x${Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}` as Hex
  return privateKeyToAccount(privateKey)
}

/**
 * Type guard to check if an address is a known test account
 */
export function isKnownTestAccount(address: Address): boolean {
  return ANVIL_ADDRESSES.includes(address)
}

/**
 * Get the private key for a known test address
 */
export function getPrivateKeyForAddress(address: Address): Hex | undefined {
  const index = ANVIL_ADDRESSES.indexOf(address)
  if (index === -1) return undefined
  return ANVIL_PRIVATE_KEYS[index]
}

/**
 * Get all test accounts as an array
 */
export function getAllTestAccounts(): Array<{
  index: number
  address: Address
  privateKey: Hex
  account: PrivateKeyAccount
}> {
  return ANVIL_ADDRESSES.map((address, index) => ({
    index,
    address,
    privateKey: ANVIL_PRIVATE_KEYS[index],
    account: privateKeyToAccount(ANVIL_PRIVATE_KEYS[index]),
  }))
}
