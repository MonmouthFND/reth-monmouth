/**
 * useMonmouthWallet - Convenience hook for SDK operations
 *
 * Provides simplified access to common wallet operations
 */

import { useState, useCallback, useMemo } from 'react'
import { useMonmouth } from '../context/MonmouthContext'
import { formatEther, parseEther } from 'viem'
import type { ActivityLogEntry } from '../../../src'

/**
 * Format bigint as ETH string
 */
export function formatETH(wei: bigint, decimals = 4): string {
  const eth = formatEther(wei)
  const num = parseFloat(eth)
  return num.toFixed(decimals)
}

/**
 * Parse ETH string to bigint
 */
export function parseETH(eth: string): bigint {
  return parseEther(eth)
}

/**
 * Hook return type
 */
export interface UseMonmouthWalletReturn {
  // Identity
  did: string | null
  agentType: string | null
  agentName: string | null
  sessionRemaining: number | null

  // Policy
  maxPerTransaction: string
  maxPerDay: string
  dailySpent: string
  dailyRemaining: string
  spendingPercentage: number

  // Activity
  activityHistory: ActivityLogEntry[]
  refreshActivity: () => void

  // Status
  isReady: boolean
  hasExceededLimits: boolean
}

/**
 * useMonmouthWallet - Convenience hook
 */
export function useMonmouthWallet(): UseMonmouthWalletReturn {
  const { wallet, identityDoc, policy, dailySpent, activityLog, isInitialized } = useMonmouth()

  const [activityHistory, setActivityHistory] = useState<ActivityLogEntry[]>([])

  // Refresh activity log
  const refreshActivity = useCallback(() => {
    if (!activityLog || !wallet) return
    const history = activityLog.getHistory(wallet.getAgentId(), 100)
    setActivityHistory(history)
  }, [activityLog, wallet])

  // Computed values
  const did = identityDoc?.id ?? null
  const agentType = identityDoc?.agentType ?? null
  const agentName = identityDoc?.name ?? null

  // Session remaining (mock - would come from actual session tracking)
  const sessionRemaining = useMemo(() => {
    if (!policy?.sessionExpiry) return null
    const now = Date.now()
    const remaining = policy.sessionExpiry - now
    return remaining > 0 ? remaining : 0
  }, [policy?.sessionExpiry])

  // Format policy values
  const maxPerTransaction = policy?.maxPerTransaction ? formatETH(policy.maxPerTransaction) : '0'
  const maxPerDay = policy?.maxPerDay ? formatETH(policy.maxPerDay) : '0'
  const dailySpentFormatted = formatETH(dailySpent)
  const dailyRemaining =
    policy?.maxPerDay && policy.maxPerDay > dailySpent ? formatETH(policy.maxPerDay - dailySpent) : '0'

  // Spending percentage
  const spendingPercentage = useMemo(() => {
    if (!policy?.maxPerDay || policy.maxPerDay === BigInt(0)) return 0
    const percentage = Number((dailySpent * BigInt(100)) / policy.maxPerDay)
    return Math.min(percentage, 100)
  }, [policy?.maxPerDay, dailySpent])

  // Check if limits exceeded
  const hasExceededLimits = spendingPercentage >= 100

  return {
    did,
    agentType,
    agentName,
    sessionRemaining,
    maxPerTransaction,
    maxPerDay,
    dailySpent: dailySpentFormatted,
    dailyRemaining,
    spendingPercentage,
    activityHistory,
    refreshActivity,
    isReady: isInitialized,
    hasExceededLimits,
  }
}

/**
 * Format session time remaining
 */
export function formatSessionTime(ms: number | null): string {
  if (ms === null || ms <= 0) return 'Expired'

  const hours = Math.floor(ms / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

/**
 * Format timestamp
 */
export function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}
