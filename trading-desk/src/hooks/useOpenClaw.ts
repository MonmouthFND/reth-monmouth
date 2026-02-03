/**
 * useOpenClaw Hook
 *
 * Manages OpenClaw agent state and provides actions for
 * guardian supervision and agent control.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  type OpenClawAgent,
  type OpenClawAgentStatus,
  type ApprovalRequest,
  type OpenClawOperation,
  type OpenClawTransaction,
  createMockOpenClawAgent,
} from '../lib/openclaw';
import { TEST_ACCOUNTS, ESCROW_ADDRESS } from './useMonmouth';
import type { Hash } from 'viem';

export interface UseOpenClawReturn {
  agent: OpenClawAgent | null;
  isConnected: boolean;

  // Guardian actions
  approveRequest: (requestId: string) => Promise<void>;
  rejectRequest: (requestId: string) => Promise<void>;
  suspendAgent: () => void;
  resumeAgent: () => void;
  updateBudget: (field: 'maxPerTx' | 'dailyCap', value: string) => void;

  // Agent operations
  startOperation: (operation: Omit<OpenClawOperation, 'id' | 'startedAt' | 'status'>) => void;
  completeOperation: (operationId: string, txHash?: Hash) => void;
  failOperation: (operationId: string, error: string) => void;

  // Simulation helpers
  simulateApprovalRequest: () => void;
  simulateTransaction: (type: OpenClawOperation['type'], amount: string) => void;
}

export function useOpenClaw(): UseOpenClawReturn {
  const [agent, setAgent] = useState<OpenClawAgent | null>(null);

  // Initialize mock agent
  useEffect(() => {
    const mockAgent = createMockOpenClawAgent(
      TEST_ACCOUNTS.trader.address,
      TEST_ACCOUNTS.research.address, // Guardian is the research account for demo
      ESCROW_ADDRESS
    );
    setAgent(mockAgent);

    // Simulate heartbeat
    const heartbeatInterval = setInterval(() => {
      setAgent((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          lastHeartbeat: Date.now(),
          metrics: {
            ...prev.metrics,
            uptime: prev.metrics.uptime + 5,
          },
        };
      });
    }, 5000);

    return () => clearInterval(heartbeatInterval);
  }, []);

  // Guardian: Approve a pending request
  const approveRequest = useCallback(async (requestId: string) => {
    setAgent((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        pendingApprovals: prev.pendingApprovals.filter((r) => r.id !== requestId),
        status: prev.currentOperation ? 'executing' : 'connected',
      };
    });
    // In real implementation, this would sign and submit the approval on-chain
    await new Promise((r) => setTimeout(r, 500));
  }, []);

  // Guardian: Reject a pending request
  const rejectRequest = useCallback(async (requestId: string) => {
    setAgent((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        pendingApprovals: prev.pendingApprovals.filter((r) => r.id !== requestId),
        currentOperation: prev.currentOperation?.id === requestId
          ? undefined
          : prev.currentOperation,
        status: 'connected',
      };
    });
  }, []);

  // Guardian: Suspend agent operations
  const suspendAgent = useCallback(() => {
    setAgent((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        status: 'suspended' as OpenClawAgentStatus,
        currentOperation: undefined,
      };
    });
  }, []);

  // Guardian: Resume agent operations
  const resumeAgent = useCallback(() => {
    setAgent((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        status: 'connected' as OpenClawAgentStatus,
      };
    });
  }, []);

  // Guardian: Update budget constraints
  const updateBudget = useCallback((field: 'maxPerTx' | 'dailyCap', value: string) => {
    setAgent((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        config: {
          ...prev.config,
          budgets: {
            ...prev.config.budgets,
            [field]: value,
          },
        },
      };
    });
  }, []);

  // Agent: Start a new operation
  const startOperation = useCallback(
    (operation: Omit<OpenClawOperation, 'id' | 'startedAt' | 'status'>) => {
      const newOperation: OpenClawOperation = {
        ...operation,
        id: `op-${Date.now()}`,
        startedAt: Date.now(),
        status: 'pending',
      };

      // Check if approval is needed
      const costNum = parseFloat(operation.estimatedCost.replace(/[^0-9.]/g, ''));
      const maxNum = parseFloat(
        agent?.config.budgets.maxPerTx.replace(/[^0-9.]/g, '') || '0.01'
      );
      const needsApproval = costNum > maxNum;

      if (needsApproval) {
        const approvalRequest: ApprovalRequest = {
          id: newOperation.id,
          operationType: operation.type,
          description: operation.description,
          amount: operation.estimatedCost,
          chain: operation.chain,
          createdAt: Date.now(),
          expiresAt: Date.now() + 300000, // 5 minutes
          riskLevel: costNum > maxNum * 2 ? 'high' : 'medium',
          reason: `Amount ${operation.estimatedCost} exceeds per-tx limit of ${agent?.config.budgets.maxPerTx}`,
        };

        setAgent((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            status: 'awaiting_approval',
            currentOperation: { ...newOperation, status: 'awaiting_approval' },
            pendingApprovals: [...prev.pendingApprovals, approvalRequest],
          };
        });
      } else {
        setAgent((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            status: 'executing',
            currentOperation: { ...newOperation, status: 'executing' },
          };
        });
      }
    },
    [agent?.config.budgets.maxPerTx]
  );

  // Agent: Complete current operation
  const completeOperation = useCallback((operationId: string, txHash?: Hash) => {
    setAgent((prev) => {
      if (!prev) return null;

      const operation = prev.currentOperation;
      if (!operation || operation.id !== operationId) return prev;

      const newTx: OpenClawTransaction = {
        hash: txHash || (`0x${Math.random().toString(16).slice(2)}` as Hash),
        type: operation.type,
        amount: operation.estimatedCost,
        chain: operation.chain,
        timestamp: Date.now(),
        status: 'confirmed',
      };

      return {
        ...prev,
        status: 'connected',
        currentOperation: undefined,
        recentTransactions: [newTx, ...prev.recentTransactions].slice(0, 10),
        metrics: {
          ...prev.metrics,
          operationsCompleted: prev.metrics.operationsCompleted + 1,
        },
        config: {
          ...prev.config,
          budgets: {
            ...prev.config.budgets,
            todaySpent: addEth(prev.config.budgets.todaySpent, operation.estimatedCost),
          },
        },
      };
    });
  }, []);

  // Agent: Fail current operation
  const failOperation = useCallback((operationId: string, _error: string) => {
    setAgent((prev) => {
      if (!prev) return null;
      if (prev.currentOperation?.id !== operationId) return prev;

      return {
        ...prev,
        status: 'connected',
        currentOperation: undefined,
        metrics: {
          ...prev.metrics,
          operationsFailed: prev.metrics.operationsFailed + 1,
        },
      };
    });
  }, []);

  // Simulation: Create a fake approval request
  const simulateApprovalRequest = useCallback(() => {
    const request: ApprovalRequest = {
      id: `approval-${Date.now()}`,
      operationType: 'trade',
      description: 'Large ETH purchase detected',
      amount: '0.08 ETH',
      chain: 'base',
      createdAt: Date.now(),
      expiresAt: Date.now() + 300000,
      riskLevel: 'medium',
      reason: 'Amount exceeds per-transaction limit',
    };

    setAgent((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        status: 'awaiting_approval',
        pendingApprovals: [...prev.pendingApprovals, request],
      };
    });
  }, []);

  // Simulation: Add a transaction to history
  const simulateTransaction = useCallback(
    (type: OpenClawOperation['type'], amount: string) => {
      const tx: OpenClawTransaction = {
        hash: `0x${Math.random().toString(16).slice(2)}` as Hash,
        type,
        amount,
        chain: 'monmouth',
        timestamp: Date.now(),
        status: 'confirmed',
      };

      setAgent((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          recentTransactions: [tx, ...prev.recentTransactions].slice(0, 10),
        };
      });
    },
    []
  );

  return {
    agent,
    isConnected: agent?.status !== 'offline',
    approveRequest,
    rejectRequest,
    suspendAgent,
    resumeAgent,
    updateBudget,
    startOperation,
    completeOperation,
    failOperation,
    simulateApprovalRequest,
    simulateTransaction,
  };
}

// Helper: Add two ETH values
function addEth(a: string, b: string): string {
  const aNum = parseFloat(a.replace(/[^0-9.]/g, '')) || 0;
  const bNum = parseFloat(b.replace(/[^0-9.]/g, '')) || 0;
  return `${(aNum + bNum).toFixed(4)} ETH`;
}
