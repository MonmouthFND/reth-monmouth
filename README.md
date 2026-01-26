# Monmouth L2 Node

An agent-aware Layer 2 blockchain built on Reth, designed for AI agents to transact safely and efficiently.

## Features

### Core Capabilities

- **Agent-Aware Wallet SDK**: Guardrails, spending limits, and policy enforcement for autonomous AI agents
- **Off-Chain AI, On-Chain Settlement**: AI/ML happens via LLM API calls; blockchain handles verification and settlement
- **Custom Precompiles**: SVM Router for Solana cross-chain, L2 Message Passer for L1↔L2 bridging
- **L2 Sequencer**: Production-ready sequencer with batch compression and L1 data availability
- **Prague EVM**: Latest EVM features with custom precompile extensions
- **No Fork Maintenance**: Extends Reth without forking, ensuring compatibility

### Architecture Components

1. **Transaction Classification System**
   - Automatic intent detection (swap, transfer, lending, staking, NFT)
   - Confidence scoring with configurable thresholds
   - Heuristic classification based on function selectors
   - Multi-runtime routing (EVM, SVM, Hybrid)

2. **Custom Precompiles**
   - SVM Router (0x1003): Solana VM program execution for cross-chain operations
   - L2 Message Passer (0x4200): L1↔L2 deposits, withdrawals, and cross-layer messaging

3. **ExEx Host Service**
   - gRPC streaming of blockchain events
   - Real-time header, block, receipt, and log notifications
   - Health monitoring and service discovery
   - Configurable filtering and buffering

4. **L2 Sequencer Engine**
   - Configurable block time and size limits
   - Batch compression for L1 submission
   - State root management
   - Withdrawal and deposit processing

### AI/ML Architecture

**Important**: AI/ML operations happen **off-chain**, not on-chain.

```
AI Agent → Wallet SDK → LLM API (off-chain) → Tool calls → Transactions → Monmouth L2
```

- LLMs (Claude, GPT, etc.) handle reasoning and planning off-chain
- Wallet SDK enforces guardrails and policies
- Blockchain handles settlement and verification only
- On-chain ML is not feasible (even local MLX is slow; consensus would be impractical)

## Quick Start

### Prerequisites

- Rust 1.76 or higher
- Docker and Docker Compose (optional)
- 8GB RAM minimum
- 50GB available disk space

### Building from Source

```bash
# Clone the repository
git clone https://github.com/monmouth/monmouth-node
cd monmouth-node

# Build the node
cargo build --release

# Run tests
cargo test
```

### Running the Node

#### Development Mode

```bash
./scripts/start_dev.sh
```

This starts a local development node with:
- HTTP RPC on port 8545
- WebSocket RPC on port 8546
- Engine API on port 8551
- ExEx gRPC on port 50051

#### Sequencer Mode

```bash
L1_RPC_URL=http://localhost:8545 ./scripts/start_sequencer.sh
```

Runs the node as an L2 sequencer connected to an L1 network.

#### Docker Deployment

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f monmouth-node

# Stop services
docker-compose down
```

## Configuration

### Chain Configuration

- **Chain ID**: 7750
- **Genesis Block**: Prague-activated
- **Gas Limit**: 30M per block
- **Base Fee**: 1 gwei minimum
- **Pre-funded Accounts**: 10 Anvil test accounts with 10,000 ETH each

### Node Options

```bash
monmouth node [OPTIONS]

OPTIONS:
    --enable-agent-pool          Enable agent-aware transaction pool
    --exex-endpoint <URL>        ExEx service endpoint
    --sequencer                  Enable L2 sequencer mode
    --l1-rpc-url <URL>          L1 RPC URL for sequencer
    --enable-exex-host          Enable ExEx host service
    --exex-host-addr <ADDR>     ExEx host address (default: 127.0.0.1:50051)
    --confidence-threshold <N>  Classification confidence threshold (default: 0.7)
    --enable-context            Enable transaction context fetching
```

### Environment Variables

```bash
# L1 Configuration
L1_RPC_URL=http://localhost:8545

# Logging
RUST_LOG=info,monmouth=debug

# Performance
TOKIO_WORKER_THREADS=8
```

## ExEx Services Integration

The ExEx host provides gRPC streaming of blockchain events:

### Available RPCs (port 50051)
- `StreamHeaders`: Real-time block header notifications
- `StreamBlocks`: Full block data streaming
- `StreamReceipts`: Transaction receipt streaming
- `ClassifyTransaction`: Heuristic-based transaction classification
- `HealthCheck`: Service health monitoring

### Example: Streaming Block Headers

```rust
// Connect to ExEx and stream headers
let mut client = ExExServiceClient::connect("http://localhost:50051").await?;
let mut stream = client.stream_headers(HeaderFilter { chain_id: 7750 }).await?;

