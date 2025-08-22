#!/bin/bash

set -e

echo "Starting Monmouth L2 sequencer node..."

# Check if L1 RPC URL is provided
if [ -z "$L1_RPC_URL" ]; then
    echo "Error: L1_RPC_URL environment variable must be set"
    echo "Example: L1_RPC_URL=http://localhost:8545 ./scripts/start_sequencer.sh"
    exit 1
fi

# Build the node
echo "Building node..."
cargo build --release

# Create data directory if it doesn't exist
mkdir -p ./data

# Start the node in sequencer mode
./target/release/monmouth node \
    --datadir ./data \
    --chain monmouth \
    --http \
    --http.addr 0.0.0.0 \
    --http.port 8545 \
    --http.corsdomain "*" \
    --http.api eth,net,web3,txpool,debug,trace,engine \
    --ws \
    --ws.addr 0.0.0.0 \
    --ws.port 8546 \
    --ws.origins "*" \
    --ws.api eth,net,web3,txpool,debug,trace,engine \
    --authrpc.addr 0.0.0.0 \
    --authrpc.port 8551 \
    --metrics 0.0.0.0:9001 \
    --sequencer \
    --l1-rpc-url $L1_RPC_URL \
    --enable-agent-pool \
    --enable-exex-host \
    --exex-host-addr 0.0.0.0:50051 \
    --enable-context \
    --confidence-threshold 0.7 \
    --log.file.directory ./logs \
    $@