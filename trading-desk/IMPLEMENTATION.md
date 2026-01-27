# Trading Desk Demo - Implementation Guide

Detailed breakdown of what we're building for the autonomous trading desk demo.

---

## Directory Structure

```
trading-desk/
├── README.md                    # Quick start guide
├── STATE_MACHINES.md            # State machine specs (this doc)
├── IMPLEMENTATION.md            # Implementation guide (this doc)
├── package.json                 # Dependencies
├── tsconfig.json
├── vite.config.ts
├── index.html
│
├── src/
│   ├── main.tsx                 # App entry point
│   ├── App.tsx                  # Main layout
│   │
│   ├── components/
│   │   ├── Layout/
│   │   │   └── DemoGrid.tsx     # 75/25 grid layout
│   │   │
│   │   ├── Chart/
│   │   │   ├── PriceChart.tsx   # TradingView wrapper
│   │   │   └── TradeMarker.tsx  # Buy/sell markers
│   │   │
│   │   ├── Panels/
│   │   │   ├── TraderPanel.tsx  # Trader agent info
│   │   │   ├── ResearchPanel.tsx # Research agent info
│   │   │   ├── ActivityFeed.tsx # Live activity log
│   │   │   └── ReasoningPanel.tsx # LLM streaming output
│   │   │
│   │   └── common/
│   │       ├── PolicyDisplay.tsx # Guardrail visualization
│   │       ├── BalanceCard.tsx
│   │       └── StatusIndicator.tsx
│   │
│   ├── agents/
│   │   ├── TraderAgent.ts       # Trading agent logic
│   │   ├── ResearchAgent.ts     # Research agent logic
│   │   └── types.ts             # Agent interfaces
│   │
│   ├── services/
│   │   ├── PriceFeed.ts         # CoinGecko + mock fallback
│   │   ├── ChainService.ts      # Anvil connection
│   │   ├── LLMService.ts        # Claude API streaming
│   │   └── EscrowService.ts     # Contract interactions
│   │
│   ├── hooks/
│   │   ├── useTraderAgent.ts
│   │   ├── useResearchAgent.ts
│   │   ├── usePriceFeed.ts
│   │   ├── useActivityLog.ts
│   │   └── useDemoOrchestrator.ts
│   │
│   ├── state/
│   │   ├── DemoOrchestrator.ts  # Demo flow controller
│   │   └── EventBus.ts          # Inter-component events
│   │
│   └── utils/
│       ├── format.ts            # Price/amount formatting
│       └── constants.ts         # Chain config, addresses
│
├── contracts/
│   └── deploy.ts                # Escrow deployment script
│
└── public/
    └── favicon.svg
```

---

## Component Breakdown

### 1. DemoGrid Layout (`components/Layout/DemoGrid.tsx`)

The main dashboard layout with 75/25 splits.

```tsx
// Target structure
<div className="h-screen grid grid-cols-[3fr_1fr]">
  {/* Main Content (75%) */}
  <div className="grid grid-rows-2">
    {/* Row 1 */}
    <div className="grid grid-cols-[3fr_1fr]">
      <PriceChart />      {/* 75% of row */}
      <TraderPanel />     {/* 25% of row */}
    </div>
    {/* Row 2 */}
    <div className="grid grid-cols-[3fr_1fr]">
      <ActivityFeed />    {/* 75% of row */}
      <ResearchPanel />   {/* 25% of row */}
    </div>
  </div>

  {/* Reasoning Panel (25%, full height) */}
  <ReasoningPanel />
</div>
```

**Styling Notes:**
- Dark theme (trading terminal aesthetic)
- Monospace fonts for numbers
- Subtle borders between panels
- Green/red colors for profit/loss

---

### 2. PriceChart (`components/Chart/PriceChart.tsx`)

TradingView Lightweight Charts integration.

```tsx
import { createChart, IChartApi, ISeriesApi } from 'lightweight-charts';

interface Props {
  trades: TradeMarker[];
}

// Features:
// - Candlestick chart (or line chart for simplicity)
// - Real-time price updates
// - Trade markers (triangles for buy/sell)
// - 24h price range indicator
```

**Dependencies:**
```json
{
  "lightweight-charts": "^4.1.0"
}
```

---

### 3. TraderPanel (`components/Panels/TraderPanel.tsx`)

Shows trader agent status and policy.

```tsx
interface TraderPanelProps {
  agent: {
    did: string;           // "did:key:z6Mk..."
    balance: bigint;       // Wei balance
    todayPnL: number;      // $ profit/loss
    tradeCount: number;
    policy: {
      maxPerTx: bigint;    // $100
      dailyCap: bigint;    // $500
      todaySpent: bigint;
    };
  };
}

// Display:
// ┌─────────────────────────┐
// │ 🤖 TRADER AGENT         │
// │                         │
// │ DID: did:key:z6Mk...    │
// │ Balance: 0.5 ETH        │
// │                         │
// │ Today's P&L: +$12.45    │
// │ Trades: 5               │
// │                         │
// │ ─── POLICY ───          │
// │ Max/Trade: $100         │
// │ Daily Cap: $500         │
// │                         │
// │ Daily Usage:            │
// │ [████████░░] 82%        │
// │ $410 / $500             │
// └─────────────────────────┘
```

