# Trading Desk Demo - State Machines

Technical specification for how the autonomous trading desk demo operates with the Monmouth chain.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              TRADING DESK DEMO                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐              │
│   │   TRADER    │ ──────► │   ESCROW    │ ──────► │  RESEARCH   │              │
│   │    AGENT    │ ◄────── │  CONTRACT   │ ◄────── │    AGENT    │              │
│   └──────┬──────┘         └─────────────┘         └─────────────┘              │
│          │                                                                       │
│          │  trade requests                                                       │
│          ▼                                                                       │
│   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐              │
│   │  GUARDRAIL  │ ──────► │   WALLET    │ ──────► │  ACTIVITY   │              │
│   │   CHECK     │         │     SDK     │         │     LOG     │              │
│   └──────┬──────┘         └──────┬──────┘         └─────────────┘              │
│          │                       │                                               │
│          │ approved              │ signed tx                                     │
│          ▼                       ▼                                               │
│   ┌─────────────────────────────────────────────────────────────┐              │
│   │                    MONMOUTH L2 (Chain ID 7750)               │              │
│   │                         2s block time                        │              │
│   └─────────────────────────────────────────────────────────────┘              │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Demo Orchestrator State Machine

Controls the overall demo flow through 5 acts.

```
                              ┌─────────────────┐
                              │      INIT       │
                              │  Load configs,  │
                              │  connect chain  │
                              └────────┬────────┘
                                       │
                                       │ ready
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                  │
│    ┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐          │
│    │  ACT 1   │      │  ACT 2   │      │  ACT 3   │      │  ACT 4   │          │
│    │  SETUP   │ ───► │ RESEARCH │ ───► │ TRADING  │ ───► │ BLOCKED  │          │
│    │  30 sec  │      │  1 min   │      │  1.5 min │      │  1 min   │          │
│    └──────────┘      └──────────┘      └──────────┘      └──────────┘          │
│         │                 │                 │                 │                 │
│         │                 │                 │                 │                 │
│         ▼                 ▼                 ▼                 ▼                 │
│    Show agents       Escrow job        Execute          Trigger block          │
│    Show policy       created           trades           Show recovery          │
│    Show balance      Research done     Update P&L       Retry success          │
│                      Payment sent                                               │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       │ complete
                                       ▼
                              ┌─────────────────┐
                              │     ACT 5       │
                              │    SUMMARY      │
                              │     1 min       │
                              └─────────────────┘
                                       │
                                       │ show stats
                                       ▼
                              ┌─────────────────┐
                              │      DONE       │
                              │  Ready to loop  │
                              └─────────────────┘
```

**State Definitions:**

| State | Entry Action | Exit Condition |
|-------|--------------|----------------|
| INIT | Connect to chain, load wallets, verify balances | All systems ready |
| ACT_1_SETUP | Display agent panels, highlight policy | Timer or manual advance |
| ACT_2_RESEARCH | Trigger escrow creation | Escrow released |
| ACT_3_TRADING | Start trading loop | 2-3 trades complete |
| ACT_4_BLOCKED | Attempt large trade | Block shown + recovery |
| ACT_5_SUMMARY | Calculate final stats | Presenter ends demo |
| DONE | Idle, can restart | Manual restart |

---

## 2. Trader Agent State Machine

The autonomous trading agent with guardrails.

```
                              ┌─────────────────┐
                              │      IDLE       │
                              │  Waiting for    │
                              │  market signal  │
                              └────────┬────────┘
                                       │
                                       │ price update / timer
                                       ▼
                              ┌─────────────────┐
                              │    ANALYZING    │
                              │  LLM reasoning  │
                              │   (streaming)   │
                              └────────┬────────┘
                                       │
                     ┌─────────────────┼─────────────────┐
                     │                 │                 │
                     ▼                 ▼                 ▼
            ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
            │    HOLD     │   │     BUY     │   │    SELL     │
            │  No action  │   │  decision   │   │  decision   │
            └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
                   │                 │                 │
                   │                 ▼                 ▼
                   │         ┌─────────────────────────────┐
                   │         │      GUARDRAIL_CHECK        │
                   │         │   PolicyEnforcer.validate   │
                   │         └────────────┬────────────────┘
                   │                      │
                   │         ┌────────────┼────────────┐
                   │         │            │            │
                   │         ▼            ▼            ▼
                   │   ┌──────────┐ ┌──────────┐ ┌──────────┐
                   │   │ APPROVED │ │ BLOCKED  │ │ ADJUSTED │
                   │   │          │ │          │ │  amount  │
                   │   └────┬─────┘ └────┬─────┘ └────┬─────┘
                   │        │            │            │
                   │        ▼            │            │
                   │   ┌──────────┐      │            │
                   │   │ EXECUTE  │      │            │
                   │   │ Send TX  │ ◄────┴────────────┘
                   │   └────┬─────┘       (retry with
                   │        │              adjusted amt)
                   │        ▼
                   │   ┌──────────┐
                   │   │ CONFIRM  │
                   │   │ Wait 2s  │
                   │   └────┬─────┘
                   │        │
                   └────────┴──────────────┐
                                           ▼
                              ┌─────────────────┐
                              │   LOG_ACTIVITY  │
                              │  Update P&L     │
                              │  Emit to feed   │
                              └────────┬────────┘
                                       │
                                       │ loop
                                       ▼
                                    [IDLE]
```

