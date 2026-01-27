# Monmouth Trading Desk Demo Setup

Complete guide to running the Monmouth L2 testnet with the Trading Desk demo application.

## Prerequisites

- **Rust** (1.75+) - for building the L2 node
- **Node.js** (18+) and **Bun** - for the trading desk frontend
- **Docker** and **Docker Compose** - for Blockscout explorer
- **Foundry** - for smart contract deployment

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Trading Desk UI                          │
│                      http://localhost:3001                      │
└─────────────────────────┬───────────────────────────────────────┘
                          │ viem (JSON-RPC)
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Monmouth L2 Node                            │
│                                                                 │
│  HTTP RPC: 8545    WS RPC: 8546    Metrics: 9001               │
│  Chain ID: 7750    Block Time: 2s                              │
└─────────────────────────┬───────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│  Blockscout   │ │   Postgres    │ │    Redis      │
│  API: 4000    │ │   (internal)  │ │  (internal)   │
│  UI: 3002     │ │               │ │               │
└───────────────┘ └───────────────┘ └───────────────┘
```

## Quick Start

### 1. Start the L2 Node

```bash
# From the repository root
cd /path/to/reth-monmouth

# Start the development node
./scripts/start_dev.sh
```

The node will start with:
- **Chain ID**: 7750
- **HTTP RPC**: http://localhost:8545
- **WebSocket**: ws://localhost:8546
- **Metrics**: http://localhost:9001/metrics

### 2. Deploy the Escrow Contract

```bash
cd trading-desk/contracts

# Install dependencies (first time only)
forge install

# Deploy to local L2
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url http://localhost:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --broadcast
```

The contract deploys to: `0x5FbDB2315678afecb367f032d93F642f64180aa3`

### 3. Start the Trading Desk UI

```bash
cd trading-desk

# Install dependencies (first time only)
bun install

# Start development server
bun run dev
```

Access at: http://localhost:3001

### 4. Start Block Explorer (Optional)

```bash
cd explorer

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f blockscout
```

Access at:
- **Explorer UI**: http://localhost:3002
- **Explorer API**: http://localhost:4000/api/v2

## Test Accounts

The L2 comes pre-funded with Anvil's default test accounts (10,000 ETH each):

| Role | Address | Private Key |
|------|---------|-------------|
| Deployer | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
| Trader | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |
| Research | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` |

## Running the Demo

1. **Start all services** (L2 node, contract deployed, UI running)

2. **Open Trading Desk** at http://localhost:3001

3. **Click "Run Demo"** in the Reasoning Panel - this will:
   - Create an escrow job (Trader pays Research agent)
   - Research agent claims the job
   - Research agent delivers results
   - Trader releases payment

4. **View transactions** in Blockscout at http://localhost:3002

## Metrics & Monitoring

### Prometheus Metrics

Raw metrics available at: http://localhost:9001/metrics

Key metrics include:
- `reth_transaction_pool_*` - Transaction pool stats
- `reth_blockchain_tree_*` - Chain state
- `reth_rpc_*` - RPC call statistics
- `reth_network_*` - P2P network stats

### Grafana Setup (Optional)

Add Grafana to the explorer docker-compose:

```yaml
# Add to explorer/docker-compose.yml
grafana:
  image: grafana/grafana:latest
  ports:
    - "3003:3000"
  environment:
    GF_SECURITY_ADMIN_PASSWORD: admin
  volumes:
    - grafana-data:/var/lib/grafana

prometheus:
  image: prom/prometheus:latest
  ports:
    - "9090:9090"
  volumes:
    - ./prometheus.yml:/etc/prometheus/prometheus.yml
  extra_hosts:
    - "host.docker.internal:host-gateway"

volumes:
  grafana-data:
```

Create `explorer/prometheus.yml`:
```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'monmouth-l2'
    static_configs:
      - targets: ['host.docker.internal:9001']
```

Then access:
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3003 (admin/admin)

## Troubleshooting

### L2 Node Issues

```bash
# Check if node is running
curl http://localhost:8545 \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# Check metrics
curl http://localhost:9001/metrics | head -20
```

### Contract Issues

```bash
# Verify contract is deployed
cast code 0x5FbDB2315678afecb367f032d93F642f64180aa3 --rpc-url http://localhost:8545

# Check escrow count
cast call 0x5FbDB2315678afecb367f032d93F642f64180aa3 "escrowCount()" --rpc-url http://localhost:8545
```

### Blockscout Issues

```bash
# Check container status
docker-compose ps

# View logs
docker-compose logs -f blockscout

# Restart services
docker-compose down && docker-compose up -d
```

### Frontend Issues

```bash
# Check if vite is running
curl http://localhost:3001

# Restart dev server
cd trading-desk && bun run dev
```

## API Reference

### L2 RPC Endpoints

Standard Ethereum JSON-RPC at `http://localhost:8545`:
- `eth_blockNumber` - Current block height
- `eth_getBalance` - Account balance
- `eth_sendRawTransaction` - Submit transaction
- `eth_call` - Read contract state

### Blockscout API

REST API at `http://localhost:4000/api/v2`:
- `GET /blocks` - List blocks
- `GET /transactions` - List transactions
- `GET /addresses/:hash` - Address details
- `GET /stats` - Chain statistics

## Development Workflow

1. **Modify contracts**: Edit in `trading-desk/contracts/src/`
2. **Run tests**: `cd trading-desk/contracts && forge test`
3. **Redeploy**: Run the deploy script again
4. **Update frontend**: Contract address is in `trading-desk/src/lib/monmouth.ts`

## Stopping Services

```bash
# Stop L2 node
# Ctrl+C in the terminal running start_dev.sh

# Stop Blockscout
cd explorer && docker-compose down

# Stop Trading Desk
# Ctrl+C in the terminal running bun dev
```
