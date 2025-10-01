use clap::Parser;
use monmouth_primitives::AgentPoolConfig;
use monmouth_engine::SequencerConfig;
use monmouth_exex_host::ExExHostConfig;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Parser, Serialize, Deserialize, Default)]
pub struct MonmouthNodeArgs {
    #[arg(long, help = "Enable agent-aware transaction pool")]
    pub enable_agent_pool: bool,

    #[arg(long, help = "ExEx service endpoint")]
    pub exex_endpoint: Option<String>,

    #[arg(long, help = "Enable L2 sequencer mode")]
    pub sequencer: bool,

    #[arg(long, help = "L1 RPC URL for sequencer")]
    pub l1_rpc_url: Option<String>,

    #[arg(long, help = "Enable ExEx host service")]
    pub enable_exex_host: bool,

    #[arg(long, default_value = "127.0.0.1:50051", help = "ExEx host address")]
    pub exex_host_addr: String,

    #[arg(long, help = "Classification confidence threshold")]
    pub confidence_threshold: Option<f64>,

    #[arg(long, help = "Enable transaction context fetching")]
    pub enable_context: bool,
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
        
        if let Some(l1_url) = &self.l1_rpc_url {
            config.l1_rpc_url = l1_url.clone();
        }
        
        config
    }

    pub fn exex_host_config(&self) -> ExExHostConfig {
        let mut config = ExExHostConfig::default();
        
        if let Ok(addr) = self.exex_host_addr.parse() {
            config.server_addr = addr;
        }
        
        config
    }
}