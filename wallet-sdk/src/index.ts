/**
 * Monmouth Wallet SDK
 *
 * Agent-aware wallet layer built on Porto (EIP-7702)
 *
 * Features:
 * - Agent identity management
 * - Spending guardrails (per-transaction, daily limits, allowlists)
 * - Session management
 * - Activity logging (Phase 2)
 * - x402 payment protocol (Phase 3)
 *
 * @example
 * ```typescript
 * import { createMonmouthWallet, PermissionTemplates } from '@monmouth/wallet-sdk'
 *
 * const wallet = createMonmouthWallet({
 *   identity: {
 *     agentId: 'my-research-agent',
 *     agentType: 'research',
 *     name: 'Research Assistant',
 *   },
 *   policy: {
 *     maxPerTransaction: 0.05 ETH, // Custom override
 *   },
 * })
 *
 * // Validate before sending
 * const result = wallet.prepareTransaction({
 *   to: '0x...',
 *   value: parseEther('0.01'),
 * })
 *
 * if (result.allowed) {
 *   // Use wagmi to send the transaction
 *   const hash = await sendTransaction(...)
 *   wallet.recordTransaction(hash, parseEther('0.01'))
 * }
 * ```
 */

// Main wallet class
export { MonmouthWallet, createMonmouthWallet } from './MonmouthWallet'

// Guardrails
export {
  PolicyEnforcer,
  createEnforcer,
  PermissionTemplates,
  createPolicyFromTemplate,
  createMinimalPolicy,
  getDefaultSessionDuration,
  isPolicyActive,
  eth,
  HOUR,
  DAY,
} from './guardrails'
export type { PermissionTemplate } from './guardrails'

// Types
export type {
  AgentIdentity,
  AgentType,
  SpendingPolicy,
  ActivityLogEntry,
  ActivityActionType,
  PolicyValidationResult,
  TransactionIntent,
  WalletState,
  MonmouthWalletConfig,
  WalletEvent,
  WalletEventListener,
  Address,
  Hash,
  Hex,
} from './types'