---

### 4. ResearchPanel (`components/Panels/ResearchPanel.tsx`)

Shows research agent status.

```tsx
interface ResearchPanelProps {
  agent: {
    did: string;
    balance: bigint;
    earnings: bigint;
    jobsCompleted: number;
    status: 'available' | 'working' | 'delivering';
    currentJob?: {
      description: string;
      payment: bigint;
      progress: number;  // 0-100
    };
  };
}

// Display:
// ┌─────────────────────────┐
// │ 🔬 RESEARCH AGENT       │
// │                         │
// │ DID: did:key:z7Nl...    │
// │ Balance: 0.02 ETH       │
// │                         │
// │ Earnings: $15.00        │
// │ Jobs: 3                 │
// │                         │
// │ Status: WORKING         │
// │ "Analyze ETH sentiment" │
// │ [███████░░░] 70%        │
// └─────────────────────────┘
```

---

### 5. ActivityFeed (`components/Panels/ActivityFeed.tsx`)

Chronological list of all actions.

```tsx
interface ActivityItem {
  id: string;
  timestamp: number;
  type: 'trade' | 'escrow' | 'blocked' | 'guardrail';
  icon: string;
  message: string;
  details?: string;
  status: 'success' | 'pending' | 'blocked';
}

// Display:
// ┌───────────────────────────────────────────────────────────────┐
// │ ACTIVITY FEED                                                 │
// ├───────────────────────────────────────────────────────────────┤
// │ 14:32:05  ✅  Bought 0.025 ETH @ $3,245                      │
// │ 14:31:58  📋  Escrow #1 released: $5 to Research Agent       │
// │ 14:31:45  📋  Research delivered: "Bullish, 75% confidence"  │
// │ 14:31:30  📋  Escrow #1 claimed by Research Agent            │
// │ 14:31:15  📋  Created escrow #1: $5 for market analysis      │
// │ 14:30:00  🟢  Trading session started                        │
// ├───────────────────────────────────────────────────────────────┤
// │ Summary: 5 trades │ $12.45 P&L │ 0 blocked                   │
// └───────────────────────────────────────────────────────────────┘
```

---

### 6. ReasoningPanel (`components/Panels/ReasoningPanel.tsx`)

Streaming LLM output showing agent's thought process.

```tsx
interface ReasoningPanelProps {
  streamingText: string;
  isThinking: boolean;
}

// Display:
// ┌─────────────────────────┐
// │ 🧠 AGENT REASONING      │
// │                         │
// │ Analyzing price action..│
// │                         │
// │ Current price: $3,245   │
// │ 24h change: +2.3%       │
// │ Research says: bullish  │
// │                         │
// │ Decision factors:       │
// │ • Strong support at     │
// │   $3,200                │
// │ • Volume increasing     │
// │ • RSI not overbought    │
// │                         │
// │ → Placing BUY order     │
// │   Amount: $80           │
// │   (within guardrails)   │
// │                         │
// │ ▌                       │  <- cursor blink
// └─────────────────────────┘
```

---

### 7. TraderAgent (`agents/TraderAgent.ts`)

Core trading logic with guardrails.

```typescript
import { AgentWallet } from '@monmouth/wallet-sdk';
import { PolicyEnforcer } from '@monmouth/wallet-sdk/guardrails';

export class TraderAgent {
  private wallet: AgentWallet;
  private state: 'idle' | 'analyzing' | 'executing' | 'blocked';
  private eventBus: EventBus;

  constructor(config: TraderConfig) {
    this.wallet = new AgentWallet({
      privateKey: config.privateKey,
      rpcUrl: config.rpcUrl,
      policy: {
        maxPerTransaction: parseEther('0.03'),  // ~$100
        dailySpendingCap: parseEther('0.15'),   // ~$500
      }
    });
  }

  async analyzePriceAction(price: PriceUpdate): Promise<TradeDecision> {
    // 1. Get research context
    // 2. Call LLM for analysis
    // 3. Return decision
  }

  async executeTrade(decision: TradeDecision): Promise<TradeResult> {
    // 1. Validate against guardrails
    // 2. If blocked, emit event and potentially adjust
    // 3. Execute via wallet SDK
    // 4. Log activity
    // 5. Return result
  }
}
```

---

### 8. EscrowService (`services/EscrowService.ts`)

Wraps the MonmouthEscrow contract.

```typescript
import { EscrowClient } from '@monmouth/wallet-sdk/commerce';

export class EscrowService {
  private client: EscrowClient;

  constructor(contractAddress: string, rpcUrl: string) {
    this.client = new EscrowClient({
      contractAddress,
      rpcUrl
    });
  }

  async createJob(params: {
    description: string;
    payment: bigint;
    deadline: number;
  }): Promise<{ escrowId: bigint; txHash: string }> {
    return this.client.createEscrowETH({
      recipient: '0x0', // Open job
      description: params.description,
      deadline: params.deadline,
      value: params.payment
    });
  }

  async releasePayment(escrowId: bigint): Promise<{ txHash: string }> {
    return this.client.release(escrowId);
  }

  // Subscribe to escrow events
  onEscrowEvent(callback: (event: EscrowEvent) => void): void {
    // Listen to contract events
  }
}
```

