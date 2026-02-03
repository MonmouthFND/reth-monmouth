/**
 * OpenClaw Integration Layer
 *
 * Connects OpenClaw AI agents to Monmouth settlement infrastructure.
 * OpenClaw provides the runtime. Monmouth provides the guardrails.
 */

import { type Address, type Hash } from 'viem';

// ============================================================================
// Types
// ============================================================================

export type OpenClawAgentStatus =
  | 'offline'
  | 'initializing'
  | 'connected'
  | 'executing'
  | 'awaiting_approval'
  | 'suspended';

export type RuntimeType = 'evm' | 'svm' | 'move' | 'cairo';

export interface OpenClawConfig {
  runtime: 'openclaw';
  version: string;

  identity: {
    did: string; // Monmouth canonical DID
    handle?: string; // Moltbook handle (e.g., @trader_42)
    guardianAddress: Address; // Human supervisor wallet
  };

  settlement: {
    layer: 'monmouth';
    chainId: number;
    rpc: string;
    escrowContract: Address;
  };

  budgets: {
    maxPerTx: string; // e.g., "0.01 ETH"
    dailyCap: string; // e.g., "0.1 ETH"
    requireApproval: string; // e.g., "> 0.05 ETH"
    todaySpent: string;
    todayEarned: string;
  };

  payments: {
    protocol: 'x402';
    escrowBacked: boolean;
  };

  execution: {
    supportedChains: string[];
    routingStrategy: 'cost-optimized' | 'speed-optimized' | 'security-first';
  };
}

export interface OpenClawAgent {
  id: string;
  config: OpenClawConfig;
  status: OpenClawAgentStatus;
  lastHeartbeat: number;
  currentOperation?: OpenClawOperation;
  pendingApprovals: ApprovalRequest[];
  recentTransactions: OpenClawTransaction[];
  metrics: AgentMetrics;
}

export interface OpenClawOperation {
  id: string;
  type: 'escrow_create' | 'escrow_claim' | 'trade' | 'transfer' | 'research';
  description: string;
  startedAt: number;
  chain: RuntimeType;
  estimatedCost: string;
  status: 'pending' | 'executing' | 'awaiting_approval' | 'completed' | 'failed';
}

export interface ApprovalRequest {
  id: string;
  operationType: OpenClawOperation['type'];
  description: string;
  amount: string;
  chain: string;
  createdAt: number;
  expiresAt: number;
  riskLevel: 'low' | 'medium' | 'high';
  reason: string; // Why approval is needed
}

export interface OpenClawTransaction {
  hash: Hash;
  type: OpenClawOperation['type'];
  amount: string;
  chain: string;
  timestamp: number;
  status: 'pending' | 'confirmed' | 'failed';
  gasUsed?: string;
}

export interface AgentMetrics {
  uptime: number; // seconds
  operationsCompleted: number;
  operationsFailed: number;
  totalVolumeUsd: string;
  avgResponseTime: number; // ms
  escrowCompletionRate: number; // 0-100
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_OPENCLAW_CONFIG: OpenClawConfig = {
  runtime: 'openclaw',
  version: '0.9.4',

  identity: {
    did: 'did:monmouth:0x0000000000000000000000000000000000000000',
    guardianAddress: '0x0000000000000000000000000000000000000000',
  },

  settlement: {
    layer: 'monmouth',
    chainId: 7750,
    rpc: 'http://localhost:8545',
    escrowContract: '0x0000000000000000000000000000000000000000',
  },

  budgets: {
    maxPerTx: '0.01 ETH',
    dailyCap: '0.1 ETH',
    requireApproval: '> 0.05 ETH',
    todaySpent: '0 ETH',
    todayEarned: '0 ETH',
  },

  payments: {
    protocol: 'x402',
    escrowBacked: true,
  },

  execution: {
    supportedChains: ['monmouth', 'base', 'ethereum'],
    routingStrategy: 'cost-optimized',
  },
};

// ============================================================================
// Mock Data for Demo
// ============================================================================

export function createMockOpenClawAgent(
  address: Address,
  guardianAddress: Address,
  escrowContract: Address
): OpenClawAgent {
  const did = `did:monmouth:${address.slice(2)}`;

  return {
    id: `openclaw-${address.slice(0, 10)}`,
    config: {
      ...DEFAULT_OPENCLAW_CONFIG,
      identity: {
        did,
        handle: '@monmouth_trader',
        guardianAddress,
      },
      settlement: {
        ...DEFAULT_OPENCLAW_CONFIG.settlement,
        escrowContract,
      },
    },
    status: 'connected',
    lastHeartbeat: Date.now(),
    pendingApprovals: [],
    recentTransactions: [],
    metrics: {
      uptime: 3600,
      operationsCompleted: 12,
      operationsFailed: 1,
      totalVolumeUsd: '$1,247.50',
      avgResponseTime: 850,
      escrowCompletionRate: 92,
    },
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

export function formatDid(did: string): string {
  if (did.length <= 28) return did;
  return `${did.slice(0, 16)}...${did.slice(-8)}`;
}

export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

export function getRiskColor(level: ApprovalRequest['riskLevel']): string {
  switch (level) {
    case 'low':
      return 'var(--profit)';
    case 'medium':
      return 'var(--warning)';
    case 'high':
      return 'var(--blocked)';
  }
}

export function getStatusColor(status: OpenClawAgentStatus): string {
  switch (status) {
    case 'offline':
      return 'var(--gray-7)';
    case 'initializing':
      return 'var(--gray-9)';
    case 'connected':
      return 'var(--profit)';
    case 'executing':
      return 'var(--cyan-9)';
    case 'awaiting_approval':
      return 'var(--warning)';
    case 'suspended':
      return 'var(--blocked)';
  }
}

export function getStatusLabel(status: OpenClawAgentStatus): string {
  switch (status) {
    case 'offline':
      return 'OFFLINE';
    case 'initializing':
      return 'INITIALIZING';
    case 'connected':
      return 'CONNECTED';
    case 'executing':
      return 'EXECUTING';
    case 'awaiting_approval':
      return 'AWAITING APPROVAL';
    case 'suspended':
      return 'SUSPENDED';
  }
}
