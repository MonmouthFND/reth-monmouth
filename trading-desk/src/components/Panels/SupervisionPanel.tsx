import { motion, AnimatePresence } from 'framer-motion';
import styles from './SupervisionPanel.module.css';

export type AgentLifecycle = 'initializing' | 'running' | 'suspended' | 'crashed' | 'restarting';
export type RestartStrategy = 'one_for_one' | 'one_for_all' | 'rest_for_one';

export interface SupervisedAgent {
  id: string;
  name: string;
  type: 'trader' | 'research' | 'oracle' | 'coordinator';
  lifecycle: AgentLifecycle;
  restartCount: number;
  lastHeartbeat: number;
  mailboxSize: number;
  uptime: number; // seconds
}

export interface Supervisor {
  id: string;
  name: string;
  strategy: RestartStrategy;
  maxRestarts: number;
  restartWindow: number; // seconds
  children: SupervisedAgent[];
}

interface SupervisionPanelProps {
  supervisor: Supervisor;
  onCrashAgent?: (agentId: string) => void;
  onRestartAgent?: (agentId: string) => void;
  onViewMailbox?: (agentId: string) => void;
}

export function SupervisionPanel({
  supervisor,
  onCrashAgent,
  onRestartAgent,
  onViewMailbox
}: SupervisionPanelProps) {
  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.beamIcon}>⚡</span>
          <div className={styles.headerText}>
            <h3 className={styles.title}>SUPERVISION TREE</h3>
            <span className={styles.subtitle}>BEAM-style fault tolerance</span>
          </div>
        </div>
        <StrategyBadge strategy={supervisor.strategy} />
      </div>

      {/* Supervisor node */}
      <div className={styles.supervisorNode}>
        <div className={styles.supervisorIcon}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        <div className={styles.supervisorInfo}>
          <span className={styles.supervisorName}>{supervisor.name}</span>
          <span className={styles.supervisorMeta}>
            {supervisor.children.length} children • max {supervisor.maxRestarts} restarts / {supervisor.restartWindow}s
          </span>
        </div>
      </div>

      {/* Connection line */}
      <div className={styles.connectionLine}>
        <div className={styles.verticalLine} />
        <div className={styles.horizontalBranches}>
          {supervisor.children.map((_, i) => (
            <div key={i} className={styles.branch} />
          ))}
        </div>
      </div>

      {/* Child agents */}
      <div className={styles.agentList}>
        <AnimatePresence mode="popLayout">
          {supervisor.children.map((agent) => (
            <motion.div
              key={agent.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
            >
              <AgentNode
                agent={agent}
                onCrash={() => onCrashAgent?.(agent.id)}
                onRestart={() => onRestartAgent?.(agent.id)}
                onViewMailbox={() => onViewMailbox?.(agent.id)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Legend */}
      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.running}`} />
          <span>Running</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.crashed}`} />
          <span>Crashed</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.restarting}`} />
          <span>Restarting</span>
        </div>
      </div>
    </div>
  );
}

function AgentNode({
  agent,
  onCrash,
  onRestart,
  onViewMailbox
}: {
  agent: SupervisedAgent;
  onCrash?: () => void;
  onRestart?: () => void;
  onViewMailbox?: () => void;
}) {
  const lifecycleConfig: Record<AgentLifecycle, { color: string; label: string; icon: string }> = {
    initializing: { color: 'var(--gray-9)', label: 'INIT', icon: '◐' },
    running: { color: 'var(--profit)', label: 'RUNNING', icon: '●' },
    suspended: { color: 'var(--warning)', label: 'SUSPENDED', icon: '⏸' },
    crashed: { color: 'var(--blocked)', label: 'CRASHED', icon: '✕' },
    restarting: { color: 'var(--cyan-9)', label: 'RESTARTING', icon: '↻' },
  };

  const config = lifecycleConfig[agent.lifecycle];
  const isCrashed = agent.lifecycle === 'crashed';
  const isRestarting = agent.lifecycle === 'restarting';

  return (
    <div className={`${styles.agentNode} ${isCrashed ? styles.crashed : ''} ${isRestarting ? styles.restarting : ''}`}>
      {/* Status indicator */}
      <div
        className={styles.lifecycleIndicator}
        style={{ '--lifecycle-color': config.color } as React.CSSProperties}
      >
        <span className={`${styles.lifecycleIcon} ${isRestarting ? styles.spinning : ''}`}>
          {config.icon}
        </span>
      </div>

      {/* Agent info */}
      <div className={styles.agentInfo}>
        <div className={styles.agentHeader}>
          <span className={styles.agentName}>{agent.name}</span>
          <span className={styles.agentType}>{agent.type.toUpperCase()}</span>
        </div>
        <div className={styles.agentMeta}>
          <span className={styles.metaItem}>
            <span className={styles.metaIcon}>↺</span>
            {agent.restartCount}
          </span>
          <span className={styles.metaItem}>
            <span className={styles.metaIcon}>✉</span>
            {agent.mailboxSize}
          </span>
          <span className={styles.metaItem}>
            <span className={styles.metaIcon}>⏱</span>
            {formatUptime(agent.uptime)}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className={styles.agentActions}>
        {agent.lifecycle === 'running' && onCrash && (
          <button
            className={styles.actionBtn}
            onClick={onCrash}
            title="Simulate crash"
          >
            💥
          </button>
        )}
        {agent.lifecycle === 'crashed' && onRestart && (
          <button
            className={`${styles.actionBtn} ${styles.restartBtn}`}
            onClick={onRestart}
            title="Restart agent"
          >
            ↻
          </button>
        )}
        {onViewMailbox && agent.mailboxSize > 0 && (
          <button
            className={styles.actionBtn}
            onClick={onViewMailbox}
            title="View mailbox"
          >
            📬
          </button>
        )}
      </div>

      {/* Crash overlay */}
      {isCrashed && (
        <motion.div
          className={styles.crashOverlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <span className={styles.crashIcon}>⚠️</span>
        </motion.div>
      )}
    </div>
  );
}

function StrategyBadge({ strategy }: { strategy: RestartStrategy }) {
  const strategyLabels: Record<RestartStrategy, string> = {
    one_for_one: 'ONE-FOR-ONE',
    one_for_all: 'ONE-FOR-ALL',
    rest_for_one: 'REST-FOR-ONE',
  };

  const strategyDescriptions: Record<RestartStrategy, string> = {
    one_for_one: 'Restart only the failed child',
    one_for_all: 'Restart all children if one fails',
    rest_for_one: 'Restart failed child and all after it',
  };

  return (
    <div className={styles.strategyBadge} title={strategyDescriptions[strategy]}>
      <span className={styles.strategyLabel}>{strategyLabels[strategy]}</span>
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}
