/**
 * Utility functions for multi-chain operations
 */

import type { ChainType, TokenAmount, TokenId, UniversalAddress } from './types'

/** Base58 alphabet (Bitcoin style) */
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

/** Hex characters */
const HEX_CHARS = '0123456789abcdef'

// ============= Encoding Utilities =============

/** Convert bytes to hex string */
export function bytesToHex(bytes: Uint8Array): string {
  let hex = '0x'
  for (const byte of bytes) {
    hex += HEX_CHARS[byte >> 4] + HEX_CHARS[byte & 0x0f]
  }
  return hex
}

/** Convert hex string to bytes */
export function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.startsWith('0x') ? hex.slice(2) : hex
  if (normalized.length % 2 !== 0) {
    throw new Error('Invalid hex string length')
  }
  const bytes = new Uint8Array(normalized.length / 2)
  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = parseInt(normalized.slice(i, i + 2), 16)
  }
  return bytes
}

/** Encode bytes to base58 */
export function bytesToBase58(bytes: Uint8Array): string {
  // Count leading zeros
  let zeros = 0
  for (const byte of bytes) {
    if (byte === 0) zeros++
    else break
  }

  // Convert to base58
  const converted: number[] = []
  let num = BigInt('0x' + bytesToHex(bytes).slice(2) || '0')

  while (num > 0n) {
    converted.unshift(Number(num % 58n))
    num = num / 58n
  }

  // Add leading '1's for zeros
  return '1'.repeat(zeros) + converted.map((i) => BASE58_ALPHABET[i]).join('')
}

/** Decode base58 to bytes */
export function base58ToBytes(str: string): Uint8Array {
  // Count leading '1's
  let zeros = 0
  for (const char of str) {
    if (char === '1') zeros++
    else break
  }

  // Convert from base58
  let num = 0n
  for (const char of str.slice(zeros)) {
    const index = BASE58_ALPHABET.indexOf(char)
    if (index === -1) throw new Error(`Invalid base58 character: ${char}`)
    num = num * 58n + BigInt(index)
  }

  // Convert to bytes
  const hex = num.toString(16).padStart(2, '0')
  const bytes = hexToBytes(hex.length % 2 ? '0' + hex : hex)

  // Add leading zeros
  const result = new Uint8Array(zeros + bytes.length)
  result.set(bytes, zeros)
  return result
}

// ============= Address Utilities =============

/** Create a universal address from raw bytes */
export function createAddress(raw: Uint8Array, chainType: ChainType): UniversalAddress {
  return {
    raw,
    display: chainType === 'evm' ? bytesToHex(raw) : bytesToBase58(raw),
    chainType,
  }
}

/** Parse an address string to universal address */
export function parseAddress(input: string, chainType: ChainType): UniversalAddress {
  if (chainType === 'evm') {
    // EVM addresses are 20 bytes hex
    const normalized = input.toLowerCase()
    if (!/^0x[0-9a-f]{40}$/.test(normalized)) {
      throw new Error(`Invalid EVM address: ${input}`)
    }
    return createAddress(hexToBytes(normalized), 'evm')
  } else {
    // Solana addresses are 32 bytes base58
    const bytes = base58ToBytes(input)
    if (bytes.length !== 32) {
      throw new Error(`Invalid Solana address: ${input}`)
    }
    return createAddress(bytes, 'svm')
  }
}

/** Check if a string is a valid address for the given chain type */
export function isValidAddress(input: string, chainType: ChainType): boolean {
  try {
    parseAddress(input, chainType)
    return true
  } catch {
    return false
  }
}

/** Compare two universal addresses */
export function addressEquals(a: UniversalAddress, b: UniversalAddress): boolean {
  if (a.chainType !== b.chainType) return false
  if (a.raw.length !== b.raw.length) return false
  for (let i = 0; i < a.raw.length; i++) {
    if (a.raw[i] !== b.raw[i]) return false
  }
  return true
}

// ============= Token Utilities =============

/** Create a native token ID for a chain */
export function createNativeToken(
  chainType: ChainType,
  symbol: string,
  decimals: number
): TokenId {
  return {
    chainType,
    address: 'native',
    symbol,
    decimals,
  }
}

/** Format a token amount for display */
export function formatTokenAmount(amount: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals)
  const whole = amount / divisor
  const fraction = amount % divisor

  if (fraction === 0n) {
    return whole.toString()
  }

  const fractionStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${whole}.${fractionStr}`
}

/** Parse a token amount from string */
export function parseTokenAmount(amount: string, decimals: number): bigint {
  const parts = amount.split('.')
  const whole = BigInt(parts[0] || '0')
  const fraction = parts[1] || ''

  const fractionPadded = fraction.padEnd(decimals, '0').slice(0, decimals)
  const fractionValue = BigInt(fractionPadded || '0')

  return whole * 10n ** BigInt(decimals) + fractionValue
}

/** Create a token amount object */
export function createTokenAmount(raw: bigint, token: TokenId): TokenAmount {
  return {
    token,
    raw,
    formatted: formatTokenAmount(raw, token.decimals),
  }
}

// ============= Transaction Utilities =============

/** Extract function selector from call data (EVM) */
export function getFunctionSelector(data: Uint8Array): Uint8Array | null {
  if (data.length < 4) return null
  return data.slice(0, 4)
}

/** Check if transaction is a contract deployment (EVM) */
export function isContractDeployment(to: UniversalAddress | undefined): boolean {
  return to === undefined
}

// ============= BigInt JSON Serialization =============

/** JSON replacer for BigInt */
export function bigIntReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return { __type: 'bigint', value: value.toString() }
  }
  return value
}

/** JSON reviver for BigInt */
export function bigIntReviver(_key: string, value: unknown): unknown {
  if (
    value &&
    typeof value === 'object' &&
    '__type' in value &&
    (value as Record<string, unknown>).__type === 'bigint'
  ) {
    return BigInt((value as Record<string, string>).value)
  }
  return value
}
