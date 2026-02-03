import { ReactNode, useState } from 'react';
import styles from './DemoGrid.module.css';

interface DemoGridProps {
  chart: ReactNode;
  traderPanel: ReactNode;
  activityFeed: ReactNode;
  researchPanel: ReactNode;
  reasoningPanel: ReactNode;
  openClawPanel?: ReactNode;
}

/**
 * Main dashboard grid layout
 *
 * Structure (with OpenClaw panel):
 * ┌──────────────────────────────────────────────┬────────────────┐
 * │              MAIN CONTENT (75%)              │ RIGHT SIDEBAR  │
 * ├────────────────────────────┬─────────────────┤  [Reasoning]   │
 * │         CHART (75%)        │  TRADER (25%)   │  [OpenClaw]    │
 * ├────────────────────────────┼─────────────────┤  (tabs)        │
 * │       ACTIVITY (75%)       │ RESEARCH (25%)  │                │
 * └────────────────────────────┴─────────────────┴────────────────┘
 */
export function DemoGrid({
  chart,
  traderPanel,
  activityFeed,
  researchPanel,
  reasoningPanel,
  openClawPanel,
}: DemoGridProps) {
  const [activeTab, setActiveTab] = useState<'reasoning' | 'openclaw'>('reasoning');
  const hasOpenClaw = !!openClawPanel;

  return (
    <div className={styles.container}>
      {/* Background effects */}
      <div className={styles.bgGradient} />
      <div className={styles.bgGrid} />

      {/* Main grid */}
      <div className={styles.grid}>
        {/* Left side: Main content (75%) */}
        <div className={styles.mainContent}>
          {/* Row 1: Chart + Trader */}
          <div className={styles.row}>
            <div className={styles.chartArea}>
              {chart}
            </div>
            <div className={styles.traderArea}>
              {traderPanel}
            </div>
          </div>

          {/* Row 2: Activity + Research */}
          <div className={styles.row}>
            <div className={styles.activityArea}>
              {activityFeed}
            </div>
            <div className={styles.researchArea}>
              {researchPanel}
            </div>
          </div>
        </div>

        {/* Right side: Tabbed sidebar (25%, full height) */}
        <div className={styles.sidebarContainer}>
          {hasOpenClaw && (
            <div className={styles.tabBar}>
              <button
                className={`${styles.tab} ${activeTab === 'reasoning' ? styles.activeTab : ''}`}
                onClick={() => setActiveTab('reasoning')}
              >
                <span className={styles.tabIcon}>🧠</span>
                <span className={styles.tabLabel}>Reasoning</span>
              </button>
              <button
                className={`${styles.tab} ${activeTab === 'openclaw' ? styles.activeTab : ''}`}
                onClick={() => setActiveTab('openclaw')}
              >
                <span className={styles.tabIcon}>🦞</span>
                <span className={styles.tabLabel}>OpenClaw</span>
              </button>
            </div>
          )}
          <div className={styles.reasoningArea}>
            {hasOpenClaw ? (
              activeTab === 'reasoning' ? reasoningPanel : openClawPanel
            ) : (
              reasoningPanel
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
