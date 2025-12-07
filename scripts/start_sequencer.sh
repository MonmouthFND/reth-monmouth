#!/bin/bash

set -e

echo "Starting Monmouth L2 sequencer node..."

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Load environment variables if .env exists
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

# Configuration
DATA_DIR="${DATA_DIR:-./data}"
BLOCK_TIME="${BLOCK_TIME:-2s}"
HTTP_PORT="${HTTP_PORT:-8545}"
WS_PORT="${WS_PORT:-8546}"
AUTH_PORT="${AUTH_PORT:-8551}"
METRICS_PORT="${METRICS_PORT:-9001}"

# Create data directory if it doesn't exist
mkdir -p "$DATA_DIR"

echo "Configuration:"
echo "  Data directory: $DATA_DIR"
echo "  Block time: $BLOCK_TIME"
echo "  HTTP RPC: 0.0.0.0:$HTTP_PORT"
echo "  WS RPC: 0.0.0.0:$WS_PORT"
echo "  Auth RPC: 0.0.0.0:$AUTH_PORT"
echo "  Metrics: 0.0.0.0:$METRICS_PORT"
echo ""

# Note: Using vanilla reth with custom genesis.json for dev mode support.
# The Monmouth custom node has a CLI extension issue that breaks dev mode.
# Custom precompiles and agent pool features will be integrated once
# the dev mode issue is resolved in the custom CLI.
#
# For production (non-dev) mode with external consensus, use:
# ./target/release/monmouth node --chain ./genesis.json ...

echo "Starting reth node in dev mode with custom genesis (Chain ID: 7750)..."

reth node \
    --chain ./genesis.json \
    --datadir "$DATA_DIR" \
    --dev \
    --dev.block-time "$BLOCK_TIME" \
    --http \
    --http.addr 0.0.0.0 \
    --http.port "$HTTP_PORT" \
    --http.corsdomain "*" \
    --http.api eth,net,web3,txpool,debug,trace \
    --ws \
    --ws.addr 0.0.0.0 \
    --ws.port "$WS_PORT" \
    --ws.origins "*" \
    --ws.api eth,net,web3,txpool,debug,trace \
    --authrpc.addr 0.0.0.0 \
    --authrpc.port "$AUTH_PORT" \
    --metrics 0.0.0.0:$METRICS_PORT \
    --log.file.directory ./logs \
    $@
