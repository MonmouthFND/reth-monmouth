# Monmouth Wallet SDK

Agent wallet SDK for Monmouth - built on [Porto](https://porto.sh/).

## Overview

The Monmouth Wallet SDK provides an agent-native wallet layer built on top of Porto's EIP-7702 smart account infrastructure. It adds:

- **Agent Identity** - Link wallets to agent identities
- **Permission Templates** - Pre-built guardrails for different agent types
- **Activity Logging** - Automatic logging for memory layer integration
- **Guardrails Enforcement** - Transaction limits, allowed protocols, blocked addresses

## Current Status

- [x] Porto integration with wagmi
- [x] React test app with wallet connection
- [ ] Agent-aware SDK wrapper
- [ ] Guardrails implementation
- [ ] Memory layer integration

## Structure

```
wallet-sdk/
├── test-app/              # React + Vite test app
│   ├── src/
│   │   ├── wagmi.ts       # Wagmi config with Porto connector
│   │   ├── App.tsx        # Main app component
│   │   └── *.test.*       # Tests
│   └── package.json
└── src/                   # SDK source (coming soon)
    ├── MonmouthWallet.ts  # Porto wrapper + guardrails
    ├── permissions.ts     # Permission templates
    └── memory.ts          # Activity logging
```

## Development

```bash
# Install dependencies
cd test-app && bun install

# Run test app (requires HTTPS via mkcert)
bun run dev

# Run tests
bun run test
```

## Features (Planned)

### Permission Templates

Pre-built permission sets for common agent types:

| Template | Max Tx | Daily Limit | Session |
|----------|--------|-------------|---------|
| RESEARCH | 0.1 ETH | 1 ETH | 24h |
| TRADING | 10 ETH | 100 ETH | 1h |
| COORDINATOR | 0.01 ETH | 0.1 ETH | 7d |

### Guardrails

- Max transaction value
- Daily spending limit
- Allowed/blocked addresses
- Function selector restrictions
- Contract deployment permissions

### Memory Layer

- Activity logging
- Context persistence
- ExEx integration for on-chain memory

## Tech Stack

- [Porto](https://porto.sh) - EIP-7702 smart accounts
- [Wagmi](https://wagmi.sh) - React hooks for Ethereum
- [Viem](https://viem.sh) - TypeScript Ethereum library
- [Vite](https://vitejs.dev) - Build tool

## License

MIT