**Guardrail Check Logic:**

```typescript
interface TradeDecision {
  action: 'buy' | 'sell' | 'hold';
  amount: bigint;
  reason: string;
}

interface GuardrailResult {
  allowed: boolean;
  adjustedAmount?: bigint;
  blockReason?: string;
}

// Validation flow
async function validateTrade(decision: TradeDecision): Promise<GuardrailResult> {
  const policy = await wallet.getPolicy();

  // Check 1: Per-transaction limit
  if (decision.amount > policy.maxPerTransaction) {
    return {
      allowed: false,
      adjustedAmount: policy.maxPerTransaction,
      blockReason: `Exceeds per-tx limit (${policy.maxPerTransaction})`
    };
  }

  // Check 2: Daily spending cap
  const todaySpent = await wallet.getTodaySpending();
  const remaining = policy.dailyCap - todaySpent;
  if (decision.amount > remaining) {
    return {
      allowed: false,
      adjustedAmount: remaining > 0n ? remaining : 0n,
      blockReason: `Exceeds daily cap (${remaining} remaining)`
    };
  }

  // Check 3: Recipient allowlist (if applicable)
  // Check 4: Contract allowlist (if applicable)

  return { allowed: true };
}
```

---

## 3. Research Agent State Machine

Provides market analysis in exchange for payment.

```
                              ┌─────────────────┐
                              │    AVAILABLE    │
                              │  Listening for  │
                              │   escrow jobs   │
                              └────────┬────────┘
                                       │
                                       │ EscrowCreated event
                                       ▼
                              ┌─────────────────┐
                              │   JOB_FOUND     │
                              │  Check job desc │
                              │  Verify payment │
                              └────────┬────────┘
                                       │
                     ┌─────────────────┴─────────────────┐
                     │                                   │
                     ▼                                   ▼
            ┌─────────────┐                     ┌─────────────┐
            │   ACCEPT    │                     │   IGNORE    │
            │  Claim job  │                     │ Not relevant│
            └──────┬──────┘                     └──────┬──────┘
                   │                                   │
                   ▼                                   │
            ┌─────────────┐                            │
            │  WORKING    │                            │
            │  Analyzing  │                            │
            │   market    │                            │
            └──────┬──────┘                            │
                   │                                   │
                   │ analysis complete                 │
                   ▼                                   │
            ┌─────────────┐                            │
            │   DELIVER   │                            │
            │ Submit work │                            │
            │  to escrow  │                            │
            └──────┬──────┘                            │
                   │                                   │
                   │ work verified                     │
                   ▼                                   │
            ┌─────────────┐                            │
            │   PAID      │                            │
            │  Received   │                            │
            │   payment   │                            │
            └──────┬──────┘                            │
                   │                                   │
                   └───────────────┬───────────────────┘
                                   │
                                   ▼
                            [AVAILABLE]
```

**Research Output Format:**

```typescript
interface ResearchResult {
  sentiment: 'bullish' | 'bearish' | 'neutral';
  confidence: number;  // 0-100
  summary: string;
  recommendation: 'buy' | 'sell' | 'hold';
  targetPrice?: number;
}

// Example output
{
  sentiment: 'bullish',
  confidence: 75,
  summary: 'ETH showing strong support at $3,200 with increasing volume',
  recommendation: 'buy',
  targetPrice: 3350
}
```

---

## 4. Escrow Flow State Machine

Agent-to-agent payment via MonmouthEscrow contract.

```
                              ┌─────────────────┐
                              │  NO_ESCROW      │
                              │  (initial)      │
                              └────────┬────────┘
                                       │
                                       │ createEscrowETH()
                                       │ + ETH value
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           ON-CHAIN STATE                                         │
│                                                                                  │
│   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐              │
│   │   CREATED   │         │   CLAIMED   │         │  DELIVERED  │              │
│   │             │ ──────► │             │ ──────► │             │              │
│   │  ETH locked │ claim() │ Worker set  │ submit()│ Work ready  │              │
│   └─────────────┘         └─────────────┘         └──────┬──────┘              │
│         │                                                 │                     │
│         │ refund()                                        │ release()           │
│         │ (if expired)                                    ▼                     │
│         ▼                                         ┌─────────────┐              │
│   ┌─────────────┐                                 │  RELEASED   │              │
│   │  REFUNDED   │                                 │             │              │
│   │             │                                 │  ETH sent   │              │
│   │  ETH back   │                                 │  to worker  │              │
│   └─────────────┘                                 └─────────────┘              │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Contract Interactions:**

```solidity
// Trader Agent calls (via Wallet SDK)
function createEscrowETH(
    address recipient,      // Research agent address (or zero for open jobs)
    string calldata description,
    uint256 deadline
) external payable returns (uint256 escrowId);

