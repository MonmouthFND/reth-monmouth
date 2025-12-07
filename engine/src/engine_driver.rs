//! Engine API Driver for Monmouth L2
//!
//! Drives block production by making Engine API calls on a timer.
//! This replaces the need for an external consensus client by internally
//! triggering block production via forkchoiceUpdated and newPayload calls.

use alloy_primitives::{Address, B256, U256};
use alloy_rpc_types_engine::{
    ExecutionPayloadV3, ForkchoiceState, ForkchoiceUpdated, PayloadAttributes, PayloadId,
    PayloadStatusEnum,
};
use jsonrpsee::core::client::ClientT;
use jsonrpsee::http_client::{HttpClient, HttpClientBuilder};
use jsonrpsee::rpc_params;
use std::fs;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use thiserror::Error;
use tokio::time::interval;
use tracing::{debug, error, info, warn};

/// Errors that can occur during engine driving
#[derive(Error, Debug)]
pub enum EngineDriverError {
    #[error("Failed to read JWT secret: {0}")]
    JwtRead(String),

    #[error("RPC error: {0}")]
    Rpc(String),

    #[error("Invalid response: {0}")]
    InvalidResponse(String),

    #[error("Payload error: {0}")]
    Payload(String),
}

/// Configuration for the engine driver
#[derive(Debug, Clone)]
pub struct EngineDriverConfig {
    /// Engine API endpoint (typically http://127.0.0.1:8551)
    pub engine_url: String,
    /// Path to JWT secret file
    pub jwt_secret_path: String,
    /// Block production interval
    pub block_time: Duration,
    /// Fee recipient address for produced blocks
    pub fee_recipient: Address,
}

impl Default for EngineDriverConfig {
    fn default() -> Self {
        Self {
            engine_url: "http://127.0.0.1:8551".to_string(),
            jwt_secret_path: "./data/jwt.hex".to_string(),
            block_time: Duration::from_secs(2),
            fee_recipient: Address::ZERO,
        }
    }
}

/// Engine Driver that produces blocks via Engine API
pub struct EngineDriver {
    config: EngineDriverConfig,
    client: HttpClient,
    /// Current head block hash
    head_hash: B256,
    /// Current block number
    block_number: u64,
    /// Shutdown signal receiver
    shutdown_rx: Option<tokio::sync::mpsc::Receiver<()>>,
}

impl EngineDriver {
    /// Create a new engine driver
    pub async fn new(config: EngineDriverConfig) -> Result<Self, EngineDriverError> {
        // Read JWT secret
        let jwt_secret = fs::read_to_string(&config.jwt_secret_path)
            .map_err(|e| EngineDriverError::JwtRead(e.to_string()))?
            .trim()
            .to_string();

        // Build HTTP client with JWT auth
        let client = HttpClientBuilder::default()
            .set_headers(Self::create_auth_header(&jwt_secret)?)
            .build(&config.engine_url)
            .map_err(|e| EngineDriverError::Rpc(e.to_string()))?;

        Ok(Self {
            config,
            client,
            head_hash: B256::ZERO, // Genesis parent
            block_number: 0,
            shutdown_rx: None,
        })
    }

    /// Create JWT auth header
    fn create_auth_header(
        jwt_secret: &str,
    ) -> Result<jsonrpsee::http_client::HeaderMap, EngineDriverError> {
        use jsonrpsee::http_client::HeaderMap;
        use jsonrpsee::http_client::HeaderValue;

        let mut headers = HeaderMap::new();

        // Generate JWT token
        let token = Self::generate_jwt_token(jwt_secret)?;
        let auth_value = HeaderValue::from_str(&format!("Bearer {}", token))
            .map_err(|e| EngineDriverError::JwtRead(e.to_string()))?;

        headers.insert("Authorization", auth_value);
        Ok(headers)
    }

