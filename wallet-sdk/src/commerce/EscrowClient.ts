/**
 * EscrowClient - Escrow operations for agent-to-agent commerce
 *
 * Provides escrow functionality for trustless agent transactions.
 * This is a stub implementation that stores escrows locally.
 * A production version would interact with an escrow smart contract.
 *
 * @example
 * ```typescript
 * const escrow = new EscrowClient(wallet)
 *
 * // Create escrow for a service
 * const { escrowId } = await escrow.createEscrow({
 *   recipient: serviceAgent,
 *   amount: parseEther('0.5'),
 *   description: 'Data analysis service',
 *   durationSeconds: 86400, // 24 hours
 * })
 *
 * // After service is complete, release funds
 * await escrow.releaseEscrow(escrowId)
 *
 * // Or if service fails, refund
 * await escrow.refundEscrow(escrowId)
 * ```
 */

import type { Hex } from 'viem'
import type { MonmouthWallet } from '../MonmouthWallet'
import type { ActivityLog } from '../memory/ActivityLog'
import {
  type EscrowId,
  type EscrowRecord,
  type EscrowResult,
  type EscrowStatus,
  type CreateEscrowParams,
  type DisputeParams,
  type DisputeResolution,
  type EscrowClientConfig,
  type EscrowEvent,
  type EscrowEventListener,
  EscrowError,
  generateEscrowId,
  isEscrowActive,
  isEscrowExpired,
  getAvailableActions,
} from './types'

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<Omit<EscrowClientConfig, 'contractAddress' | 'defaultArbiter'>> = {
  defaultDurationSeconds: 86400, // 24 hours
  chainId: 7750,
}

/**
 * Storage key for escrows
 */
const STORAGE_KEY = 'monmouth_escrows'

/**
 * EscrowClient - Manages escrow operations
 */
export class EscrowClient {
  private wallet: MonmouthWallet
  private config: EscrowClientConfig
  private escrows: Map<EscrowId, EscrowRecord> = new Map()
  private listeners: Set<EscrowEventListener> = new Set()
  private activityLog?: ActivityLog

  constructor(
    wallet: MonmouthWallet,
    config?: EscrowClientConfig,
    options?: { activityLog?: ActivityLog }
  ) {
    this.wallet = wallet
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.activityLog = options?.activityLog

    // Restore from storage
    this.restoreEscrows()
  }

  /**
   * Create a new escrow
   *
   * Locks funds until released or refunded.
   */
  async createEscrow(params: CreateEscrowParams): Promise<EscrowResult> {
    const payer = this.wallet.getConnectedAddress()
    if (!payer) {
      throw new EscrowError('UNAUTHORIZED', 'Wallet not connected')
    }

    // Validate against guardrails
    const validation = this.wallet.validateTransaction({
      to: params.recipient,
      value: params.amount,
    })

    if (!validation.allowed) {
      return {
        success: false,
        escrowId: '' as EscrowId,
        error: validation.reason || 'Transaction blocked by guardrails',
      }
    }

    // Generate escrow ID
    const escrowId = generateEscrowId()
    const now = Date.now()

    // Create escrow record
    const escrow: EscrowRecord = {
      id: escrowId,
      payer,
      recipient: params.recipient,
      amount: params.amount,
      token: params.token || 'ETH',
      description: params.description,
      state: 'locked', // In real impl, would be 'pending' until funded
      createdAt: now,
      expiresAt: now + params.durationSeconds * 1000,
      serviceId: params.serviceId,
      arbiter: params.arbiter || this.config.defaultArbiter,
    }

    // Store escrow
    this.escrows.set(escrowId, escrow)
    this.persistEscrows()

    // Record spend (in real impl, funds would be locked in contract)
    this.wallet.recordTransaction(
      `0x${'e'.repeat(64)}` as Hex, // Placeholder escrow tx
      params.amount
    )

    // Log activity
    this.logActivity('transaction', {
      event: 'escrow_created',
      escrowId,
      recipient: params.recipient,
      amount: params.amount.toString(),
      description: params.description,
    })

    // Emit event
    this.emit({ type: 'escrow_created', escrow })

    // Simulate transaction hash
    const txHash = `0x${escrowId.replace('escrow_', '')}${'0'.repeat(40)}` as Hex

    return {
      success: true,
      escrowId,
      txHash,
      escrow,
    }
  }

