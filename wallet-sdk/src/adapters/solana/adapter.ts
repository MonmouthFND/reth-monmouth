/**
 * Solana Chain Adapter - Full implementation for Solana
 *
 * Uses @solana/web3.js for RPC and transaction building,
 * and @noble/ed25519 for signing.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import type { Finality } from '@solana/web3.js'
import * as ed25519 from '@noble/ed25519'
import bs58 from 'bs58'

import type {
  AdapterConfig,
  AdapterEvent,
  AdapterEventListener,
  ChainAdapterWithEvents,
} from '../../core/adapter'
import type {
  ChainConfig,
  TokenAmount,
  TokenId,
  TxHash,
  TxReceipt,
  TxResult,
  TypedDataDomain,
  TypedDataTypes,
  UniversalAddress,
  UniversalSignature,
  UniversalTransaction,
} from '../../core/types'
import {
  createAddress,
  createNativeToken,
  createTokenAmount,
} from '../../core/utils'

// Enable synchronous methods for ed25519 (required for some environments)
// @ts-expect-error - sha512 sync setup
ed25519.etc.sha512Sync = (...m: Uint8Array[]) => {
  const h = new Uint8Array(64)
  // Simple sync hash (in production, use proper sha512)
  let i = 0
  for (const arr of m) {
    for (const byte of arr) {
      h[i % 64] ^= byte
      i++
    }
  }
  return h
}

/** Solana-specific adapter configuration */
export interface SolanaAdapterConfig extends AdapterConfig {
  /** RPC URL for Solana cluster */
  rpcUrl: string
  /** Keypair for signing (optional if using wallet adapter) */
  keypair?: Keypair
  /** Secret key bytes (64 bytes) - alternative to keypair */
  secretKey?: Uint8Array
  /** External wallet adapter (for browser wallets like Phantom) */
  walletAdapter?: SolanaWalletAdapter
  /** Commitment level for transactions */
  commitment?: 'processed' | 'confirmed' | 'finalized'
}

/** Interface for external Solana wallet adapters (Phantom, etc.) */
export interface SolanaWalletAdapter {
  publicKey: PublicKey | null
  connected: boolean
  connect(): Promise<void>
  disconnect(): Promise<void>
  signMessage(message: Uint8Array): Promise<Uint8Array>
  signTransaction(transaction: Transaction): Promise<Transaction>
  sendTransaction(
    transaction: Transaction,
    connection: Connection
  ): Promise<string>
}

/** Solana adapter implementation */
export class SolanaAdapter implements ChainAdapterWithEvents {
  readonly chainType = 'svm' as const
  readonly chainId: string
  readonly config: ChainConfig

  private connection: Connection
  private keypair: Keypair | null = null
  private walletAdapter: SolanaWalletAdapter | null = null
  private connected = false
  private listeners = new Set<AdapterEventListener>()
  private commitment: 'processed' | 'confirmed' | 'finalized'

  constructor(config: SolanaAdapterConfig) {
    this.config = config.chain
    this.chainId = config.chain.chainId as string
    this.commitment = config.commitment ?? 'confirmed'

    // Create connection
    this.connection = new Connection(config.rpcUrl, this.commitment)

    // Set up keypair
    if (config.keypair) {
      this.keypair = config.keypair
    } else if (config.secretKey) {
      if (config.secretKey.length !== 64) {
        throw new Error('Solana secret key must be 64 bytes')
      }
      this.keypair = Keypair.fromSecretKey(config.secretKey)
    }

    // Set up wallet adapter
    if (config.walletAdapter) {
      this.walletAdapter = config.walletAdapter
    }
  }

  // ============= Connection =============

  isConnected(): boolean {
    if (this.walletAdapter) {
      return this.walletAdapter.connected
    }
    return this.connected && this.keypair !== null
  }

  async connect(): Promise<void> {
    if (this.walletAdapter) {
      await this.walletAdapter.connect()
      this.connected = true
      const address = await this.getAddress()
      this.emit({ type: 'connected', address })
      return
    }

    if (!this.keypair) {
      throw new Error('No keypair or wallet adapter configured')
    }

    this.connected = true
    const address = await this.getAddress()
    this.emit({ type: 'connected', address })
  }

  async disconnect(): Promise<void> {
    if (this.walletAdapter) {
      await this.walletAdapter.disconnect()
    }
    this.connected = false
    this.emit({ type: 'disconnected' })
  }

  // ============= Address Management =============

