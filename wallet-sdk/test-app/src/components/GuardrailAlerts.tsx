/**
 * GuardrailAlerts - Display payment blocked notifications
 */

import { useMonmouth, type GuardrailAlert } from '../context/MonmouthContext'

/**
 * Single alert component
 */
function Alert({ alert, onDismiss }: { alert: GuardrailAlert; onDismiss: () => void }) {
  const timeAgo = getTimeAgo(alert.timestamp)

  return (
    <div className={`guardrail-alert ${alert.type}`}>
      <div className="alert-icon">{alert.type === 'blocked' ? '🛑' : '⚠️'}</div>
      <div className="alert-content">
        <div className="alert-header">
          <span className="alert-title">{alert.type === 'blocked' ? 'Payment Blocked' : 'Warning'}</span>
          <span className="alert-time">{timeAgo}</span>
        </div>
        <p className="alert-message">{alert.message}</p>
        {alert.details && (
          <div className="alert-details">
            {alert.details.amount && <span>Amount: {formatWei(alert.details.amount)} ETH</span>}
            {alert.details.recipient && (
              <span>To: {truncateAddress(alert.details.recipient)}</span>
            )}
          </div>
        )}
      </div>
      <button className="alert-dismiss" onClick={onDismiss} title="Dismiss">
        ✕
      </button>
    </div>
  )
}

/**
 * GuardrailAlerts component
 */
export function GuardrailAlerts() {
  const { alerts, dismissAlert, clearAlerts } = useMonmouth()

  if (alerts.length === 0) {
    return null
  }

  return (
    <div className="guardrail-alerts-container">
      <div className="alerts-header">
        <span className="alerts-title">
          {alerts.length} Alert{alerts.length > 1 ? 's' : ''}
        </span>
        {alerts.length > 1 && (
          <button className="btn-text" onClick={clearAlerts}>
            Clear All
          </button>
        )}
      </div>
      <div className="alerts-list">
        {alerts.map((alert) => (
          <Alert key={alert.id} alert={alert} onDismiss={() => dismissAlert(alert.id)} />
        ))}
      </div>
    </div>
  )
}

/**
 * Format wei string to ETH
 */
function formatWei(wei: string): string {
  try {
    const num = BigInt(wei)
    const eth = Number(num) / 1e18
    return eth.toFixed(4)
  } catch {
    return wei
  }
}

/**
 * Truncate address for display
 */
function truncateAddress(address: string): string {
  if (address.length <= 16) return address
  return `${address.slice(0, 8)}...${address.slice(-6)}`
}

/**
 * Get human-readable time ago
 */
function getTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)

  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}
