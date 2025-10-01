use clap::Parser;
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
        Cli::<EthereumChainSpecParser>::parse().run(async move |builder, _args| {
            info!(target: "reth::cli", "Launching Monmouth L2 node");
            let NodeHandle { node: _, node_exit_future } =
                builder.node(MonmouthNode::default()).launch().await?;

            node_exit_future.await
        })
    {
        eprintln!("Error: {err:?}");
        std::process::exit(1);
    }
}