    /// Generate a JWT token for Engine API authentication
    fn generate_jwt_token(secret_hex: &str) -> Result<String, EngineDriverError> {
        use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
        use hmac::{Hmac, Mac};
        use sha2::Sha256;

        let secret_bytes = hex::decode(secret_hex.trim_start_matches("0x"))
            .map_err(|e| EngineDriverError::JwtRead(format!("Invalid hex: {}", e)))?;

        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        // JWT header
        let header = r#"{"alg":"HS256","typ":"JWT"}"#;
        let header_b64 = URL_SAFE_NO_PAD.encode(header);

        // JWT payload
        let payload = format!(r#"{{"iat":{}}}"#, timestamp);
        let payload_b64 = URL_SAFE_NO_PAD.encode(payload);

        // Sign
        let message = format!("{}.{}", header_b64, payload_b64);
        let mut mac = Hmac::<Sha256>::new_from_slice(&secret_bytes)
            .map_err(|e| EngineDriverError::JwtRead(e.to_string()))?;
        mac.update(message.as_bytes());
        let signature = mac.finalize().into_bytes();
        let signature_b64 = URL_SAFE_NO_PAD.encode(signature);

        Ok(format!("{}.{}.{}", header_b64, payload_b64, signature_b64))
    }

    /// Start the engine driver loop
    pub async fn start(mut self) -> Result<(), EngineDriverError> {
        info!(
            target: "monmouth::engine",
            "Starting engine driver with {}s block time",
            self.config.block_time.as_secs()
        );

        // Wait for auth RPC to be available with exponential backoff
        let mut attempt = 0;
        let max_attempts = 30;
        let mut delay = Duration::from_millis(500);

        info!(target: "monmouth::engine", "Waiting for Engine API to become available...");

        loop {
            attempt += 1;

            // Try to make a simple call to check if RPC is ready
            match self.check_engine_ready().await {
                Ok(()) => {
                    info!(target: "monmouth::engine", "Engine API is ready, starting block production");
                    break;
                }
                Err(e) if attempt >= max_attempts => {
                    error!(target: "monmouth::engine", "Engine API not available after {} attempts: {}", attempt, e);
                    return Err(e);
                }
                Err(e) => {
                    debug!(target: "monmouth::engine", "Attempt {}/{}: Engine API not ready: {}", attempt, max_attempts, e);
                    tokio::time::sleep(delay).await;
                    // Exponential backoff capped at 5 seconds
                    delay = std::cmp::min(delay * 2, Duration::from_secs(5));
                }
            }
        }

        // Bootstrap: Do initial forkchoice update to trigger RPC binding
        info!(target: "monmouth::engine", "Sending initial forkchoice update to bootstrap consensus...");
        if let Err(e) = self.bootstrap_forkchoice().await {
            warn!(target: "monmouth::engine", "Bootstrap forkchoice failed (may be normal on fresh chain): {}", e);
        }

        let mut block_interval = interval(self.config.block_time);

        loop {
            tokio::select! {
                _ = block_interval.tick() => {
                    match self.produce_block().await {
                        Ok(hash) => {
                            self.block_number += 1;
                            self.head_hash = hash;
                            info!(
                                target: "monmouth::engine",
                                "Block {} produced: {:?}",
                                self.block_number,
                                hash
                            );
                        }
                        Err(e) => {
                            warn!(target: "monmouth::engine", "Block production failed: {}", e);
                        }
                    }
                }
                _ = async {
                    if let Some(ref mut rx) = self.shutdown_rx {
                        rx.recv().await
                    } else {
                        std::future::pending::<Option<()>>().await
                    }
                } => {
                    info!(target: "monmouth::engine", "Engine driver shutting down");
                    break;
                }
            }
        }

        Ok(())
    }

    /// Check if Engine API is ready by making a simple call
    async fn check_engine_ready(&self) -> Result<(), EngineDriverError> {
        // Try getting exchange capabilities - a lightweight call
        let _: Vec<String> = self
            .client
            .request(
                "engine_exchangeCapabilities",
                rpc_params![vec![
                    "engine_forkchoiceUpdatedV3",
                    "engine_getPayloadV3",
                    "engine_newPayloadV3"
                ]],
            )
            .await
            .map_err(|e| EngineDriverError::Rpc(e.to_string()))?;
        Ok(())
    }

    /// Bootstrap forkchoice to trigger consensus readiness
    async fn bootstrap_forkchoice(&mut self) -> Result<(), EngineDriverError> {
        let fcu_state = ForkchoiceState {
            head_block_hash: self.head_hash,
            safe_block_hash: self.head_hash,
            finalized_block_hash: self.head_hash,
        };

        let _: ForkchoiceUpdated = self
            .client
            .request(
                "engine_forkchoiceUpdatedV3",
                rpc_params![fcu_state, Option::<PayloadAttributes>::None],
            )
            .await
            .map_err(|e| EngineDriverError::Rpc(e.to_string()))?;

        Ok(())
    }

    /// Produce a single block via Engine API
    async fn produce_block(&mut self) -> Result<B256, EngineDriverError> {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        debug!(target: "monmouth::engine", "Producing block at timestamp {}", timestamp);

        // Step 1: Fork choice update with payload attributes to start building
        let fcu_state = ForkchoiceState {
            head_block_hash: self.head_hash,
            safe_block_hash: self.head_hash,
            finalized_block_hash: self.head_hash,
        };

        let payload_attrs = PayloadAttributes {
            timestamp,
            prev_randao: B256::ZERO,
            suggested_fee_recipient: self.config.fee_recipient,
            withdrawals: Some(vec![]),
            parent_beacon_block_root: Some(B256::ZERO),
        };

        let fcu_response: ForkchoiceUpdated = self
            .client
            .request(
                "engine_forkchoiceUpdatedV3",
                rpc_params![fcu_state, payload_attrs],
            )
            .await
            .map_err(|e| EngineDriverError::Rpc(e.to_string()))?;

        let payload_id = fcu_response.payload_id.ok_or_else(|| {
            EngineDriverError::Payload(format!(
                "No payload ID returned, status: {:?}",
                fcu_response.payload_status.status
            ))
        })?;

        debug!(target: "monmouth::engine", "Got payload ID: {:?}", payload_id);

        // Step 2: Wait a bit for payload to build
        tokio::time::sleep(Duration::from_millis(500)).await;

        // Step 3: Get the built payload
        let payload_response: serde_json::Value = self
            .client
            .request("engine_getPayloadV3", rpc_params![payload_id])
            .await
            .map_err(|e| EngineDriverError::Rpc(e.to_string()))?;

        let execution_payload = payload_response
            .get("executionPayload")
            .ok_or_else(|| EngineDriverError::Payload("No executionPayload in response".into()))?;

        let block_hash = execution_payload
            .get("blockHash")
            .and_then(|v| v.as_str())
            .ok_or_else(|| EngineDriverError::Payload("No blockHash in payload".into()))?;

        let block_hash: B256 = block_hash
            .parse()
            .map_err(|e| EngineDriverError::Payload(format!("Invalid block hash: {}", e)))?;

        debug!(target: "monmouth::engine", "Built block: {:?}", block_hash);

        // Step 4: Submit the new payload
        let versioned_hashes: Vec<B256> = vec![];
        let parent_beacon_root = B256::ZERO;

        let new_payload_response: serde_json::Value = self
            .client
            .request(
                "engine_newPayloadV3",
                rpc_params![execution_payload, versioned_hashes, parent_beacon_root],
            )
            .await
            .map_err(|e| EngineDriverError::Rpc(e.to_string()))?;

        let status = new_payload_response
            .get("status")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown");

        if status != "VALID" {
            return Err(EngineDriverError::Payload(format!(
                "newPayload returned {}: {:?}",
                status, new_payload_response
            )));
        }

        debug!(target: "monmouth::engine", "Payload validated");

        // Step 5: Fork choice update to finalize
        let final_fcu_state = ForkchoiceState {
            head_block_hash: block_hash,
            safe_block_hash: block_hash,
            finalized_block_hash: block_hash,
        };

        let _: ForkchoiceUpdated = self
            .client
            .request(
                "engine_forkchoiceUpdatedV3",
                rpc_params![final_fcu_state, Option::<PayloadAttributes>::None],
            )
            .await
            .map_err(|e| EngineDriverError::Rpc(e.to_string()))?;

        Ok(block_hash)
    }

    /// Set shutdown receiver
    pub fn with_shutdown(mut self, rx: tokio::sync::mpsc::Receiver<()>) -> Self {
        self.shutdown_rx = Some(rx);
        self
    }
}

/// Handle to control the engine driver
#[derive(Clone)]
pub struct EngineDriverHandle {
    shutdown_tx: tokio::sync::mpsc::Sender<()>,
}

impl EngineDriverHandle {
    /// Signal the engine driver to shutdown
    pub async fn shutdown(&self) {
        let _ = self.shutdown_tx.send(()).await;
    }
}

/// Spawn the engine driver as a background task
pub fn spawn_engine_driver(
    config: EngineDriverConfig,
) -> (EngineDriverHandle, tokio::task::JoinHandle<()>) {
    let (shutdown_tx, shutdown_rx) = tokio::sync::mpsc::channel(1);

    let handle = tokio::spawn(async move {
        match EngineDriver::new(config).await {
            Ok(driver) => {
                if let Err(e) = driver.with_shutdown(shutdown_rx).start().await {
                    error!(target: "monmouth::engine", "Engine driver error: {}", e);
                }
            }
            Err(e) => {
                error!(target: "monmouth::engine", "Failed to create engine driver: {}", e);
            }
        }
    });

    (EngineDriverHandle { shutdown_tx }, handle)
}
