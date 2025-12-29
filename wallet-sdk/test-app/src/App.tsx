/**
 * Monmouth Wallet SDK - Test App
 *
 * Full demo of all SDK features:
 * - Wallet connection with Porto
 * - Agent identity (DID)
 * - Spending guardrails
 * - Activity logging
 * - x402 payment protocol
 * - Payment routing
 */

import { useState } from 'react'
import { useAccount, useConnect, useDisconnect, useBalance } from 'wagmi'
import { useMonmouth, MonmouthProvider } from './context/MonmouthContext'
import { AgentIdentityDisplay } from './components/AgentIdentityDisplay'
import { SpendingPolicyConfig } from './components/SpendingPolicyConfig'
import { ActivityLogViewer } from './components/ActivityLogViewer'
import { X402Demo } from './components/X402Demo'
import { GuardrailAlerts } from './components/GuardrailAlerts'
import type { AgentType } from '../../src'

/**
 * Wallet connection card
 */
function ConnectionCard() {
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { data: balance } = useBalance({ address })

  return (
    <div className="card connection-card">
      <h2>Wallet Connection</h2>
      {isConnected ? (
        <>
          <div className="status connected">
            <span className="dot"></span>
            Connected
          </div>
          <div className="info">
            <p>
              <strong>Address:</strong> {address}
            </p>
            <p>
              <strong>Balance:</strong> {balance?.formatted} {balance?.symbol}
            </p>
          </div>
          <button onClick={() => disconnect()}>Disconnect</button>
        </>
      ) : (
        <>
          <div className="status">
            <span className="dot"></span>
            Not connected
          </div>
          {connectors.map((connector) => (
            <button key={connector.uid} onClick={() => connect({ connector })} disabled={isPending}>
              {isPending ? 'Connecting...' : `Connect with ${connector.name}`}
            </button>
          ))}
        </>
      )}
    </div>
  )
}

/**
 * Agent initialization card
 */
function InitializeCard() {
  const { isConnected } = useAccount()
  const { initialize, isInitialized } = useMonmouth()
  const [agentType, setAgentType] = useState<AgentType>('commerce')
  const [agentName, setAgentName] = useState('My Agent')
  const [isLoading, setIsLoading] = useState(false)

  const handleInitialize = async () => {
    setIsLoading(true)
    try {
      await initialize(agentType, agentName)
    } finally {
      setIsLoading(false)
    }
  }

  if (!isConnected) {
    return null
  }

  if (isInitialized) {
    return null
  }

  return (
    <div className="card init-card">
      <h2>Initialize Agent</h2>
      <p className="init-subtitle">Configure your agent identity before using the SDK</p>

      <div className="init-form">
        <div className="init-field">
          <label>Agent Name</label>
          <input
            type="text"
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            placeholder="My Commerce Agent"
          />
        </div>

        <div className="init-field">
          <label>Agent Type</label>
          <div className="init-type-grid">
            {(['research', 'trading', 'coordinator', 'commerce'] as AgentType[]).map((type) => (
              <button
                key={type}
                className={`init-type-btn ${agentType === type ? 'active' : ''}`}
                onClick={() => setAgentType(type)}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <button className="btn-primary init-btn" onClick={handleInitialize} disabled={isLoading || !agentName}>
          {isLoading ? 'Initializing...' : 'Initialize SDK'}
        </button>
      </div>
    </div>
  )
}

/**
 * Main app content
 */
function AppContent() {
  const { isConnected } = useAccount()
  const { isInitialized } = useMonmouth()

  return (
    <div className="container">
      <header className="app-header">
        <h1>Monmouth Wallet SDK</h1>
        <p className="subtitle">Agent-aware wallet with guardrails, identity, and x402 payments</p>
      </header>

      {/* Guardrail Alerts - Always visible when there are alerts */}
      <GuardrailAlerts />

      {/* Connection */}
      <ConnectionCard />

      {/* Initialize Agent */}
      <InitializeCard />

      {/* SDK Features - Only show when initialized */}
      {isConnected && isInitialized && (
        <>
          <div className="grid-2">
            <AgentIdentityDisplay />
            <SpendingPolicyConfig />
          </div>

          <X402Demo />

          <ActivityLogViewer />
        </>
      )}

      <footer className="app-footer">
        <p>Built with Porto (EIP-7702) on Base Sepolia</p>
      </footer>
    </div>
  )
}

/**
 * App with providers
 */
function App() {
  return (
    <MonmouthProvider>
      <AppContent />
    </MonmouthProvider>
  )
}

export default App
