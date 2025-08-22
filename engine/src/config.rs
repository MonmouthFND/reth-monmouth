use alloy_primitives::Address;
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SequencerConfig {
    pub sequencer_address: Address,
    pub block_time: Duration,
    pub max_block_size: usize,
    pub max_block_gas: u64,
    pub batch_submission_frequency: Duration,
    pub max_batch_size: usize,
    pub enable_compression: bool,
    pub l1_rpc_url: String,
    pub l1_contract_address: Address,
    pub unsafe_block_signer_key: Option<String>,
}

impl Default for SequencerConfig {
    fn default() -> Self {
        Self {
            sequencer_address: Address::ZERO,
            block_time: Duration::from_secs(2),
            max_block_size: 1000,
            max_block_gas: 30_000_000,
            batch_submission_frequency: Duration::from_secs(60),
            max_batch_size: 100,
            enable_compression: true,
            l1_rpc_url: "http://localhost:8545".to_string(),
            l1_contract_address: Address::ZERO,
            unsafe_block_signer_key: None,
        }
    }
}