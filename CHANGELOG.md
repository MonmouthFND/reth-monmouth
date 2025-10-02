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

### Changed
- Upgraded from Reth v1.0.6 to v1.8.1
- Chain ID updated to 7750 (decimal)
- Node uses delegation pattern for EVM extension instead of forking
- CLI now uses `Cli::<EthereumChainSpecParser, MonmouthNodeArgs>` pattern

### Fixed
- Unreachable pattern warning in transaction classifier (removed duplicate "23b872dd" selector)
- Custom CLI arguments now properly parsed and accessible
- Node can start successfully with custom genesis.json

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
