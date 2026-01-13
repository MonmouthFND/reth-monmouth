/**
 * EIP-712 Signing Types
 *
 * Unified types for EIP-712 typed data signing across the wallet SDK.
 * Used for identity verification, x402 payments, and escrow operations.
 */

import type { Address, Hex, TypedDataDomain } from 'viem'

/**
 * Monmouth chain ID
 */
export const MONMOUTH_CHAIN_ID = 7750

/**
 * Supported signing domains
 */
export type SigningDomainName = 'AgentIdentity' | 'X402Payment' | 'MonmouthEscrow'

/**
 * EIP-712 Domain configuration
 */
export interface EIP712Domain extends TypedDataDomain {
  name: string
  version: string
  chainId: number
  verifyingContract?: Address
}

/**
 * Pre-configured domains for each use case
 */
export const SIGNING_DOMAINS: Record<SigningDomainName, EIP712Domain> = {
  AgentIdentity: {
    name: 'MonmouthAgentIdentity',
    version: '1',
    chainId: MONMOUTH_CHAIN_ID,
  },
  X402Payment: {
    name: 'X402Payment',
    version: '1',
    chainId: MONMOUTH_CHAIN_ID,
  },
  MonmouthEscrow: {
    name: 'MonmouthEscrow',
    version: '1',
    chainId: MONMOUTH_CHAIN_ID,
  },
}

/**
 * EIP-712 type definitions for Agent Identity
 */
export const IDENTITY_TYPES = {
  Identity: [
    { name: 'id', type: 'string' },
    { name: 'controller', type: 'address' },
    { name: 'agentType', type: 'string' },
    { name: 'capabilities', type: 'string' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expiry', type: 'uint256' },
  ],
} as const

/**
 * EIP-712 type definitions for x402 Payment
 */
export const PAYMENT_TYPES = {
  Payment: [
    { name: 'recipient', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'token', type: 'address' },
    { name: 'nonce', type: 'string' },
    { name: 'expiry', type: 'uint256' },
    { name: 'description', type: 'string' },
  ],
} as const

/**
 * EIP-712 type definitions for Escrow operations
 */
export const ESCROW_TYPES = {
  EscrowCreate: [
    { name: 'recipient', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'token', type: 'address' },
    { name: 'duration', type: 'uint256' },
    { name: 'serviceId', type: 'string' },
    { name: 'nonce', type: 'uint256' },
  ],
  EscrowAction: [
    { name: 'escrowId', type: 'bytes32' },
    { name: 'action', type: 'string' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const

/**
 * Identity message for signing
 */
export interface IdentityMessage {
  [key: string]: unknown
  id: string
  controller: Address
  agentType: string
  capabilities: string
  nonce: bigint
  expiry: bigint
}

/**
 * Payment message for signing
 */
export interface PaymentMessage {
  [key: string]: unknown
  recipient: Address
  amount: bigint
  token: Address
  nonce: string
  expiry: bigint
  description: string
}

/**
 * Escrow create message for signing
 */
export interface EscrowCreateMessage {
  [key: string]: unknown
  recipient: Address
  amount: bigint
  token: Address
  duration: bigint
  serviceId: string
  nonce: bigint
}

/**
 * Escrow action message for signing
 */
export interface EscrowActionMessage {
  [key: string]: unknown
  escrowId: Hex
  action: 'release' | 'refund' | 'dispute'
  nonce: bigint
}

/**
 * Signature with metadata
 */
export interface SignedData<T> {
  message: T
  signature: Hex
  signer: Address
  domain: EIP712Domain
  signedAt: number
  expiresAt?: number
}

/**
 * Nonce tracking for replay protection
 */
export interface NonceManager {
  /** Get the next nonce for an address */
  getNextNonce(address: Address): bigint
  /** Mark a nonce as used */
  useNonce(address: Address, nonce: bigint): void
  /** Check if a nonce has been used */
  isNonceUsed(address: Address, nonce: bigint): boolean
}

/**
 * Signer interface (compatible with viem WalletClient)
 */
export interface TypedDataSigner {
  signTypedData<T extends Record<string, unknown>>(params: {
    account: Address
    domain: EIP712Domain
    types: Record<string, readonly { name: string; type: string }[]>
    primaryType: string
    message: T
  }): Promise<Hex>
}

/**
 * Signing error codes
 */
export type SigningErrorCode =
  | 'NO_SIGNER' // No signer configured
  | 'SIGN_REJECTED' // User rejected signing
  | 'INVALID_DOMAIN' // Invalid EIP-712 domain
  | 'INVALID_MESSAGE' // Invalid message format
  | 'EXPIRED' // Signature expired
  | 'REPLAY_DETECTED' // Nonce already used
  | 'VERIFICATION_FAILED' // Signature verification failed

/**
 * Signing error class
 */
export class SigningError extends Error {
  constructor(
    public readonly code: SigningErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'SigningError'
  }
}
