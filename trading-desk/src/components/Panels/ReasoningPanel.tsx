import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import styles from './ReasoningPanel.module.css';

interface ReasoningPanelProps {
  text: string;
  isThinking: boolean;
  decision?: {
    action: 'buy' | 'sell' | 'hold' | 'blocked';
    amount?: string;
    reason?: string;
  };
}

export function ReasoningPanel({ text, isThinking, decision }: ReasoningPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll as text streams in
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text]);

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerIcon}>
          <BrainIcon />
        </div>
        <h3 className={styles.title}>AGENT REASONING</h3>
        {isThinking && (
          <div className={styles.thinkingIndicator}>
            <span className={styles.thinkingDot} />
            <span className={styles.thinkingDot} />
            <span className={styles.thinkingDot} />
          </div>
        )}
      </div>

      {/* Streaming text area */}
      <div className={styles.content} ref={scrollRef}>
        <div className={styles.textArea}>
          {/* Render text with syntax highlighting for key terms */}
          <FormattedText text={text} />

          {/* Blinking cursor when thinking */}
          {isThinking && <span className={styles.cursor}>▌</span>}
        </div>

        {/* Decision badge (when made) */}
        {decision && !isThinking && (
          <motion.div
            className={`${styles.decision} ${styles[decision.action]}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.165, 0.84, 0.44, 1] }}
          >
            <div className={styles.decisionIcon}>
              {decision.action === 'buy' && '↗'}
              {decision.action === 'sell' && '↘'}
              {decision.action === 'hold' && '⏸'}
              {decision.action === 'blocked' && '⛔'}
            </div>
            <div className={styles.decisionContent}>
              <div className={styles.decisionAction}>
                {decision.action.toUpperCase()}
                {decision.amount && (
                  <span className={styles.decisionAmount}>{decision.amount}</span>
                )}
              </div>
              {decision.reason && (
                <div className={styles.decisionReason}>{decision.reason}</div>
              )}
            </div>
          </motion.div>
        )}
      </div>

      {/* Footer gradient fade */}
      <div className={styles.fadeBottom} />
    </div>
  );
}

function BrainIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.54Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.54Z" />
    </svg>
  );
}

function FormattedText({ text }: { text: string }) {
  // Highlight key terms
  const patterns: Array<{ regex: RegExp; className: string }> = [
    { regex: /\b(BUY|SELL|HOLD)\b/g, className: styles.highlightAction },
    { regex: /\$[\d,]+\.?\d*/g, className: styles.highlightAmount },
    { regex: /\+[\d.]+%/g, className: styles.highlightProfit },
    { regex: /-[\d.]+%/g, className: styles.highlightLoss },
    { regex: /\b(bullish|bearish|neutral)\b/gi, className: styles.highlightSentiment },
    { regex: /\b(BLOCKED|DENIED|EXCEEDED)\b/g, className: styles.highlightBlocked },
    { regex: /→/g, className: styles.highlightArrow },
  ];

  // Split text into lines for rendering
  const lines = text.split('\n');

  return (
    <>
      {lines.map((line, lineIndex) => {
        // Build highlighted segments
        let result: React.ReactNode[] = [];
        let lastIndex = 0;
        let segments: Array<{ start: number; end: number; className: string }> = [];

        // Find all matches
        for (const pattern of patterns) {
          const regex = new RegExp(pattern.regex);
          let match;
          while ((match = regex.exec(line)) !== null) {
            segments.push({
              start: match.index,
              end: match.index + match[0].length,
              className: pattern.className,
            });
          }
        }

        // Sort by start position
        segments.sort((a, b) => a.start - b.start);

        // Build result
        for (const segment of segments) {
          if (segment.start > lastIndex) {
            result.push(line.slice(lastIndex, segment.start));
          }
          result.push(
            <span key={`${lineIndex}-${segment.start}`} className={segment.className}>
              {line.slice(segment.start, segment.end)}
            </span>
          );
          lastIndex = segment.end;
        }

        // Add remaining text
        if (lastIndex < line.length) {
          result.push(line.slice(lastIndex));
        }

        return (
          <div key={lineIndex} className={styles.line}>
            {result.length > 0 ? result : '\u00A0'}
          </div>
        );
      })}
    </>
  );
}