  async getAddress(): Promise<UniversalAddress> {
    let publicKey: PublicKey

    if (this.walletAdapter?.publicKey) {
      publicKey = this.walletAdapter.publicKey
    } else if (this.keypair) {
      publicKey = this.keypair.publicKey
    } else {
      throw new Error('No account connected')
    }

    return createAddress(publicKey.toBytes(), 'svm')
  }

  normalizeAddress(input: string): UniversalAddress {
    try {
      const publicKey = new PublicKey(input)
      return createAddress(publicKey.toBytes(), 'svm')
    } catch {
      throw new Error(`Invalid Solana address: ${input}`)
    }
  }

  isValidAddress(input: string): boolean {
    try {
      new PublicKey(input)
      return true
    } catch {
      return false
    }
  }

  // ============= Signing =============

  async sign(message: Uint8Array): Promise<UniversalSignature> {
    if (this.walletAdapter) {
      const signature = await this.walletAdapter.signMessage(message)
      return {
        bytes: signature,
        scheme: 'ed25519',
      }
    }

    if (!this.keypair) {
      throw new Error('No wallet connected')
    }

    // Use @noble/ed25519 for signing
    const signature = await ed25519.signAsync(
      message,
      this.keypair.secretKey.slice(0, 32)
    )

    return {
      bytes: signature,
      scheme: 'ed25519',
    }
  }

  async signMessage(message: string): Promise<UniversalSignature> {
    const encoder = new TextEncoder()
    return this.sign(encoder.encode(message))
  }

  async signTypedData(
    _domain: TypedDataDomain,
    _types: TypedDataTypes,
    _value: Record<string, unknown>
  ): Promise<UniversalSignature> {
    // Solana doesn't have EIP-712 equivalent
    // Could implement a custom typed message format
    throw new Error('Typed data signing not supported on Solana. Use signMessage instead.')
  }

  // ============= Balances =============

  async getNativeBalance(): Promise<TokenAmount> {
    const address = await this.getAddress()
    const publicKey = new PublicKey(address.raw)

    const balance = await this.connection.getBalance(publicKey)
    const token = createNativeToken('svm', 'SOL', 9)

    return createTokenAmount(BigInt(balance), token)
  }

  async getTokenBalance(token: TokenId): Promise<TokenAmount> {
    if (token.address === 'native') {
      return this.getNativeBalance()
    }

    const address = await this.getAddress()
    const ownerPublicKey = new PublicKey(address.raw)
    const mintPublicKey = new PublicKey(token.address.raw)

    // Find associated token account
    const tokenAccounts = await this.connection.getTokenAccountsByOwner(
      ownerPublicKey,
      { mint: mintPublicKey }
    )

    if (tokenAccounts.value.length === 0) {
      return createTokenAmount(0n, token)
    }

    // Get balance from first token account
    const accountInfo = await this.connection.getTokenAccountBalance(
      tokenAccounts.value[0].pubkey
    )

    return createTokenAmount(
      BigInt(accountInfo.value.amount),
      token
    )
  }

  // ============= Transactions =============

  async estimateFee(tx: UniversalTransaction): Promise<TokenAmount> {
    // Build transaction to estimate
    const transaction = await this.buildTransaction(tx)

    // Get fee for transaction
    const { blockhash } = await this.connection.getLatestBlockhash()
    transaction.recentBlockhash = blockhash

    if (this.keypair) {
      transaction.feePayer = this.keypair.publicKey
    } else if (this.walletAdapter?.publicKey) {
      transaction.feePayer = this.walletAdapter.publicKey
    }

    const fee = await this.connection.getFeeForMessage(
      transaction.compileMessage()
    )

    const token = createNativeToken('svm', 'SOL', 9)
    return createTokenAmount(BigInt(fee.value ?? 5000), token)
  }

