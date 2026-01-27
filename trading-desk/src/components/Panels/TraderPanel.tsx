import { motion } from 'framer-motion';
import styles from './TraderPanel.module.css';

interface TraderPanelProps {
  agent: {
    did: string;
    balance: string;
    balanceUsd: string;
    todayPnL: number;
    tradeCount: number;
    policy: {
      maxPerTx: string;
      dailyCap: string;
      todaySpent: string;
      usagePercent: number;
    };
    status: 'idle' | 'analyzing' | 'executing' | 'blocked';
  };
}

export function TraderPanel({ agent }: TraderPanelProps) {
  const isProfitable = agent.todayPnL >= 0;
  const isNearLimit = agent.policy.usagePercent >= 80;
  const isBlocked = agent.status === 'blocked';

  return (
    <div className={`${styles.panel} ${isBlocked ? styles.blocked : ''}`}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.agentIcon}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
            <path d="m4.93 4.93 2.83 2.83m8.48 8.48 2.83 2.83m-2.83-14.14 2.83 2.83m-14.14 8.48 2.83 2.83" />
          </svg>
        </div>
        <div className={styles.headerText}>
          <h3 className={styles.title}>TRADER AGENT</h3>
          <StatusIndicator status={agent.status} />
        </div>
      </div>

      {/* Identity */}
      <div className={styles.section}>
        <div className={styles.label}>DID</div>
        <div className={`${styles.value} ${styles.did} font-mono`}>
          {truncateDid(agent.did)}
        </div>
      </div>

      {/* Balance */}
      <div className={styles.section}>
        <div className={styles.label}>Balance</div>
        <div className={styles.balanceRow}>
          <span className={`${styles.balance} font-mono`}>{agent.balance}</span>
          <span className={styles.balanceUsd}>≈ {agent.balanceUsd}</span>
        </div>
      </div>

      {/* P&L and Trades */}
      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <div className={styles.label}>Today's P&L</div>
          <div className={`${styles.pnl} font-mono ${isProfitable ? styles.profit : styles.loss}`}>
            {isProfitable ? '+' : ''}{formatCurrency(agent.todayPnL)}
          </div>
        </div>
        <div className={styles.stat}>
          <div className={styles.label}>Trades</div>
          <div className={`${styles.tradeCount} font-mono`}>{agent.tradeCount}</div>
        </div>
      </div>

      {/* Policy Section */}
      <div className={styles.policySection}>
        <div className={styles.policyHeader}>
          <span className={styles.policyIcon}>⚡</span>
          <span className={styles.policyTitle}>POLICY</span>
        </div>

        <div className={styles.policyGrid}>
          <div className={styles.policyItem}>
            <span className={styles.policyLabel}>Max/Trade</span>
            <span className={`${styles.policyValue} font-mono`}>{agent.policy.maxPerTx}</span>
          </div>
          <div className={styles.policyItem}>
            <span className={styles.policyLabel}>Daily Cap</span>
            <span className={`${styles.policyValue} font-mono`}>{agent.policy.dailyCap}</span>
          </div>
        </div>

        {/* Usage Progress Bar */}
        <div className={styles.usageSection}>
          <div className={styles.usageHeader}>
            <span className={styles.usageLabel}>Daily Usage</span>
            <span className={`${styles.usagePercent} font-mono ${isNearLimit ? styles.warning : ''}`}>
              {agent.policy.usagePercent}%
            </span>
          </div>
          <div className={styles.progressTrack}>
            <motion.div
              className={`${styles.progressBar} ${isNearLimit ? styles.nearLimit : ''}`}
              initial={{ width: 0 }}
              animate={{ width: `${agent.policy.usagePercent}%` }}
              transition={{ duration: 0.5, ease: [0.165, 0.84, 0.44, 1] }}
            />
            {/* Danger zone indicator */}
            <div className={styles.dangerZone} />
          </div>
          <div className={styles.usageValues}>
            <span className="font-mono">{agent.policy.todaySpent}</span>
            <span className={styles.usageDivider}>/</span>
            <span className="font-mono">{agent.policy.dailyCap}</span>
          </div>
        </div>
      </div>

      {/* Blocked overlay */}
      {isBlocked && (
        <motion.div
          className={styles.blockedOverlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <div className={styles.blockedIcon}>🚫</div>
          <div className={styles.blockedText}>BLOCKED</div>
        </motion.div>
      )}
    </div>
  );
}

function StatusIndicator({ status }: { status: string }) {
  const statusConfig: Record<string, { color: string; label: string }> = {
    idle: { color: 'var(--gray-9)', label: 'IDLE' },
    analyzing: { color: 'var(--cyan-9)', label: 'ANALYZING' },
    executing: { color: 'var(--profit)', label: 'EXECUTING' },
    blocked: { color: 'var(--blocked)', label: 'BLOCKED' },
  };

  const config = statusConfig[status] || statusConfig.idle;

  return (
    <div className={styles.status} style={{ '--status-color': config.color } as React.CSSProperties}>
      <span className={styles.statusDot} />
      <span className={styles.statusLabel}>{config.label}</span>
    </div>
  );
}

function truncateDid(did: string): string {
  if (did.length <= 24) return did;
  return `${did.slice(0, 16)}...${did.slice(-8)}`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
