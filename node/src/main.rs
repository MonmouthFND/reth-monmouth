use clap::Parser;
use monmouth_node::args::MonmouthNodeArgs;
use monmouth_node::MonmouthNode;
use reth::cli::Cli;
use reth_ethereum_cli::chainspec::EthereumChainSpecParser;
use reth_node_builder::NodeHandle;
use tracing::info;

fn main() {
    reth_cli_util::sigsegv_handler::install();

    // Enable backtraces unless a RUST_BACKTRACE value has already been explicitly provided.
    if std::env::var_os("RUST_BACKTRACE").is_none() {
        unsafe { std::env::set_var("RUST_BACKTRACE", "1") };
    }

    if let Err(err) =
        Cli::<EthereumChainSpecParser, MonmouthNodeArgs>::parse().run(async move |builder, args| {
            info!(target: "reth::cli", "Launching Monmouth L2 node");
            info!(target: "reth::cli", "Agent pool enabled: {}", args.enable_agent_pool);
            info!(target: "reth::cli", "Sequencer enabled: {}", args.sequencer);
            info!(target: "reth::cli", "ExEx host enabled: {}", args.enable_exex_host);

            let NodeHandle { node: _, node_exit_future } =
                builder.node(MonmouthNode::default()).launch().await?;

            node_exit_future.await
        })
    {
        eprintln!("Error: {err:?}");
        std::process::exit(1);
    }
}