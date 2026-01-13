/**
 * MonmouthContext - SDK state provider for test app
 *
 * Provides centralized access to all SDK components:
 * - MonmouthWallet instance
 * - AgentIdentityManager
 * - EscrowClient
 * - PaymentRouter
 * - ActivityLog
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { useAccount, useSendTransaction } from 'wagmi'
import type { Address } from 'viem'

// Import SDK components - using relative path for now
// In production, this would be: import { ... } from '@monmouth/wallet-sdk'
import {
  MonmouthWallet,
  createMonmouthWallet,
  AgentIdentityManager,
  createAgentIdentity,
  EscrowClient,
  createEscrowClient,
  PaymentRouter,
  createPaymentRouter,
  ActivityLog,
  createActivityLog,
  X402Client,
  createX402Client,
  PermissionTemplates,
  type SpendingPolicy,
  type AgentType,
  type IdentityDocument,
  type PaymentResult,
  type WalletEvent,
} from '../../../src'

/**
 * Guardrail alert type
 */
export interface GuardrailAlert {
  id: string
  type: 'blocked' | 'warning'
  message: string
  timestamp: number
  details?: {
    amount?: string
    recipient?: string
    reason?: string
  }
}

/**
 * Context value type
 */
export interface MonmouthContextValue {
  // SDK instances
  wallet: MonmouthWallet | null
  identity: AgentIdentityManager | null
  escrowClient: EscrowClient | null
  paymentRouter: PaymentRouter | null
  activityLog: ActivityLog | null
  x402Client: X402Client | null

  // State
  isInitialized: boolean
  identityDoc: IdentityDocument | null
  policy: SpendingPolicy | null
  dailySpent: bigint
  alerts: GuardrailAlert[]

  // Actions
  initialize: (agentType: AgentType, name: string) => Promise<void>
  updatePolicy: (template: keyof typeof PermissionTemplates) => void
  updateCustomPolicy: (policy: Partial<SpendingPolicy>) => void
  dismissAlert: (id: string) => void
  clearAlerts: () => void
  makePayment: (params: { recipient: string; amount: bigint; purpose: 'direct' | 'api_access' | 'escrow' }) => Promise<PaymentResult>
}

const MonmouthContext = createContext<MonmouthContextValue | null>(null)

/**
 * Provider props
 */
interface MonmouthProviderProps {
  children: ReactNode
}

/**
 * MonmouthProvider - Wraps app with SDK context
 */
