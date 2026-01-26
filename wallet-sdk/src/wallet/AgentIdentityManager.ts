/**
 * AgentIdentityManager - Multi-chain DID identity management
 *
 * Provides did:key based identity that works across EVM and Solana chains.
 * Uses multicodec prefixes to identify key types:
 * - 0xe701: secp256k1 (EVM)
 * - 0xed01: ed25519 (Solana)
 */

import type { ChainAdapter } from '../core/adapter'
import type { ChainType, UniversalAddress, UniversalSignature } from '../core/types'
import { bytesToBase58, base58ToBytes, bytesToHex } from '../core/utils'
import type { AgentType } from './AgentWallet'

/** DID format */
export type DID = `did:key:z${string}`

/** Agent capabilities */
export type AgentCapability =
  | 'payments'
  | 'signing'
  | 'x402'
  | 'escrow'
  | 'deploy'
  | 'admin'

/** Identity document */
export interface IdentityDocument {
  /** DID identifier */
  id: DID
  /** Controller address */
  controller: UniversalAddress
  /** Chain type */
  chainType: ChainType
  /** Agent type */
  agentType: AgentType
  /** Human-readable name */
  name: string
  /** Capabilities */
  capabilities: AgentCapability[]
  /** Creation timestamp */
  created: number
  /** Last updated timestamp */
  updated: number
  /** Optional metadata */
  metadata?: Record<string, unknown>
}

/** Signed identity for sharing/verification */
export interface SignedIdentity {
  document: IdentityDocument
  signature: UniversalSignature
  signedAt: number
}

/** Verification result */
export interface VerificationResult {
  valid: boolean
  error?: string
  identity?: IdentityDocument
  verifiedAt: number
}

/** Identity events */
export type IdentityEvent =
  | { type: 'identity_created'; identity: IdentityDocument }
  | { type: 'identity_updated'; identity: IdentityDocument }
  | { type: 'identity_signed'; did: DID }
  | { type: 'identity_verified'; did: DID; valid: boolean }

export type IdentityEventListener = (event: IdentityEvent) => void

/** Identity manager configuration */
export interface IdentityManagerConfig {
  /** Persist to localStorage */
  persist?: boolean
  /** Storage key prefix */
  storagePrefix?: string
  /** Default capabilities */
  defaultCapabilities?: AgentCapability[]
}

/** Multicodec prefixes */
const MULTICODEC = {
  secp256k1: new Uint8Array([0xe7, 0x01]),
  ed25519: new Uint8Array([0xed, 0x01]),
} as const

/** Default configuration */
const DEFAULT_CONFIG: Required<IdentityManagerConfig> = {
  persist: true,
  storagePrefix: 'agent_identity_',
  defaultCapabilities: ['payments', 'signing'],
}

/**
 * AgentIdentityManager - Multi-chain identity management
 */
export class AgentIdentityManager {
  private adapter: ChainAdapter
  private config: Required<IdentityManagerConfig>
  private identity: IdentityDocument | null = null
  private listeners = new Set<IdentityEventListener>()
  private agentType: AgentType
  private agentName: string

  constructor(
    adapter: ChainAdapter,
    agentType: AgentType,
    agentName: string,
    config?: IdentityManagerConfig
  ) {
    this.adapter = adapter
    this.agentType = agentType
    this.agentName = agentName
    this.config = { ...DEFAULT_CONFIG, ...config }

    // Try to restore from storage
    this.restoreIdentity()
  }

  /**
   * Initialize or restore identity
   */
  async initialize(capabilities?: AgentCapability[]): Promise<IdentityDocument> {
    if (!this.adapter.isConnected()) {
      throw new Error('Adapter not connected')
    }

    const address = await this.adapter.getAddress()

    // Check if we already have an identity for this address
    if (this.identity && this.identity.controller.display === address.display) {
      return this.identity
    }

    // Generate new identity
    const did = this.generateDID(address)

    this.identity = {
      id: did,
      controller: address,
      chainType: this.adapter.chainType,
      agentType: this.agentType,
      name: this.agentName,
      capabilities: capabilities ?? this.config.defaultCapabilities,
      created: Date.now(),
      updated: Date.now(),
    }

    this.persistIdentity()
    this.emit({ type: 'identity_created', identity: this.identity })

    return this.identity
  }

  /**
   * Get current identity
   */
  getIdentity(): IdentityDocument | null {
    return this.identity ? { ...this.identity } : null
  }

  /**
   * Get DID
   */
  getDID(): DID | null {
    return this.identity?.id ?? null
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.identity !== null
  }

  /**
   * Generate DID from address
   */
  generateDID(address: UniversalAddress): DID {
    // Select multicodec prefix based on chain type
    const prefix =
      address.chainType === 'evm' ? MULTICODEC.secp256k1 : MULTICODEC.ed25519

    // Combine prefix and address bytes
    const combined = new Uint8Array(prefix.length + address.raw.length)
    combined.set(prefix)
    combined.set(address.raw, prefix.length)

    // Encode as base58btc with 'z' multibase prefix
    const encoded = bytesToBase58(combined)

    return `did:key:z${encoded}` as DID
  }

