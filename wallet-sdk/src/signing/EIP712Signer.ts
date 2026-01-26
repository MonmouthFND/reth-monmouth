/**
 * EIP712Signer - Unified EIP-712 typed data signing
 *
 * Provides secure signing with nonce management and expiry handling.
 * Works with viem WalletClient or any compatible signer.
 *
 * @example
 * ```typescript
 * import { createEIP712Signer } from './signing'
 *
 * const signer = createEIP712Signer({
 *   walletClient,
 *   account: '0x...',
 * })
 *
 * // Sign an identity
 * const signed = await signer.signIdentity({
 *   id: 'did:key:z...',
 *   controller: '0x...',
 *   agentType: 'commerce',
 *   capabilities: ['payments', 'escrow'],
 * })
 *
 * // Verify later
 * const isValid = await signer.verifyIdentity(signed)
 * ```
 */

import type { Address, Hex } from 'viem'
import { hashTypedData, recoverTypedDataAddress } from 'viem'
import {
  type EIP712Domain,
  type IdentityMessage,
  type PaymentMessage,
  type EscrowCreateMessage,
  type EscrowActionMessage,
  type SignedData,
  type TypedDataSigner,
  SIGNING_DOMAINS,
  IDENTITY_TYPES,
  PAYMENT_TYPES,
  ESCROW_TYPES,
  MONMOUTH_CHAIN_ID,
  SigningError,
} from './types'

/**
 * Configuration for EIP712Signer
 */
export interface EIP712SignerConfig {
  /** The signer (viem WalletClient or compatible) */
  signer?: TypedDataSigner
  /** Account address to sign with */
  account: Address
  /** Chain ID (default: Monmouth 7750) */
  chainId?: number
  /** Default signature validity in seconds (default: 24 hours) */
  defaultExpirySeconds?: number
}

/**
 * Local nonce manager using Map
 */
class LocalNonceManager {
  private nonces: Map<string, Set<string>> = new Map()
  private counters: Map<string, bigint> = new Map()

  getNextNonce(address: Address): bigint {
    const key = address.toLowerCase()
    const current = this.counters.get(key) || 0n
    const next = current + 1n
    this.counters.set(key, next)
    return next
  }

  useNonce(address: Address, nonce: bigint): void {
    const key = address.toLowerCase()
    let used = this.nonces.get(key)
    if (!used) {
      used = new Set()
      this.nonces.set(key, used)
    }
    used.add(nonce.toString())
  }

  isNonceUsed(address: Address, nonce: bigint): boolean {
    const key = address.toLowerCase()
    const used = this.nonces.get(key)
    return used ? used.has(nonce.toString()) : false
  }
}

/**
 * EIP712Signer - Main signing class
 */
export class EIP712Signer {
  private signer?: TypedDataSigner
  private account: Address
  private chainId: number
  private defaultExpirySeconds: number
  private nonceManager: LocalNonceManager

  constructor(config: EIP712SignerConfig) {
    this.signer = config.signer
    this.account = config.account
    this.chainId = config.chainId || MONMOUTH_CHAIN_ID
    this.defaultExpirySeconds = config.defaultExpirySeconds || 24 * 60 * 60
    this.nonceManager = new LocalNonceManager()
  }

  // ============= Identity Signing =============

  /**
   * Sign an agent identity document
   */
  async signIdentity(params: {
    id: string
    controller: Address
    agentType: string
    capabilities: string[]
    expirySeconds?: number
  }): Promise<SignedData<IdentityMessage>> {
    const nonce = this.nonceManager.getNextNonce(this.account)
    const expirySeconds = params.expirySeconds || this.defaultExpirySeconds
    const expiry = BigInt(Math.floor(Date.now() / 1000) + expirySeconds)

    const message: IdentityMessage = {
      id: params.id,
      controller: params.controller,
      agentType: params.agentType,
      capabilities: params.capabilities.join(','),
      nonce,
      expiry,
    }

    const domain = this.getDomain('AgentIdentity')
    const signature = await this.sign(domain, IDENTITY_TYPES, 'Identity', message)

    this.nonceManager.useNonce(this.account, nonce)

    return {
      message,
      signature,
      signer: this.account,
      domain,
      signedAt: Date.now(),
      expiresAt: Number(expiry) * 1000,
    }
  }

