//! RPC testing utilities

use alloy_primitives::{Address, B256, U256};
use eyre::Result;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// JSON-RPC request structure
#[derive(Debug, Serialize)]
struct JsonRpcRequest {
    jsonrpc: &'static str,
    method: String,
    params: Value,
    id: u64,
}

/// JSON-RPC response structure
#[derive(Debug, Deserialize)]
struct JsonRpcResponse {
    #[serde(rename = "jsonrpc")]
    _jsonrpc: String,
    result: Option<Value>,
    error: Option<JsonRpcError>,
    #[serde(rename = "id")]
    _id: u64,
}

#[derive(Debug, Deserialize)]
struct JsonRpcError {
    code: i64,
    message: String,
}

/// RPC client for testing
#[derive(Debug)]
pub struct RpcClient {
    client: reqwest::Client,
    url: String,
    request_id: std::sync::atomic::AtomicU64,
}

impl RpcClient {
    pub fn new(url: &str) -> Self {
        Self {
            client: reqwest::Client::new(),
            url: url.to_string(),
            request_id: std::sync::atomic::AtomicU64::new(1),
        }
    }

    fn next_id(&self) -> u64 {
        self.request_id
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst)
    }

    /// Make a raw JSON-RPC call
    pub async fn call(&self, method: &str, params: Value) -> Result<Value> {
        let request = JsonRpcRequest {
            jsonrpc: "2.0",
            method: method.to_string(),
            params,
            id: self.next_id(),
        };

        let response: JsonRpcResponse = self
            .client
            .post(&self.url)
            .json(&request)
            .send()
            .await?
            .json()
            .await?;

        if let Some(error) = response.error {
            eyre::bail!("RPC error {}: {}", error.code, error.message);
        }

        response.result.ok_or_else(|| eyre::eyre!("No result in response"))
    }

    /// Get the chain ID
    pub async fn chain_id(&self) -> Result<u64> {
        let result = self.call("eth_chainId", json!([])).await?;
        let hex = result.as_str().ok_or_else(|| eyre::eyre!("Invalid chainId response"))?;
        let id = u64::from_str_radix(hex.trim_start_matches("0x"), 16)?;
        Ok(id)
    }

    /// Get the current block number
    pub async fn block_number(&self) -> Result<u64> {
        let result = self.call("eth_blockNumber", json!([])).await?;
        let hex = result.as_str().ok_or_else(|| eyre::eyre!("Invalid blockNumber response"))?;
        let num = u64::from_str_radix(hex.trim_start_matches("0x"), 16)?;
        Ok(num)
    }

    /// Get the balance of an address
    pub async fn get_balance(&self, address: Address) -> Result<U256> {
        let result = self
            .call("eth_getBalance", json!([format!("{:?}", address), "latest"]))
            .await?;
        let hex = result.as_str().ok_or_else(|| eyre::eyre!("Invalid balance response"))?;
        let balance = U256::from_str_radix(hex.trim_start_matches("0x"), 16)?;
        Ok(balance)
    }

    /// Get the transaction count (nonce) for an address
    pub async fn get_transaction_count(&self, address: Address) -> Result<u64> {
        let result = self
            .call("eth_getTransactionCount", json!([format!("{:?}", address), "latest"]))
            .await?;
        let hex = result.as_str().ok_or_else(|| eyre::eyre!("Invalid txCount response"))?;
        let count = u64::from_str_radix(hex.trim_start_matches("0x"), 16)?;
        Ok(count)
    }

    /// Send a raw transaction
    pub async fn send_raw_transaction(&self, raw_tx: &str) -> Result<B256> {
        let result = self.call("eth_sendRawTransaction", json!([raw_tx])).await?;
        let hex = result.as_str().ok_or_else(|| eyre::eyre!("Invalid tx hash response"))?;
        let hash: B256 = hex.parse()?;
        Ok(hash)
    }

    /// Get transaction receipt
    pub async fn get_transaction_receipt(&self, tx_hash: B256) -> Result<Option<Value>> {
        let result = self
            .call("eth_getTransactionReceipt", json!([format!("{:?}", tx_hash)]))
            .await?;
        if result.is_null() {
            Ok(None)
        } else {
            Ok(Some(result))
        }
    }

    /// Call a contract (eth_call)
    pub async fn eth_call(&self, to: Address, data: &str) -> Result<String> {
        let result = self
            .call(
                "eth_call",
                json!([{
                    "to": format!("{:?}", to),
                    "data": data
                }, "latest"]),
            )
            .await?;
        let hex = result.as_str().ok_or_else(|| eyre::eyre!("Invalid eth_call response"))?;
        Ok(hex.to_string())
    }

    /// Get client version
    pub async fn client_version(&self) -> Result<String> {
        let result = self.call("web3_clientVersion", json!([])).await?;
        let version = result.as_str().ok_or_else(|| eyre::eyre!("Invalid version response"))?;
        Ok(version.to_string())
    }

    /// Check if node is syncing
    pub async fn syncing(&self) -> Result<bool> {
        let result = self.call("eth_syncing", json!([])).await?;
        // Returns false if not syncing, object if syncing
        Ok(!result.is_boolean() || result.as_bool().unwrap_or(false))
    }

    /// Get gas price
    pub async fn gas_price(&self) -> Result<U256> {
        let result = self.call("eth_gasPrice", json!([])).await?;
        let hex = result.as_str().ok_or_else(|| eyre::eyre!("Invalid gasPrice response"))?;
        let price = U256::from_str_radix(hex.trim_start_matches("0x"), 16)?;
        Ok(price)
    }

    /// Check if node is listening for network connections
    pub async fn net_listening(&self) -> Result<bool> {
        let result = self.call("net_listening", json!([])).await?;
        result
            .as_bool()
            .ok_or_else(|| eyre::eyre!("Invalid net_listening response"))
    }

    /// Get peer count
    pub async fn net_peer_count(&self) -> Result<u64> {
        let result = self.call("net_peerCount", json!([])).await?;
        let hex = result.as_str().ok_or_else(|| eyre::eyre!("Invalid peerCount response"))?;
        let count = u64::from_str_radix(hex.trim_start_matches("0x"), 16)?;
        Ok(count)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rpc_client_creation() {
        let client = RpcClient::new("http://localhost:8545");
        assert_eq!(client.url, "http://localhost:8545");
    }

    #[test]
    fn test_request_id_increment() {
        let client = RpcClient::new("http://localhost:8545");
        assert_eq!(client.next_id(), 1);
        assert_eq!(client.next_id(), 2);
        assert_eq!(client.next_id(), 3);
    }
}
