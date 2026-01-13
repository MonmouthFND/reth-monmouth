/**
 * EIP-712 Signing Module
 *
 * Unified signing utilities for the Monmouth Wallet SDK.
 *
 * @example
 * ```typescript
 * import { createEIP712Signer, verifyIdentitySignature } from './signing'
 *
 * // Create signer with viem wallet client
 * const signer = createEIP712Signer({
 *   signer: walletClient,
 *   account: '0x...',
 * })
 *
 * // Sign identity
 * const signed = await signer.signIdentity({
 *   id: 'did:key:z...',
 *   controller: '0x...',
 *   agentType: 'commerce',
 *   capabilities: ['payments'],
 * })
 *
 * // Verify off-chain
 * const result = await verifyIdentitySignature(signed)
 * console.log(result.valid) // true
 * ```
 */

// Types
export {
  type EIP712Domain,
  type IdentityMessage,
  type PaymentMessage,
  type EscrowCreateMessage,
  type EscrowActionMessage,
  type SignedData,
  type TypedDataSigner,
  type NonceManager,
  type SigningDomainName,
  type SigningErrorCode,
  SigningError,
  SIGNING_DOMAINS,
  IDENTITY_TYPES,
  PAYMENT_TYPES,
  ESCROW_TYPES,
  MONMOUTH_CHAIN_ID,
} from './types'

// EIP712Signer
export { EIP712Signer, createEIP712Signer, type EIP712SignerConfig } from './EIP712Signer'

// Verification utilities
export {
  verifyIdentitySignature,
  verifyPaymentSignature,
  verifyIdentityOnChain,
  verifyPaymentOnChain,
  computeDomainSeparator,
  computeIdentityStructHash,
  computePaymentStructHash,
  computeDigest,
  VERIFIER_ABI,
} from './verification'
