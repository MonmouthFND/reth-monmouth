# Monmouth Block Explorer

Blockscout instance for the Monmouth L2 testnet.

## Quick Start

```bash
# Make sure L2 node is running first
cd /path/to/reth-monmouth
./scripts/start_dev.sh

# Then start Blockscout (in another terminal)
cd explorer
docker-compose up -d

# View logs
docker-compose logs -f blockscout

# Stop
docker-compose down
```

## Access

- **Explorer UI**: http://localhost:4000
- **API**: http://localhost:4000/api/v2

## Configuration

- Chain ID: 7750
- Network Name: Monmouth L2
- RPC: http://localhost:8545

## Features

- Transaction explorer
- Address pages
- Contract verification
- Token tracking
- API access

## Indexing

Blockscout will automatically index all blocks from the L2. Initial sync may show some warnings - this is normal for a fresh chain.
