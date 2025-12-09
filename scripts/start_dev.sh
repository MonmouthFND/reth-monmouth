#!/bin/bash

set -e

echo "Starting Monmouth L2 development node..."
echo ""

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Check if reth is installed
if ! command -v reth &> /dev/null; then
    echo "Error: 'reth' command not found. Please install Reth first:"
    echo "  cargo install reth --locked"
    exit 1
fi

# Create data directory if it doesn't exist
mkdir -p ./data

echo "Starting Monmouth node in dev mode..."
echo "  Chain ID: 7750 (from genesis.json)"
echo "  HTTP RPC: 0.0.0.0:8545"
echo "  WS RPC: 0.0.0.0:8546"
echo "  Block time: 2s (auto-seal)"
echo ""
echo "NOTE: Using vanilla reth for dev mode auto-seal."
echo "      For production with custom precompiles, use start_sequencer.sh with L1."
echo ""

# Start reth with our custom genesis in dev mode
#
# IMPORTANT: We use vanilla 'reth' instead of the 'monmouth' binary for dev mode
# because the monmouth CLI extension has compatibility issues with dev mode's
# auto-seal consensus. The custom precompiles only work with monmouth binary
# in production mode (start_sequencer.sh with external Engine API consensus).
#
# This provides:
# - HTTP RPC on port 8545
# - WS RPC on port 8546
# - Auto-seal block production every 2 seconds
# - Chain ID 7750 (from genesis.json)
reth node \
    --chain ./genesis.json \
    --datadir ./data \
    --dev \
    --dev.block-time 2s \
    --http \
    --http.addr 0.0.0.0 \
    --http.port 8545 \
    --http.corsdomain "*" \
    --http.api eth,net,web3,txpool,debug,trace \
    --ws \
    --ws.addr 0.0.0.0 \
    --ws.port 8546 \
    --ws.origins "*" \
    --ws.api eth,net,web3,txpool,debug,trace \
    --authrpc.addr 127.0.0.1 \
    --authrpc.port 8551 \
    --metrics 127.0.0.1:9001 \
    --log.file.directory ./logs \
    $@