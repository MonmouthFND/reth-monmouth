# Monmouth L2 Node

An agent-aware Layer 2 blockchain built on Reth, featuring AI/ML transaction classification, custom precompiles, and remote execution extensions (ExEx).

## Features

### Core Capabilities

- **Agent-Aware Transaction Pool**: ML-powered transaction classification with intent recognition
- **Custom AI Precompiles**: Built-in support for AI inference, vector similarity, and intent parsing
- **ExEx Architecture**: Modular remote services for SVM execution and RAG memory
- **L2 Sequencer**: Production-ready sequencer with batch compression and L1 data availability
- **Prague EVM**: Latest EVM features with custom precompile extensions
- **No Fork Maintenance**: Extends Reth without forking, ensuring compatibility

### Architecture Components

1. **Transaction Classification System**
   - Automatic intent detection (swap, transfer, lending, staking, NFT, AI)
   - Confidence scoring with configurable thresholds
   - Multi-runtime routing (EVM, SVM, Hybrid)
   - Fallback heuristic classification

2. **Custom Precompiles**
   - AI Inference (0x1000): ML model execution
   - Vector Similarity (0x1001): Semantic search operations
   - Intent Parser (0x1002): Natural language processing
   - SVM Router (0x1003): Solana VM program execution
   - L2 Message Passer (0x4200): Cross-layer communication

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

- **Chain ID**: 42069
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

The node expects the following remote ExEx services:

### Classification Service (port 50051)
Provides ML-based transaction classification and intent recognition.

### SVM Execution Service (port 50052)
Handles Solana VM program execution for hybrid transactions.

### RAG Memory Service (port 50053)
Maintains transaction history and provides contextual information.

### Example ExEx Service Implementation

```rust
// Implement the proto::ExExService trait
impl ExExService for MyService {
    async fn classify_transaction(
        &self,
        request: Request<TransactionRequest>,
    ) -> Result<Response<ClassificationResponse>, Status> {
        // Your ML classification logic
    }
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

## L2 Bridge Implementation

To complete the L2 setup, implement:

1. **L1 Contracts**
   - Deposit contract for L1→L2 transfers
   - State commitment chain for batch submission
   - Withdrawal finalizer for L2→L1 transfers

2. **Bridge Service**
   - Monitor L1 deposit events
   - Process withdrawal requests
   - Submit state roots and batches

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

MIT OR Apache-2.0

## Support

- Documentation: [https://docs.monmouth.io](https://docs.monmouth.io)
- Discord: [https://discord.gg/monmouth](https://discord.gg/monmouth)
- Issues: [GitHub Issues](https://github.com/monmouth/monmouth-node/issues)