while let Some(header) = stream.message().await? {
    println!("New block: {} hash: {:?}", header.number, header.hash);
}
```

## API Endpoints

### JSON-RPC

Standard Ethereum JSON-RPC methods plus:

- `eth_call`: Supports custom precompile calls
- `txpool_content`: Shows classified transactions
- `debug_traceTransaction`: Includes execution plan details

### Engine API

Sequencer-specific methods:

- `engine_forkchoiceUpdatedV3`
- `engine_newPayloadV3`
- `engine_getPayloadV3`

### ExEx gRPC

- `StreamHeaders`: Real-time header notifications
- `StreamBlocks`: Block streaming with filters
- `StreamReceipts`: Transaction receipt streaming
- `ClassifyTransaction`: Transaction classification
- `FetchContext`: Context retrieval
- `CreateExecutionPlan`: Multi-step execution planning

## Testing

### Unit Tests

```bash
cargo test --all
```

### Integration Tests

```bash
cargo test --test integration --features integration-tests
```

### Precompile Testing

```bash
./scripts/test_precompiles.sh
```

## Performance Tuning

### Transaction Pool

```toml
[txpool]
max_pending_intents = 1000
max_classification_time = "100ms"
confidence_threshold = 0.7
```

### ExEx Host

```toml
[exex]
max_concurrent_streams = 100
stream_buffer_size = 1000
enable_metrics = true
```

### Sequencer

```toml
[sequencer]
block_time = "2s"
max_block_size = 1000
batch_submission_frequency = "60s"
enable_compression = true
```

## Monitoring

### Metrics

Prometheus metrics available at `http://localhost:9001/metrics`:

- `monmouth_txpool_classified_total`
- `monmouth_exex_streams_active`
- `monmouth_sequencer_blocks_produced`
- `monmouth_precompile_calls_total`

### Health Check

```bash
curl http://localhost:50051/health
```

## Security Considerations

1. **JWT Authentication**: Enable for production Engine API
2. **Private Keys**: Use secure key management for sequencer
3. **Rate Limiting**: Configure RPC rate limits
4. **Network Security**: Use TLS for ExEx communication
5. **Resource Limits**: Set appropriate gas and compute limits

## L1 Integration (Sepolia Testnet)

Monmouth L2 is deployed to Sepolia testnet with a **Trusted Sequencer** security model.

### L1 Contracts

| Contract | Purpose |
|----------|---------|
| SequencerInbox | Receives batch data from sequencer |
| StateCommitmentChain | Stores L2 state roots for verification |
| L1StandardBridge | Handles ETH deposits (L1→L2) and withdrawals (L2→L1) |
| CrossDomainMessenger | Arbitrary L1↔L2 message passing |

### L1 Configuration Options

```bash
monmouth node [OPTIONS]

L1 OPTIONS:
    --l1-rpc-url <URL>                    L1 RPC endpoint (env: L1_RPC_URL)
    --sequencer-private-key <KEY>         Signing key for L1 txs (env: SEQUENCER_PRIVATE_KEY)
    --l1-sequencer-inbox <ADDR>           SequencerInbox address (env: L1_SEQUENCER_INBOX)
    --l1-state-commitment-chain <ADDR>    StateCommitmentChain address (env: L1_STATE_COMMITMENT_CHAIN)
    --l1-bridge <ADDR>                    L1StandardBridge address (env: L1_BRIDGE_ADDRESS)
    --l1-cross-domain-messenger <ADDR>    CrossDomainMessenger address (env: L1_CROSS_DOMAIN_MESSENGER)
    --l1-deposit-poll-interval <SECS>     Deposit polling interval (default: 12)
```

### Running with L1 Integration

```bash
# Set environment variables (or use .env file)
export L1_RPC_URL="https://sepolia.infura.io/v3/YOUR_KEY"
export SEQUENCER_PRIVATE_KEY="0x..."
export L1_SEQUENCER_INBOX="0x..."
export L1_STATE_COMMITMENT_CHAIN="0x..."
export L1_BRIDGE_ADDRESS="0x..."
export L1_CROSS_DOMAIN_MESSENGER="0x..."

# Start sequencer with L1 integration
./scripts/start_sequencer.sh
```

### L1 Client Features

- **Batch Submission**: Submits L2 blocks to SequencerInbox with chained batch hashes
- **State Commitment**: Commits L2 state roots to StateCommitmentChain
- **Deposit Monitoring**: Polls L1StandardBridge for ETHDepositInitiated events
- **Withdrawal Processing**: Includes pending withdrawals in batch submissions

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

MIT OR Apache-2.0

## Support

- Documentation: [https://docs.monmouth.io](https://docs.monmouth.io)
- Discord: [https://discord.gg/monmouth](https://discord.gg/monmouth)
- Issues: [GitHub Issues](https://github.com/monmouth/monmouth-node/issues)