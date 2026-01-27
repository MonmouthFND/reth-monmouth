import { motion, AnimatePresence } from 'framer-motion';
import styles from './ActivityFeed.module.css';

export interface ActivityItem {
  id: string;
  timestamp: number;
  type: 'trade_buy' | 'trade_sell' | 'trade_blocked' | 'escrow_created' | 'escrow_claimed' | 'escrow_released' | 'guardrail_trigger' | 'session_start';
  message: string;
  details?: string;
  amount?: string;
  txHash?: string;
}

interface ActivityFeedProps {
  activities: ActivityItem[];
  stats: {
    trades: number;
    pnl: number;
    blocked: number;
  };
}

const activityConfig: Record<ActivityItem['type'], { icon: string; color: string; label: string }> = {
  trade_buy: { icon: '↗', color: 'var(--profit)', label: 'BUY' },
  trade_sell: { icon: '↘', color: 'var(--cyan-9)', label: 'SELL' },
  trade_blocked: { icon: '⛔', color: 'var(--blocked)', label: 'BLOCKED' },
  escrow_created: { icon: '📋', color: 'var(--cyan-9)', label: 'ESCROW' },
  escrow_claimed: { icon: '✋', color: 'var(--warning)', label: 'CLAIMED' },
  escrow_released: { icon: '💰', color: 'var(--profit)', label: 'RELEASED' },
  guardrail_trigger: { icon: '⚠️', color: 'var(--warning)', label: 'GUARDRAIL' },
  session_start: { icon: '🟢', color: 'var(--profit)', label: 'START' },
};

export function ActivityFeed({ activities, stats }: ActivityFeedProps) {
  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h3 className={styles.title}>ACTIVITY FEED</h3>
          <span className={styles.count}>{activities.length} events</span>
        </div>
        <div className={styles.liveIndicator}>
          <span className={styles.liveDot} />
          <span className={styles.liveText}>LIVE</span>
        </div>
      </div>

      {/* Activity list */}
      <div className={styles.list}>
        <AnimatePresence mode="popLayout">
          {activities.map((activity, index) => (
            <motion.div
              key={activity.id}
              className={`${styles.item} ${activity.type === 'trade_blocked' ? styles.blocked : ''}`}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{
                duration: 0.2,
                ease: [0.165, 0.84, 0.44, 1],
                delay: index === 0 ? 0 : 0,
              }}
              layout
            >
              <ActivityRow activity={activity} />
            </motion.div>
          ))}
        </AnimatePresence>

        {activities.length === 0 && (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>📡</span>
            <span className={styles.emptyText}>Waiting for activity…</span>
          </div>
        )}
      </div>

      {/* Summary footer */}
      <div className={styles.footer}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{stats.trades}</span>
          <span className={styles.statLabel}>trades</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.stat}>
          <span className={`${styles.statValue} ${stats.pnl >= 0 ? styles.profit : styles.loss}`}>
            {stats.pnl >= 0 ? '+' : ''}{formatCurrency(stats.pnl)}
          </span>
          <span className={styles.statLabel}>P&L</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.stat}>
          <span className={`${styles.statValue} ${stats.blocked > 0 ? styles.warning : ''}`}>
            {stats.blocked}
          </span>
          <span className={styles.statLabel}>blocked</span>
        </div>
      </div>
    </div>
  );
}

function ActivityRow({ activity }: { activity: ActivityItem }) {
  const config = activityConfig[activity.type];

  return (
    <>
      {/* Timestamp */}
      <span className={`${styles.timestamp} font-mono`}>
        {formatTime(activity.timestamp)}
      </span>

      {/* Icon */}
      <span
        className={styles.icon}
        style={{ '--icon-color': config.color } as React.CSSProperties}
      >
        {config.icon}
      </span>

      {/* Message */}
      <span className={styles.message}>
        {activity.message}
      </span>

      {/* Amount (if present) */}
      {activity.amount && (
        <span className={`${styles.amount} font-mono`}>
          {activity.amount}
        </span>
      )}

      {/* TX Hash link (if present) */}
      {activity.txHash && (
        <span className={`${styles.txHash} font-mono`}>
          {truncateHash(activity.txHash)}
        </span>
      )}
    </>
  );
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function truncateHash(hash: string): string {
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}
