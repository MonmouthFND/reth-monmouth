# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Monmouth is an agent-aware Layer 2 blockchain built on Reth v1.8.1, featuring AI/ML transaction classification, custom precompiles for AI operations, and a modular ExEx (Execution Extension) system for remote services. The project extends Reth without forking, ensuring upstream compatibility.

## Build and Development Commands

```bash
# Build the entire workspace
cargo build --release

# Run all tests
cargo test --all

# Run tests for a specific module
cargo test -p monmouth-primitives
cargo test -p monmouth-txpool
cargo test -p monmouth-evm

# Run a single test
cargo test test_chain_spec_creation

# Check compilation without building
cargo check --all

# Format code
cargo fmt --all

# Lint code
cargo clippy --all -- -D warnings

# Generate protobuf code (required after modifying .proto files)
cd exex-host && cargo build --build-dependencies

# Regenerate genesis.json (if chain config changes)
cargo run --release -p monmouth-chain-config --bin export-genesis > genesis.json

# Start development node (HTTP RPC: 8545, WS: 8546, Engine: 8551, ExEx: 50051)
./scripts/start_dev.sh

# Start sequencer mode (requires L1_RPC_URL env var)
L1_RPC_URL=http://localhost:8545 ./scripts/start_sequencer.sh

# Test precompiles
./scripts/test_precompiles.sh

# Docker operations
docker-compose build
docker-compose up -d
docker-compose logs -f monmouth-node

# Check health of ExEx services
curl http://localhost:50051/health

# View metrics
curl http://localhost:9001/metrics
```

## Architecture and Key Design Decisions

### Chain Configuration
- **Chain ID**: 7750 (defined in `primitives/src/lib.rs`)
- **Genesis**: Prague-activated at block 0
- **Pre-funded accounts**: 10 Anvil test accounts with 10,000 ETH each
- **Gas Limit**: 30M per block
- **Base Fee**: 1 gwei minimum

### Module Interaction Flow

1. **Transaction Entry**: Transactions enter through RPC → `txpool` module
2. **Classification Pipeline**: `txpool/agent_pool.rs` → ExEx client or fallback heuristic classifier
3. **Execution Path Routing**:
   - `EvmOnly` → Standard EVM execution via `evm` module
   - `SvmOnly` → Routed to SVM precompile (0x1003)
   - `HybridEvmSvm` → Multi-step execution plan created
   - `RagEnhanced` → Context fetched from ExEx services

### ExEx (Execution Extension) System

The ExEx system (`exex-host/`) provides gRPC-based remote service integration:

- **Protocol**: Defined in `exex-host/proto/exex.proto`
- **Default Port**: 50051
- **Services Expected**:
  - Classification Service (ML-based tx classification)
  - SVM Execution Service (Solana VM programs)
  - RAG Memory Service (context and history)

When modifying ExEx services:
1. Update `proto/exex.proto`
2. Rebuild with `cargo build` in `exex-host/` to regenerate bindings
3. Implement service traits in `exex-host/src/service.rs`

### Custom Precompiles

Located in `evm/src/precompiles.rs`, addresses hardcoded in `primitives/src/precompiles.rs`:

- `0x1000`: AI Inference
- `0x1001`: Vector Similarity  
- `0x1002`: Intent Parser
- `0x1003`: SVM Router
- `0x4200`: L2 Message Passer

Precompiles are registered in `evm/src/factory.rs` via the EVM builder's handler register.

### Transaction Classification

The classification system (`txpool/src/classifier.rs`) uses:
1. **Primary**: ExEx remote service with 100ms timeout
2. **Fallback**: Heuristic classifier based on function selectors
3. **Confidence threshold**: 0.7 (configurable via CLI)

Classification results determine execution paths and whether context fetching is required.

### L2 Sequencer Architecture

The sequencer (`engine/src/sequencer.rs`) operates with:
- **Block production**: Every 2 seconds (configurable)
- **Batch submission**: Every 60 seconds to L1
- **Compression**: Enabled by default
- **State management**: Via `batch_builder.rs`

### Node Configuration Flow

1. CLI args parsed in `node/src/args.rs` using Reth's CLI extension system
2. Configuration structs created for each module
3. Components built in `node/src/node.rs` using Reth's builder pattern
4. Services started in sequence: ExEx host → Sequencer → RPC

### Genesis Configuration and Chain Loading

The node uses a custom genesis.json file instead of built-in chain specs:

**Genesis File Generation:**
- Genesis configuration is defined in `chain-config/src/lib.rs`
- Export binary at `chain-config/src/bin/export_genesis.rs` generates the JSON
- Run `cargo run --release -p monmouth-chain-config --bin export-genesis > genesis.json` to regenerate
- The genesis.json includes:
  - Chain ID: 7750
  - All hardforks activated at block 0 (Prague-enabled)
  - 10 pre-funded Anvil test accounts (10,000 ETH each)
  - System accounts (sequencer and L1 fee vaults)

**Chain Loading:**
- Node loads chain spec via `--chain ./genesis.json` flag
- Uses `Cli::<EthereumChainSpecParser, MonmouthNodeArgs>` pattern
- EthereumChainSpecParser handles both built-in chains and custom JSON files

### CLI Extension Pattern

Monmouth extends Reth's CLI with custom arguments following this pattern:

**Implementation (`node/src/args.rs`):**
```rust
#[derive(Debug, Clone, Args, Serialize, Deserialize, Default)]
pub struct MonmouthNodeArgs {
    #[arg(long)]
    pub enable_agent_pool: bool,

    #[arg(long)]
    pub exex_endpoint: Option<String>,
    // ... other custom args
}
```

