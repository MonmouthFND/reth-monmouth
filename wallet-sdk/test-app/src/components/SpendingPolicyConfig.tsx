/**
 * SpendingPolicyConfig - Configure spending guardrails
 */

import { useState } from 'react'
import { useMonmouth } from '../context/MonmouthContext'
import { useMonmouthWallet, formatETH, parseETH } from '../hooks/useMonmouthWallet'
import { PermissionTemplates } from '../../../src'

type TemplateKey = keyof typeof PermissionTemplates

const TEMPLATE_INFO: Record<TemplateKey, { description: string; color: string }> = {
  research: { description: 'Low limits for testing', color: '#3b82f6' },
  trading: { description: 'High limits for DeFi', color: '#f59e0b' },
  coordinator: { description: 'Minimal for orchestration', color: '#8b5cf6' },
  commerce: { description: 'Balanced for shopping', color: '#22c55e' },
}

/**
 * SpendingPolicyConfig component
 */
export function SpendingPolicyConfig() {
  const { updatePolicy, updateCustomPolicy, isInitialized } = useMonmouth()
  const { maxPerTransaction, maxPerDay, dailySpent, dailyRemaining, spendingPercentage, hasExceededLimits } =
    useMonmouthWallet()

  const [selectedTemplate, setSelectedTemplate] = useState<TemplateKey>('commerce')
  const [customMaxTx, setCustomMaxTx] = useState('')
  const [customMaxDay, setCustomMaxDay] = useState('')
  const [showCustom, setShowCustom] = useState(false)

  if (!isInitialized) {
    return (
      <div className="card policy-card">
        <h2>Spending Policy</h2>
        <p className="policy-placeholder">Initialize wallet to configure policy</p>
      </div>
    )
  }

  // Handle template selection
  const handleTemplateSelect = (template: TemplateKey) => {
    setSelectedTemplate(template)
    updatePolicy(template)
    setShowCustom(false)
  }

  // Handle custom policy save
  const handleCustomSave = () => {
    const updates: { maxPerTransaction?: bigint; maxPerDay?: bigint } = {}

    if (customMaxTx) {
      try {
        updates.maxPerTransaction = parseETH(customMaxTx)
      } catch {
        // Invalid input, ignore
      }
    }

    if (customMaxDay) {
      try {
        updates.maxPerDay = parseETH(customMaxDay)
      } catch {
        // Invalid input, ignore
      }
    }

    if (Object.keys(updates).length > 0) {
      updateCustomPolicy(updates)
    }
  }

  return (
    <div className="card policy-card">
      <h2>
        Spending Policy
        <span className="policy-template-badge" style={{ backgroundColor: TEMPLATE_INFO[selectedTemplate].color }}>
          {selectedTemplate}
        </span>
      </h2>

      {/* Spending Summary */}
      <div className="policy-summary">
        <div className="policy-stat">
          <span className="policy-stat-label">Per-Tx Limit</span>
          <span className="policy-stat-value">{maxPerTransaction} ETH</span>
        </div>
        <div className="policy-stat">
          <span className="policy-stat-label">Daily Limit</span>
          <span className="policy-stat-value">{maxPerDay} ETH</span>
        </div>
        <div className="policy-stat">
          <span className="policy-stat-label">Used Today</span>
          <span className={`policy-stat-value ${hasExceededLimits ? 'exceeded' : ''}`}>
            {dailySpent} / {maxPerDay} ETH
          </span>
        </div>
      </div>

      {/* Spending Progress Bar */}
      <div className="policy-progress">
        <div className="policy-progress-bar">
          <div
            className={`policy-progress-fill ${hasExceededLimits ? 'exceeded' : ''}`}
            style={{ width: `${spendingPercentage}%` }}
          />
        </div>
        <div className="policy-progress-labels">
          <span>{spendingPercentage.toFixed(0)}% used</span>
          <span>{dailyRemaining} ETH remaining</span>
        </div>
      </div>

      {/* Template Selector */}
      <div className="policy-templates">
        <span className="policy-section-label">Permission Templates</span>
        <div className="policy-template-grid">
          {(Object.keys(PermissionTemplates) as TemplateKey[]).map((template) => (
            <button
              key={template}
              className={`policy-template-btn ${selectedTemplate === template ? 'active' : ''}`}
              onClick={() => handleTemplateSelect(template)}
              style={
                selectedTemplate === template
                  ? { borderColor: TEMPLATE_INFO[template].color, backgroundColor: `${TEMPLATE_INFO[template].color}20` }
                  : {}
              }
            >
              <span className="template-name">{template}</span>
              <span className="template-limits">
                {formatETH(PermissionTemplates[template].maxPerTransaction)} /{' '}
                {formatETH(PermissionTemplates[template].maxPerDay)} ETH
              </span>
              <span className="template-desc">{TEMPLATE_INFO[template].description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Configuration */}
      <div className="policy-custom">
        <button className="btn-text" onClick={() => setShowCustom(!showCustom)}>
          {showCustom ? '▼ Hide Custom Limits' : '▶ Custom Limits'}
        </button>

        {showCustom && (
          <div className="policy-custom-form">
            <div className="policy-input-group">
              <label>Max Per Transaction (ETH)</label>
              <input
                type="text"
                value={customMaxTx}
                onChange={(e) => setCustomMaxTx(e.target.value)}
                placeholder={maxPerTransaction}
              />
            </div>
            <div className="policy-input-group">
              <label>Max Per Day (ETH)</label>
              <input
                type="text"
                value={customMaxDay}
                onChange={(e) => setCustomMaxDay(e.target.value)}
                placeholder={maxPerDay}
              />
            </div>
            <button className="btn-primary" onClick={handleCustomSave}>
              Apply Custom Limits
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
