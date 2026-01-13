/**
 * Agent Identity Types
 *
 * Types for decentralized agent identity using did:key method.
 * Enables agent-to-agent trust and verification.
 */

import type { Address, Hex } from 'viem'

/**
 * DID (Decentralized Identifier) string
 * Format: did:key:z6Mk...
 */
export type DID = `did:key:${string}`

/**
 * Agent capabilities that can be advertised
 */
export type AgentCapability =
  | 'payments'        // Can send/receive payments
  | 'escrow'          // Can participate in escrow
  | 'x402'            // Can pay for APIs via x402
  | 'signing'         // Can sign messages
  | 'delegation'      // Can delegate to other agents
  | 'trading'         // Can execute trades
  | 'research'        // Can perform research tasks

/**
 * Identity document representing an agent
 */
export interface IdentityDocument {
  /** DID identifier */
  id: DID
  /** Ethereum address that controls this identity */
  controller: Address
  /** Agent type from wallet config */
  agentType: string
  /** Human-readable name */
  name: string
  /** Capabilities this agent supports */
  capabilities: AgentCapability[]
  /** Creation timestamp */
  created: number
  /** Last updated timestamp */
  updated: number
  /** Optional metadata */
  metadata?: Record<string, unknown>
}

/**
 * Signed identity document for verification
 */
export interface SignedIdentity {
  /** The identity document */
  document: IdentityDocument
  /** Signature over the document */
  signature: Hex
  /** Timestamp when signed */
  signedAt: number
}

/**
 * Result of identity verification
 */
export interface VerificationResult {
  /** Whether verification succeeded */
  valid: boolean
  /** The verified identity if valid */
  identity?: IdentityDocument
  /** Error message if invalid */
  error?: string
  /** When verification was performed */
  verifiedAt: number
}

/**
 * Configuration for AgentIdentityManager
 */
export interface AgentIdentityConfig {
  /** Whether to persist identity to localStorage */
  persist?: boolean
  /** Storage key prefix */
  storagePrefix?: string
  /** Default capabilities */
  defaultCapabilities?: AgentCapability[]
}

/**
 * Identity event types
 */
export type IdentityEvent =
  | { type: 'identity_created'; identity: IdentityDocument }
  | { type: 'identity_updated'; identity: IdentityDocument }
  | { type: 'identity_verified'; did: DID; valid: boolean }
  | { type: 'identity_signed'; did: DID }

/**
 * Identity event listener
 */
export type IdentityEventListener = (event: IdentityEvent) => void

/**
 * Error codes for identity operations
 */
export type IdentityErrorCode =
  | 'NOT_INITIALIZED'       // Identity not yet created
  | 'INVALID_DID'           // Malformed DID
  | 'INVALID_SIGNATURE'     // Signature verification failed
  | 'EXPIRED_SIGNATURE'     // Signature too old
  | 'CONTROLLER_MISMATCH'   // Controller doesn't match signer
  | 'STORAGE_ERROR'         // Failed to persist/load

/**
 * Identity error class
 */
export class IdentityError extends Error {
  constructor(
    public readonly code: IdentityErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'IdentityError'
  }
}

/**
 * Multibase prefix for base58btc encoding
 * Used in did:key method
 */
export const MULTIBASE_BASE58BTC_PREFIX = 'z'

/**
 * Multicodec prefix for secp256k1 public key
 */
export const MULTICODEC_SECP256K1_PREFIX = 0xe7

/**
 * EIP-712 domain for identity signatures
 */
export interface IdentitySignatureDomain {
  name: string
  version: string
  chainId: number
}

/**
 * EIP-712 types for identity document signature
 */
export const IDENTITY_SIGNATURE_TYPES = {
  Identity: [
    { name: 'id', type: 'string' },
    { name: 'controller', type: 'address' },
    { name: 'agentType', type: 'string' },
    { name: 'name', type: 'string' },
    { name: 'capabilities', type: 'string' },
    { name: 'created', type: 'uint256' },
  ],
} as const
