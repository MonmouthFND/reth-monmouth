use alloy_primitives::Address;
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Configuration for the L1 client
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct L1ClientConfig {
    /// L1 RPC URL (e.g., Sepolia endpoint)
    pub l1_rpc_url: String,
    /// Private key for signing L1 transactions
    pub private_key: String,
    /// SequencerInbox contract address
    pub sequencer_inbox: Address,
    /// StateCommitmentChain contract address
    pub state_commitment_chain: Address,
    /// L1StandardBridge contract address
    pub bridge: Address,
    /// CrossDomainMessenger contract address
    pub cross_domain_messenger: Address,
    /// How often to poll L1 for deposits
    pub deposit_poll_interval: Duration,
}

impl Default for L1ClientConfig {
    fn default() -> Self {
        Self {
            l1_rpc_url: "http://localhost:8545".to_string(),
            private_key: String::new(),
            sequencer_inbox: Address::ZERO,
            state_commitment_chain: Address::ZERO,
            bridge: Address::ZERO,
            cross_domain_messenger: Address::ZERO,
            deposit_poll_interval: Duration::from_secs(12),
        }
    }
}

impl L1ClientConfig {
    /// Check if the config has all required fields set
    pub fn is_configured(&self) -> bool {
        !self.private_key.is_empty()
            && self.sequencer_inbox != Address::ZERO
            && self.state_commitment_chain != Address::ZERO
            && self.bridge != Address::ZERO
    }
}

/// Configuration for the L2 sequencer
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SequencerConfig {
    pub sequencer_address: Address,
    pub block_time: Duration,
    pub max_block_size: usize,
    pub max_block_gas: u64,
    pub batch_submission_frequency: Duration,
    pub max_batch_size: usize,
    pub enable_compression: bool,
    /// L1 client configuration (optional - if not set, L1 submission is disabled)
    pub l1_client_config: Option<L1ClientConfig>,
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
            l1_client_config: None,
        }
    }
}