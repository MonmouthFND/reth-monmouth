//! Integration tests for Monmouth L2 node
//!
//! These tests require a running Monmouth node.
//! Run with: `cargo test -p monmouth-integration-tests -- --ignored`
//!
//! Start the node first with: `./scripts/start_dev.sh`

#![cfg(test)]

use crate::{helpers, rpc::RpcClient, TestConfig, MONMOUTH_CHAIN_ID};
use alloy_primitives::{Address, U256};

/// Get a configured RPC client for testing
fn get_rpc_client() -> RpcClient {
    let config = TestConfig::from_env();
    RpcClient::new(&config.rpc_url)
}

/// Test that we can connect to the node and get the chain ID
#[tokio::test]
#[ignore = "requires running node"]
async fn test_chain_id() {
    let client = get_rpc_client();

    let chain_id = client.chain_id().await.expect("Failed to get chain ID");
    assert_eq!(
        chain_id, MONMOUTH_CHAIN_ID,
        "Chain ID should be {MONMOUTH_CHAIN_ID}"
    );
}

/// Test that we can get the current block number
#[tokio::test]
#[ignore = "requires running node"]
async fn test_block_number() {
    let client = get_rpc_client();

    let block_number = client
        .block_number()
        .await
        .expect("Failed to get block number");
    // Successfully retrieved block number (u64 is always >= 0)
    // Just verify the call succeeded - block_number existing is the test
    let _ = block_number;
}

/// Test that test accounts have the expected balance
#[tokio::test]
#[ignore = "requires running node"]
async fn test_account_balance() {
    let client = get_rpc_client();

    let (address, _) = helpers::get_test_account(0);
    let balance = client
        .get_balance(address)
        .await
        .expect("Failed to get balance");

    // Should have at least some ETH (10,000 ETH pre-funded minus any spent)
    let min_expected = U256::from(1000) * U256::from(10).pow(U256::from(18)); // 1000 ETH
    assert!(
        balance >= min_expected,
        "Balance should be at least 1000 ETH, got {balance}"
    );
}

/// Test that we can get the client version
#[tokio::test]
#[ignore = "requires running node"]
async fn test_client_version() {
    let client = get_rpc_client();

    let version = client
        .client_version()
        .await
        .expect("Failed to get client version");
    // Should contain "reth" since we're built on reth
    assert!(
        version.to_lowercase().contains("reth"),
        "Client version should contain 'reth', got: {version}"
    );
}

/// Test that we can get the gas price
#[tokio::test]
#[ignore = "requires running node"]
async fn test_gas_price() {
    let client = get_rpc_client();

    let gas_price = client.gas_price().await.expect("Failed to get gas price");
    // Gas price should be non-zero
    assert!(gas_price > U256::ZERO, "Gas price should be positive");
}

/// Test that the node is not syncing (local dev node should be synced)
#[tokio::test]
#[ignore = "requires running node"]
async fn test_not_syncing() {
    let client = get_rpc_client();

    let syncing = client.syncing().await.expect("Failed to check sync status");
    // Local dev node should not be syncing
    assert!(!syncing, "Local dev node should not be syncing");
}

/// Test that we can call a precompile (AI Inference at 0x1000)
#[tokio::test]
#[ignore = "requires running node"]
async fn test_precompile_ai_inference() {
    let client = get_rpc_client();

    let precompile_addr: Address = "0x0000000000000000000000000000000000001000"
        .parse()
        .expect("valid address");

    let result = client
        .eth_call(precompile_addr, "0x1234567890abcdef")
        .await
        .expect("Failed to call AI inference precompile");

    // Should return some data (the stub returns 32 bytes of 0x01)
    assert!(
        result.len() > 2,
        "Precompile should return data, got: {result}"
    );
}

/// Test that we can call the vector similarity precompile (0x1001)
#[tokio::test]
#[ignore = "requires running node"]
async fn test_precompile_vector_similarity() {
    let client = get_rpc_client();

    let precompile_addr: Address = "0x0000000000000000000000000000000000001001"
        .parse()
        .expect("valid address");

    let result = client
        .eth_call(precompile_addr, "0xabcdef1234567890")
        .await
        .expect("Failed to call vector similarity precompile");

    assert!(
        result.len() > 2,
        "Precompile should return data, got: {result}"
    );
}

/// Test that we can call the intent parser precompile (0x1002)
#[tokio::test]
#[ignore = "requires running node"]
async fn test_precompile_intent_parser() {
    let client = get_rpc_client();

    let precompile_addr: Address = "0x0000000000000000000000000000000000001002"
        .parse()
        .expect("valid address");

    // "Hello World" in hex
    let result = client
        .eth_call(precompile_addr, "0x48656c6c6f20576f726c64")
        .await
        .expect("Failed to call intent parser precompile");

    assert!(
        result.len() > 2,
        "Precompile should return data, got: {result}"
    );
}

/// Test that we can call the SVM router precompile (0x1003)
#[tokio::test]
#[ignore = "requires running node"]
async fn test_precompile_svm_router() {
    let client = get_rpc_client();

    let precompile_addr: Address = "0x0000000000000000000000000000000000001003"
        .parse()
        .expect("valid address");

    let result = client
        .eth_call(precompile_addr, "0x00000000000000000000000000000000")
        .await
        .expect("Failed to call SVM router precompile");

    assert!(
        result.len() > 2,
        "Precompile should return data, got: {result}"
    );
}

/// Test that we can get transaction count for a test account
#[tokio::test]
#[ignore = "requires running node"]
async fn test_transaction_count() {
    let client = get_rpc_client();

    let (address, _) = helpers::get_test_account(0);
    let nonce = client
        .get_transaction_count(address)
        .await
        .expect("Failed to get transaction count");

    // Successfully retrieved nonce (u64 is always >= 0)
    let _ = nonce;
}

/// Test multiple accounts have correct initial state
#[tokio::test]
#[ignore = "requires running node"]
async fn test_multiple_accounts() {
    let client = get_rpc_client();

    for i in 0..5 {
        let (address, _) = helpers::get_test_account(i);
        let balance = client
            .get_balance(address)
            .await
            .expect("Failed to get balance");

        // All test accounts should have some balance
        assert!(
            balance > U256::ZERO,
            "Account {i} should have positive balance"
        );
    }
}

/// Test RPC health - all basic methods should work
#[tokio::test]
#[ignore = "requires running node"]
async fn test_rpc_health() {
    let client = get_rpc_client();

    // All these should succeed without error
    let _ = client.chain_id().await.expect("chain_id failed");
    let _ = client.block_number().await.expect("block_number failed");
    let _ = client.gas_price().await.expect("gas_price failed");
    let _ = client
        .client_version()
        .await
        .expect("client_version failed");
    let _ = client.syncing().await.expect("syncing failed");
}
