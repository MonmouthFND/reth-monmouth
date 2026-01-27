# Monmouth Trading Desk Contracts

Smart contracts for the autonomous trading desk demo, built with security best practices from Trail of Bits.

## Contracts

### MonmouthEscrow

Trustless escrow for agent-to-agent payments. Enables Trader Agent to pay Research Agent for market analysis.

**State Machine:**
```
OPEN → CLAIMED → DELIVERED → RESOLVED
  ↓                            ↑
  └──────(expire)──────────────┘
```

See [ESCROW_STATE_MACHINE.md](./ESCROW_STATE_MACHINE.md) for full documentation.

## Setup

```bash
# Install dependencies
forge install OpenZeppelin/openzeppelin-contracts
forge install foundry-rs/forge-std

# Build
forge build

# Test
forge test -vvv

# Gas report
forge test --gas-report
```

## Deploy

```bash
# Start Monmouth L2 node (from repo root)
./scripts/start_dev.sh

# Deploy to local node
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast

# Deploy with custom key
DEPLOYER_KEY=0x... forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast
```

## Security

This contract follows Trail of Bits guidelines:

- **ReentrancyGuard** on all state-changing functions
- **Checks-Effects-Interactions** pattern for ETH transfers
- **Custom errors** for gas-efficient reverts
- **Explicit state machine** with forward-only transitions
- **Comprehensive events** for all state changes
- **Fuzz testing** with Foundry

### Audit Checklist

- [ ] Run Slither: `slither src/`
- [ ] Run Mythril: `myth analyze src/MonmouthEscrow.sol`
- [ ] Fuzz test edge cases: `forge test --fuzz-runs 10000`
- [ ] Check gas optimization: `forge test --gas-report`

## Integration

```typescript
import { getContract } from 'viem';
import { MonmouthEscrowABI } from './abis/MonmouthEscrow';

const escrow = getContract({
  address: ESCROW_ADDRESS,
  abi: MonmouthEscrowABI,
  client: walletClient,
});

// Create escrow
const hash = await escrow.write.create([
  providerAddress,
  jobHash,
  3600, // 1 hour timeout
], { value: parseEther('0.01') });

// Listen for events
escrow.watchEvent.EscrowCreated({
  onLogs: (logs) => console.log('Escrow created:', logs),
});
```

## License

MIT
