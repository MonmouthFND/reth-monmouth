//! Monmouth L2 Integration Test Framework
//!
//! This module provides test utilities for integration testing the Monmouth L2 node.
//!
//! ## Running Integration Tests
//!
//! Integration tests require a running Monmouth node:
//!
//! ```bash
//! # Start the node
//! ./scripts/start_dev.sh
//!
//! # Run integration tests
//! cargo test -p monmouth-integration-tests -- --ignored
//! ```

pub mod helpers;
pub mod integration;
pub mod rpc;

pub use helpers::*;
pub use rpc::*;

/// Default RPC endpoint for local testing
pub const DEFAULT_RPC_URL: &str = "http://127.0.0.1:8545";

/// Default ExEx gRPC endpoint
pub const DEFAULT_EXEX_URL: &str = "http://127.0.0.1:50051";

/// Monmouth chain ID
pub const MONMOUTH_CHAIN_ID: u64 = 7750;

/// Test configuration
#[derive(Debug, Clone)]
pub struct TestConfig {
    pub rpc_url: String,
    pub exex_url: String,
    pub chain_id: u64,
}

impl Default for TestConfig {
    fn default() -> Self {
        Self {
            rpc_url: DEFAULT_RPC_URL.to_string(),
            exex_url: DEFAULT_EXEX_URL.to_string(),
            chain_id: MONMOUTH_CHAIN_ID,
        }
    }
}

impl TestConfig {
    pub fn from_env() -> Self {
        Self {
            rpc_url: std::env::var("MONMOUTH_RPC_URL")
                .unwrap_or_else(|_| DEFAULT_RPC_URL.to_string()),
            exex_url: std::env::var("MONMOUTH_EXEX_URL")
                .unwrap_or_else(|_| DEFAULT_EXEX_URL.to_string()),
            chain_id: std::env::var("MONMOUTH_CHAIN_ID")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(MONMOUTH_CHAIN_ID),
        }
    }
}