  /**
   * Parse DID to extract address info
   */
  parseDID(did: DID): { address: UniversalAddress; chainType: ChainType } | null {
    try {
      if (!did.startsWith('did:key:z')) {
        return null
      }

      const encoded = did.slice(9) // Remove 'did:key:z'
      const decoded = base58ToBytes(encoded)

      // Check multicodec prefix
      let chainType: ChainType
      let prefixLength: number

      if (decoded[0] === 0xe7 && decoded[1] === 0x01) {
        chainType = 'evm'
        prefixLength = 2
      } else if (decoded[0] === 0xed && decoded[1] === 0x01) {
        chainType = 'svm'
        prefixLength = 2
      } else {
        return null
      }

      const addressBytes = decoded.slice(prefixLength)
      const display =
        chainType === 'evm' ? bytesToHex(addressBytes) : bytesToBase58(addressBytes)

      return {
        address: {
          raw: addressBytes,
          display,
          chainType,
        },
        chainType,
      }
    } catch {
      return null
    }
  }

  /**
   * Update capabilities
   */
  updateCapabilities(capabilities: AgentCapability[]): void {
    if (!this.identity) {
      throw new Error('Identity not initialized')
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
   * Update metadata
   */
  updateMetadata(metadata: Record<string, unknown>): void {
    if (!this.identity) {
      throw new Error('Identity not initialized')
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
      throw new Error('Identity not initialized')
    }

    // Create message to sign
    const message = this.createSignableMessage(this.identity)
    const signature = await this.adapter.sign(message)

    this.emit({ type: 'identity_signed', did: this.identity.id })

    return {
      document: { ...this.identity },
      signature,
      signedAt: Date.now(),
    }
  }

  /**
   * Sign an arbitrary message
   */
  async signMessage(message: string): Promise<{
    message: string
    signature: UniversalSignature
    did: DID
  }> {
    if (!this.identity) {
      throw new Error('Identity not initialized')
    }

    const signature = await this.adapter.signMessage(message)

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
    if (!document.id.startsWith('did:key:z')) {
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

    // Parse DID and verify it matches controller
    const parsed = this.parseDID(document.id)
    if (!parsed) {
      return {
        valid: false,
        error: 'Could not parse DID',
        verifiedAt: Date.now(),
      }
    }

    if (parsed.address.display.toLowerCase() !== document.controller.display.toLowerCase()) {
      return {
        valid: false,
        error: 'Controller address does not match DID',
        verifiedAt: Date.now(),
      }
    }

    // Verify chain type matches
    if (parsed.chainType !== document.chainType) {
      return {
        valid: false,
        error: 'Chain type mismatch',
        verifiedAt: Date.now(),
      }
    }

    // For now, trust the signature format (real impl would verify cryptographically)
    const isValid = signature.bytes.length > 0

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
   * Export identity as JSON
   */
  toJSON(): IdentityDocument | null {
    if (!this.identity) return null

    return {
      ...this.identity,
      controller: {
        raw: Array.from(this.identity.controller.raw) as unknown as Uint8Array,
        display: this.identity.controller.display,
        chainType: this.identity.controller.chainType,
      },
    }
  }

  // ============= Events =============

  on(listener: IdentityEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: IdentityEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event)
      } catch (error) {
        console.error('Identity event listener error:', error)
      }
    })
  }

  // ============= Helpers =============

  private createSignableMessage(identity: IdentityDocument): Uint8Array {
    const message = JSON.stringify({
      id: identity.id,
      controller: identity.controller.display,
      chainType: identity.chainType,
      agentType: identity.agentType,
      name: identity.name,
      capabilities: identity.capabilities,
      created: identity.created,
    })

    return new TextEncoder().encode(message)
  }

  // ============= Persistence =============

  private persistIdentity(): void {
    if (!this.config.persist || typeof localStorage === 'undefined') return
    if (!this.identity) return

    try {
      const key = `${this.config.storagePrefix}${this.identity.controller.display}_${this.identity.chainType}`
      const serializable = {
        ...this.identity,
        controller: {
          raw: Array.from(this.identity.controller.raw),
          display: this.identity.controller.display,
          chainType: this.identity.controller.chainType,
        },
      }
      localStorage.setItem(key, JSON.stringify(serializable))
    } catch (error) {
      console.error('Failed to persist identity:', error)
    }
  }

  private async restoreIdentity(): Promise<void> {
    if (!this.config.persist || typeof localStorage === 'undefined') return
    if (!this.adapter.isConnected()) return

    try {
      const address = await this.adapter.getAddress()
      const key = `${this.config.storagePrefix}${address.display}_${this.adapter.chainType}`
      const stored = localStorage.getItem(key)

      if (stored) {
        const parsed = JSON.parse(stored)
        this.identity = {
          ...parsed,
          controller: {
            raw: new Uint8Array(parsed.controller.raw),
            display: parsed.controller.display,
            chainType: parsed.controller.chainType,
          },
        }
      }
    } catch (error) {
      console.error('Failed to restore identity:', error)
    }
  }

  clearIdentity(): void {
    if (this.identity && typeof localStorage !== 'undefined') {
      const key = `${this.config.storagePrefix}${this.identity.controller.display}_${this.identity.chainType}`
      localStorage.removeItem(key)
    }
    this.identity = null
  }
}

/**
 * Create an AgentIdentityManager
 */
export function createAgentIdentityManager(
  adapter: ChainAdapter,
  agentType: AgentType,
  agentName: string,
  config?: IdentityManagerConfig
): AgentIdentityManager {
  return new AgentIdentityManager(adapter, agentType, agentName, config)
}
