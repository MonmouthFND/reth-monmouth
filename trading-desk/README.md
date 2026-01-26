# Autonomous Trading Desk Demo

Pre-seed pitch demo showcasing Monmouth's agent-aware L2 capabilities.

## Quick Start

```bash
# Install dependencies
cd trading-desk
npm install

# Start local chain (in another terminal)
cd .. && ./scripts/start_dev.sh

# Deploy escrow contract
npm run deploy:escrow

# Start demo
npm run dev
```

## What This Demonstrates

| Feature | How It's Shown |
|---------|----------------|
| **Fast L2** | 2-second block confirmations for trades |
| **Guardrails** | Agent blocked from exceeding limits, then adjusts |
| **Agent Identity** | DID displayed for both agents |
| **Escrow** | Agent-to-agent payment for research |
| **Activity Logging** | Full audit trail of all actions |
| **LLM Reasoning** | Streaming agent thought process |

## Demo Flow (5 min)

1. **Setup** (30s) - Show agents, explain guardrails
2. **Research** (1m) - Escrow job: pay for market analysis
3. **Trading** (1.5m) - Execute profitable trades within limits
4. **Blocked** (1m) - Attempt large trade → blocked → adjust → succeed
5. **Summary** (1m) - Show activity log, P&L, emphasize safety

## Documentation

- [STATE_MACHINES.md](./STATE_MACHINES.md) - Technical state machine specs
- [IMPLEMENTATION.md](./IMPLEMENTATION.md) - Component breakdown and build guide
- [../docs/DEMO_TRADING_DESK.md](../docs/DEMO_TRADING_DESK.md) - Original spec

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   React UI  │ ←── │  Agents     │ ←── │  Chain      │
│  (Vite)     │     │  (TS)       │     │  (Anvil)    │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                    ┌──────┴──────┐
                    │ Wallet SDK  │
                    │ - Guardrails│
                    │ - Identity  │
                    │ - Escrow    │
                    │ - Logging   │
                    └─────────────┘
```
