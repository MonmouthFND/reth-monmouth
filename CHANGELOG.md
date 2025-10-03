# Changelog

All notable changes to the Monmouth L2 node project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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

### Changed
- Upgraded from Reth v1.0.6 to v1.8.1
- Chain ID updated to 7750 (decimal)
- Node uses delegation pattern for EVM extension instead of forking
- CLI now uses `Cli::<EthereumChainSpecParser, MonmouthNodeArgs>` pattern
- `SequencerBatch` now includes `withdrawals` field for L1 submission
- Sequencer batch submitter processes pending withdrawals from message queue

### Fixed
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
