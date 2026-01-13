/**
 * ActivityLogViewer - View and export activity history
 */

import { useState, useEffect, useCallback } from 'react'
import { useMonmouth } from '../context/MonmouthContext'
import { formatTimestamp } from '../hooks/useMonmouthWallet'
import type { ActivityLogEntry, ActivityActionType } from '../../../src'

const ACTION_TYPE_COLORS: Record<ActivityActionType, string> = {
  transaction: '#22c55e',
  signature: '#3b82f6',
  decision: '#f59e0b',
  error: '#ef4444',
}

const ACTION_TYPE_ICONS: Record<ActivityActionType, string> = {
  transaction: '💸',
  signature: '✍️',
  decision: '🤔',
  error: '❌',
}

/**
 * ActivityLogViewer component
 */
export function ActivityLogViewer() {
  const { activityLog, wallet, isInitialized } = useMonmouth()
  const [entries, setEntries] = useState<ActivityLogEntry[]>([])
  const [filter, setFilter] = useState<ActivityActionType | 'all'>('all')
  const [showConfirmClear, setShowConfirmClear] = useState(false)

  // Refresh entries
  const refreshEntries = useCallback(() => {
    if (!activityLog || !wallet) return
    const history = activityLog.getHistory(wallet.getAgentId(), 100)
    setEntries(history)
  }, [activityLog, wallet])

  // Initial load and periodic refresh
  useEffect(() => {
    refreshEntries()
    const interval = setInterval(refreshEntries, 5000)
    return () => clearInterval(interval)
  }, [refreshEntries])

  // Filter entries
  const filteredEntries = filter === 'all' ? entries : entries.filter((e) => e.actionType === filter)

  // Export to JSON
  const handleExport = useCallback(() => {
    if (!activityLog) return
    const data = activityLog.export()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `activity-log-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [activityLog])

  // Clear log
  const handleClear = useCallback(() => {
    if (!activityLog) return
    activityLog.clear()
    setEntries([])
    setShowConfirmClear(false)
  }, [activityLog])

  // Format entry data for display
  const formatEntryData = (entry: ActivityLogEntry): string => {
    const data = entry.data as Record<string, unknown>
    if (!data) return ''

    if (entry.actionType === 'transaction') {
      const amount = data.amount || data.value
      const to = data.to || data.recipient
      if (amount && to) {
        return `${amount} → ${typeof to === 'string' ? `${to.slice(0, 10)}...` : to}`
      }
    }

    if (entry.actionType === 'error') {
      return data.error?.toString() || data.message?.toString() || 'Error'
    }

    if (entry.actionType === 'decision') {
      return data.decision?.toString() || data.reason?.toString() || 'Decision made'
    }

    // Generic formatting
    const event = data.event || data.type
    if (event) return event.toString()

    return JSON.stringify(data).slice(0, 50) + '...'
  }

  if (!isInitialized) {
    return (
      <div className="card activity-card">
        <h2>Activity Log</h2>
        <p className="activity-placeholder">Initialize wallet to view activity</p>
      </div>
    )
  }

  return (
    <div className="card activity-card">
      <div className="activity-header">
        <h2>Activity Log</h2>
        <div className="activity-actions">
          <button className="btn-secondary btn-sm" onClick={handleExport}>
            Export
          </button>
          {showConfirmClear ? (
            <>
              <button className="btn-danger btn-sm" onClick={handleClear}>
                Confirm
              </button>
              <button className="btn-secondary btn-sm" onClick={() => setShowConfirmClear(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button className="btn-secondary btn-sm" onClick={() => setShowConfirmClear(true)}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Filter */}
      <div className="activity-filter">
        <button className={`filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          All ({entries.length})
        </button>
        {(['transaction', 'signature', 'decision', 'error'] as ActivityActionType[]).map((type) => {
          const count = entries.filter((e) => e.actionType === type).length
          return (
            <button
              key={type}
              className={`filter-btn ${filter === type ? 'active' : ''}`}
              onClick={() => setFilter(type)}
              style={filter === type ? { borderColor: ACTION_TYPE_COLORS[type] } : {}}
            >
              {ACTION_TYPE_ICONS[type]} {type} ({count})
            </button>
          )
        })}
      </div>

      {/* Entries */}
      <div className="activity-list">
        {filteredEntries.length === 0 ? (
          <p className="activity-empty">No activity recorded</p>
        ) : (
          filteredEntries.map((entry, idx) => (
            <div key={`${entry.timestamp}-${idx}`} className="activity-entry">
              <span className="activity-time">{formatTimestamp(entry.timestamp)}</span>
              <span
                className="activity-type"
                style={{ backgroundColor: `${ACTION_TYPE_COLORS[entry.actionType]}20`, color: ACTION_TYPE_COLORS[entry.actionType] }}
              >
                {ACTION_TYPE_ICONS[entry.actionType]} {entry.actionType}
              </span>
              <span className="activity-data">{formatEntryData(entry)}</span>
            </div>
          ))
        )}
      </div>

      <div className="activity-footer">
        <span className="activity-count">{filteredEntries.length} entries</span>
        <button className="btn-text" onClick={refreshEntries}>
          Refresh
        </button>
      </div>
    </div>
  )
}