**Integration (`node/src/main.rs`):**
```rust
Cli::<EthereumChainSpecParser, MonmouthNodeArgs>::parse()
    .run(async move |builder, args| {
        // args contains parsed MonmouthNodeArgs
        // builder is the node builder
    })
```

**Key Points:**
- Use `clap::Args` (not `clap::Parser`) for CLI extension structs
- Second generic parameter to `Cli<>` enables custom arguments
- All Reth standard flags remain available
- Custom args appear in `--help` output automatically

### EVM Customization

Monmouth extends the EVM with custom precompiles for AI/ML operations and cross-chain execution.

**Architecture Pattern:**
- Delegation wrapper around `EthEvmConfig`
- Custom precompiles registered in `MonmouthPrecompileSet`
- Zero performance overhead through inline delegation
- Maintains full Ethereum compatibility

**Custom Precompiles:**

| Address | Name | Purpose | Status |
|---------|------|---------|--------|
| 0x1000 | AI Inference | ML model execution on-chain | 🚧 Stub |
| 0x1001 | Vector Similarity | Semantic search & RAG operations | 🚧 Stub |
| 0x1002 | Intent Parser | Natural language → transaction plans | 🚧 Stub |
| 0x1003 | SVM Router | Solana VM program execution | 🚧 Stub |
| 0x4200 | L2 Message Passer | L1 ↔ L2 cross-layer messaging | 🚧 Stub |

**Implementation Locations:**
- `evm/src/factory.rs` - `MonmouthEvmConfig` wrapper
- `evm/src/precompiles.rs` - Precompile implementations
- `primitives/src/precompiles.rs` - Addresses & data structures
- `node/src/node.rs` - `MonmouthExecutorBuilder` integration

**Implementation Status:**
- Precompile infrastructure exists with stub implementations
- Gas models defined for each precompile
- Type system for inputs/outputs in place
- Real ML/AI logic not yet implemented (returns mock data)

**Quick Reference - Adding a Precompile:**
1. Define address in `primitives/src/precompiles.rs`
2. Add input/output types in same file
3. Implement `run(input, gas_limit)` method in `evm/src/precompiles.rs`
4. Register in `MonmouthPrecompileSet::new()`
5. Test via `eth_call` RPC to the precompile address

### Critical Dependencies

- **Reth 1.8.1**: Base node implementation (pinned version)
- **Revm v29**: EVM execution with custom precompiles
- **Tonic 0.12**: gRPC server/client for ExEx
- **Workspace-level deps**: Defined in root `Cargo.toml` for consistency

### Testing Strategy

- Unit tests: In each module's `src/` files
- Chain config tests: `chain-config/src/lib.rs` contains genesis validation
- Precompile tests: Script-based via `scripts/test_precompiles.sh`
- Integration tests: Would go in `tests/` directory (not yet implemented)

### Key CLI Options

The node binary accepts the following important options:
- `--enable-agent-pool`: Enable agent-aware transaction pool
- `--exex-endpoint <URL>`: ExEx service endpoint
- `--sequencer`: Enable L2 sequencer mode
- `--l1-rpc-url <URL>`: L1 RPC URL for sequencer
- `--enable-exex-host`: Enable ExEx host service
- `--exex-host-addr <ADDR>`: ExEx host address (default: 127.0.0.1:50051)
- `--confidence-threshold <N>`: Classification confidence threshold (default: 0.7)
- `--enable-context`: Enable transaction context fetching

### Port Configuration

Default ports used by the node:
- **8545**: HTTP JSON-RPC
- **8546**: WebSocket RPC
- **8551**: Engine API
- **50051**: ExEx gRPC service
- **9001**: Prometheus metrics

ExEx remote services expected on:
- **50051**: Classification Service
- **50052**: SVM Execution Service
- **50053**: RAG Memory Service

### Production Considerations

When deploying to production:
1. Enable JWT authentication for Engine API
2. Set proper L1 RPC endpoints for sequencer
3. Deploy ExEx services before starting node
4. Configure TLS for ExEx communication
5. Set resource limits in Docker deployment

### Common Development Scenarios

**Adding a new precompile**:
1. Define address in `primitives/src/precompiles.rs`
2. Implement precompile in `evm/src/precompiles.rs`
3. Register in `MonmouthPrecompileSet::new()`

**Modifying transaction classification**:
1. Update classification types in `primitives/src/agent.rs`
2. Modify classifier logic in `txpool/src/classifier.rs`
3. Update ExEx proto if remote classification changes

**Changing L2 parameters**:
1. Chain parameters in `primitives/src/lib.rs`
2. Genesis configuration in `chain-config/src/lib.rs`
3. Regenerate genesis.json: `cargo run --release -p monmouth-chain-config --bin export-genesis > genesis.json`
4. Sequencer timing in `engine/src/config.rs`

**Adding custom CLI arguments**:
1. Add argument to `MonmouthNodeArgs` in `node/src/args.rs` using `#[arg(long)]` attribute
2. Use `clap::Args` derive macro (not `Parser`)
3. Access args in `node/src/main.rs` via the `args` parameter in CLI run closure
4. Custom args automatically appear in `--help` output

### Environment Variables

Important environment variables for development:
- `L1_RPC_URL`: L1 RPC endpoint for sequencer mode
- `RUST_LOG`: Logging level (e.g., `info,monmouth=debug`)
- `TOKIO_WORKER_THREADS`: Number of async runtime threads (default: 8)