# Changelog

All notable changes to the Monmouth L2 node project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Sepolia testnet deployment with L1 contracts (Trusted Sequencer model)
  - SequencerInbox contract for batch submission
  - StateCommitmentChain contract for L2 state root commitments
  - L1StandardBridge contract for ETH deposits and withdrawals
  - CrossDomainMessenger contract for arbitrary L1/L2 message passing
- L1 Client module (`engine/src/l1_client.rs`) for L1 contract interactions
  - Batch submission to SequencerInbox with chained batch hashes
  - State root commitment to StateCommitmentChain
  - ETHDepositInitiated event monitoring from L1StandardBridge
- CLI arguments for L1 contract configuration
  - `--l1-rpc-url` (env: L1_RPC_URL) - L1 RPC endpoint
  - `--sequencer-private-key` (env: SEQUENCER_PRIVATE_KEY) - Signing key
  - `--l1-sequencer-inbox` (env: L1_SEQUENCER_INBOX) - Contract address
  - `--l1-state-commitment-chain` (env: L1_STATE_COMMITMENT_CHAIN) - Contract address
  - `--l1-bridge` (env: L1_BRIDGE_ADDRESS) - Contract address
  - `--l1-cross-domain-messenger` (env: L1_CROSS_DOMAIN_MESSENGER) - Contract address
  - `--l1-deposit-poll-interval` - Deposit monitoring interval
- Engine driver module and standalone binary (`engine-driver`)
  - JWT authentication for Engine API
  - Configurable block production interval
  - Automatic payload building via forkchoiceUpdated/getPayload/newPayload cycle
- CI pipeline with GitHub Actions (`.github/workflows/ci.yml`)
  - cargo build, test, clippy, and fmt checks
  - Integration tests for L2 sequencer and L1 client
- Integration tests for core components
  - L2 sequencer operation tests
  - L1 client configuration tests
  - ExEx client wiring tests
- Genesis.json generation system with dedicated export binary
- Custom CLI arguments properly integrated with Reth's CLI extension system
- EVM architecture documentation section in CLAUDE.md
- Comprehensive development guide in CLAUDE.md
- L2 Message Passer precompile (0x4200) for cross-layer communication
  - Thread-safe message queue with support for deposits, withdrawals, and state roots
  - Message deduplication via keccak256 hashing
  - JSON-based message encoding for flexibility
  - Comprehensive test suite (6 passing tests)
- Message queue integration with L2 sequencer for withdrawal processing
- `MessageQueue` module in primitives crate for L2 message storage
- L2 message types: `L2Message`, `L2MessageInput`, `L2MessageOutput`, `L2MessageType`
- `.env.example` file documenting all environment variables and configuration options

### Changed
- Development mode now uses vanilla reth approach for reliable block production
- Removed unused `BatchBuilder` from sequencer (dead code cleanup)
- Upgraded from Reth v1.0.6 to v1.8.1
- Chain ID updated to 7750 (decimal)
- Node uses delegation pattern for EVM extension instead of forking
- CLI now uses `Cli::<EthereumChainSpecParser, MonmouthNodeArgs>` pattern
- `SequencerBatch` now includes `withdrawals` field for L1 submission
- Sequencer batch submitter processes pending withdrawals from message queue

### Fixed
- Clippy warnings (uninlined format args, field reassign with default)
- Deprecated alloy-provider API usage (`on_http` -> `connect_http`)
- Unreachable pattern warning in transaction classifier (removed duplicate "23b872dd" selector)
- Custom CLI arguments now properly parsed and accessible
- Node can start successfully with custom genesis.json

### Dependencies
- Added `once_cell` to monmouth-evm for global message queue singleton
- Added `serde_json` to monmouth-evm for message encoding
- Added `parking_lot` to monmouth-primitives for thread-safe locks

## [0.1.0] - 2025-01-10

### Added
- Initial Monmouth L2 node implementation based on Reth v1.8.1
- Custom EVM precompile infrastructure (5 precompiles with addresses 0x1000-0x1003, 0x4200)
- Agent-aware transaction pool architecture
- ExEx host service for external ML classification
- L2 sequencer with block production and batch submission
- Transaction classifier with heuristic fallback
- Chain configuration with ID 7750
- Docker deployment configuration
- Development and sequencer startup scripts
