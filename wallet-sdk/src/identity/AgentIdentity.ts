/**
 * AgentIdentity - Decentralized identity management for agents
 *
 * Provides did:key based identity for agent-to-agent trust.
 * Uses the wallet's Ethereum address to derive a DID.
 *
 * @example
 * ```typescript
 * const identity = new AgentIdentityManager(wallet)
 * await identity.initialize()
 *
 * // Get DID for sharing
 * const did = identity.getDID()
 *
 * // Sign a message
 * const signed = await identity.signMessage('Hello')
 *
 * // Verify another agent
 * const result = await identity.verifyIdentity(otherDid, signature)
 * ```
 */

import type { Address, Hex } from 'viem'
import type { MonmouthWallet } from '../MonmouthWallet'
import {
  type DID,
  type AgentCapability,
  type IdentityDocument,
  type SignedIdentity,
  type VerificationResult,
  type AgentIdentityConfig,
  type IdentityEvent,
  type IdentityEventListener,
  type IdentitySignatureDomain,
  IdentityError,
  IDENTITY_SIGNATURE_TYPES,
  MULTIBASE_BASE58BTC_PREFIX,
} from './types'

// Base58 alphabet for encoding
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

/**
 * Simple base58 encoding
 */
function encodeBase58(bytes: Uint8Array): string {
  const digits = [0]

  for (const byte of bytes) {
    let carry = byte
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8
      digits[j] = carry % 58
      carry = (carry / 58) | 0
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = (carry / 58) | 0
    }
  }

  // Handle leading zeros
  let output = ''
  for (const byte of bytes) {
    if (byte === 0) {
      output += BASE58_ALPHABET[0]
    } else {
      break
    }
  }

  // Convert digits to string (reverse order)
  for (let i = digits.length - 1; i >= 0; i--) {
    output += BASE58_ALPHABET[digits[i]]
  }

  return output
}

/**
 * Simple base58 decoding
 */
function decodeBase58(str: string): Uint8Array {
  const bytes = [0]

  for (const char of str) {
    const value = BASE58_ALPHABET.indexOf(char)
    if (value === -1) {
      throw new IdentityError('INVALID_DID', `Invalid base58 character: ${char}`)
    }

    let carry = value
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58
      bytes[j] = carry & 0xff
      carry >>= 8
    }
    while (carry > 0) {
      bytes.push(carry & 0xff)
      carry >>= 8
    }
  }

  // Handle leading '1's
  let leadingZeros = 0
  for (const char of str) {
    if (char === BASE58_ALPHABET[0]) {
      leadingZeros++
    } else {
      break
    }
  }

  const result = new Uint8Array(leadingZeros + bytes.length)
  result.fill(0, 0, leadingZeros)
  for (let i = 0; i < bytes.length; i++) {
    result[leadingZeros + i] = bytes[bytes.length - 1 - i]
  }

  return result
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<AgentIdentityConfig> = {
  persist: true,
  storagePrefix: 'monmouth_identity_',
  defaultCapabilities: ['payments', 'signing'],
}

/**
 * AgentIdentityManager - Manages agent DID and verification
 */
export class AgentIdentityManager {
  private wallet: MonmouthWallet
  private config: Required<AgentIdentityConfig>
  private identity: IdentityDocument | null = null
  private listeners: Set<IdentityEventListener> = new Set()
  private signTypedData?: (params: {
    domain: IdentitySignatureDomain
    types: typeof IDENTITY_SIGNATURE_TYPES
    primaryType: 'Identity'
    message: Record<string, unknown>
  }) => Promise<Hex>

  constructor(
    wallet: MonmouthWallet,
    config?: AgentIdentityConfig,
    options?: {
      signTypedData?: (params: {
        domain: IdentitySignatureDomain
        types: typeof IDENTITY_SIGNATURE_TYPES
        primaryType: 'Identity'
        message: Record<string, unknown>
      }) => Promise<Hex>
    }
  ) {
    this.wallet = wallet
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.signTypedData = options?.signTypedData

    // Try to restore from storage
    this.restoreIdentity()
  }

  /**
   * Initialize or restore identity
   */
  async initialize(capabilities?: AgentCapability[]): Promise<IdentityDocument> {
    const address = this.wallet.getConnectedAddress()
    if (!address) {
      throw new IdentityError('NOT_INITIALIZED', 'Wallet not connected')
    }

    // Check if we already have an identity for this address
    if (this.identity && this.identity.controller === address) {
      return this.identity
    }

    // Generate new identity
    const did = this.generateDID(address)
    const walletIdentity = this.wallet.getIdentity()

    this.identity = {
      id: did,
      controller: address,
      agentType: walletIdentity.agentType,
      name: walletIdentity.name,
      capabilities: capabilities || this.config.defaultCapabilities,
      created: Date.now(),
      updated: Date.now(),
    }

    this.persistIdentity()
    this.emit({ type: 'identity_created', identity: this.identity })

    return this.identity
  }

