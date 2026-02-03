import { useState, useEffect, useCallback } from 'react';
import { DemoGrid } from './components/Layout/DemoGrid';
import { MobileLayout } from './components/Layout/MobileLayout';
import { PriceChart } from './components/Chart/PriceChart';
import { TraderPanel } from './components/Panels/TraderPanel';
import { ActivityFeed, ActivityItem } from './components/Panels/ActivityFeed';
import { ResearchPanel } from './components/Panels/ResearchPanel';
import { ReasoningPanel } from './components/Panels/ReasoningPanel';
import { OpenClawPanel } from './components/Panels/OpenClawPanel';
import {
  useChainStatus,
  useAgentBalances,
  useEscrowEvents,
  useEscrowActions,
  TEST_ACCOUNTS,
  ESCROW_ADDRESS,
} from './hooks/useMonmouth';
import { useOpenClaw } from './hooks/useOpenClaw';
import { usePriceData, useTradeMarkers } from './hooks/usePriceData';
import { useIsMobile } from './hooks/useMediaQuery';

export default function App() {
  // Responsive layout detection
  const isMobile = useIsMobile();

  // Chain state
  const chainStatus = useChainStatus();
  const { balances, refresh: refreshBalances } = useAgentBalances();
  const escrowEvents = useEscrowEvents();
  const escrowActions = useEscrowActions();

  // OpenClaw agent state
  const openClaw = useOpenClaw();

  // Real price data from CoinGecko
  const { priceData, currentPrice, priceChange24h, isLoading: priceLoading } = usePriceData();

  // Trade markers derived from escrow events
  const trades = useTradeMarkers(escrowEvents, priceData);

  // UI state
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [reasoning, setReasoning] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [_currentEscrowId, setCurrentEscrowId] = useState<bigint | null>(null);

  // Convert escrow events to activity items
  useEffect(() => {
    const newActivities: ActivityItem[] = escrowEvents.map((event, idx) => {
      const typeMap: Record<string, ActivityItem['type']> = {
        created: 'escrow_created',
        claimed: 'escrow_claimed',
        delivered: 'escrow_claimed',
        released: 'escrow_released',
        expired: 'trade_blocked',
      };

      return {
        id: `${event.txHash}-${idx}`,
        timestamp: Date.now() - idx * 5000,
        type: typeMap[event.type] || 'session_start',
        message: `Escrow #${event.escrowId}: ${event.type}`,
        txHash: event.txHash,
      };
    });

    if (newActivities.length > 0) {
      setActivities((prev) => [...newActivities, ...prev].slice(0, 20));
    }
  }, [escrowEvents]);

  // Demo: Run the trading flow
  const runDemoFlow = useCallback(async () => {
    if (!chainStatus.connected) {
      setReasoning('❌ Not connected to Monmouth L2. Please start the node.');
      return;
    }

    setIsThinking(true);
    setReasoning('Connecting to Monmouth L2...\n');

    try {
      // Step 1: Create escrow
      setReasoning((prev) => prev + `\n✓ Connected to chain ${chainStatus.chainId}\n`);
      setReasoning((prev) => prev + `\n🦞 OpenClaw agent initiating escrow creation...\n`);
      setReasoning((prev) => prev + `  Provider: ${TEST_ACCOUNTS.research.address.slice(0, 10)}...\n`);
      setReasoning((prev) => prev + `  Amount: 0.005 ETH\n`);
      setReasoning((prev) => prev + `  Timeout: 1 hour\n`);

      // Start OpenClaw operation
      openClaw.startOperation({
        type: 'escrow_create',
        description: 'Creating escrow for market analysis',
        chain: 'evm',
        estimatedCost: '0.005 ETH',
      });

      const createTx = await escrowActions.create(
        'Analyze ETH/USD market sentiment',
        '0.005',
        3600
      );

      // Complete OpenClaw operation
      openClaw.completeOperation(`op-${Date.now()}`, createTx);
      openClaw.simulateTransaction('escrow_create', '0.005 ETH');

      setReasoning((prev) => prev + `\n✓ Escrow created!\n  TX: ${createTx.slice(0, 18)}...\n`);

      // Get escrow ID from count
      const escrowId = chainStatus.escrowCount;
      setCurrentEscrowId(escrowId);

      // Step 2: Research agent claims
      setReasoning((prev) => prev + `\n🔬 Research Agent claiming escrow #${escrowId}...\n`);
      await new Promise((r) => setTimeout(r, 1000));

      const claimTx = await escrowActions.claim(escrowId);
      setReasoning((prev) => prev + `✓ Claimed! TX: ${claimTx.slice(0, 18)}...\n`);

      // Step 3: Research agent delivers
      setReasoning((prev) => prev + `\n📊 Analyzing market via x402 payment...\n`);
      openClaw.startOperation({
        type: 'research',
        description: 'Market sentiment analysis',
        chain: 'evm',
        estimatedCost: '0.001 ETH',
      });
      await new Promise((r) => setTimeout(r, 2000));

      setReasoning((prev) => prev + `\nMarket Analysis Results:\n`);
      setReasoning((prev) => prev + `  • Sentiment: BULLISH\n`);
      setReasoning((prev) => prev + `  • Confidence: 75%\n`);
      setReasoning((prev) => prev + `  • Support: $3,200\n`);
      setReasoning((prev) => prev + `  • Resistance: $3,400\n`);

      const deliverTx = await escrowActions.deliver(
        escrowId,
        'Bullish sentiment, 75% confidence, recommend BUY'
      );
      openClaw.completeOperation(`op-${Date.now()}`, deliverTx);
      setReasoning((prev) => prev + `\n✓ Delivered! TX: ${deliverTx.slice(0, 18)}...\n`);

      // Step 4: Trader releases payment
      setReasoning((prev) => prev + `\n💰 Releasing payment to Research Agent...\n`);
      await new Promise((r) => setTimeout(r, 500));

      const releaseTx = await escrowActions.release(escrowId);
      openClaw.simulateTransaction('escrow_claim', '0.005 ETH');
      setReasoning((prev) => prev + `✓ Released! TX: ${releaseTx.slice(0, 18)}...\n`);

      // Refresh balances
      await refreshBalances();

      setReasoning((prev) => prev + `\n════════════════════════════════════\n`);
      setReasoning((prev) => prev + `✅ Demo flow complete!\n`);
      setReasoning((prev) => prev + `\n🦞 OpenClaw agent metrics updated\n`);
      setReasoning((prev) => prev + `\nNew balances:\n`);
      setReasoning((prev) => prev + `  Trader: ${balances.trader.slice(0, 8)} ETH\n`);
      setReasoning((prev) => prev + `  Research: ${balances.research.slice(0, 8)} ETH\n`);
    } catch (error) {
      setReasoning(
        (prev) => prev + `\n❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`
      );
    } finally {
      setIsThinking(false);
    }
  }, [chainStatus, escrowActions, refreshBalances, balances, openClaw]);

  // Initial reasoning text
  useEffect(() => {
    const priceStatus = priceLoading
      ? '⏳ Loading ETH price...'
      : `📈 ETH/USD: $${currentPrice.toFixed(2)} (${priceChange24h >= 0 ? '+' : ''}${priceChange24h.toFixed(2)}%)`;

    if (chainStatus.connected) {
      setReasoning(
        `Connected to Monmouth L2 (Chain ID: ${chainStatus.chainId})\n` +
          `Block: ${chainStatus.blockNumber}\n` +
          `Escrow Contract: ${ESCROW_ADDRESS}\n` +
          `Total Escrows: ${chainStatus.escrowCount}\n` +
          `Total Locked: ${chainStatus.totalLocked} ETH\n\n` +
          `${priceStatus}\n` +
          `(Live data from CoinGecko)\n\n` +
          `Trader Agent: ${TEST_ACCOUNTS.trader.address.slice(0, 18)}...\n` +
          `  Balance: ${balances.trader.slice(0, 8)} ETH\n\n` +
          `Research Agent: ${TEST_ACCOUNTS.research.address.slice(0, 18)}...\n` +
          `  Balance: ${balances.research.slice(0, 8)} ETH\n\n` +
          `Click "Run Demo" to execute escrow flow.`
      );
    } else {
      setReasoning(
        `⏳ Connecting to Monmouth L2...\n\n` +
          `${priceStatus}\n\n` +
          `Make sure the L2 node is running:\n` +
          `  ./scripts/start_dev.sh\n\n` +
          `Expected RPC: http://localhost:8545`
      );
    }
  }, [chainStatus, balances, currentPrice, priceChange24h, priceLoading]);

  // Build trader agent data
  const traderAgent = {
    did: `did:key:${TEST_ACCOUNTS.trader.address.slice(2, 42)}`,
    balance: `${balances.trader.slice(0, 6)} ETH`,
    balanceUsd: `$${(parseFloat(balances.trader) * currentPrice).toFixed(2)}`,
    todayPnL: 12.45,
    tradeCount: Number(chainStatus.escrowCount),
    policy: {
      maxPerTx: '$100',
      dailyCap: '$500',
      todaySpent: '$85',
      usagePercent: 17,
    },
    status: isThinking ? ('analyzing' as const) : ('idle' as const),
  };

  const researchAgent = {
    did: `did:key:${TEST_ACCOUNTS.research.address.slice(2, 42)}`,
    balance: `${balances.research.slice(0, 6)} ETH`,
    earnings: '$15.00',
    jobsCompleted: Number(chainStatus.escrowCount),
    status: isThinking ? ('working' as const) : ('available' as const),
    lastResult: {
      sentiment: 'bullish' as const,
      confidence: 75,
      recommendation: 'Buy ETH with moderate position size',
    },
  };

  // Add demo button activity
  const demoActivity: ActivityItem = {
    id: 'demo-btn',
    timestamp: Date.now(),
    type: 'session_start',
    message: chainStatus.connected
      ? '🚀 Ready - Click "Run Demo" in Reasoning panel'
      : '⏳ Waiting for L2 connection...',
  };

  const allActivities =
    activities.length > 0 ? activities : [demoActivity];

  // Shared components
  const chartComponent = (
    <PriceChart
      symbol="ETH/USD"
      currentPrice={currentPrice}
      priceChange24h={priceChange24h}
      priceData={priceData}
      trades={trades}
    />
  );

  const traderPanelComponent = <TraderPanel agent={traderAgent} />;

  const activityFeedComponent = (
    <ActivityFeed
      activities={allActivities}
      stats={{
        trades: Number(chainStatus.escrowCount),
        pnl: 12.45,
        blocked: 0,
      }}
    />
  );

  const researchPanelComponent = <ResearchPanel agent={researchAgent} />;

  const reasoningPanelComponent = (
    <ReasoningPanel
      text={reasoning}
      isThinking={isThinking}
      decision={
        chainStatus.connected
          ? {
              action: 'demo',
              amount: 'Run Demo',
              reason: 'Execute full escrow flow',
            }
          : undefined
      }
      onAction={runDemoFlow}
    />
  );

  const openClawPanelComponent = (
    <OpenClawPanel
      agent={openClaw.agent}
      onApprove={openClaw.approveRequest}
      onReject={openClaw.rejectRequest}
      onSuspend={openClaw.suspendAgent}
      onResume={openClaw.resumeAgent}
      onSimulateApproval={openClaw.simulateApprovalRequest}
    />
  );

  // Mobile layout
  if (isMobile) {
    return (
      <MobileLayout
        chart={chartComponent}
        traderPanel={traderPanelComponent}
        activityFeed={activityFeedComponent}
        researchPanel={researchPanelComponent}
        reasoningPanel={reasoningPanelComponent}
        openClawPanel={openClawPanelComponent}
        priceHeader={{
          symbol: 'ETH/USD',
          price: `$${currentPrice.toFixed(2)}`,
          change: `${Math.abs(priceChange24h).toFixed(2)}%`,
          isPositive: priceChange24h >= 0,
        }}
        status={{
          connected: chainStatus.connected,
          balance: `${balances.trader.slice(0, 6)} ETH`,
          escrowCount: Number(chainStatus.escrowCount),
        }}
        onRunDemo={runDemoFlow}
        isDemoDisabled={!chainStatus.connected || isThinking}
      />
    );
  }

  // Desktop layout
  return (
    <DemoGrid
      chart={chartComponent}
      traderPanel={traderPanelComponent}
      activityFeed={activityFeedComponent}
      researchPanel={researchPanelComponent}
      reasoningPanel={reasoningPanelComponent}
      openClawPanel={openClawPanelComponent}
    />
  );
}
