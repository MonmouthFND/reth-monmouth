use clap::Parser;
use monmouth_engine::{L1Client, L2Sequencer};
use monmouth_exex_host::ExExHost;
use monmouth_node::args::MonmouthNodeArgs;
use monmouth_node::{create_state_provider, MonmouthNode};
use reth::cli::Cli;
use reth_ethereum_cli::chainspec::EthereumChainSpecParser;
use reth_node_builder::NodeHandle;
use reth_node_ethereum::EthereumNode;
use tracing::{info, warn};

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
            // When in sequencer mode, use EthereumNode which properly integrates with --dev mode
            // MonmouthNode's custom EVM precompiles (currently stubs) are not yet needed for testnet
            let (node_exit_future, state_provider) = if args.sequencer {
                info!(target: "monmouth", "Using EthereumNode for sequencer mode (dev mode compatible)");
                info!(target: "monmouth", "Note: Custom precompiles disabled in this mode");
                let NodeHandle { node, node_exit_future } =
                    builder.node(EthereumNode::default()).launch().await?;

                // Create state provider from the node's blockchain provider
                let provider = create_state_provider(node.provider().clone());
                info!(target: "monmouth", "Created state provider for real state roots");

                (node_exit_future, Some(provider))
            } else {
                info!(target: "monmouth", "Using MonmouthNode with custom precompiles");
                let NodeHandle { node, node_exit_future } =
                    builder.node(MonmouthNode::default()).launch().await?;

                // Create state provider from the node's blockchain provider
                let provider = create_state_provider(node.provider().clone());
                info!(target: "monmouth", "Created state provider for real state roots");

                (node_exit_future, Some(provider))
            };

            // Start L1 client and batch submission if in sequencer mode with L1 config
            let _sequencer_handle = if args.sequencer {
                let seq_config = args.sequencer_config();
                if let Some(l1_config) = &seq_config.l1_client_config {
                    if l1_config.is_configured() {
                        info!(target: "monmouth", "Starting L1 client for batch submission...");

                        match L1Client::new(l1_config).await {
                            Ok(l1_client) => {
                                info!(target: "monmouth", "L1 client connected successfully");
                                info!(target: "monmouth", "  - SequencerInbox: {:?}", l1_client.sequencer_inbox);
                                info!(target: "monmouth", "  - Bridge: {:?}", l1_client.bridge);

                                // Create sequencer with L1 client and state provider
                                let sequencer = L2Sequencer::new(seq_config.clone())
                                    .with_l1_client(l1_client);

                                // Add state provider for real state roots if available
                                let mut sequencer = if let Some(ref provider) = state_provider {
                                    sequencer.with_state_provider(provider.clone())
                                } else {
                                    sequencer
                                };

                                match sequencer.start().await {
                                    Ok(handle) => {
                                        info!(target: "monmouth", "L2 Sequencer started with L1 batch submission");
                                        Some(handle)
                                    }
                                    Err(e) => {
                                        warn!(target: "monmouth", "Failed to start L2 sequencer: {}", e);
                                        None
                                    }
                                }
                            }
                            Err(e) => {
                                warn!(target: "monmouth", "Failed to create L1 client: {}", e);
                                warn!(target: "monmouth", "L1 batch submission disabled");
                                None
                            }
                        }
                    } else {
                        info!(target: "monmouth", "L1 config incomplete, batch submission disabled");
                        info!(target: "monmouth", "Set L1_SEQUENCER_INBOX, L1_STATE_COMMITMENT_CHAIN, L1_BRIDGE_ADDRESS env vars");
                        None
                    }
                } else {
                    info!(target: "monmouth", "No L1 config provided, batch submission disabled");
                    None
                }
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
