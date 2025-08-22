#!/bin/bash

set -e

echo "Starting Monmouth L2 development node..."

# Build the node
echo "Building node..."
cargo build --release

# Create data directory if it doesn't exist
mkdir -p ./data

# Start the node with development configuration
./target/release/monmouth node \
    --datadir ./data \
    --chain monmouth \
    --http \
    --http.addr 127.0.0.1 \
    --http.port 8545 \
    --http.corsdomain "*" \
    --http.api eth,net,web3,txpool,debug,trace \
    --ws \
    --ws.addr 127.0.0.1 \
    --ws.port 8546 \
    --ws.origins "*" \
    --ws.api eth,net,web3,txpool,debug,trace \
    --authrpc.addr 127.0.0.1 \
    --authrpc.port 8551 \
    --metrics 127.0.0.1:9001 \
    --enable-agent-pool \
    --enable-exex-host \
    --exex-host-addr 127.0.0.1:50051 \
    --enable-context \
    --confidence-threshold 0.7 \
    --log.file.directory ./logs \
    $@