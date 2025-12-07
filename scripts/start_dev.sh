#!/bin/bash

set -e

echo "Starting Monmouth L2 development node..."
echo ""
echo "NOTE: Using vanilla 'reth' in dev mode for block production."
echo "      Custom precompiles are stubs for now - using Ethereum node."
echo ""

# Create data directory if it doesn't exist
mkdir -p ./data

# Check if reth is installed
if ! command -v reth &> /dev/null; then
    echo "Error: 'reth' command not found. Please install Reth first:"
    echo "  cargo install reth --locked"
    exit 1
fi

# Start reth with our custom genesis in dev mode
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