/**
 * X402Demo - Interactive demo of x402 payment protocol
 */

import { useState, useCallback } from 'react'
import { useMonmouth } from '../context/MonmouthContext'
import { parseETH } from '../hooks/useMonmouthWallet'

interface PaymentStatus {
  state: 'idle' | 'loading' | 'success' | 'error'
  message?: string
  txHash?: string
  responseData?: string
}

// Mock API endpoints for demo
const DEMO_ENDPOINTS = [
  { url: 'https://api.example.com/market-data', cost: '0.001', description: 'Real-time market data' },
  { url: 'https://api.example.com/ai-analysis', cost: '0.01', description: 'AI-powered analysis' },
  { url: 'https://api.example.com/premium-feed', cost: '0.05', description: 'Premium data feed' },
]

/**
 * X402Demo component
 */
export function X402Demo() {
  const { makePayment, isInitialized } = useMonmouth()
  const [url, setUrl] = useState('')
  const [customAmount, setCustomAmount] = useState('0.01')
  const [status, setStatus] = useState<PaymentStatus>({ state: 'idle' })

  // Handle fetch with payment
  const handleFetch = useCallback(async () => {
    if (!url) {
      setStatus({ state: 'error', message: 'Please enter a URL' })
      return
    }

    setStatus({ state: 'loading', message: 'Processing payment...' })

    try {
      const amount = parseETH(customAmount)

      const result = await makePayment({
        recipient: url,
        amount,
        purpose: 'api_access',
      })

      if (result.success) {
        setStatus({
          state: 'success',
          message: `Paid ${customAmount} ETH for API access`,
          txHash: result.txHash,
          responseData: result.response ? 'Response received' : 'Payment complete',
        })
      } else {
        setStatus({
          state: 'error',
          message: result.error || 'Payment failed',
        })
      }
    } catch (error) {
      setStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }, [url, customAmount, makePayment])

  // Handle demo endpoint selection
  const handleDemoSelect = (endpoint: (typeof DEMO_ENDPOINTS)[0]) => {
    setUrl(endpoint.url)
    setCustomAmount(endpoint.cost)
    setStatus({ state: 'idle' })
  }

  if (!isInitialized) {
    return (
      <div className="card x402-card">
        <h2>x402 Payment Demo</h2>
        <p className="x402-placeholder">Initialize wallet to test x402 payments</p>
      </div>
    )
  }

  return (
    <div className="card x402-card">
      <h2>x402 Payment Demo</h2>
      <p className="x402-subtitle">Test paying for API access using the x402 protocol</p>

      {/* Demo Endpoints */}
      <div className="x402-demos">
        <span className="x402-label">Quick Select:</span>
        <div className="x402-demo-btns">
          {DEMO_ENDPOINTS.map((endpoint) => (
            <button
              key={endpoint.url}
              className="x402-demo-btn"
              onClick={() => handleDemoSelect(endpoint)}
            >
              <span className="demo-desc">{endpoint.description}</span>
              <span className="demo-cost">{endpoint.cost} ETH</span>
            </button>
          ))}
        </div>
      </div>

      {/* URL Input */}
      <div className="x402-input-group">
        <label>API Endpoint URL</label>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://api.example.com/data"
          className="x402-input"
        />
      </div>

      {/* Amount Input */}
      <div className="x402-input-group">
        <label>Payment Amount (ETH)</label>
        <input
          type="text"
          value={customAmount}
          onChange={(e) => setCustomAmount(e.target.value)}
          placeholder="0.01"
          className="x402-input x402-amount"
        />
      </div>

      {/* Action Button */}
      <button
        className="btn-primary x402-fetch-btn"
        onClick={handleFetch}
        disabled={status.state === 'loading' || !url}
      >
        {status.state === 'loading' ? 'Processing...' : `Fetch with Payment (${customAmount} ETH)`}
      </button>

      {/* Status Display */}
      {status.state !== 'idle' && (
        <div className={`x402-status ${status.state}`}>
          <span className="status-icon">
            {status.state === 'loading' && '⏳'}
            {status.state === 'success' && '✓'}
            {status.state === 'error' && '✗'}
          </span>
          <div className="status-content">
            <span className="status-message">{status.message}</span>
            {status.txHash && (
              <span className="status-tx">
                Tx: {status.txHash.slice(0, 10)}...{status.txHash.slice(-8)}
              </span>
            )}
            {status.responseData && <span className="status-response">{status.responseData}</span>}
          </div>
        </div>
      )}

      {/* Protocol Info */}
      <div className="x402-info">
        <h4>How x402 Works</h4>
        <ol>
          <li>Agent requests protected resource</li>
          <li>Server returns 402 Payment Required</li>
          <li>Agent signs EIP-712 payment authorization</li>
          <li>Payment header sent with retry request</li>
          <li>Server verifies payment, returns data</li>
        </ol>
      </div>
    </div>
  )
}
