/**
 * Core utilities tests
 */

import { describe, it, expect } from 'vitest'
import {
  bytesToHex,
  hexToBytes,
  bytesToBase58,
  base58ToBytes,
  createAddress,
  parseAddress,
  isValidAddress,
  addressEquals,
  formatTokenAmount,
  parseTokenAmount,
  createNativeToken,
  createTokenAmount,
} from '../core/utils'
import type { ChainType } from '../core/types'

describe('Core Utilities', () => {
  describe('Hex Encoding', () => {
    it('should convert bytes to hex', () => {
      const bytes = new Uint8Array([0x12, 0x34, 0xab, 0xcd])
      expect(bytesToHex(bytes)).toBe('0x1234abcd')
    })

    it('should convert hex to bytes', () => {
      const hex = '0x1234abcd'
      const bytes = hexToBytes(hex)
      expect(bytes).toEqual(new Uint8Array([0x12, 0x34, 0xab, 0xcd]))
    })

    it('should handle hex without 0x prefix', () => {
      const hex = '1234abcd'
      const bytes = hexToBytes(hex)
      expect(bytes).toEqual(new Uint8Array([0x12, 0x34, 0xab, 0xcd]))
    })

    it('should roundtrip hex encoding', () => {
      const original = new Uint8Array([0x00, 0xff, 0x42, 0x99])
      const hex = bytesToHex(original)
      const decoded = hexToBytes(hex)
      expect(decoded).toEqual(original)
    })
  })

  describe('Base58 Encoding', () => {
    it('should convert bytes to base58', () => {
      // Known test vector
      const bytes = new Uint8Array([0x00, 0x01, 0x02, 0x03])
      const encoded = bytesToBase58(bytes)
      expect(encoded.length).toBeGreaterThan(0)
    })

    it('should convert base58 to bytes', () => {
      // Encode and decode should roundtrip
      const original = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05])
      const encoded = bytesToBase58(original)
      const decoded = base58ToBytes(encoded)
      expect(decoded).toEqual(original)
    })

    it('should handle leading zeros', () => {
      const bytes = new Uint8Array([0x00, 0x00, 0x01, 0x02])
      const encoded = bytesToBase58(bytes)
      expect(encoded.startsWith('11')).toBe(true) // Leading zeros become '1's
    })
  })

  describe('Address Utilities', () => {
    it('should create EVM address', () => {
      const bytes = new Uint8Array(20).fill(0x42)
      const address = createAddress(bytes, 'evm')

      expect(address.chainType).toBe('evm')
      expect(address.raw).toEqual(bytes)
      expect(address.display.startsWith('0x')).toBe(true)
      expect(address.display.length).toBe(42) // 0x + 40 hex chars
    })

    it('should create Solana address', () => {
      const bytes = new Uint8Array(32).fill(0x42)
      const address = createAddress(bytes, 'svm')

      expect(address.chainType).toBe('svm')
      expect(address.raw).toEqual(bytes)
      expect(address.display.length).toBeGreaterThan(30) // Base58 encoded
    })

    it('should parse EVM address', () => {
      const hex = '0x' + '42'.repeat(20)
      const address = parseAddress(hex, 'evm')

      expect(address.chainType).toBe('evm')
      expect(address.display.toLowerCase()).toBe(hex.toLowerCase())
    })

    it('should validate EVM addresses', () => {
      expect(isValidAddress('0x' + '00'.repeat(20), 'evm')).toBe(true)
      expect(isValidAddress('0x' + '00'.repeat(19), 'evm')).toBe(false)
      expect(isValidAddress('invalid', 'evm')).toBe(false)
    })

    it('should compare addresses', () => {
      const bytes1 = new Uint8Array(20).fill(0x42)
      const bytes2 = new Uint8Array(20).fill(0x42)
      const bytes3 = new Uint8Array(20).fill(0x43)

      const addr1 = createAddress(bytes1, 'evm')
      const addr2 = createAddress(bytes2, 'evm')
      const addr3 = createAddress(bytes3, 'evm')
      const addr4 = createAddress(new Uint8Array(32).fill(0x42), 'svm')

      expect(addressEquals(addr1, addr2)).toBe(true)
      expect(addressEquals(addr1, addr3)).toBe(false)
      expect(addressEquals(addr1, addr4)).toBe(false) // Different chain types
    })
  })

  describe('Token Utilities', () => {
    it('should format token amount with 18 decimals', () => {
      const amount = BigInt('1000000000000000000') // 1 ETH
      expect(formatTokenAmount(amount, 18)).toBe('1')
    })

    it('should format token amount with fractional part', () => {
      const amount = BigInt('1500000000000000000') // 1.5 ETH
      expect(formatTokenAmount(amount, 18)).toBe('1.5')
    })

    it('should format token amount with trailing zeros trimmed', () => {
      const amount = BigInt('1100000000000000000') // 1.1 ETH
      expect(formatTokenAmount(amount, 18)).toBe('1.1')
    })

    it('should parse token amount string', () => {
      const parsed = parseTokenAmount('1.5', 18)
      expect(parsed).toBe(BigInt('1500000000000000000'))
    })

    it('should parse whole token amount', () => {
      const parsed = parseTokenAmount('10', 18)
      expect(parsed).toBe(BigInt('10000000000000000000'))
    })

    it('should create native token', () => {
      const token = createNativeToken('evm', 'ETH', 18)

      expect(token.chainType).toBe('evm')
      expect(token.symbol).toBe('ETH')
      expect(token.decimals).toBe(18)
      expect(token.address).toBe('native')
    })

    it('should create token amount', () => {
      const token = createNativeToken('evm', 'ETH', 18)
      const amount = createTokenAmount(BigInt('2000000000000000000'), token)

      expect(amount.raw).toBe(BigInt('2000000000000000000'))
      expect(amount.formatted).toBe('2')
      expect(amount.token).toBe(token)
    })

    it('should handle Solana decimals (9)', () => {
      const amount = BigInt('1000000000') // 1 SOL
      expect(formatTokenAmount(amount, 9)).toBe('1')

      const parsed = parseTokenAmount('1.5', 9)
      expect(parsed).toBe(BigInt('1500000000'))
    })
  })
})