---

### 9. PriceFeed (`services/PriceFeed.ts`)

Real prices with mock fallback.

```typescript
export class PriceFeed {
  private mode: 'live' | 'mock' = 'live';
  private currentPrice: number = 3200;
  private listeners: Set<(price: PriceUpdate) => void> = new Set();

  async connect(): Promise<void> {
    try {
      // Try CoinGecko
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
      );
      const data = await response.json();
      this.currentPrice = data.ethereum.usd;
      this.mode = 'live';
    } catch {
      console.warn('CoinGecko unavailable, using mock prices');
      this.mode = 'mock';
    }

    this.startPolling();
  }

  private startPolling(): void {
    setInterval(async () => {
      if (this.mode === 'live') {
        await this.fetchLivePrice();
      } else {
        this.generateMockPrice();
      }
      this.emit();
    }, 5000);
  }

  private generateMockPrice(): void {
    // Random walk with slight upward bias (for demo)
    const change = (Math.random() - 0.45) * 10; // -4.5 to +5.5
    this.currentPrice += change;
  }

  subscribe(callback: (price: PriceUpdate) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
}
```

---

### 10. DemoOrchestrator (`state/DemoOrchestrator.ts`)

Controls the 5-act demo flow.

```typescript
type DemoAct = 'init' | 'setup' | 'research' | 'trading' | 'blocked' | 'summary' | 'done';

export class DemoOrchestrator {
  private currentAct: DemoAct = 'init';
  private trader: TraderAgent;
  private researcher: ResearchAgent;
  private eventBus: EventBus;

  async start(): Promise<void> {
    await this.transition('setup');
  }

  async transition(act: DemoAct): Promise<void> {
    this.currentAct = act;
    this.eventBus.emit('act_change', { act });

    switch (act) {
      case 'setup':
        // Just display, wait for manual advance or timer
        break;

      case 'research':
        await this.runResearchPhase();
        break;

      case 'trading':
        await this.runTradingPhase();
        break;

      case 'blocked':
        await this.runBlockedPhase();
        break;

      case 'summary':
        // Calculate and display final stats
        break;
    }
  }

  private async runResearchPhase(): Promise<void> {
    // 1. Trader creates escrow job
    const escrowId = await this.trader.requestResearch({
      description: 'Analyze ETH sentiment',
      payment: parseEther('0.0015') // ~$5
    });

    // 2. Research agent claims and delivers
    await this.researcher.claimJob(escrowId);
    await this.researcher.deliverWork(escrowId);

    // 3. Trader releases payment
    await this.trader.releaseEscrow(escrowId);

    // Transition after complete
    await this.transition('trading');
  }

  private async runBlockedPhase(): Promise<void> {
    // Attempt a trade that exceeds limits
    const result = await this.trader.executeTrade({
      action: 'buy',
      amount: parseEther('0.18'), // ~$600, exceeds $500 daily cap
      reason: 'Large opportunity detected'
    });

    // Should be blocked, then retry with adjusted amount
    if (result.blocked) {
      await sleep(2000); // Dramatic pause
      await this.trader.executeTrade({
        action: 'buy',
        amount: result.adjustedAmount!,
        reason: 'Adjusted to comply with guardrails'
      });
    }

    await this.transition('summary');
  }
}
```

---

## Dependencies

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "lightweight-charts": "^4.1.0",
    "viem": "^2.0.0",
    "@anthropic-ai/sdk": "^0.20.0",
    "zustand": "^4.5.0",
    "tailwindcss": "^3.4.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0",
    "@vitejs/plugin-react": "^4.2.0"
  }
}
```

---

## Environment Variables

```env
# .env.local
VITE_RPC_URL=http://localhost:8545
VITE_ESCROW_CONTRACT=0x...  # Deployed address
VITE_ANTHROPIC_API_KEY=sk-ant-...
VITE_COINGECKO_API_KEY=...  # Optional, for higher rate limits
```

---

## Build Order

### Week 1: Foundation
1. **Day 1-2**: Project setup, layout, static components
2. **Day 3**: TradingView chart integration
3. **Day 4**: Price feed service (mock + CoinGecko)
4. **Day 5**: Deploy escrow contract, basic EscrowService

### Week 2: Integration
1. **Day 1-2**: TraderAgent with guardrails wired
2. **Day 3**: ResearchAgent with escrow flow
3. **Day 4**: Activity feed with real events
4. **Day 5**: LLM streaming integration

### Week 3: Polish
1. **Day 1-2**: DemoOrchestrator with full flow
2. **Day 3**: Edge cases, error handling
3. **Day 4**: Visual polish, animations
4. **Day 5**: Full run-through, record backup video