function release(uint256 escrowId) external;  // After verifying work

// Research Agent calls
function claim(uint256 escrowId) external;    // Accept the job
function submitWork(uint256 escrowId, string calldata deliverable) external;
```

**Demo Escrow Timeline:**

```
T+0s   Trader: createEscrowETH($5, "Analyze ETH sentiment", deadline=5min)
       → Event: EscrowCreated(id=1, amount=5, description="...")

T+2s   Research: claim(1)
       → Event: EscrowClaimed(id=1, worker=0xResearch)
       → UI: Research panel shows "Working..."

T+5s   Research: submitWork(1, "Bullish, confidence 75%, recommend buy")
       → Event: WorkSubmitted(id=1, deliverable="...")
       → UI: Research panel shows "Delivered"

T+7s   Trader: release(1)
       → Event: EscrowReleased(id=1, amount=5)
       → UI: Activity feed shows "💰 Escrow #1 released: $5"
       → Research agent balance increases
```

---

## 5. Activity Log Flow

Every action is logged for audit trail.

```
                    ┌──────────────────────────────────────────┐
                    │            ACTION SOURCES                 │
                    │                                          │
                    │  ┌────────┐  ┌────────┐  ┌────────┐     │
                    │  │ Trade  │  │ Escrow │  │ Block  │     │
                    │  │ Exec   │  │ Events │  │ Events │     │
                    │  └───┬────┘  └───┬────┘  └───┬────┘     │
                    │      │           │           │           │
                    └──────┼───────────┼───────────┼───────────┘
                           │           │           │
                           └─────────┬─┴───────────┘
                                     │
                                     ▼
                           ┌─────────────────┐
                           │  ActivityLog    │
                           │  .logActivity() │
                           └────────┬────────┘
                                    │
                                    ▼
                    ┌──────────────────────────────────────────┐
                    │           LOG ENTRY                       │
                    │                                          │
                    │  {                                        │
                    │    id: "uuid",                            │
                    │    timestamp: 1706185200,                 │
                    │    type: "trade" | "escrow" | "blocked",  │
                    │    action: "buy" | "sell" | "create"...,  │
                    │    amount: "0.05",                        │
                    │    details: { ... },                      │
                    │    txHash: "0x...",                       │
                    │    status: "success" | "blocked"          │
                    │  }                                        │
                    │                                          │
                    └──────────────────────────────────────────┘
                                    │
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
            ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
            │  UI Feed    │ │  IndexedDB  │ │  Console    │
            │  (realtime) │ │  (persist)  │ │  (debug)    │
            └─────────────┘ └─────────────┘ └─────────────┘
```

**Activity Types for Demo:**

| Type | Icon | Example |
|------|------|---------|
| `trade_buy` | ✅ | "Bought 0.025 ETH @ $3,245" |
| `trade_sell` | ✅ | "Sold 0.025 ETH @ $3,280 (+$0.87)" |
| `trade_blocked` | 🔴 | "BLOCKED: $600 exceeds daily cap" |
| `escrow_created` | 📋 | "Created escrow #1: $5 for research" |
| `escrow_claimed` | 📋 | "Escrow #1 claimed by Research Agent" |
| `escrow_released` | 💰 | "Released $5 to Research Agent" |
| `guardrail_trigger` | ⚠️ | "Daily limit reached (95% used)" |

---

## 6. Price Feed State Machine

Manages real-time price data for the chart and trading decisions.

```
                              ┌─────────────────┐
                              │  DISCONNECTED   │
                              └────────┬────────┘
                                       │
                                       │ connect()
                                       ▼
                              ┌─────────────────┐
                              │   CONNECTING    │
                              │  Fetch initial  │
                              │     data        │
                              └────────┬────────┘
                                       │
                     ┌─────────────────┴─────────────────┐
                     │                                   │
                     ▼                                   ▼
            ┌─────────────┐                     ┌─────────────┐
            │  CONNECTED  │                     │   FAILED    │
            │  Live feed  │                     │  Use mock   │
            └──────┬──────┘                     └──────┬──────┘
                   │                                   │
                   │ every 5s                          │ every 5s
                   ▼                                   ▼
            ┌─────────────┐                     ┌─────────────┐
            │   POLLING   │                     │  MOCK_TICK  │
            │  CoinGecko  │                     │ Random walk │
            └──────┬──────┘                     └──────┬──────┘
                   │                                   │
                   └───────────────┬───────────────────┘
                                   │
                                   ▼
                           ┌─────────────────┐
                           │   EMIT_PRICE    │
                           │  Update chart   │
                           │  Notify agent   │
                           └────────┬────────┘
                                    │
                                    │ loop
                                    ▼
                              [POLLING/MOCK]