  /**
   * Verify a signed identity
   */
  async verifyIdentity(signed: SignedData<IdentityMessage>): Promise<boolean> {
    // Check expiry
    if (signed.expiresAt && Date.now() > signed.expiresAt) {
      throw new SigningError('EXPIRED', 'Identity signature has expired')
    }

    // Check nonce hasn't been reused
    if (this.nonceManager.isNonceUsed(signed.signer, signed.message.nonce)) {
      throw new SigningError('REPLAY_DETECTED', 'Nonce has already been used')
    }

    // Recover signer from signature
    const recoveredAddress = await this.recoverSigner(
      signed.domain,
      IDENTITY_TYPES,
      'Identity',
      signed.message,
      signed.signature
    )

    // Verify signer matches
    if (recoveredAddress.toLowerCase() !== signed.signer.toLowerCase()) {
      throw new SigningError('VERIFICATION_FAILED', 'Signature does not match signer')
    }

    // Verify controller matches signer
    if (recoveredAddress.toLowerCase() !== signed.message.controller.toLowerCase()) {
      throw new SigningError('VERIFICATION_FAILED', 'Signer is not the controller')
    }

    return true
  }

  // ============= Payment Signing =============

  /**
   * Sign a payment request
   */
  async signPayment(params: {
    recipient: Address
    amount: bigint
    token: Address
    nonce: string
    expiry: number
    description?: string
    chainId?: number
  }): Promise<SignedData<PaymentMessage>> {
    const message: PaymentMessage = {
      recipient: params.recipient,
      amount: params.amount,
      token: params.token,
      nonce: params.nonce,
      expiry: BigInt(params.expiry),
      description: params.description || '',
    }

    const domain: EIP712Domain = {
      ...SIGNING_DOMAINS.X402Payment,
      chainId: params.chainId || this.chainId,
    }

    const signature = await this.sign(domain, PAYMENT_TYPES, 'Payment', message)

    return {
      message,
      signature,
      signer: this.account,
      domain,
      signedAt: Date.now(),
      expiresAt: params.expiry * 1000,
    }
  }

  /**
   * Verify a signed payment
   */
  async verifyPayment(signed: SignedData<PaymentMessage>): Promise<boolean> {
    // Check expiry
    if (signed.expiresAt && Date.now() > signed.expiresAt) {
      throw new SigningError('EXPIRED', 'Payment signature has expired')
    }

    // Recover signer
    const recoveredAddress = await this.recoverSigner(
      signed.domain,
      PAYMENT_TYPES,
      'Payment',
      signed.message,
      signed.signature
    )

    return recoveredAddress.toLowerCase() === signed.signer.toLowerCase()
  }

  // ============= Escrow Signing =============

  /**
   * Sign an escrow creation request
   */
  async signEscrowCreate(params: {
    recipient: Address
    amount: bigint
    token: Address
    duration: bigint
    serviceId: string
  }): Promise<SignedData<EscrowCreateMessage>> {
    const nonce = this.nonceManager.getNextNonce(this.account)

    const message: EscrowCreateMessage = {
      recipient: params.recipient,
      amount: params.amount,
      token: params.token,
      duration: params.duration,
      serviceId: params.serviceId,
      nonce,
    }

    const domain = this.getDomain('MonmouthEscrow')
    const signature = await this.sign(domain, ESCROW_TYPES, 'EscrowCreate', message)

    this.nonceManager.useNonce(this.account, nonce)

    return {
      message,
      signature,
      signer: this.account,
      domain,
      signedAt: Date.now(),
    }
  }

