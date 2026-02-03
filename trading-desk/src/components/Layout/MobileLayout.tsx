/**
 * MobileLayout Component
 *
 * Full-screen chart + bottom sheet pattern for mobile devices.
 * Inspired by TradingView and Webull mobile apps.
 */

import { ReactNode, useState } from 'react';
import { BottomSheet } from './BottomSheet';
import styles from './MobileLayout.module.css';

interface MobileLayoutProps {
  chart: ReactNode;
  traderPanel: ReactNode;
  activityFeed: ReactNode;
  researchPanel: ReactNode;
  reasoningPanel: ReactNode;
  openClawPanel?: ReactNode;
  priceHeader: {
    symbol: string;
    price: string;
    change: string;
    isPositive: boolean;
  };
  status: {
    connected: boolean;
    balance: string;
    escrowCount: number;
  };
  onRunDemo: () => void;
  isDemoDisabled: boolean;
}

type TabId = 'reasoning' | 'agent' | 'activity' | 'research' | 'openclaw';

export function MobileLayout({
  chart,
  traderPanel,
  activityFeed,
  researchPanel,
  reasoningPanel,
  openClawPanel,
  priceHeader,
  status,
  onRunDemo,
  isDemoDisabled,
}: MobileLayoutProps) {
  const [activeTab, setActiveTab] = useState<TabId>('reasoning');

  const tabs = [
    { id: 'reasoning' as const, icon: '🧠', label: 'Reasoning' },
    { id: 'agent' as const, icon: '🤖', label: 'Agent' },
    { id: 'activity' as const, icon: '📊', label: 'Activity' },
    { id: 'research' as const, icon: '🔬', label: 'Research' },
    ...(openClawPanel ? [{ id: 'openclaw' as const, icon: '🦞', label: 'OpenClaw' }] : []),
  ];

  const renderActivePanel = () => {
    switch (activeTab) {
      case 'reasoning':
        return reasoningPanel;
      case 'agent':
        return traderPanel;
      case 'activity':
        return activityFeed;
      case 'research':
        return researchPanel;
      case 'openclaw':
        return openClawPanel;
      default:
        return reasoningPanel;
    }
  };

  const collapsedContent = (
    <div className={styles.statusSummary}>
      <div className={styles.statusItem}>
        <span className={`${styles.statusValue} ${status.connected ? styles.connected : ''}`}>
          {status.connected ? '●' : '○'}
        </span>
        <span className={styles.statusLabel}>
          {status.connected ? 'Connected' : 'Offline'}
        </span>
      </div>
      <div className={styles.divider} />
      <div className={styles.statusItem}>
        <span className={styles.statusValue}>{status.balance}</span>
        <span className={styles.statusLabel}>Balance</span>
      </div>
      <div className={styles.divider} />
      <div className={styles.statusItem}>
        <span className={styles.statusValue}>{status.escrowCount}</span>
        <span className={styles.statusLabel}>Escrows</span>
      </div>
    </div>
  );

  return (
    <div className={styles.container}>
      {/* Background effects */}
      <div className={styles.bgGradient} />

      {/* Price Header */}
      <div className={styles.priceHeader}>
        <div className={styles.priceLeft}>
          <span className={styles.symbol}>{priceHeader.symbol}</span>
          <span className={styles.price}>{priceHeader.price}</span>
        </div>
        <span className={`${styles.change} ${priceHeader.isPositive ? styles.up : styles.down}`}>
          {priceHeader.isPositive ? '▲' : '▼'} {priceHeader.change}
        </span>
      </div>

      {/* Full-screen Chart */}
      <div className={styles.chartContainer}>
        {chart}
      </div>

      {/* Bottom Sheet */}
      <BottomSheet
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as TabId)}
        collapsedContent={collapsedContent}
        actionButton={{
          label: '🚀 Run Demo',
          onClick: onRunDemo,
          disabled: isDemoDisabled,
        }}
      >
        <div className={styles.panelContainer}>
          {renderActivePanel()}
        </div>
      </BottomSheet>
    </div>
  );
}
