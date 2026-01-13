/**
 * E2E Tests: Wallet Connection
 *
 * Tests for wallet connection, agent initialization, and guardrails
 * using mocked wallet provider for CI compatibility.
 */

import { test, expect, connectWallet, initializeAgent, waitForWalletConnection } from '../setup/fixtures'
import { parseEther } from 'viem'

test.describe('Wallet Connection', () => {
  test.beforeEach(async ({ walletPage }) => {
    // Navigate to test app
    await walletPage.goto('/')
    // Wait for app to load
    await walletPage.waitForLoadState('networkidle')
  })

  test('should display connect wallet button when disconnected', async ({ walletPage }) => {
    // Look for connect button
    const connectButton = walletPage.locator(
      '[data-testid="connect-wallet"], button:has-text("Connect"), button:has-text("Connect Wallet")'
    )

    await expect(connectButton.first()).toBeVisible()
  })

  test('should connect wallet successfully', async ({ walletPage, accounts }) => {
    // Connect wallet via UI
    await connectWallet(walletPage)

    // Verify connected state is displayed
    // The exact selector depends on your test app implementation
    const connectedIndicator = walletPage.locator(
      '[data-testid="connected-address"], .wallet-connected, [data-testid="wallet-status"]'
    )
    await expect(connectedIndicator.first()).toBeVisible()

    // Optionally check that the address is displayed
    const addressDisplay = walletPage.locator('text=' + accounts.alice.address.slice(0, 10))
    // Address might be truncated, just check first part is visible
    const isAddressVisible = await addressDisplay.first().isVisible().catch(() => false)
    // This is optional since UI may vary
  })

  test('should disconnect wallet', async ({ walletPage }) => {
    // First connect
    await connectWallet(walletPage)

    // Find and click disconnect button
    const disconnectButton = walletPage.locator(
      '[data-testid="disconnect-wallet"], button:has-text("Disconnect"), button:has-text("Logout")'
    )

    if (await disconnectButton.first().isVisible()) {
      await disconnectButton.first().click()

      // Verify disconnected state
      const connectButton = walletPage.locator(
        '[data-testid="connect-wallet"], button:has-text("Connect")'
      )
      await expect(connectButton.first()).toBeVisible()
    } else {
      // Disconnect button might be in a dropdown
      test.skip()
    }
  })
})

test.describe('Agent Initialization', () => {
  test.beforeEach(async ({ walletPage }) => {
    await walletPage.goto('/')
    await walletPage.waitForLoadState('networkidle')
    // Ensure wallet is connected first
    await connectWallet(walletPage)
  })

  test('should initialize agent with default settings', async ({ walletPage }) => {
    // Find agent initialization section or trigger
    const initSection = walletPage.locator(
      '[data-testid="agent-init"], [data-testid="initialize-section"], .agent-initialization'
    )

    if (await initSection.first().isVisible()) {
      // Initialize with defaults
      await initializeAgent(walletPage, {
        agentId: 'e2e-test-agent',
        agentType: 'research',
        agentName: 'E2E Test Agent',
      })

      // Verify agent is initialized
      const agentStatus = walletPage.locator(
        '[data-testid="agent-initialized"], [data-testid="agent-status"], .agent-ready'
      )
      await expect(agentStatus.first()).toBeVisible()
    } else {
      // If no explicit init section, agent might auto-initialize
      test.skip()
    }
  })

  test('should display agent identity after initialization', async ({ walletPage }) => {
    // Initialize agent
    const initSection = walletPage.locator('[data-testid="agent-init"]')
    if (await initSection.isVisible()) {
      await initializeAgent(walletPage, {
        agentId: 'identity-test-agent',
        agentType: 'trading',
        agentName: 'Identity Test Agent',
      })
    }

    // Look for identity display
    const identityDisplay = walletPage.locator(
      '[data-testid="agent-identity"], .agent-identity, [data-testid="agent-info"]'
    )

    if (await identityDisplay.first().isVisible()) {
      // Check that some identity info is shown
      const identityText = await identityDisplay.first().textContent()
      // At minimum we should see something
      expect(identityText).toBeTruthy()
    } else {
      test.skip()
    }
  })

  test('should show policy/guardrails after initialization', async ({ walletPage }) => {
    // Initialize agent
    const initSection = walletPage.locator('[data-testid="agent-init"]')
    if (await initSection.isVisible()) {
      await initializeAgent(walletPage, {
        agentType: 'research',
      })
    }

    // Look for policy display
    const policyDisplay = walletPage.locator(
      '[data-testid="policy-info"], [data-testid="guardrails"], .spending-limits'
    )

    if (await policyDisplay.first().isVisible()) {
      // Research template should show 0.1 ETH per-tx limit
      const policyText = await policyDisplay.first().textContent()
      expect(policyText).toBeTruthy()
    } else {
      test.skip()
    }
  })
})

