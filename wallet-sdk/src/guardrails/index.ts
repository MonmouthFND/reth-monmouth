/**
 * Guardrails module - Safety mechanisms for agent wallets
 */

export { PolicyEnforcer, createEnforcer } from './PolicyEnforcer'
export {
  PermissionTemplates,
  createPolicyFromTemplate,
  createMinimalPolicy,
  getDefaultSessionDuration,
  isPolicyActive,
  eth,
  HOUR,
  DAY,
} from './templates'
export type { PermissionTemplate } from './templates'