  /**
   * Get the current identity document
   */
  getIdentity(): IdentityDocument | null {
    return this.identity ? { ...this.identity } : null
  }

  /**
   * Get the DID
   */
  getDID(): DID | null {
    return this.identity?.id || null
  }

  /**
   * Check if identity is initialized
   */
  isInitialized(): boolean {
    return this.identity !== null
  }

  /**
   * Generate a DID from an Ethereum address
   *
   * Uses did:key method with a deterministic derivation from the address.
   * Note: This is a simplified implementation. A production version would
   * use the actual public key from the wallet.
   */
  generateDID(address: Address): DID {
    // Convert address to bytes (remove 0x prefix)
    const addressBytes = new Uint8Array(
      (address.slice(2).match(/.{2}/g) || []).map((byte) => parseInt(byte, 16))
    )

    // Create a multicodec-prefixed key
    // Using 0xe7 for secp256k1 public key (simplified - real impl uses full pubkey)
    const prefixedKey = new Uint8Array(2 + addressBytes.length)
    prefixedKey[0] = 0xe7
    prefixedKey[1] = 0x01
    prefixedKey.set(addressBytes, 2)

    // Encode as base58btc with multibase prefix
    const encoded = MULTIBASE_BASE58BTC_PREFIX + encodeBase58(prefixedKey)

    return `did:key:${encoded}` as DID
  }

  /**
   * Extract address from a DID
   */
  extractAddressFromDID(did: DID): Address | null {
    try {
      // Parse did:key format
      if (!did.startsWith('did:key:z')) {
        return null
      }

      const encoded = did.slice(9) // Remove 'did:key:z'
      const decoded = decodeBase58(encoded)

      // Check multicodec prefix
      if (decoded[0] !== 0xe7 || decoded[1] !== 0x01) {
        return null
      }

      // Extract address bytes
      const addressBytes = decoded.slice(2)
      const address =
        '0x' + Array.from(addressBytes)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')

      return address as Address
    } catch {
      return null
    }
  }

  /**
   * Update identity capabilities
   */
  updateCapabilities(capabilities: AgentCapability[]): void {
    if (!this.identity) {
      throw new IdentityError('NOT_INITIALIZED', 'Identity not initialized')
    }

    this.identity = {
      ...this.identity,
      capabilities,
      updated: Date.now(),
    }

    this.persistIdentity()
    this.emit({ type: 'identity_updated', identity: this.identity })
  }

  /**
   * Update identity metadata
   */
  updateMetadata(metadata: Record<string, unknown>): void {
    if (!this.identity) {
      throw new IdentityError('NOT_INITIALIZED', 'Identity not initialized')
    }

    this.identity = {
      ...this.identity,
      metadata: { ...this.identity.metadata, ...metadata },
      updated: Date.now(),
    }

    this.persistIdentity()
    this.emit({ type: 'identity_updated', identity: this.identity })
  }

  /**
   * Sign the identity document
   */
  async signIdentity(): Promise<SignedIdentity> {
    if (!this.identity) {
      throw new IdentityError('NOT_INITIALIZED', 'Identity not initialized')
    }

    const signature = await this.createSignature(this.identity)

    this.emit({ type: 'identity_signed', did: this.identity.id })

    return {
      document: { ...this.identity },
      signature,
      signedAt: Date.now(),
    }
  }

  /**
   * Sign an arbitrary message with identity
   */
  async signMessage(message: string): Promise<{ message: string; signature: Hex; did: DID }> {
    if (!this.identity) {
      throw new IdentityError('NOT_INITIALIZED', 'Identity not initialized')
    }

    // Create a hash of the message for signing
    const messageHash = this.hashMessage(message)
    const signature = await this.stubSign(messageHash)

    return {
      message,
      signature,
      did: this.identity.id,
    }
  }

  /**
   * Verify a signed identity
   */
  async verifyIdentity(signedIdentity: SignedIdentity): Promise<VerificationResult> {
    const { document, signature, signedAt } = signedIdentity

    // Check DID format
    if (!document.id.startsWith('did:key:')) {
      return {
        valid: false,
        error: 'Invalid DID format',
        verifiedAt: Date.now(),
      }
    }

    // Check signature age (max 24 hours)
    const maxAge = 24 * 60 * 60 * 1000
    if (Date.now() - signedAt > maxAge) {
      return {
        valid: false,
        error: 'Signature expired',
        verifiedAt: Date.now(),
      }
    }

    // Extract address from DID and verify it matches controller
    const extractedAddress = this.extractAddressFromDID(document.id)
    if (!extractedAddress || extractedAddress.toLowerCase() !== document.controller.toLowerCase()) {
      return {
        valid: false,
        error: 'Controller address does not match DID',
        verifiedAt: Date.now(),
      }
    }

    // Verify signature (stub - real impl would use ecrecover)
    const isValid = await this.verifySignature(document, signature)

    this.emit({ type: 'identity_verified', did: document.id, valid: isValid })

    if (!isValid) {
      return {
        valid: false,
        error: 'Invalid signature',
        verifiedAt: Date.now(),
      }
    }

    return {
      valid: true,
      identity: document,
      verifiedAt: Date.now(),
    }
  }

