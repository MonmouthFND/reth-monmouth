use clap::Parser;
use monmouth_node::{MonmouthNode, MonmouthNodeArgs};
use reth::cli::Cli;
use reth_node_builder::{NodeBuilder, NodeHandle};
use tracing::info;

#[tokio::main]
async fn main() -> eyre::Result<()> {
    reth::cli::Cli::<MonmouthNodeArgs>::parse().run(|builder, args| async move {
        let handle = builder
            .with_types::<MonmouthNode>()
            .with_components(MonmouthNode::components(&args))
            .launch()
            .await?;

        handle.wait_for_node_exit().await
    }).await
}