  /**
   * Sign an escrow action (release, refund, dispute)
   */
  async signEscrowAction(params: {
    escrowId: Hex
    action: 'release' | 'refund' | 'dispute'
  }): Promise<SignedData<EscrowActionMessage>> {
    const nonce = this.nonceManager.getNextNonce(this.account)

    const message: EscrowActionMessage = {
      escrowId: params.escrowId,
      action: params.action,
      nonce,
    }

    const domain = this.getDomain('MonmouthEscrow')
    const signature = await this.sign(domain, ESCROW_TYPES, 'EscrowAction', message)

    this.nonceManager.useNonce(this.account, nonce)

    return {
      message,
      signature,
      signer: this.account,
      domain,
      signedAt: Date.now(),
    }
  }

  // ============= Core Signing =============

  /**
   * Sign typed data using the configured signer
   */
  private async sign<T extends Record<string, unknown>>(
    domain: EIP712Domain,
    types: Record<string, readonly { name: string; type: string }[]>,
    primaryType: string,
    message: T
  ): Promise<Hex> {
    if (!this.signer) {
      // Return stub signature for testing
      return this.stubSign(domain, types, primaryType, message)
    }

    try {
      return await this.signer.signTypedData({
        account: this.account,
        domain,
        types,
        primaryType,
        message,
      })
    } catch (error) {
      if (error instanceof Error && error.message.includes('rejected')) {
        throw new SigningError('SIGN_REJECTED', 'User rejected the signature request')
      }
      throw new SigningError('INVALID_MESSAGE', 'Failed to sign message', { error })
    }
  }

  /**
   * Recover signer address from signature
   */
  private async recoverSigner<T extends Record<string, unknown>>(
    domain: EIP712Domain,
    types: Record<string, readonly { name: string; type: string }[]>,
    primaryType: string,
    message: T,
    signature: Hex
  ): Promise<Address> {
    try {
      return await recoverTypedDataAddress({
        domain,
        types,
        primaryType,
        message,
        signature,
      })
    } catch (error) {
      throw new SigningError('VERIFICATION_FAILED', 'Could not recover signer', { error })
    }
  }

  /**
   * Create a stub signature for testing without a real signer
   */
  private stubSign<T extends Record<string, unknown>>(
    domain: EIP712Domain,
    types: Record<string, readonly { name: string; type: string }[]>,
    primaryType: string,
    message: T
  ): Hex {
    // Create deterministic hash for testing (BigInt-safe)
    const replacer = (_key: string, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value
    const dataStr = JSON.stringify({ domain, types, primaryType, message }, replacer)
    let hash = 0
    for (let i = 0; i < dataStr.length; i++) {
      const char = dataStr.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }

    // Format as 65-byte signature (r + s + v)
    const hashHex = Math.abs(hash).toString(16).padStart(64, '0')
    return `0x${hashHex}${'0'.repeat(64)}${'1b'}` as Hex
  }

  /**
   * Get hash of typed data (for on-chain verification)
   */
  getTypedDataHash<T extends Record<string, unknown>>(
    domain: EIP712Domain,
    types: Record<string, readonly { name: string; type: string }[]>,
    primaryType: string,
    message: T
  ): Hex {
    return hashTypedData({
      domain,
      types,
      primaryType,
      message,
    })
  }

  // ============= Configuration =============

  /**
   * Get domain for a specific use case
   */
  getDomain(name: 'AgentIdentity' | 'X402Payment' | 'MonmouthEscrow'): EIP712Domain {
    return {
      ...SIGNING_DOMAINS[name],
      chainId: this.chainId,
    }
  }

  /**
   * Set a new signer
   */
  setSigner(signer: TypedDataSigner): void {
    this.signer = signer
  }

  /**
   * Set the account address
   */
  setAccount(account: Address): void {
    this.account = account
  }

  /**
   * Get current account
   */
  getAccount(): Address {
    return this.account
  }

  /**
   * Check if a real signer is configured
   */
  hasSigner(): boolean {
    return this.signer !== undefined
  }
}

/**
 * Create a new EIP712Signer instance
 */
export function createEIP712Signer(config: EIP712SignerConfig): EIP712Signer {
  return new EIP712Signer(config)
}
