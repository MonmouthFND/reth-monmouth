use clap::Parser;
use monmouth_exex_host::ExExHost;
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
            info!(target: "monmouth", "Launching Monmouth L2 node");
            info!(target: "monmouth", "Agent pool enabled: {}", args.enable_agent_pool);
            info!(target: "monmouth", "Sequencer enabled: {}", args.sequencer);
            info!(target: "monmouth", "ExEx host enabled: {}", args.enable_exex_host);

            // Start ExEx host service if enabled
            let _exex_host = if args.enable_exex_host {
                let config = args.exex_host_config();
                let host = ExExHost::new(config);

                if let Err(e) = host.start().await {
                    tracing::error!(target: "monmouth", "Failed to start ExEx host: {}", e);
                } else {
                    info!(target: "monmouth", "ExEx host started on {}", args.exex_host_addr);
                }

                Some(host)
            } else {
                None
            };

            // Log agent pool configuration if enabled
            if args.enable_agent_pool {
                let pool_config = args.agent_pool_config();
                info!(target: "monmouth", "Agent pool configured:");
                info!(target: "monmouth", "  - ExEx endpoint: {}",
                    if pool_config.exex_endpoint.is_empty() { "none (using local classifier)" }
                    else { &pool_config.exex_endpoint });
                info!(target: "monmouth", "  - Confidence threshold: {:.2}", pool_config.confidence_threshold);
                info!(target: "monmouth", "  - Context fetching: {}", pool_config.enable_context_fetching);
            }

            // Log sequencer configuration if enabled
            if args.sequencer {
                let seq_config = args.sequencer_config();
                info!(target: "monmouth", "Sequencer mode enabled:");
                info!(target: "monmouth", "  - L1 RPC URL: {}",
                    if seq_config.l1_rpc_url.is_empty() { "not configured" }
                    else { &seq_config.l1_rpc_url });
                info!(target: "monmouth", "  - Block time: {:?}", seq_config.block_time);
                info!(target: "monmouth", "  - Batch submission frequency: {:?}", seq_config.batch_submission_frequency);
            }

            // Launch the node
            let NodeHandle { node: _, node_exit_future } =
                builder.node(MonmouthNode::default()).launch().await?;

            node_exit_future.await
        })
    {
        eprintln!("Error: {err:?}");
        std::process::exit(1);
    }
}
