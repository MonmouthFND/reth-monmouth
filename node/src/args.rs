use alloy_primitives::Address;
use clap::Args;
use monmouth_engine::{EngineDriverConfig, L1ClientConfig, SequencerConfig};
use monmouth_exex_host::ExExHostConfig;
use monmouth_primitives::AgentPoolConfig;
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Args, Serialize, Deserialize, Default)]
pub struct MonmouthNodeArgs {
    #[arg(long, help = "Enable agent-aware transaction pool")]
    pub enable_agent_pool: bool,

    #[arg(long, help = "ExEx service endpoint")]
    pub exex_endpoint: Option<String>,

    #[arg(long, help = "Enable L2 sequencer mode")]
    pub sequencer: bool,

    #[arg(long, env = "L1_RPC_URL", help = "L1 RPC URL for sequencer")]
    pub l1_rpc_url: Option<String>,

    #[arg(
        long,
        env = "SEQUENCER_PRIVATE_KEY",
        help = "Private key for signing L1 transactions"
    )]
    pub sequencer_private_key: Option<String>,

    #[arg(
        long,
        env = "L1_SEQUENCER_INBOX",
        help = "SequencerInbox contract address on L1"
    )]
    pub l1_sequencer_inbox: Option<String>,

    #[arg(
        long,
        env = "L1_STATE_COMMITMENT_CHAIN",
        help = "StateCommitmentChain contract address on L1"
    )]
    pub l1_state_commitment_chain: Option<String>,

    #[arg(
        long,
        env = "L1_BRIDGE_ADDRESS",
        help = "L1StandardBridge contract address on L1"
    )]
    pub l1_bridge: Option<String>,

    #[arg(
        long,
        env = "L1_CROSS_DOMAIN_MESSENGER",
        help = "CrossDomainMessenger contract address on L1"
    )]
    pub l1_cross_domain_messenger: Option<String>,

    #[arg(
        long,
        default_value = "12",
        help = "L1 deposit poll interval in seconds"
    )]
    pub l1_deposit_poll_interval: u64,

    #[arg(
        long,
        env = "L2_RPC_URL",
        help = "L2 RPC URL for deposit crediting (e.g., http://127.0.0.1:8545)"
    )]
    pub l2_rpc_url: Option<String>,

    #[arg(
        long,
        env = "BRIDGE_PRIVATE_KEY",
        help = "Bridge account private key for crediting deposits on L2"
    )]
    pub bridge_private_key: Option<String>,

    #[arg(long, help = "Enable ExEx host service")]
    pub enable_exex_host: bool,

    #[arg(long, default_value = "127.0.0.1:50051", help = "ExEx host address")]
    pub exex_host_addr: String,

    #[arg(long, help = "Classification confidence threshold")]
    pub confidence_threshold: Option<f64>,

    #[arg(long, help = "Enable transaction context fetching")]
    pub enable_context: bool,

    // Engine driver configuration
    #[arg(long, default_value = "http://127.0.0.1:8551", help = "Engine API URL")]
    pub engine_url: String,

    #[arg(
        long,
        default_value = "./data/jwt.hex",
        help = "Path to JWT secret file"
    )]
    pub jwt_secret_path: String,

    #[arg(
        long,
        default_value = "2",
        help = "Block production interval in seconds for engine driver"
    )]
    pub engine_block_time: u64,

    #[arg(long, help = "Fee recipient address for produced blocks")]
    pub fee_recipient: Option<String>,
}

impl MonmouthNodeArgs {
    pub fn agent_pool_config(&self) -> AgentPoolConfig {
        let mut config = AgentPoolConfig::default();

        if let Some(endpoint) = &self.exex_endpoint {
            config.exex_endpoint = endpoint.clone();
        }

        if let Some(threshold) = self.confidence_threshold {
            config.confidence_threshold = threshold;
        }

        config.enable_context_fetching = self.enable_context;

        config
    }

    pub fn sequencer_config(&self) -> SequencerConfig {
        let mut config = SequencerConfig::default();

        // Build L1 client config if we have the required parameters
        if let (Some(l1_url), Some(private_key)) = (&self.l1_rpc_url, &self.sequencer_private_key) {
            #[allow(clippy::field_reassign_with_default)]
            let mut l1_config = L1ClientConfig {
                l1_rpc_url: l1_url.clone(),
                private_key: private_key.clone(),
                ..Default::default()
            };

            // Parse contract addresses
            if let Some(addr) = &self.l1_sequencer_inbox {
                if let Ok(parsed) = addr.parse::<Address>() {
                    l1_config.sequencer_inbox = parsed;
                }
            }
            if let Some(addr) = &self.l1_state_commitment_chain {
                if let Ok(parsed) = addr.parse::<Address>() {
                    l1_config.state_commitment_chain = parsed;
                }
            }
            if let Some(addr) = &self.l1_bridge {
                if let Ok(parsed) = addr.parse::<Address>() {
                    l1_config.bridge = parsed;
                }
            }
            if let Some(addr) = &self.l1_cross_domain_messenger {
                if let Ok(parsed) = addr.parse::<Address>() {
                    l1_config.cross_domain_messenger = parsed;
                }
            }

            l1_config.deposit_poll_interval = Duration::from_secs(self.l1_deposit_poll_interval);

            // Only set L1 config if it's properly configured
            if l1_config.is_configured() {
                config.l1_client_config = Some(l1_config);
            }
        }

        // Set L2 deposit processing config
        config.l2_rpc_url = self.l2_rpc_url.clone();
        config.bridge_private_key = self.bridge_private_key.clone();

        config
    }

    pub fn exex_host_config(&self) -> ExExHostConfig {
        let mut config = ExExHostConfig::default();

        if let Ok(addr) = self.exex_host_addr.parse() {
            config.server_addr = addr;
        }

        config
    }

    pub fn engine_driver_config(&self) -> EngineDriverConfig {
        let mut config = EngineDriverConfig {
            engine_url: self.engine_url.clone(),
            jwt_secret_path: self.jwt_secret_path.clone(),
            block_time: Duration::from_secs(self.engine_block_time),
            ..Default::default()
        };

        if let Some(recipient) = &self.fee_recipient {
            if let Ok(addr) = recipient.parse() {
                config.fee_recipient = addr;
            }
        }

        config
    }
}
