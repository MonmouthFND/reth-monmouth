use crate::args::MonmouthNodeArgs;
use monmouth_engine::{L2Sequencer, SequencerHandle};
use monmouth_exex_host::ExExHost;
use monmouth_txpool::{AgentAwarePool, AgentPoolBuilder};
use reth_node_builder::{NodeBuilder, NodeHandle};
use std::sync::Arc;
use tracing::info;

pub struct MonmouthNodeBuilder {
    args: MonmouthNodeArgs,
    sequencer: Option<L2Sequencer>,
    exex_host: Option<ExExHost>,
}

impl MonmouthNodeBuilder {
    pub fn new(args: MonmouthNodeArgs) -> Self {
        Self {
            args,
            sequencer: None,
            exex_host: None,
        }
    }

    pub async fn build(mut self) -> eyre::Result<()> {
        if self.args.enable_exex_host {
            info!("Starting ExEx host service");
            let config = self.args.exex_host_config();
            let host = ExExHost::new(config);
            host.start().await?;
            self.exex_host = Some(host);
        }

        if self.args.sequencer {
            info!("Starting L2 sequencer");
            let config = self.args.sequencer_config();
            let mut sequencer = L2Sequencer::new(config);
            let _handle = sequencer.start().await?;
            self.sequencer = Some(sequencer);
        }

        Ok(())
    }

    pub async fn shutdown(mut self) {
        if let Some(mut sequencer) = self.sequencer.take() {
            sequencer.shutdown().await;
        }

        if let Some(host) = self.exex_host.take() {
            host.stop().await;
        }
    }
}