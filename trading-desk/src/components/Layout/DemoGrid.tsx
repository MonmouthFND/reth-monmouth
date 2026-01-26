import { ReactNode } from 'react';
import styles from './DemoGrid.module.css';

interface DemoGridProps {
  chart: ReactNode;
  traderPanel: ReactNode;
  activityFeed: ReactNode;
  researchPanel: ReactNode;
  reasoningPanel: ReactNode;
}

/**
 * Main dashboard grid layout
 *
 * Structure:
 * ┌──────────────────────────────────────────────┬────────────────┐
 * │              MAIN CONTENT (75%)              │ REASONING (25%)│
 * ├────────────────────────────┬─────────────────┤                │
 * │         CHART (75%)        │  TRADER (25%)   │  (full height) │
 * ├────────────────────────────┼─────────────────┤                │
 * │       ACTIVITY (75%)       │ RESEARCH (25%)  │                │
 * └────────────────────────────┴─────────────────┴────────────────┘
 */
export function DemoGrid({
  chart,
  traderPanel,
  activityFeed,
  researchPanel,
  reasoningPanel,
}: DemoGridProps) {
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

        {/* Right side: Reasoning panel (25%, full height) */}
        <div className={styles.reasoningArea}>
          {reasoningPanel}
        </div>
      </div>
    </div>
  );
}