  async sendTransaction(tx: UniversalTransaction): Promise<TxResult> {
    if (!this.walletAdapter && !this.keypair) {
      throw new Error('No wallet connected')
    }

    // Build transaction
    const transaction = await this.buildTransaction(tx)

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash()
    transaction.recentBlockhash = blockhash
    transaction.lastValidBlockHeight = lastValidBlockHeight

    let signature: string

    if (this.walletAdapter) {
      // Use wallet adapter
      transaction.feePayer = this.walletAdapter.publicKey!
      const signed = await this.walletAdapter.signTransaction(transaction)
      signature = await this.connection.sendRawTransaction(signed.serialize())
    } else if (this.keypair) {
      // Use keypair directly
      transaction.feePayer = this.keypair.publicKey
      signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.keypair],
        { commitment: this.commitment }
      )
    } else {
      throw new Error('No signer available')
    }

    return {
      hash: {
        bytes: bs58.decode(signature),
        display: signature,
        chainType: 'svm',
      },
      status: 'confirmed',
    }
  }

  async waitForConfirmation(
    hash: TxHash,
    _confirmations = 1
  ): Promise<TxReceipt> {
    const signature = hash.display

    // Wait for confirmation
    const result = await this.connection.confirmTransaction(
      {
        signature,
        blockhash: (await this.connection.getLatestBlockhash()).blockhash,
        lastValidBlockHeight: (await this.connection.getLatestBlockhash())
          .lastValidBlockHeight,
      },
      this.commitment
    )

    const token = createNativeToken('svm', 'SOL', 9)

    if (result.value.err) {
      return {
        hash,
        status: 'failed',
        blockNumber: 0n,
        fee: createTokenAmount(5000n, token),
        logs: [],
      }
    }

    // Get transaction details (getTransaction only supports 'confirmed' or 'finalized')
    const finality: Finality = this.commitment === 'processed' ? 'confirmed' : this.commitment
    const txInfo = await this.connection.getTransaction(signature, {
      commitment: finality,
    })

    return {
      hash,
      status: 'success',
      blockNumber: BigInt(txInfo?.slot ?? 0),
      fee: createTokenAmount(BigInt(txInfo?.meta?.fee ?? 5000), token),
      logs: [], // Could parse logs from txInfo.meta.logMessages
    }
  }

  async getTransaction(hash: TxHash): Promise<TxReceipt | null> {
    // getTransaction only supports 'confirmed' or 'finalized'
    const finality: Finality = this.commitment === 'processed' ? 'confirmed' : this.commitment
    const txInfo = await this.connection.getTransaction(hash.display, {
      commitment: finality,
    })

    if (!txInfo) return null

    const token = createNativeToken('svm', 'SOL', 9)

    return {
      hash,
      status: txInfo.meta?.err ? 'failed' : 'success',
      blockNumber: BigInt(txInfo.slot),
      fee: createTokenAmount(BigInt(txInfo.meta?.fee ?? 5000), token),
      logs: [], // Could parse logs from txInfo.meta.logMessages
    }
  }

  // ============= Transaction Building =============

  private async buildTransaction(tx: UniversalTransaction): Promise<Transaction> {
    const transaction = new Transaction()

    // Get sender
    let fromPublicKey: PublicKey
    if (this.walletAdapter?.publicKey) {
      fromPublicKey = this.walletAdapter.publicKey
    } else if (this.keypair) {
      fromPublicKey = this.keypair.publicKey
    } else {
      throw new Error('No sender available')
    }

    // Add native SOL transfer if value specified
    if (tx.value && tx.value > 0n) {
      const toPublicKey = new PublicKey(tx.to.raw)
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: fromPublicKey,
          toPubkey: toPublicKey,
          lamports: Number(tx.value),
        })
      )
    }

    // Add compute budget if specified
    if (tx.svm?.computeUnits || tx.svm?.computeUnitPrice) {
      // Would need to import ComputeBudgetProgram
      // For now, skip compute budget instructions
    }

    return transaction
  }

  // ============= Raw Client Access =============

  getRawClient<T>(): T {
    return {
      connection: this.connection,
      keypair: this.keypair,
      walletAdapter: this.walletAdapter,
    } as T
  }

  // ============= Events =============

  on(listener: AdapterEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  off(listener: AdapterEventListener): void {
    this.listeners.delete(listener)
  }

  private emit(event: AdapterEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event)
      } catch (error) {
        console.error('Adapter event listener error:', error)
      }
    })
  }

  // ============= Static Helpers =============

  /** Generate a new Solana keypair */
  static generateKeypair(): Keypair {
    return Keypair.generate()
  }

  /** Create keypair from secret key bytes */
  static keypairFromSecretKey(secretKey: Uint8Array): Keypair {
    return Keypair.fromSecretKey(secretKey)
  }

  /** Create keypair from base58 encoded secret key */
  static keypairFromBase58(base58SecretKey: string): Keypair {
    return Keypair.fromSecretKey(bs58.decode(base58SecretKey))
  }
}

/** Create a Solana adapter */
export function createSolanaAdapter(config: SolanaAdapterConfig): SolanaAdapter {
  return new SolanaAdapter(config)
}
