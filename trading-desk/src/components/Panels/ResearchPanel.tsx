import { motion } from 'framer-motion';
import styles from './ResearchPanel.module.css';

interface ResearchPanelProps {
  agent: {
    did: string;
    balance: string;
    earnings: string;
    jobsCompleted: number;
    status: 'available' | 'working' | 'delivering' | 'paid';
    currentJob?: {
      description: string;
      payment: string;
      progress: number;
    };
    lastResult?: {
      sentiment: 'bullish' | 'bearish' | 'neutral';
      confidence: number;
      recommendation: string;
    };
  };
}

export function ResearchPanel({ agent }: ResearchPanelProps) {
  const statusConfig: Record<string, { color: string; label: string; icon: string }> = {
    available: { color: 'var(--profit)', label: 'AVAILABLE', icon: '✓' },
    working: { color: 'var(--cyan-9)', label: 'WORKING', icon: '⚙' },
    delivering: { color: 'var(--warning)', label: 'DELIVERING', icon: '↗' },
    paid: { color: 'var(--profit)', label: 'PAID', icon: '💰' },
  };

  const status = statusConfig[agent.status];

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.agentIcon}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
            <path d="M11 8v6M8 11h6" />
          </svg>
        </div>
        <div className={styles.headerText}>
          <h3 className={styles.title}>RESEARCH AGENT</h3>
          <div
            className={styles.status}
            style={{ '--status-color': status.color } as React.CSSProperties}
          >
            <span className={styles.statusIcon}>{status.icon}</span>
            <span className={styles.statusLabel}>{status.label}</span>
          </div>
        </div>
      </div>

      {/* Identity */}
      <div className={styles.section}>
        <div className={styles.label}>DID</div>
        <div className={`${styles.did} font-mono`}>
          {truncateDid(agent.did)}
        </div>
      </div>

      {/* Balance & Earnings */}
      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <div className={styles.label}>Balance</div>
          <div className={`${styles.balance} font-mono`}>{agent.balance}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.label}>Earnings</div>
          <div className={`${styles.earnings} font-mono`}>{agent.earnings}</div>
        </div>
      </div>

      {/* Jobs completed */}
      <div className={styles.section}>
        <div className={styles.label}>Jobs Completed</div>
        <div className={`${styles.jobCount} font-mono`}>{agent.jobsCompleted}</div>
      </div>

      {/* Current job (if working) */}
      {agent.currentJob && (
        <motion.div
          className={styles.currentJob}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.165, 0.84, 0.44, 1] }}
        >
          <div className={styles.jobHeader}>
            <span className={styles.jobLabel}>Current Job</span>
            <span className={`${styles.jobPayment} font-mono`}>{agent.currentJob.payment}</span>
          </div>
          <div className={styles.jobDescription}>"{agent.currentJob.description}"</div>
          <div className={styles.progressContainer}>
            <div className={styles.progressTrack}>
              <motion.div
                className={styles.progressBar}
                initial={{ width: 0 }}
                animate={{ width: `${agent.currentJob.progress}%` }}
                transition={{ duration: 0.3, ease: [0.165, 0.84, 0.44, 1] }}
              />
            </div>
            <span className={`${styles.progressPercent} font-mono`}>
              {agent.currentJob.progress}%
            </span>
          </div>
        </motion.div>
      )}

      {/* Last result (if available) */}
      {agent.lastResult && !agent.currentJob && (
        <motion.div
          className={styles.lastResult}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <div className={styles.resultHeader}>Last Analysis</div>
          <div className={styles.resultContent}>
            <div className={`${styles.sentiment} ${styles[agent.lastResult.sentiment]}`}>
              {agent.lastResult.sentiment.toUpperCase()}
            </div>
            <div className={styles.confidence}>
              <span className={styles.confidenceLabel}>Confidence:</span>
              <span className={`${styles.confidenceValue} font-mono`}>
                {agent.lastResult.confidence}%
              </span>
            </div>
            <div className={styles.recommendation}>
              → {agent.lastResult.recommendation}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function truncateDid(did: string): string {
  if (did.length <= 24) return did;
  return `${did.slice(0, 16)}...${did.slice(-8)}`;
}
