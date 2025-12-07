//! Standalone Engine Driver Binary
//!
//! Produces blocks via Engine API for a running Monmouth/Reth node.
//! This replaces the need for --dev mode by acting as an external consensus client.
//!
//! Usage:
//!   cargo run -p monmouth-engine --bin engine-driver -- --jwt-secret ./data/jwt.hex
//!
//! Or after building:
//!   ./target/release/engine-driver --jwt-secret ./data/jwt.hex

use monmouth_engine::{EngineDriver, EngineDriverConfig};
use std::time::Duration;
use tracing::info;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,monmouth=debug".into()),
        )
        .init();

    // Parse args
    let args: Vec<String> = std::env::args().collect();

    let mut jwt_secret_path = "./data/jwt.hex".to_string();
    let mut engine_url = "http://127.0.0.1:8551".to_string();
    let mut block_time_secs = 2u64;

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--jwt-secret" | "-j" => {
                i += 1;
                if i < args.len() {
                    jwt_secret_path = args[i].clone();
                }
            }
            "--engine-url" | "-e" => {
                i += 1;
                if i < args.len() {
                    engine_url = args[i].clone();
                }
            }
            "--block-time" | "-t" => {
                i += 1;
                if i < args.len() {
                    block_time_secs = args[i].parse().unwrap_or(2);
                }
            }
            "--help" | "-h" => {
                println!("Monmouth Engine Driver - Block Producer via Engine API");
                println!();
                println!("USAGE:");
                println!("    engine-driver [OPTIONS]");
                println!();
                println!("OPTIONS:");
                println!("    -j, --jwt-secret <PATH>    Path to JWT secret file [default: ./data/jwt.hex]");
                println!("    -e, --engine-url <URL>     Engine API endpoint [default: http://127.0.0.1:8551]");
                println!("    -t, --block-time <SECS>    Block production interval [default: 2]");
                println!("    -h, --help                 Print help");
                return Ok(());
            }
            _ => {}
        }
        i += 1;
    }

    info!("Monmouth Engine Driver starting...");
    info!("  JWT Secret: {}", jwt_secret_path);
    info!("  Engine URL: {}", engine_url);
    info!("  Block Time: {}s", block_time_secs);

    let config = EngineDriverConfig {
        engine_url,
        jwt_secret_path,
        block_time: Duration::from_secs(block_time_secs),
        fee_recipient: alloy_primitives::Address::ZERO,
    };

    let driver = EngineDriver::new(config).await?;
    driver.start().await?;

    Ok(())
}
