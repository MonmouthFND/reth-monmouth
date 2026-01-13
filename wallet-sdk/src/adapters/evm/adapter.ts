/**
 * EVM Chain Adapter - Implementation for Ethereum and EVM-compatible chains
 *
 * Wraps viem to provide a universal interface for EVM chains.
 */

import type {
  Account,
  Chain,
  PublicClient,
  Transport,
  WalletClient,
} from 'viem'
import {
  createPublicClient,
  createWalletClient,
  http,
} from 'viem'

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
  bytesToHex,
  createAddress,
  createNativeToken,
  createTokenAmount,
  hexToBytes,
  parseAddress,
} from '../../core/utils'

/** EVM-specific adapter configuration */
export interface EvmAdapterConfig extends AdapterConfig {
  /** Viem chain object (optional, for full viem compatibility) */
  viemChain?: Chain
  /** Viem transport (defaults to http) */
  transport?: Transport
  /** Account for signing (private key, mnemonic, or external signer) */
  account?: Account
  /** External wallet client (for browser wallets) */
  walletClient?: WalletClient
}

/** EVM adapter implementation */
export class EvmAdapter implements ChainAdapterWithEvents {
  readonly chainType = 'evm' as const
  readonly chainId: number
  readonly config: ChainConfig

  private publicClient: PublicClient
  private walletClient: WalletClient | null = null
  private account: Account | null = null
  private connected = false
  private listeners = new Set<AdapterEventListener>()

  constructor(config: EvmAdapterConfig) {
    this.config = config.chain
    this.chainId = config.chain.chainId as number

    // Build viem chain object
    const viemChain: Chain = config.viemChain ?? {
      id: this.chainId,
      name: config.chain.name,
      nativeCurrency: {
        name: config.chain.nativeToken.symbol,
        symbol: config.chain.nativeToken.symbol,
        decimals: config.chain.nativeToken.decimals,
      },
      rpcUrls: {
        default: { http: [config.rpcUrl ?? config.chain.rpcUrl ?? ''] },
      },
    }

    // Create transport
    const transport = config.transport ?? http(config.rpcUrl ?? config.chain.rpcUrl)

    // Create public client for read operations
    this.publicClient = createPublicClient({
      chain: viemChain,
      transport,
    })

    // Use provided wallet client or account
    if (config.walletClient) {
      this.walletClient = config.walletClient
      this.account = config.walletClient.account ?? null
    } else if (config.account) {
      this.account = config.account
      this.walletClient = createWalletClient({
        chain: viemChain,
        transport,
        account: config.account,
      })
    }
  }

  // ============= Connection =============

  isConnected(): boolean {
    return this.connected && this.account !== null
  }

  async connect(): Promise<void> {
    if (!this.account) {
      throw new Error('No account configured. Provide account or walletClient in config.')
    }
    this.connected = true
    const address = await this.getAddress()
    this.emit({ type: 'connected', address })
  }

  async disconnect(): Promise<void> {
    this.connected = false
    this.emit({ type: 'disconnected' })
  }

  // ============= Address Management =============

  async getAddress(): Promise<UniversalAddress> {
    if (!this.account) {
      throw new Error('No account connected')
    }
    return parseAddress(this.account.address, 'evm')
  }

  normalizeAddress(input: string): UniversalAddress {
    return parseAddress(input.toLowerCase(), 'evm')
  }

  isValidAddress(input: string): boolean {
    return /^0x[0-9a-fA-F]{40}$/.test(input)
  }

  // ============= Signing =============

  async sign(message: Uint8Array): Promise<UniversalSignature> {
    if (!this.walletClient || !this.account) {
      throw new Error('No wallet connected')
    }

    const signature = await this.walletClient.signMessage({
      account: this.account,
      message: { raw: message },
    })

    const sigBytes = hexToBytes(signature)
    // Last byte is recovery id (v), typically 27 or 28
    const recoveryId = sigBytes[sigBytes.length - 1] - 27

    return {
      bytes: sigBytes,
      scheme: 'secp256k1',
      recoveryId,
    }
  }

  async signMessage(message: string): Promise<UniversalSignature> {
    if (!this.walletClient || !this.account) {
      throw new Error('No wallet connected')
    }

    const signature = await this.walletClient.signMessage({
      account: this.account,
      message,
    })

    const sigBytes = hexToBytes(signature)
    const recoveryId = sigBytes[sigBytes.length - 1] - 27

    return {
      bytes: sigBytes,
      scheme: 'secp256k1',
      recoveryId,
    }
  }

  async signTypedData(
    domain: TypedDataDomain,
    types: TypedDataTypes,
    value: Record<string, unknown>
  ): Promise<UniversalSignature> {
    if (!this.walletClient || !this.account) {
      throw new Error('No wallet connected')
    }

    const signature = await this.walletClient.signTypedData({
      account: this.account,
      domain: {
        name: domain.name,
        version: domain.version,
        chainId: domain.chainId ? Number(domain.chainId) : undefined,
        verifyingContract: domain.verifyingContract as `0x${string}` | undefined,
      },
      types,
      primaryType: Object.keys(types).find((k) => k !== 'EIP712Domain') ?? '',
      message: value,
    })

    const sigBytes = hexToBytes(signature)
    const recoveryId = sigBytes[sigBytes.length - 1] - 27

    return {
      bytes: sigBytes,
      scheme: 'secp256k1',
      recoveryId,
    }
  }

