/**
 * AgentIdentityDisplay - Shows agent DID and identity info
 */

import { useState, useCallback } from 'react'
import { useMonmouth } from '../context/MonmouthContext'
import { useMonmouthWallet, formatSessionTime } from '../hooks/useMonmouthWallet'

/**
 * AgentIdentityDisplay component
 */
export function AgentIdentityDisplay() {
  const { identity, identityDoc, isInitialized } = useMonmouth()
  const { did, agentType, agentName, sessionRemaining } = useMonmouthWallet()
  const [copied, setCopied] = useState(false)

  // Copy DID to clipboard
  const copyDID = useCallback(async () => {
    if (!did) return
    try {
      await navigator.clipboard.writeText(did)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy DID:', err)
    }
  }, [did])

  if (!isInitialized || !identityDoc) {
    return (
      <div className="card identity-card">
        <h2>Agent Identity</h2>
        <p className="identity-placeholder">Initialize wallet to view identity</p>
      </div>
    )
  }

  // Truncate DID for display
  const truncatedDID = did ? `${did.slice(0, 20)}...${did.slice(-8)}` : ''

  return (
    <div className="card identity-card">
      <h2>Agent Identity</h2>

      <div className="identity-grid">
        <div className="identity-item">
          <span className="identity-label">DID</span>
          <div className="identity-did">
            <code className="identity-value" title={did || ''}>
              {truncatedDID}
            </code>
            <button className="btn-icon" onClick={copyDID} title="Copy DID">
              {copied ? '✓' : '📋'}
            </button>
          </div>
        </div>

        <div className="identity-item">
          <span className="identity-label">Type</span>
          <span className="identity-badge">{agentType}</span>
        </div>

        <div className="identity-item">
          <span className="identity-label">Name</span>
          <span className="identity-value">{agentName}</span>
        </div>

        <div className="identity-item">
          <span className="identity-label">Session</span>
          <span className={`identity-value ${sessionRemaining && sessionRemaining < 3600000 ? 'warning' : ''}`}>
            {formatSessionTime(sessionRemaining)}
          </span>
        </div>

        <div className="identity-item">
          <span className="identity-label">Capabilities</span>
          <div className="identity-capabilities">
            {identityDoc.capabilities.map((cap) => (
              <span key={cap} className="capability-tag">
                {cap}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="identity-actions">
        <button
          className="btn-secondary"
          onClick={() => {
            if (identity) {
              const json = identity.toJSON()
              if (json) {
                const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `identity-${json.id.slice(0, 16)}.json`
                a.click()
                URL.revokeObjectURL(url)
              }
            }
          }}
        >
          Export Identity
        </button>
      </div>
    </div>
  )
}