  /**
   * Release escrow funds to recipient
   *
   * Only the payer can release funds.
   */
  async releaseEscrow(escrowId: EscrowId): Promise<EscrowResult> {
    const escrow = this.escrows.get(escrowId)
    if (!escrow) {
      throw new EscrowError('NOT_FOUND', `Escrow ${escrowId} not found`)
    }

    const caller = this.wallet.getConnectedAddress()
    if (!caller || caller.toLowerCase() !== escrow.payer.toLowerCase()) {
      throw new EscrowError('UNAUTHORIZED', 'Only payer can release escrow')
    }

    if (escrow.state !== 'locked') {
      throw new EscrowError('INVALID_STATE', `Cannot release escrow in state: ${escrow.state}`)
    }

    // Update escrow state
    escrow.state = 'released'
    escrow.releasedAt = Date.now()
    escrow.txHash = `0x${'r'.repeat(64)}` as Hex

    this.escrows.set(escrowId, escrow)
    this.persistEscrows()

    // Log activity
    this.logActivity('transaction', {
      event: 'escrow_released',
      escrowId,
      recipient: escrow.recipient,
      amount: escrow.amount.toString(),
    })

    // Emit event
    this.emit({ type: 'escrow_released', escrowId, txHash: escrow.txHash })

    return {
      success: true,
      escrowId,
      txHash: escrow.txHash,
      escrow,
    }
  }

  /**
   * Refund escrow funds to payer
   *
   * Payer can refund if escrow expired or service failed.
   */
  async refundEscrow(escrowId: EscrowId): Promise<EscrowResult> {
    const escrow = this.escrows.get(escrowId)
    if (!escrow) {
      throw new EscrowError('NOT_FOUND', `Escrow ${escrowId} not found`)
    }

    const caller = this.wallet.getConnectedAddress()
    if (!caller || caller.toLowerCase() !== escrow.payer.toLowerCase()) {
      throw new EscrowError('UNAUTHORIZED', 'Only payer can refund escrow')
    }

    if (escrow.state !== 'locked') {
      throw new EscrowError('INVALID_STATE', `Cannot refund escrow in state: ${escrow.state}`)
    }

    // Update escrow state
    escrow.state = 'refunded'
    escrow.refundedAt = Date.now()
    escrow.txHash = `0x${'f'.repeat(64)}` as Hex

    this.escrows.set(escrowId, escrow)
    this.persistEscrows()

    // Log activity
    this.logActivity('transaction', {
      event: 'escrow_refunded',
      escrowId,
      payer: escrow.payer,
      amount: escrow.amount.toString(),
    })

    // Emit event
    this.emit({ type: 'escrow_refunded', escrowId, txHash: escrow.txHash })

    return {
      success: true,
      escrowId,
      txHash: escrow.txHash,
      escrow,
    }
  }

  /**
   * Initiate a dispute
   *
   * Either party can dispute an active escrow.
   */
  async disputeEscrow(params: DisputeParams): Promise<EscrowResult> {
    const escrow = this.escrows.get(params.escrowId)
    if (!escrow) {
      throw new EscrowError('NOT_FOUND', `Escrow ${params.escrowId} not found`)
    }

    const caller = this.wallet.getConnectedAddress()
    if (!caller) {
      throw new EscrowError('UNAUTHORIZED', 'Wallet not connected')
    }

    const isParty =
      caller.toLowerCase() === escrow.payer.toLowerCase() ||
      caller.toLowerCase() === escrow.recipient.toLowerCase()

    if (!isParty) {
      throw new EscrowError('UNAUTHORIZED', 'Only escrow parties can dispute')
    }

    if (escrow.state !== 'locked') {
      throw new EscrowError('INVALID_STATE', `Cannot dispute escrow in state: ${escrow.state}`)
    }

    // Update escrow state
    escrow.state = 'disputed'
    escrow.disputeReason = params.reason

    this.escrows.set(params.escrowId, escrow)
    this.persistEscrows()

    // Log activity
    this.logActivity('decision', {
      event: 'escrow_disputed',
      escrowId: params.escrowId,
      reason: params.reason,
      disputedBy: caller,
    })

    // Emit event
    this.emit({ type: 'escrow_disputed', escrowId: params.escrowId, reason: params.reason })

    return {
      success: true,
      escrowId: params.escrowId,
      escrow,
    }
  }

  /**
   * Resolve a disputed escrow (arbiter only)
   */
  async resolveDispute(resolution: DisputeResolution): Promise<EscrowResult> {
    const escrow = this.escrows.get(resolution.escrowId)
    if (!escrow) {
      throw new EscrowError('NOT_FOUND', `Escrow ${resolution.escrowId} not found`)
    }

    const caller = this.wallet.getConnectedAddress()
    if (!caller) {
      throw new EscrowError('UNAUTHORIZED', 'Wallet not connected')
    }

    // Check if caller is arbiter
    if (escrow.arbiter && caller.toLowerCase() !== escrow.arbiter.toLowerCase()) {
      throw new EscrowError('UNAUTHORIZED', 'Only arbiter can resolve disputes')
    }

    if (escrow.state !== 'disputed') {
      throw new EscrowError('INVALID_STATE', 'Escrow must be in disputed state')
    }

    // Update escrow state
    escrow.state = 'resolved'
    escrow.resolution = {
      winner: resolution.winner,
      amount: resolution.amount,
      reason: resolution.reason,
    }
    escrow.txHash = `0x${'d'.repeat(64)}` as Hex

    this.escrows.set(resolution.escrowId, escrow)
    this.persistEscrows()

    // Log activity
    this.logActivity('decision', {
      event: 'escrow_resolved',
      escrowId: resolution.escrowId,
      winner: resolution.winner,
      amount: resolution.amount.toString(),
      reason: resolution.reason,
    })

    // Emit event
    this.emit({ type: 'escrow_resolved', escrowId: resolution.escrowId, resolution })

    return {
      success: true,
      escrowId: resolution.escrowId,
      txHash: escrow.txHash,
      escrow,
    }
  }

