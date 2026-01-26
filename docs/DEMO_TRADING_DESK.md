# The Autonomous Trading Desk - Demo Spec

**Status**: Planning
**Target**: Pre-seed pitch demo
**Branch**: `feature/trading-desk-demo` (to be created)

---

## Overview

A live demo showing an autonomous AI trading agent operating within guardrails, paying for research via escrow, and executing trades on Monmouth L2.

**Core thesis**: "AI agents need to transact, but can't do so safely. Monmouth solves this."

---

## What We're Showcasing

### Chain Capabilities
- Fast L2 transactions (2s blocks)
- Custom chain for agents (Chain ID 7750)
- Low fees for high-frequency trading

### Wallet SDK Capabilities
- **Guardrails** - Spending limits, per-tx caps, daily caps
- **Agent Identity** - DID, session management
- **Activity Logging** - Full audit trail
- **Policy Templates** - "Trading Agent" preset
- **Escrow** - Agent-to-agent payments
- **x402** - Pay for API data

---

## UI Layout

```
┌──────────────────────────────────────────────────────────┬──────────────────┐
│                     MAIN CONTENT (~75%)                  │ REASONING (~25%) │
├───────────────────────────────────┬──────────────────────┤                  │
│                                   │                      │                  │
│         CHART (75%)               │  TRADER (25%)        │   (full height)  │
│         TradingView               │  Agent Panel         │   LLM streaming  │
│                                   │                      │                  │
├───────────────────────────────────┼──────────────────────┤                  │
│                                   │                      │                  │
│       ACTIVITY (75%)              │  RESEARCH (25%)      │                  │
│       Live feed                   │  Agent Panel         │                  │
│                                   │                      │                  │
└───────────────────────────────────┴──────────────────────┴──────────────────┘
```

### Panel Details

**TradingView Chart**
- ETH/USD price chart using TradingView Lightweight Charts
- Real-time price updates
- Trade markers showing buys/sells

**Trader Agent Panel**
- DID identity
- Wallet balance
- Today's P&L
- Trade count
- Policy display (max/tx, daily cap, allowed venues)
- Daily usage progress bar

**Live Activity Feed**
- Chronological list of all actions
- Icons: 💰 payments, 📋 escrow, ✅ trades, 🔴 blocked
- Summary stats at bottom

**Research Agent Panel**
- DID identity
- Balance and earnings
- Job completion count
- Status (available/busy)
- Last job info

**Agent Reasoning Panel**
- Streaming LLM output showing agent's thought process
- Shows decision making in real-time
- Explains why trades are made or blocked

---

## Demo Flow (5 minutes)

### Act 1: Setup (30 sec)
- Show the dashboard with both agents
- Explain: "This is a trading agent with $1,000 and strict guardrails"
- Point out the policy: max $100/trade, $500/day

### Act 2: Research Purchase (1 min)
- Trader agent needs market intel
- Creates escrow job for $5: "Analyze ETH sentiment"
- Research agent claims and delivers
- Escrow releases payment
- Show: agent-to-agent commerce working

### Act 3: Successful Trades (1.5 min)
- Agent buys $80 ETH based on research
- Price ticks up
- Agent sells for small profit
- Show: autonomous trading within limits

### Act 4: Guardrail Block (1 min)
- Agent sees opportunity, tries to buy $600
- **RED FLASH: BLOCKED - exceeds daily cap**
- Agent reasoning shows: "Adjusting to $95..."
- Retries with compliant amount
- Show: guardrails preventing dangerous behavior

### Act 5: Summary (1 min)
- Show activity log with blocked attempts
- Show P&L staying positive
- Emphasize: "Agent made money while staying safe"

---

## Technical Requirements

### Must Build

| Component | Status | Notes |
|-----------|--------|-------|
| React dashboard UI | ❌ Need | Grid layout with 4 panels + reasoning |
| TradingView integration | ❌ Need | Lightweight Charts library |
| Price feed | ❌ Need | CoinGecko API or mock |
| Trading agent logic | ❌ Need | Simple momentum strategy |
| LLM reasoning display | ❌ Need | Claude API streaming |
| Escrow contract deployment | ❌ Need | Deploy MonmouthEscrow.sol |
| EscrowClient wiring | ❌ Need | Connect to real contract |

### Already Have

| Component | Status | Notes |
|-----------|--------|-------|
| Wallet SDK | ✅ Done | Guardrails, identity, logging |
| Policy templates | ✅ Done | Can add "Trading" preset |
| x402 client | ✅ Done | For price feed payments |
| Activity logging | ✅ Done | Full audit trail |
| Agent identity (DID) | ✅ Done | Session management |
| Escrow contract code | ✅ Done | Just needs deployment |

---

## Build Plan

### Phase 1: UI Shell (2-3 days)
```
├── Set up React app with grid layout
├── Integrate TradingView Lightweight Charts
├── Create Trader Agent panel component
├── Create Research Agent panel component
├── Create Activity Feed component
├── Create Agent Reasoning panel component
└── Mock data for all panels
```

### Phase 2: Escrow Integration (2-3 days)
```
├── Deploy MonmouthEscrow.sol to Anvil/Sepolia
├── Update EscrowClient.ts with contract address
├── Wire up escrow create/release in demo
├── Test agent-to-agent payment flow
└── Add escrow events to activity feed
```

### Phase 3: Trading Logic (3-4 days)
```
├── Integrate price feed (CoinGecko or mock)
├── Build simple trading strategy
├── Connect to Wallet SDK guardrails
├── Handle blocked transactions gracefully
├── Add trade markers to chart
└── Calculate and display P&L
```

### Phase 4: LLM Integration (2 days)
```
├── Set up Claude API streaming
├── Create agent reasoning prompts
├── Display streaming responses in panel
├── Add context about trades and blocks
└── Polish the "thinking" display
```

### Phase 5: Polish (2 days)
```
├── Error handling and edge cases
├── Loading states and animations
├── Mobile responsiveness (nice to have)
├── Record backup demo video
└── Practice demo flow
```

---

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Charts**: TradingView Lightweight Charts
- **Styling**: Tailwind CSS
- **Wallet SDK**: @monmouth/wallet-sdk
- **LLM**: Claude API (streaming)
- **Price Data**: CoinGecko API (free tier)
- **Chain**: Monmouth L2 (local Anvil or Sepolia)

---

## Open Questions

1. **Real trades or simulated?**
   - Leaning: Simulated with real prices (more controllable)

2. **Which testnet?**
   - Leaning: Local Anvil (faster, no rate limits)

3. **Mock research agent or real LLM?**
   - Leaning: Mock responses (simpler, more predictable)

4. **Price data source?**
   - Leaning: CoinGecko free API with fallback to mock

---

## Success Criteria

Demo is ready when:
- [ ] UI renders correctly with all panels
- [ ] Chart shows real-time price data
- [ ] Trader agent can execute trades
- [ ] Guardrails block excessive trades
- [ ] Escrow payment works between agents
- [ ] Activity feed shows all events
- [ ] Agent reasoning streams coherently
- [ ] Demo can run for 5 min without errors
- [ ] Backup video recorded
