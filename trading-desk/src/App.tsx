import { useState, useEffect, useCallback } from 'react';
import { DemoGrid } from './components/Layout/DemoGrid';
import { PriceChart, TradeMarker } from './components/Chart/PriceChart';
import { TraderPanel } from './components/Panels/TraderPanel';
import { ActivityFeed, ActivityItem } from './components/Panels/ActivityFeed';
import { ResearchPanel } from './components/Panels/ResearchPanel';
import { ReasoningPanel } from './components/Panels/ReasoningPanel';
import { OpenClawPanel } from './components/Panels/OpenClawPanel';
import { LineData, Time } from 'lightweight-charts';
import {
  useChainStatus,
  useAgentBalances,
  useEscrowEvents,
  useEscrowActions,
  TEST_ACCOUNTS,
  ESCROW_ADDRESS,
} from './hooks/useMonmouth';
import { useOpenClaw } from './hooks/useOpenClaw';

// Generate mock price data
function generatePriceData(): LineData[] {
  const data: LineData[] = [];
  const basePrice = 3200;
  const now = Math.floor(Date.now() / 1000);

  for (let i = 100; i >= 0; i--) {
    const time = (now - i * 60) as Time;
    const randomWalk = (Math.random() - 0.48) * 15;
    const trend = (100 - i) * 0.3;
    const price = basePrice + trend + randomWalk + Math.sin(i / 10) * 20;
    data.push({ time, value: price });
  }

  return data;
}

// Generate trade markers from escrow events
function generateTradeMarkers(priceData: LineData[]): TradeMarker[] {
  if (priceData.length < 20) return [];

  return [
    {
      time: priceData[priceData.length - 30]?.time || (0 as Time),
      position: 'belowBar',
      color: '#82D173',
      shape: 'arrowUp',
      text: '$65',
      type: 'buy',
    },
    {
      time: priceData[priceData.length - 15]?.time || (0 as Time),
      position: 'aboveBar',
      color: '#FF66CC',
      shape: 'arrowDown',
      text: '$67',
      type: 'sell',
    },
    {
      time: priceData[priceData.length - 5]?.time || (0 as Time),
      position: 'belowBar',
      color: '#82D173',
      shape: 'arrowUp',
      text: '$81',
      type: 'buy',
    },
  ];
}

export default function App() {
  // Chain state
  const chainStatus = useChainStatus();
  const { balances, refresh: refreshBalances } = useAgentBalances();
  const escrowEvents = useEscrowEvents();
  const escrowActions = useEscrowActions();

  // OpenClaw agent state
  const openClaw = useOpenClaw();

  // UI state
  const [priceData, setPriceData] = useState<LineData[]>([]);
  const [currentPrice, setCurrentPrice] = useState(3245.67);
  const [priceChange, setPriceChange] = useState(2.3);
  const [trades, setTrades] = useState<TradeMarker[]>([]);
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

  // Initialize price data
  useEffect(() => {
    const data = generatePriceData();
    setPriceData(data);
    setTrades(generateTradeMarkers(data));

    // Simulate live price updates
    const interval = setInterval(() => {
      setPriceData((prev) => {
        const lastTime = prev[prev.length - 1]?.time as number;
        const lastValue = prev[prev.length - 1]?.value || 3200;
        const newValue = lastValue + (Math.random() - 0.48) * 5;

        const newData = [
          ...prev.slice(1),
          { time: (lastTime + 60) as Time, value: newValue },
        ];

        setCurrentPrice(newValue);
        setPriceChange((prev) => prev + (Math.random() - 0.5) * 0.1);

        return newData;
      });
    }, 5000);

    return () => clearInterval(interval);
  }, []);

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
    if (chainStatus.connected) {
      setReasoning(
        `Connected to Monmouth L2 (Chain ID: ${chainStatus.chainId})\n` +
          `Block: ${chainStatus.blockNumber}\n` +
          `Escrow Contract: ${ESCROW_ADDRESS}\n` +
          `Total Escrows: ${chainStatus.escrowCount}\n` +
          `Total Locked: ${chainStatus.totalLocked} ETH\n\n` +
          `Trader Agent: ${TEST_ACCOUNTS.trader.address.slice(0, 18)}...\n` +
          `  Balance: ${balances.trader.slice(0, 8)} ETH\n\n` +
          `Research Agent: ${TEST_ACCOUNTS.research.address.slice(0, 18)}...\n` +
          `  Balance: ${balances.research.slice(0, 8)} ETH\n\n` +
          `Click "Run Demo" to execute escrow flow.`
      );
    } else {
      setReasoning(
        `⏳ Connecting to Monmouth L2...\n\n` +
          `Make sure the L2 node is running:\n` +
          `  ./scripts/start_dev.sh\n\n` +
          `Expected RPC: http://localhost:8545`
      );
    }
  }, [chainStatus, balances]);

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

  return (
    <DemoGrid
      chart={
        <PriceChart
          symbol="ETH/USD"
          currentPrice={currentPrice}
          priceChange24h={priceChange}
          priceData={priceData}
          trades={trades}
        />
      }
      traderPanel={<TraderPanel agent={traderAgent} />}
      activityFeed={
        <ActivityFeed
          activities={allActivities}
          stats={{
            trades: Number(chainStatus.escrowCount),
            pnl: 12.45,
            blocked: 0,
          }}
        />
      }
      researchPanel={<ResearchPanel agent={researchAgent} />}
      reasoningPanel={
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
      }
      openClawPanel={
        <OpenClawPanel
          agent={openClaw.agent}
          onApprove={openClaw.approveRequest}
          onReject={openClaw.rejectRequest}
          onSuspend={openClaw.suspendAgent}
          onResume={openClaw.resumeAgent}
          onSimulateApproval={openClaw.simulateApprovalRequest}
        />
      }
    />
  );
}