  /**
   * Get escrow status
   */
  getEscrowStatus(escrowId: EscrowId): EscrowStatus {
    const escrow = this.escrows.get(escrowId)
    if (!escrow) {
      throw new EscrowError('NOT_FOUND', `Escrow ${escrowId} not found`)
    }

    const caller = this.wallet.getConnectedAddress()
    const timeRemaining = Math.max(0, escrow.expiresAt - Date.now())

    return {
      escrow: { ...escrow },
      timeRemaining,
      isActive: isEscrowActive(escrow),
      isExpired: isEscrowExpired(escrow),
      availableActions: caller ? getAvailableActions(escrow, caller) : [],
    }
  }

  /**
   * Get all escrows for current user
   */
  getMyEscrows(): EscrowRecord[] {
    const caller = this.wallet.getConnectedAddress()
    if (!caller) return []

    return Array.from(this.escrows.values()).filter(
      (e) =>
        e.payer.toLowerCase() === caller.toLowerCase() ||
        e.recipient.toLowerCase() === caller.toLowerCase()
    )
  }

  /**
   * Get escrows by state
   */
  getEscrowsByState(state: EscrowRecord['state']): EscrowRecord[] {
    return Array.from(this.escrows.values()).filter((e) => e.state === state)
  }

  /**
   * Check and expire old escrows
   */
  checkExpiredEscrows(): EscrowId[] {
    const expired: EscrowId[] = []
    const now = Date.now()

    for (const [id, escrow] of this.escrows) {
      if (escrow.state === 'locked' && escrow.expiresAt < now) {
        escrow.state = 'expired'
        this.escrows.set(id, escrow)
        expired.push(id)
        this.emit({ type: 'escrow_expired', escrowId: id })
      }
    }

    if (expired.length > 0) {
      this.persistEscrows()
    }

    return expired
  }

  // ============= Events =============

  /**
   * Subscribe to escrow events
   */
  on(listener: EscrowEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Emit an event
   */
  private emit(event: EscrowEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event)
      } catch (error) {
        console.error('[EscrowClient] Event listener error:', error)
      }
    })
  }

  // ============= Activity Logging =============

  /**
   * Log activity
   */
  private logActivity(
    actionType: 'transaction' | 'decision' | 'error',
    data: unknown
  ): void {
    if (!this.activityLog) return

    this.activityLog.log({
      agentId: this.wallet.getAgentId(),
      actionType,
      data,
    })
  }

  /**
   * Set activity log
   */
  setActivityLog(log: ActivityLog): void {
    this.activityLog = log
  }

  // ============= Persistence =============

  /**
   * Persist escrows to storage
   */
  private persistEscrows(): void {
    if (typeof localStorage === 'undefined') return

    try {
      const data = Array.from(this.escrows.entries()).map(([, escrow]) => ({
        ...escrow,
        amount: escrow.amount.toString(),
        resolution: escrow.resolution
          ? { ...escrow.resolution, amount: escrow.resolution.amount.toString() }
          : undefined,
      }))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (error) {
      console.error('[EscrowClient] Failed to persist escrows:', error)
    }
  }

  /**
   * Restore escrows from storage
   */
  private restoreEscrows(): void {
    if (typeof localStorage === 'undefined') return

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) return

      const data = JSON.parse(stored)
      for (const item of data) {
        const escrow: EscrowRecord = {
          ...item,
          amount: BigInt(item.amount),
          resolution: item.resolution
            ? { ...item.resolution, amount: BigInt(item.resolution.amount) }
            : undefined,
        }
        this.escrows.set(item.id as EscrowId, escrow)
      }
    } catch (error) {
      console.error('[EscrowClient] Failed to restore escrows:', error)
    }
  }

  /**
   * Clear all escrows
   */
  clearEscrows(): void {
    this.escrows.clear()
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  /**
   * Get escrow count
   */
  count(): number {
    return this.escrows.size
  }
}

/**
 * Create a new EscrowClient instance
 */
export function createEscrowClient(
  wallet: MonmouthWallet,
  config?: EscrowClientConfig,
  options?: { activityLog?: ActivityLog }
): EscrowClient {
  return new EscrowClient(wallet, config, options)
}
