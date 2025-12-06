use clap::Parser;
use monmouth_engine::spawn_engine_driver;
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
                if let Some(l1_config) = &seq_config.l1_client_config {
                    info!(target: "monmouth", "  - L1 RPC URL: {}", l1_config.l1_rpc_url);
                    info!(target: "monmouth", "  - L1 SequencerInbox: {:?}", l1_config.sequencer_inbox);
                    info!(target: "monmouth", "  - L1 Bridge: {:?}", l1_config.bridge);
                } else {
                    info!(target: "monmouth", "  - L1 integration: not configured");
                }
                info!(target: "monmouth", "  - Block time: {:?}", seq_config.block_time);
                info!(target: "monmouth", "  - Batch submission frequency: {:?}", seq_config.batch_submission_frequency);
            }

            // Launch the node
            let NodeHandle { node: _, node_exit_future } =
                builder.node(MonmouthNode::default()).launch().await?;

            // Start engine driver if sequencer mode is enabled
            let _engine_driver = if args.sequencer {
                let engine_config = args.engine_driver_config();
                info!(
                    target: "monmouth",
                    "Starting engine driver for block production ({}s block time)",
                    engine_config.block_time.as_secs()
                );
                info!(
                    target: "monmouth",
                    "Engine API: {}, JWT: {}",
                    engine_config.engine_url,
                    engine_config.jwt_secret_path
                );

                let (handle, task) = spawn_engine_driver(engine_config);
                Some((handle, task))
            } else {
                None
            };

            node_exit_future.await
        })
    {
        eprintln!("Error: {err:?}");
        std::process::exit(1);
    }
}
