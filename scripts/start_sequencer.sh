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

# Check if monmouth binary exists
MONMOUTH_BIN="./target/release/monmouth"
if [ ! -f "$MONMOUTH_BIN" ]; then
    echo "Monmouth binary not found. Building..."
    cargo build --release
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

# Build L1 configuration arguments if environment variables are set
L1_ARGS=""
if [ -n "$L1_RPC_URL" ] && [ -n "$SEQUENCER_PRIVATE_KEY" ]; then
    echo "L1 Integration:"
    echo "  L1 RPC: $L1_RPC_URL"
    [ -n "$L1_SEQUENCER_INBOX" ] && echo "  SequencerInbox: $L1_SEQUENCER_INBOX"
    [ -n "$L1_STATE_COMMITMENT_CHAIN" ] && echo "  StateCommitmentChain: $L1_STATE_COMMITMENT_CHAIN"
    [ -n "$L1_BRIDGE_ADDRESS" ] && echo "  L1StandardBridge: $L1_BRIDGE_ADDRESS"
    [ -n "$L1_CROSS_DOMAIN_MESSENGER" ] && echo "  CrossDomainMessenger: $L1_CROSS_DOMAIN_MESSENGER"
    echo ""

    L1_ARGS="--l1-rpc-url $L1_RPC_URL"
    L1_ARGS="$L1_ARGS --sequencer-private-key $SEQUENCER_PRIVATE_KEY"
    [ -n "$L1_SEQUENCER_INBOX" ] && L1_ARGS="$L1_ARGS --l1-sequencer-inbox $L1_SEQUENCER_INBOX"
    [ -n "$L1_STATE_COMMITMENT_CHAIN" ] && L1_ARGS="$L1_ARGS --l1-state-commitment-chain $L1_STATE_COMMITMENT_CHAIN"
    [ -n "$L1_BRIDGE_ADDRESS" ] && L1_ARGS="$L1_ARGS --l1-bridge $L1_BRIDGE_ADDRESS"
    [ -n "$L1_CROSS_DOMAIN_MESSENGER" ] && L1_ARGS="$L1_ARGS --l1-cross-domain-messenger $L1_CROSS_DOMAIN_MESSENGER"
else
    echo "Note: L1 integration not configured (L1_RPC_URL or SEQUENCER_PRIVATE_KEY not set)"
    echo ""
fi

echo "Starting Monmouth sequencer node in dev mode (Chain ID: 7750)..."

"$MONMOUTH_BIN" node \
    --chain ./genesis.json \
    --datadir "$DATA_DIR" \
    --sequencer \
    --dev \
    --dev.block-time "$BLOCK_TIME" \
    $L1_ARGS \
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