  /**
   * Verify a signed message
   */
  async verifyMessage(
    message: string,
    signature: Hex,
    did: DID
  ): Promise<{ valid: boolean; error?: string }> {
    // Extract address from DID
    const address = this.extractAddressFromDID(did)
    if (!address) {
      return { valid: false, error: 'Invalid DID format' }
    }

    // Verify signature (stub implementation)
    const messageHash = this.hashMessage(message)
    const isValid = signature.length > 10 && messageHash.length > 0

    return { valid: isValid }
  }

  /**
   * Export identity as JSON for sharing
   */
  toJSON(): IdentityDocument | null {
    return this.identity ? { ...this.identity } : null
  }

  /**
   * Import an identity document (for verification purposes)
   */
  static fromJSON(json: IdentityDocument): IdentityDocument {
    return { ...json }
  }

  // ============= Events =============

  /**
   * Subscribe to identity events
   */
  on(listener: IdentityEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Emit an event
   */
  private emit(event: IdentityEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event)
      } catch (error) {
        console.error('[AgentIdentity] Event listener error:', error)
      }
    })
  }

  // ============= Signing Helpers =============

  /**
   * Create signature for identity document
   */
  private async createSignature(identity: IdentityDocument): Promise<Hex> {
    if (this.signTypedData) {
      const domain: IdentitySignatureDomain = {
        name: 'AgentIdentity',
        version: '1',
        chainId: 7750, // Monmouth chain ID
      }

      const message = {
        id: identity.id,
        controller: identity.controller,
        agentType: identity.agentType,
        name: identity.name,
        capabilities: identity.capabilities.join(','),
        created: BigInt(identity.created),
      }

      return this.signTypedData({
        domain,
        types: IDENTITY_SIGNATURE_TYPES,
        primaryType: 'Identity',
        message,
      })
    }

    // Stub signature
    return this.stubSign(JSON.stringify(identity))
  }

  /**
   * Verify signature (stub implementation)
   */
  private async verifySignature(_identity: IdentityDocument, signature: Hex): Promise<boolean> {
    // In a real implementation, this would:
    // 1. Recreate the message hash
    // 2. Use ecrecover to get the signer address
    // 3. Compare with the controller address
    return signature.startsWith('0x') && signature.length > 10
  }

  /**
   * Simple hash function for messages
   */
  private hashMessage(message: string): string {
    let hash = 0
    for (let i = 0; i < message.length; i++) {
      const char = message.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash
    }
    return Math.abs(hash).toString(16).padStart(16, '0')
  }

  /**
   * Stub signature for testing
   */
  private async stubSign(data: string): Promise<Hex> {
    const hash = this.hashMessage(data)
    return `0x${hash}${'0'.repeat(64 - hash.length)}${'1b'}` as Hex
  }

  // ============= Persistence =============

  /**
   * Persist identity to storage
   */
  private persistIdentity(): void {
    if (!this.config.persist || typeof localStorage === 'undefined') return
    if (!this.identity) return

    try {
      const key = `${this.config.storagePrefix}${this.identity.controller}`
      localStorage.setItem(key, JSON.stringify(this.identity))
    } catch (error) {
      console.error('[AgentIdentity] Failed to persist identity:', error)
    }
  }

  /**
   * Restore identity from storage
   */
  private restoreIdentity(): void {
    if (!this.config.persist || typeof localStorage === 'undefined') return

    const address = this.wallet.getConnectedAddress()
    if (!address) return

    try {
      const key = `${this.config.storagePrefix}${address}`
      const stored = localStorage.getItem(key)
      if (stored) {
        this.identity = JSON.parse(stored)
      }
    } catch (error) {
      console.error('[AgentIdentity] Failed to restore identity:', error)
    }
  }

  /**
   * Clear stored identity
   */
  clearIdentity(): void {
    if (this.identity && typeof localStorage !== 'undefined') {
      const key = `${this.config.storagePrefix}${this.identity.controller}`
      localStorage.removeItem(key)
    }
    this.identity = null
  }

  /**
   * Set the sign typed data function
   */
  setSignTypedData(
    fn: (params: {
      domain: IdentitySignatureDomain
      types: typeof IDENTITY_SIGNATURE_TYPES
      primaryType: 'Identity'
      message: Record<string, unknown>
    }) => Promise<Hex>
  ): void {
    this.signTypedData = fn
  }
}

/**
 * Create a new AgentIdentityManager instance
 */
export function createAgentIdentity(
  wallet: MonmouthWallet,
  config?: AgentIdentityConfig
): AgentIdentityManager {
  return new AgentIdentityManager(wallet, config)
}
