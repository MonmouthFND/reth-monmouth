import { useState, useEffect } from 'react';
import { DemoGrid } from './components/Layout/DemoGrid';
import { PriceChart, TradeMarker } from './components/Chart/PriceChart';
import { TraderPanel } from './components/Panels/TraderPanel';
import { ActivityFeed, ActivityItem } from './components/Panels/ActivityFeed';
import { ResearchPanel } from './components/Panels/ResearchPanel';
import { ReasoningPanel } from './components/Panels/ReasoningPanel';
import { LineData, Time } from 'lightweight-charts';

// Mock data for demo
const mockTraderAgent = {
  did: 'did:key:z6MkhaXgBZDvotDkL5LMrxFfGVpMPgscYAK4xVnQrNQqpoHE',
  balance: '0.485 ETH',
  balanceUsd: '$1,576.25',
  todayPnL: 12.45,
  tradeCount: 5,
  policy: {
    maxPerTx: '$100',
    dailyCap: '$500',
    todaySpent: '$410',
    usagePercent: 82,
  },
  status: 'analyzing' as const,
};

const mockResearchAgent = {
  did: 'did:key:z6MknGc3ocHs3zdPiJbnaaqDi58ExyJMu8AUV6kBP7w9pGpL',
  balance: '0.018 ETH',
  earnings: '$15.00',
  jobsCompleted: 3,
  status: 'available' as const,
  lastResult: {
    sentiment: 'bullish' as const,
    confidence: 75,
    recommendation: 'Buy ETH with moderate position size',
  },
};

const mockActivities: ActivityItem[] = [
  {
    id: '6',
    timestamp: Date.now() - 5000,
    type: 'trade_buy',
    message: 'Bought 0.025 ETH @ $3,245',
    amount: '$81.13',
    txHash: '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
  },
  {
    id: '5',
    timestamp: Date.now() - 25000,
    type: 'escrow_released',
    message: 'Escrow #1 released: $5 to Research Agent',
    txHash: '0x2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c',
  },
  {
    id: '4',
    timestamp: Date.now() - 35000,
    type: 'escrow_claimed',
    message: 'Research delivered: "Bullish, 75% confidence"',
  },
  {
    id: '3',
    timestamp: Date.now() - 55000,
    type: 'escrow_claimed',
    message: 'Escrow #1 claimed by Research Agent',
  },
  {
    id: '2',
    timestamp: Date.now() - 75000,
    type: 'escrow_created',
    message: 'Created escrow #1: $5 for market analysis',
    amount: '$5.00',
    txHash: '0x3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
  },
  {
    id: '1',
    timestamp: Date.now() - 120000,
    type: 'session_start',
    message: 'Trading session started',
  },
];

const mockReasoning = `Analyzing current market conditions...

Current price: $3,245.67
24h change: +2.3%
Research sentiment: bullish

Decision factors:
• Strong support at $3,200 level
• Volume increasing over past 4 hours
• RSI at 58 (not overbought)
• Research agent confidence: 75%

Checking guardrails:
• Max per trade: $100 ✓
• Daily remaining: $90 ✓
• Recipient allowlisted: N/A

→ Placing BUY order
Amount: $80 (within guardrails)
Expected execution: ~2 seconds`;

// Generate mock price data
function generatePriceData(): LineData[] {
  const data: LineData[] = [];
  const basePrice = 3200;
  const now = Math.floor(Date.now() / 1000);

  for (let i = 100; i >= 0; i--) {
    const time = (now - i * 60) as Time;
    const randomWalk = (Math.random() - 0.48) * 15;
    const trend = (100 - i) * 0.3; // Slight upward trend
    const price = basePrice + trend + randomWalk + Math.sin(i / 10) * 20;
    data.push({ time, value: price });
  }

  return data;
}

// Generate mock trade markers
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
  const [priceData, setPriceData] = useState<LineData[]>([]);
  const [currentPrice, setCurrentPrice] = useState(3245.67);
  const [priceChange, setPriceChange] = useState(2.3);
  const [trades, setTrades] = useState<TradeMarker[]>([]);
  const [traderAgent, setTraderAgent] = useState(mockTraderAgent);
  const [activities, setActivities] = useState(mockActivities);

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
          activities={activities}
          stats={{
            trades: 5,
            pnl: 12.45,
            blocked: 0,
          }}
        />
      }
      researchPanel={<ResearchPanel agent={mockResearchAgent} />}
      reasoningPanel={
        <ReasoningPanel
          text={mockReasoning}
          isThinking={false}
          decision={{
            action: 'buy',
            amount: '$80',
            reason: 'Within guardrails, research bullish',
          }}
        />
      }
    />
  );
}