export function MonmouthProvider({ children }: MonmouthProviderProps) {
  const { address, isConnected } = useAccount()
  const { sendTransactionAsync } = useSendTransaction()

  // SDK instances
  const [wallet, setWallet] = useState<MonmouthWallet | null>(null)
  const [identity, setIdentity] = useState<AgentIdentityManager | null>(null)
  const [escrowClient, setEscrowClient] = useState<EscrowClient | null>(null)
  const [paymentRouter, setPaymentRouter] = useState<PaymentRouter | null>(null)
  const [activityLog, setActivityLog] = useState<ActivityLog | null>(null)
  const [x402Client, setX402Client] = useState<X402Client | null>(null)

  // State
  const [isInitialized, setIsInitialized] = useState(false)
  const [identityDoc, setIdentityDoc] = useState<IdentityDocument | null>(null)
  const [policy, setPolicy] = useState<SpendingPolicy | null>(null)
  const [dailySpent, setDailySpent] = useState<bigint>(BigInt(0))
  const [alerts, setAlerts] = useState<GuardrailAlert[]>([])

  // Initialize SDK when wallet connects
  const initialize = useCallback(
    async (agentType: AgentType, name: string) => {
      if (!address) return

      // Create wallet instance
      const newWallet = createMonmouthWallet({
        identity: {
          agentId: `agent-${address.slice(0, 8)}`,
          agentType,
          name,
        },
        policy: PermissionTemplates.commerce,
      })

      newWallet.setConnectedAddress(address)

      // Create activity log
      const newActivityLog = createActivityLog({ autoSave: true })

      // Create identity manager
      const newIdentity = createAgentIdentity(newWallet)
      const doc = await newIdentity.initialize(['payments', 'signing', 'x402', 'escrow'])
      setIdentityDoc(doc)

      // Create x402 client
      const newX402Client = createX402Client(newWallet, { autoRetry: true }, { activityLog: newActivityLog })

      // Create escrow client
      const newEscrowClient = createEscrowClient(newWallet, {}, { activityLog: newActivityLog })

      // Create payment router
      const newPaymentRouter = createPaymentRouter(newWallet, {
        x402Client: newX402Client,
        escrowClient: newEscrowClient,
        activityLog: newActivityLog,
        sendTransaction: async ({ to, value }) => {
          const hash = await sendTransactionAsync({ to, value })
          return hash
        },
      })

      // Subscribe to wallet events
      newWallet.on((event: WalletEvent) => {
        if (event.type === 'transaction_blocked') {
          addAlert({
            type: 'blocked',
            message: event.reason || 'Transaction blocked by guardrails',
            details: {
              amount: event.intent?.value?.toString(),
              recipient: event.intent?.to,
              reason: event.reason,
            },
          })
        } else if (event.type === 'policy_updated') {
          setPolicy(newWallet.getPolicy())
        }
      })

      // Set state
      setWallet(newWallet)
      setIdentity(newIdentity)
      setEscrowClient(newEscrowClient)
      setPaymentRouter(newPaymentRouter)
      setActivityLog(newActivityLog)
      setX402Client(newX402Client)
      setPolicy(newWallet.getPolicy())
      setDailySpent(newWallet.getDailySpent())
      setIsInitialized(true)
    },
    [address, sendTransactionAsync]
  )

  // Add alert helper
  const addAlert = useCallback((alert: Omit<GuardrailAlert, 'id' | 'timestamp'>) => {
    const newAlert: GuardrailAlert = {
      ...alert,
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
    }
    setAlerts((prev) => [newAlert, ...prev])
  }, [])

  // Dismiss alert
  const dismissAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id))
  }, [])

  // Clear all alerts
  const clearAlerts = useCallback(() => {
    setAlerts([])
  }, [])

  // Update policy from template
  const updatePolicy = useCallback(
    (template: keyof typeof PermissionTemplates) => {
      if (!wallet) return
      wallet.updatePolicy(PermissionTemplates[template])
      setPolicy(wallet.getPolicy())
    },
    [wallet]
  )

  // Update custom policy
  const updateCustomPolicy = useCallback(
    (policyUpdate: Partial<SpendingPolicy>) => {
      if (!wallet) return
      wallet.updatePolicy(policyUpdate)
      setPolicy(wallet.getPolicy())
    },
    [wallet]
  )

  // Make payment through router
  const makePayment = useCallback(
    async (params: { recipient: string; amount: bigint; purpose: 'direct' | 'api_access' | 'escrow' }) => {
      if (!paymentRouter) {
        throw new Error('Payment router not initialized')
      }

      const result = await paymentRouter.pay({
        recipient: params.recipient as Address,
        amount: params.amount,
        purpose: params.purpose,
      })

      // Update daily spent
      if (wallet) {
        setDailySpent(wallet.getDailySpent())
      }

      // Add alert if blocked
      if (!result.success && result.error) {
        addAlert({
          type: 'blocked',
          message: result.error,
          details: {
            amount: params.amount.toString(),
            recipient: params.recipient,
          },
        })
      }

      return result
    },
    [paymentRouter, wallet, addAlert]
  )

  // Cleanup on disconnect
  useEffect(() => {
    if (!isConnected && wallet) {
      wallet.destroy()
      setWallet(null)
      setIdentity(null)
      setEscrowClient(null)
      setPaymentRouter(null)
      setActivityLog(null)
      setX402Client(null)
      setIsInitialized(false)
      setIdentityDoc(null)
      setPolicy(null)
      setDailySpent(BigInt(0))
    }
  }, [isConnected, wallet])

  const value: MonmouthContextValue = {
    wallet,
    identity,
    escrowClient,
    paymentRouter,
    activityLog,
    x402Client,
    isInitialized,
    identityDoc,
    policy,
    dailySpent,
    alerts,
    initialize,
    updatePolicy,
    updateCustomPolicy,
    dismissAlert,
    clearAlerts,
    makePayment,
  }

  return <MonmouthContext.Provider value={value}>{children}</MonmouthContext.Provider>
}

/**
 * Hook to access Monmouth context
 */
export function useMonmouth(): MonmouthContextValue {
  const context = useContext(MonmouthContext)
  if (!context) {
    throw new Error('useMonmouth must be used within a MonmouthProvider')
  }
  return context
}
