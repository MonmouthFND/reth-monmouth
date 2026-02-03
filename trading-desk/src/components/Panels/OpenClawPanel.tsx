/**
 * OpenClaw Panel
 *
 * Guardian supervision interface for OpenClaw agents.
 * Shows agent status, budget controls, pending approvals, and transaction history.
 */

import { motion, AnimatePresence } from 'framer-motion';
import styles from './OpenClawPanel.module.css';
import {
  type OpenClawAgent,
  type ApprovalRequest,
  formatDid,
  formatUptime,
  getStatusColor,
  getStatusLabel,
  getRiskColor,
} from '../../lib/openclaw';

interface OpenClawPanelProps {
  agent: OpenClawAgent | null;
  onApprove?: (requestId: string) => void;
  onReject?: (requestId: string) => void;
  onSuspend?: () => void;
  onResume?: () => void;
  onSimulateApproval?: () => void;
}

export function OpenClawPanel({
  agent,
  onApprove,
  onReject,
  onSuspend,
  onResume,
  onSimulateApproval,
}: OpenClawPanelProps) {
  if (!agent) {
    return (
      <div className={styles.panel}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🦞</div>
          <div className={styles.emptyText}>Connecting to OpenClaw...</div>
        </div>
      </div>
    );
  }

  const isSuspended = agent.status === 'suspended';
  const hasApprovals = agent.pendingApprovals.length > 0;

  return (
    <div className={`${styles.panel} ${isSuspended ? styles.suspended : ''}`}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.logo}>🦞</div>
          <div className={styles.headerText}>
            <h3 className={styles.title}>OPENCLAW AGENT</h3>
            <div
              className={styles.status}
              style={{ '--status-color': getStatusColor(agent.status) } as React.CSSProperties}
            >
              <span className={styles.statusDot} />
              <span className={styles.statusLabel}>{getStatusLabel(agent.status)}</span>
            </div>
          </div>
        </div>
        <div className={styles.version}>v{agent.config.version}</div>
      </div>

      {/* Identity Section */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionIcon}>🔑</span>
          <span className={styles.sectionTitle}>IDENTITY</span>
        </div>
        <div className={styles.identityGrid}>
          <div className={styles.identityItem}>
            <span className={styles.identityLabel}>Monmouth DID</span>
            <span className={`${styles.identityValue} ${styles.did} font-mono`}>
              {formatDid(agent.config.identity.did)}
            </span>
          </div>
          {agent.config.identity.handle && (
            <div className={styles.identityItem}>
              <span className={styles.identityLabel}>Moltbook</span>
              <span className={`${styles.identityValue} ${styles.handle}`}>
                {agent.config.identity.handle}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Budget Section */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionIcon}>💰</span>
          <span className={styles.sectionTitle}>BUDGET GUARDRAILS</span>
        </div>
        <div className={styles.budgetGrid}>
          <div className={styles.budgetItem}>
            <span className={styles.budgetLabel}>Max/Transaction</span>
            <span className={`${styles.budgetValue} font-mono`}>
              {agent.config.budgets.maxPerTx}
            </span>
          </div>
          <div className={styles.budgetItem}>
            <span className={styles.budgetLabel}>Daily Cap</span>
            <span className={`${styles.budgetValue} font-mono`}>
              {agent.config.budgets.dailyCap}
            </span>
          </div>
          <div className={styles.budgetItem}>
            <span className={styles.budgetLabel}>Today Spent</span>
            <span className={`${styles.budgetValue} ${styles.spent} font-mono`}>
              {agent.config.budgets.todaySpent}
            </span>
          </div>
          <div className={styles.budgetItem}>
            <span className={styles.budgetLabel}>Today Earned</span>
            <span className={`${styles.budgetValue} ${styles.earned} font-mono`}>
              {agent.config.budgets.todayEarned}
            </span>
          </div>
        </div>
        <div className={styles.paymentProtocol}>
          <span className={styles.protocolBadge}>x402</span>
          <span className={styles.protocolLabel}>
            {agent.config.payments.escrowBacked ? 'Escrow-backed payments' : 'Direct payments'}
          </span>
        </div>
      </div>

      {/* Pending Approvals */}
      {hasApprovals && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionIcon}>⚠️</span>
            <span className={styles.sectionTitle}>PENDING APPROVALS</span>
            <span className={styles.approvalCount}>{agent.pendingApprovals.length}</span>
          </div>
          <div className={styles.approvalList}>
            <AnimatePresence mode="popLayout">
              {agent.pendingApprovals.map((request) => (
                <ApprovalCard
                  key={request.id}
                  request={request}
                  onApprove={() => onApprove?.(request.id)}
                  onReject={() => onReject?.(request.id)}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Metrics */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionIcon}>📊</span>
          <span className={styles.sectionTitle}>METRICS</span>
        </div>
        <div className={styles.metricsGrid}>
          <div className={styles.metricItem}>
            <span className={styles.metricValue}>{formatUptime(agent.metrics.uptime)}</span>
            <span className={styles.metricLabel}>Uptime</span>
          </div>
          <div className={styles.metricItem}>
            <span className={styles.metricValue}>{agent.metrics.operationsCompleted}</span>
            <span className={styles.metricLabel}>Completed</span>
          </div>
          <div className={styles.metricItem}>
            <span className={`${styles.metricValue} ${styles.success}`}>
              {agent.metrics.escrowCompletionRate}%
            </span>
            <span className={styles.metricLabel}>Escrow Rate</span>
          </div>
          <div className={styles.metricItem}>
            <span className={styles.metricValue}>{agent.metrics.avgResponseTime}ms</span>
            <span className={styles.metricLabel}>Avg Response</span>
          </div>
        </div>
      </div>

      {/* Guardian Controls */}
      <div className={styles.controls}>
        {isSuspended ? (
          <button className={`${styles.controlBtn} ${styles.resumeBtn}`} onClick={onResume}>
            <span className={styles.btnIcon}>▶</span>
            Resume Agent
          </button>
        ) : (
          <button className={`${styles.controlBtn} ${styles.suspendBtn}`} onClick={onSuspend}>
            <span className={styles.btnIcon}>⏸</span>
            Suspend Agent
          </button>
        )}
        <button
          className={`${styles.controlBtn} ${styles.testBtn}`}
          onClick={onSimulateApproval}
          disabled={isSuspended}
        >
          <span className={styles.btnIcon}>🧪</span>
          Test Approval
        </button>
      </div>

      {/* Suspended Overlay */}
      {isSuspended && (
        <motion.div
          className={styles.suspendedOverlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className={styles.suspendedIcon}>⏸</div>
          <div className={styles.suspendedText}>AGENT SUSPENDED</div>
          <div className={styles.suspendedHint}>Guardian has paused all operations</div>
        </motion.div>
      )}
    </div>
  );
}

function ApprovalCard({
  request,
  onApprove,
  onReject,
}: {
  request: ApprovalRequest;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  const timeLeft = Math.max(0, Math.floor((request.expiresAt - Date.now()) / 1000));
  const isExpiring = timeLeft < 60;

  return (
    <motion.div
      className={styles.approvalCard}
      layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
    >
      <div className={styles.approvalHeader}>
        <span
          className={styles.riskBadge}
          style={{ '--risk-color': getRiskColor(request.riskLevel) } as React.CSSProperties}
        >
          {request.riskLevel.toUpperCase()}
        </span>
        <span className={`${styles.approvalTimer} ${isExpiring ? styles.expiring : ''}`}>
          {formatTime(timeLeft)}
        </span>
      </div>
      <div className={styles.approvalBody}>
        <div className={styles.approvalType}>{formatOperationType(request.operationType)}</div>
        <div className={styles.approvalAmount}>{request.amount}</div>
        <div className={styles.approvalReason}>{request.reason}</div>
      </div>
      <div className={styles.approvalActions}>
        <button className={`${styles.approvalBtn} ${styles.rejectBtn}`} onClick={onReject}>
          Reject
        </button>
        <button className={`${styles.approvalBtn} ${styles.approveBtn}`} onClick={onApprove}>
          Approve
        </button>
      </div>
    </motion.div>
  );
}

function formatOperationType(type: string): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