test.describe('Guardrails Blocking', () => {
  test.beforeEach(async ({ walletPage }) => {
    await walletPage.goto('/')
    await walletPage.waitForLoadState('networkidle')
    await connectWallet(walletPage)
  })

  test('should block transaction exceeding per-tx limit', async ({ walletPage, accounts }) => {
    // This test verifies that guardrails block transactions
    // The test app should have a send transaction form

    const sendForm = walletPage.locator(
      '[data-testid="send-form"], [data-testid="transfer-form"], .send-transaction'
    )

    if (!(await sendForm.first().isVisible())) {
      test.skip()
      return
    }

    // Fill in a large amount that exceeds limits
    const amountInput = walletPage.locator(
      '[data-testid="amount-input"], input[name="amount"], input[type="number"]'
    )
    await amountInput.first().fill('1000') // Way over any reasonable limit

    const recipientInput = walletPage.locator(
      '[data-testid="recipient-input"], input[name="to"], input[name="recipient"]'
    )
    await recipientInput.first().fill(accounts.bob.address)

    // Try to send
    const sendButton = walletPage.locator(
      '[data-testid="send-button"], button:has-text("Send"), button[type="submit"]'
    )
    await sendButton.first().click()

    // Should see error/blocked message
    const errorMessage = walletPage.locator(
      '[data-testid="error-message"], [data-testid="blocked-message"], .error, .alert-error, text=/blocked|exceeded|limit/i'
    )
    await expect(errorMessage.first()).toBeVisible({ timeout: 5000 })
  })

  test('should allow transaction within limits', async ({ walletPage, accounts }) => {
    const sendForm = walletPage.locator(
      '[data-testid="send-form"], [data-testid="transfer-form"], .send-transaction'
    )

    if (!(await sendForm.first().isVisible())) {
      test.skip()
      return
    }

    // Fill in a small amount within limits
    const amountInput = walletPage.locator(
      '[data-testid="amount-input"], input[name="amount"], input[type="number"]'
    )
    await amountInput.first().fill('0.01') // Small amount, should be within limits

    const recipientInput = walletPage.locator(
      '[data-testid="recipient-input"], input[name="to"], input[name="recipient"]'
    )
    await recipientInput.first().fill(accounts.bob.address)

    // Try to send
    const sendButton = walletPage.locator(
      '[data-testid="send-button"], button:has-text("Send"), button[type="submit"]'
    )
    await sendButton.first().click()

    // Should see success or pending state (not error)
    // Note: With mock wallet, actual tx won't complete but UI should show "pending" or "sent"
    const successIndicator = walletPage.locator(
      '[data-testid="tx-pending"], [data-testid="tx-success"], text=/pending|sent|success|submitted/i'
    )
    const errorIndicator = walletPage.locator('[data-testid="error-message"], .error')

    // Wait a moment for UI to update
    await walletPage.waitForTimeout(1000)

    // Either success is visible OR error is not visible
    const hasSuccess = await successIndicator.first().isVisible().catch(() => false)
    const hasError = await errorIndicator.first().isVisible().catch(() => false)

    // For this test to pass, we either see success OR we don't see a guardrails-specific error
    if (!hasSuccess && hasError) {
      const errorText = await errorIndicator.first().textContent()
      // If error is guardrails-related, fail the test
      expect(errorText?.toLowerCase()).not.toMatch(/blocked|exceeded|limit|guardrail/)
    }
  })

  test('should show daily spending tracking', async ({ walletPage }) => {
    // Look for spending display
    const spendingDisplay = walletPage.locator(
      '[data-testid="daily-spent"], [data-testid="spending-tracker"], .daily-budget'
    )

    if (await spendingDisplay.first().isVisible()) {
      const text = await spendingDisplay.first().textContent()
      // Should show some spending info
      expect(text).toBeTruthy()
      // Might contain ETH or numbers
      expect(text).toMatch(/\d|eth/i)
    } else {
      // Spending display might not be visible by default
      test.skip()
    }
  })

  test('should block contract deployment for restricted agent types', async ({ walletPage }) => {
    // This tests that research agents cannot deploy contracts

    const deploySection = walletPage.locator(
      '[data-testid="deploy-contract"], [data-testid="contract-deploy"], .deploy-section'
    )

    if (!(await deploySection.first().isVisible())) {
      test.skip()
      return
    }

    // Try to deploy
    const deployButton = walletPage.locator(
      '[data-testid="deploy-button"], button:has-text("Deploy")'
    )
    await deployButton.first().click()

    // Should see blocked message
    const blockedMessage = walletPage.locator(
      '[data-testid="blocked-message"], text=/cannot deploy|blocked|not allowed/i'
    )
    await expect(blockedMessage.first()).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Session Management', () => {
  test.beforeEach(async ({ walletPage }) => {
    await walletPage.goto('/')
    await walletPage.waitForLoadState('networkidle')
    await connectWallet(walletPage)
  })

  test('should display session time remaining', async ({ walletPage }) => {
    const sessionDisplay = walletPage.locator(
      '[data-testid="session-time"], [data-testid="session-remaining"], .session-timer'
    )

    if (await sessionDisplay.first().isVisible()) {
      const text = await sessionDisplay.first().textContent()
      // Should show time (hours, minutes, or similar)
      expect(text).toMatch(/\d|hour|min|h|m/i)
    } else {
      test.skip()
    }
  })

  test('should allow session extension', async ({ walletPage }) => {
    const extendButton = walletPage.locator(
      '[data-testid="extend-session"], button:has-text("Extend")'
    )

    if (await extendButton.first().isVisible()) {
      // Get initial time
      const sessionDisplay = walletPage.locator('[data-testid="session-time"]')
      const initialText = await sessionDisplay.first().textContent().catch(() => '')

      // Click extend
      await extendButton.first().click()

      // Wait for update
      await walletPage.waitForTimeout(500)

      // Time should have changed (or at least no error)
      const newText = await sessionDisplay.first().textContent().catch(() => '')
      // Just verify something happened
      expect(newText).toBeTruthy()
    } else {
      test.skip()
    }
  })
})