```

**Price Event Format:**

```typescript
interface PriceUpdate {
  symbol: 'ETH/USD';
  price: number;
  timestamp: number;
  change24h: number;
  source: 'coingecko' | 'mock';
}

// Event emission
priceEmitter.emit('price', {
  symbol: 'ETH/USD',
  price: 3245.67,
  timestamp: Date.now(),
  change24h: 2.3,
  source: 'coingecko'
});
```

---

## 7. Complete Demo Sequence Diagram

```
┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌─────────┐  ┌────────┐
│  UI    │  │ Trader │  │Research│  │ Escrow │  │ Chain   │  │ Price  │
│        │  │ Agent  │  │ Agent  │  │Contract│  │(Anvil)  │  │ Feed   │
└───┬────┘  └───┬────┘  └───┬────┘  └───┬────┘  └────┬────┘  └───┬────┘
    │           │           │           │            │           │
    │◄──────────────────────────────────────────────────────────│ price tick
    │           │           │           │            │           │
    │  ─────────┼───────────┼───────────┼────────────┼──────────►│
    │  request  │           │           │            │           │
    │  research │           │           │            │           │
    │           │           │           │            │           │
    │           │──────────────────────►│            │           │
    │           │  createEscrowETH($5)  │            │           │
    │           │           │           │───────────►│           │
    │           │           │           │   TX       │           │
    │           │           │           │◄───────────│           │
    │           │           │           │  receipt   │           │
    │           │           │◄──────────│            │           │
    │           │           │  event    │            │           │
    │           │           │           │            │           │
    │           │           │──────────►│            │           │
    │           │           │  claim()  │            │           │
    │           │           │           │───────────►│           │
    │           │           │           │◄───────────│           │
    │           │           │           │            │           │
    │           │           │──────────►│            │           │
    │           │           │ submitWork│            │           │
    │           │           │           │───────────►│           │
    │           │           │           │◄───────────│           │
    │           │           │           │            │           │
    │           │──────────────────────►│            │           │
    │           │  release()            │            │           │
    │           │           │           │───────────►│           │
    │           │           │           │◄───────────│           │
    │           │           │◄──────────│            │           │
    │           │           │  payment  │            │           │
    │           │           │           │            │           │
    │◄──────────────────────────────────────────────────────────│ price tick
    │           │           │           │            │           │
    │           │  analyze()│           │            │           │
    │           │──────────►│           │            │           │
    │           │◄──────────│           │            │           │
    │           │  "BUY"    │           │            │           │
    │           │           │           │            │           │
    │           │────────────────────────────────────►           │
    │           │  buy 0.025 ETH                     │           │
    │           │◄───────────────────────────────────│           │
    │           │  tx confirmed                      │           │
    │           │           │           │            │           │
    │◄──────────│           │           │            │           │
    │  update   │           │           │            │           │
    │  activity │           │           │            │           │
    │  + chart  │           │           │            │           │
    │           │           │           │            │           │
```

---

## Implementation Checklist

### Phase 1: State Infrastructure
- [ ] Create `DemoOrchestrator` class with act state machine
- [ ] Create `TraderAgent` class with trading state machine
- [ ] Create `ResearchAgent` class with job state machine
- [ ] Create `PriceFeed` class with polling/mock fallback
- [ ] Create shared event bus for component communication

### Phase 2: Chain Integration
- [ ] Deploy MonmouthEscrow.sol to local Anvil
- [ ] Configure EscrowClient with contract address
- [ ] Wire Trader agent to Wallet SDK guardrails
- [ ] Test escrow create → claim → deliver → release flow
- [ ] Verify activity logging captures all events

### Phase 3: UI Binding
- [ ] Connect state machines to React components via hooks
- [ ] Implement real-time activity feed updates
- [ ] Add trade markers to TradingView chart
- [ ] Stream LLM reasoning to panel
- [ ] Add visual indicators for blocked transactions

### Phase 4: Demo Polish
- [ ] Add transition animations between acts
- [ ] Create "danger zone" visual for approaching limits
- [ ] Test full 5-minute flow end-to-end
- [ ] Add manual controls for presenter (pause, skip, restart)