  // ============= Balances =============

  async getNativeBalance(): Promise<TokenAmount> {
    const address = await this.getAddress()
    const balance = await this.publicClient.getBalance({
      address: address.display as `0x${string}`,
    })

    const token = createNativeToken(
      'evm',
      this.config.nativeToken.symbol,
      this.config.nativeToken.decimals
    )

    return createTokenAmount(balance, token)
  }

  async getTokenBalance(token: TokenId): Promise<TokenAmount> {
    if (token.address === 'native') {
      return this.getNativeBalance()
    }

    const address = await this.getAddress()

    // ERC-20 balanceOf call
    const balance = await this.publicClient.readContract({
      address: token.address.display as `0x${string}`,
      abi: [
        {
          name: 'balanceOf',
          type: 'function',
          inputs: [{ name: 'account', type: 'address' }],
          outputs: [{ name: 'balance', type: 'uint256' }],
          stateMutability: 'view',
        },
      ],
      functionName: 'balanceOf',
      args: [address.display as `0x${string}`],
    })

    return createTokenAmount(balance as bigint, token)
  }

  // ============= Transactions =============

  async estimateFee(tx: UniversalTransaction): Promise<TokenAmount> {
    const gasEstimate = await this.publicClient.estimateGas({
      to: tx.to.display as `0x${string}`,
      value: tx.value,
      data: tx.data ? bytesToHex(tx.data) as `0x${string}` : undefined,
    })

    const gasPrice = await this.publicClient.getGasPrice()
    const fee = gasEstimate * gasPrice

    const token = createNativeToken(
      'evm',
      this.config.nativeToken.symbol,
      this.config.nativeToken.decimals
    )

    return createTokenAmount(fee, token)
  }

  async sendTransaction(tx: UniversalTransaction): Promise<TxResult> {
    if (!this.walletClient || !this.account) {
      throw new Error('No wallet connected')
    }

    const hash = await this.walletClient.sendTransaction({
      account: this.account,
      to: tx.to.display as `0x${string}`,
      value: tx.value,
      data: tx.data ? bytesToHex(tx.data) as `0x${string}` : undefined,
      gas: tx.evm?.gasLimit,
      maxFeePerGas: tx.evm?.maxFeePerGas,
      maxPriorityFeePerGas: tx.evm?.maxPriorityFeePerGas,
      nonce: tx.evm?.nonce,
      chain: null, // Already set in client
    })

    return {
      hash: {
        bytes: hexToBytes(hash),
        display: hash,
        chainType: 'evm',
      },
      status: 'pending',
    }
  }

  async waitForConfirmation(hash: TxHash, confirmations = 1): Promise<TxReceipt> {
    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: hash.display as `0x${string}`,
      confirmations,
    })

    const token = createNativeToken(
      'evm',
      this.config.nativeToken.symbol,
      this.config.nativeToken.decimals
    )

    const fee = (receipt.gasUsed ?? 0n) * (receipt.effectiveGasPrice ?? 0n)

    return {
      hash,
      status: receipt.status === 'success' ? 'success' : 'reverted',
      blockNumber: receipt.blockNumber,
      fee: createTokenAmount(fee, token),
      logs: receipt.logs.map((log) => ({
        address: createAddress(hexToBytes(log.address), 'evm'),
        topics: log.topics.map((t) => hexToBytes(t)),
        data: hexToBytes(log.data),
      })),
    }
  }

  async getTransaction(hash: TxHash): Promise<TxReceipt | null> {
    try {
      const receipt = await this.publicClient.getTransactionReceipt({
        hash: hash.display as `0x${string}`,
      })

      if (!receipt) return null

      const token = createNativeToken(
        'evm',
        this.config.nativeToken.symbol,
        this.config.nativeToken.decimals
      )

      const fee = (receipt.gasUsed ?? 0n) * (receipt.effectiveGasPrice ?? 0n)

      return {
        hash,
        status: receipt.status === 'success' ? 'success' : 'reverted',
        blockNumber: receipt.blockNumber,
        fee: createTokenAmount(fee, token),
        logs: receipt.logs.map((log) => ({
          address: createAddress(hexToBytes(log.address), 'evm'),
          topics: log.topics.map((t) => hexToBytes(t)),
          data: hexToBytes(log.data),
        })),
      }
    } catch {
      return null
    }
  }

  // ============= Raw Client Access =============

  getRawClient<T>(): T {
    return {
      publicClient: this.publicClient,
      walletClient: this.walletClient,
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
}

/** Create an EVM adapter */
export function createEvmAdapter(config: EvmAdapterConfig): EvmAdapter {
  return new EvmAdapter(config)
}
