/**
 * BottomSheet Component
 *
 * Mobile-native bottom sheet with drag-to-expand functionality.
 * Inspired by iOS/Android native patterns and trading apps like TradingView.
 */

import { useState, useRef, useEffect, ReactNode } from 'react';
import { motion, useMotionValue, PanInfo } from 'framer-motion';
import styles from './BottomSheet.module.css';

type SheetState = 'collapsed' | 'partial' | 'expanded';

interface BottomSheetProps {
  children: ReactNode;
  collapsedContent?: ReactNode;
  tabs?: { id: string; icon: string; label: string }[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  actionButton?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
}

const COLLAPSED_HEIGHT = 140;
const PARTIAL_HEIGHT = 360;

export function BottomSheet({
  children,
  collapsedContent,
  tabs,
  activeTab,
  onTabChange,
  actionButton,
}: BottomSheetProps) {
  const [sheetState, setSheetState] = useState<SheetState>('collapsed');
  const containerRef = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState(0);

  // Calculate max height on mount and resize
  useEffect(() => {
    const updateMaxHeight = () => {
      // Leave 60px for price header
      setMaxHeight(window.innerHeight - 60);
    };
    updateMaxHeight();
    window.addEventListener('resize', updateMaxHeight);
    return () => window.removeEventListener('resize', updateMaxHeight);
  }, []);

  const y = useMotionValue(0);

  // Get height based on state
  const getHeightForState = (state: SheetState): number => {
    switch (state) {
      case 'collapsed':
        return COLLAPSED_HEIGHT;
      case 'partial':
        return PARTIAL_HEIGHT;
      case 'expanded':
        return maxHeight;
    }
  };

  const currentHeight = getHeightForState(sheetState);

  // Handle drag end
  const handleDragEnd = (_: never, info: PanInfo) => {
    const velocity = info.velocity.y;
    const offset = info.offset.y;

    // Fast swipe detection
    if (Math.abs(velocity) > 500) {
      if (velocity < 0) {
        // Swiping up
        setSheetState(sheetState === 'collapsed' ? 'partial' : 'expanded');
      } else {
        // Swiping down
        setSheetState(sheetState === 'expanded' ? 'partial' : 'collapsed');
      }
      return;
    }

    // Slow drag - snap to nearest state
    if (offset < -50) {
      setSheetState(sheetState === 'collapsed' ? 'partial' : 'expanded');
    } else if (offset > 50) {
      setSheetState(sheetState === 'expanded' ? 'partial' : 'collapsed');
    }
  };

  // Handle drag handle click to cycle states
  const handleHandleClick = () => {
    if (sheetState === 'collapsed') {
      setSheetState('partial');
    } else if (sheetState === 'partial') {
      setSheetState('expanded');
    } else {
      setSheetState('collapsed');
    }
  };

  return (
    <>
      {/* Backdrop */}
      {sheetState !== 'collapsed' && (
        <motion.div
          className={styles.backdrop}
          initial={{ opacity: 0 }}
          animate={{ opacity: sheetState === 'expanded' ? 0.5 : 0.2 }}
          exit={{ opacity: 0 }}
          onClick={() => setSheetState('collapsed')}
        />
      )}

      {/* Sheet */}
      <motion.div
        ref={containerRef}
        className={styles.sheet}
        initial={{ height: COLLAPSED_HEIGHT }}
        animate={{ height: currentHeight }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        style={{ y }}
      >
        {/* Drag Handle */}
        <motion.div
          className={styles.handleArea}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.1}
          onDragEnd={handleDragEnd}
          onClick={handleHandleClick}
        >
          <div className={styles.handle} />
          <div className={styles.handleHint}>
            {sheetState === 'collapsed' ? 'Pull up for details' : 'Pull down to minimize'}
          </div>
        </motion.div>

        {/* Tabs (only visible when not collapsed) */}
        {tabs && sheetState !== 'collapsed' && (
          <div className={styles.tabs}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`${styles.tab} ${activeTab === tab.id ? styles.activeTab : ''}`}
                onClick={() => onTabChange?.(tab.id)}
              >
                <span className={styles.tabIcon}>{tab.icon}</span>
                <span className={styles.tabLabel}>{tab.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className={styles.content}>
          {sheetState === 'collapsed' ? (
            <div className={styles.collapsedContent}>
              {collapsedContent}
              {actionButton && (
                <button
                  className={styles.actionButton}
                  onClick={actionButton.onClick}
                  disabled={actionButton.disabled}
                >
                  {actionButton.label}
                </button>
              )}
            </div>
          ) : (
            <div className={styles.expandedContent}>{children}</div>
          )}
        </div>
      </motion.div>
    </>
  );
}
