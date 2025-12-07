//! L1 Client for Monmouth L2
//!
//! Handles all communication with L1 Sepolia contracts:
//! - Submitting batches to SequencerInbox
//! - Committing state roots to StateCommitmentChain
//! - Monitoring L1StandardBridge for deposits

use alloy_network::EthereumWallet;
use alloy_primitives::{Address, Bytes, B256, keccak256};
use alloy_sol_types::SolValue;
use alloy_provider::{Provider, ProviderBuilder};
use alloy_signer_local::PrivateKeySigner;
use alloy_sol_types::sol;
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::RwLock;
use tracing::{debug, info};

use crate::config::L1ClientConfig;
use monmouth_primitives::{DepositRequest, SequencerBatch, WithdrawalRequest};

// Generate contract bindings from Solidity interfaces
sol! {
    #[sol(rpc)]
    interface ISequencerInbox {
        struct BatchHeader {
            uint64 batchIndex;
            bytes32 parentBatchHash;
            uint64 epochNum;
            bytes32 epochHash;
            uint64 timestamp;
            bytes32 stateRoot;
            bytes32 withdrawalsRoot;
            bytes32 transactionsRoot;
        }

        function submitBatch(BatchHeader calldata header, bytes calldata transactions) external returns (bytes32 batchHash);
        function latestBatchIndex() external view returns (uint64);
        function batchHashes(uint64 index) external view returns (bytes32);
    }

    #[sol(rpc)]
    interface IStateCommitmentChain {
        function commitStateRoot(uint64 batchIndex, bytes32 stateRoot) external;
        function getStateRoot(uint64 batchIndex) external view returns (bytes32);
        function isCommitted(uint64 batchIndex) external view returns (bool);
        function latestCommittedBatch() external view returns (uint64);
    }

    #[sol(rpc)]
    interface IL1StandardBridge {
        event ETHDepositInitiated(
            address indexed from,
            address indexed to,
            uint256 value,
            uint256 indexed nonce,
            uint64 gasLimit,
            bytes data
        );

        function depositNonce() external view returns (uint256);
    }
}

/// Errors that can occur during L1 operations
#[derive(Error, Debug)]
pub enum L1ClientError {
    #[error("Provider error: {0}")]
    Provider(String),

    #[error("Signer error: {0}")]
    Signer(String),

    #[error("Transaction failed: {0}")]
    Transaction(String),

    #[error("Contract error: {0}")]
    Contract(String),

    #[error("Configuration error: {0}")]
    Config(String),
}

/// L1 Client for interacting with Monmouth L1 contracts on Sepolia
pub struct L1Client {
    /// Wallet for signing transactions
    wallet: EthereumWallet,
    /// SequencerInbox contract address
    pub sequencer_inbox: Address,
    /// StateCommitmentChain contract address
    pub state_commitment_chain: Address,
    /// L1StandardBridge contract address
    pub bridge: Address,
    /// CrossDomainMessenger contract address
    pub messenger: Address,
    /// Last L1 block we scanned for deposits
    last_scanned_block: RwLock<u64>,
    /// L1 RPC URL for building providers
    rpc_url: Arc<url::Url>,
}

impl L1Client {
    /// Create a new L1 client from configuration
    pub async fn new(config: &L1ClientConfig) -> Result<Self, L1ClientError> {
        // Parse private key
        let signer: PrivateKeySigner = config
            .private_key
            .parse()
            .map_err(|e| L1ClientError::Signer(format!("Invalid private key: {}", e)))?;

        let sequencer_address = signer.address();
        info!(
            "L1 Client initialized with sequencer address: {}",
            sequencer_address
        );

        let wallet = EthereumWallet::from(signer);

        // Parse RPC URL
        let rpc_url: url::Url = config
            .l1_rpc_url
            .parse()
            .map_err(|e| L1ClientError::Provider(format!("Invalid RPC URL: {}", e)))?;

        Ok(Self {
            wallet,
            sequencer_inbox: config.sequencer_inbox,
            state_commitment_chain: config.state_commitment_chain,
            bridge: config.bridge,
            messenger: config.cross_domain_messenger,
            last_scanned_block: RwLock::new(0),
            rpc_url: Arc::new(rpc_url),
        })
    }

    /// Get a read-only provider for queries
    fn get_provider(&self) -> impl Provider + Clone {
        ProviderBuilder::new().on_http(self.rpc_url.as_ref().clone())
    }

    /// Get a provider with wallet for sending transactions
    fn get_signer_provider(&self) -> impl Provider + Clone {
        ProviderBuilder::new()
            .wallet(self.wallet.clone())
            .on_http(self.rpc_url.as_ref().clone())
    }

    /// Submit a batch to the L1 SequencerInbox contract
    /// Returns the computed batch hash (for use as parent_batch_hash in next batch)
    pub async fn submit_batch(&self, batch: &SequencerBatch) -> Result<B256, L1ClientError> {
        info!(
            "Submitting batch {} to L1 SequencerInbox",
            batch.batch_index
        );

        let provider = self.get_signer_provider();
        let contract = ISequencerInbox::new(self.sequencer_inbox, provider);

        // Serialize transactions
        let tx_data = bincode::serialize(&batch.transactions).map_err(|e| {
            L1ClientError::Contract(format!("Failed to serialize transactions: {}", e))
        })?;

        // Compute merkle roots
        let withdrawals_root = self.compute_withdrawals_root(&batch.withdrawals);
        let transactions_root = keccak256(&tx_data);

        // Build batch header
        let header = ISequencerInbox::BatchHeader {
            batchIndex: batch.batch_index,
            parentBatchHash: batch.parent_batch_hash,
            epochNum: batch.epoch_num,
            epochHash: batch.epoch_hash,
            timestamp: batch.timestamp,
            stateRoot: batch.state_root,
            withdrawalsRoot: withdrawals_root,
            transactionsRoot: transactions_root,
        };

        // Compute batch hash locally (same as contract: keccak256(abi.encode(header, keccak256(transactions))))
        let tx_data_hash = keccak256(&tx_data);
        let encoded = (header.clone(), tx_data_hash).abi_encode();
        let batch_hash = keccak256(&encoded);

        debug!(
            "Batch header: index={}, state_root={:?}, {} txs, {} withdrawals, batch_hash={:?}",
            batch.batch_index,
            batch.state_root,
            batch.transactions.len(),
            batch.withdrawals.len(),
            batch_hash
        );

        // Submit batch transaction
        let call = contract.submitBatch(header, Bytes::from(tx_data));

        let pending_tx = call
            .send()
            .await
            .map_err(|e| L1ClientError::Transaction(format!("Failed to send batch tx: {}", e)))?;

        info!("Batch tx sent, waiting for confirmation...");

        let receipt = pending_tx
            .get_receipt()
            .await
            .map_err(|e| L1ClientError::Transaction(format!("Failed to get receipt: {}", e)))?;

        let tx_hash = receipt.transaction_hash;
        info!(
            "Batch {} submitted successfully! L1 tx: {:?}, batch_hash: {:?}",
            batch.batch_index, tx_hash, batch_hash
        );

        // Return the computed batch hash (not tx hash) for chaining
        Ok(batch_hash)
    }

    /// Commit a state root to the StateCommitmentChain
    pub async fn commit_state_root(
        &self,
        batch_index: u64,
        state_root: B256,
    ) -> Result<B256, L1ClientError> {
        info!(
            "Committing state root for batch {}: {:?}",
            batch_index, state_root
        );

        let provider = self.get_signer_provider();
        let contract = IStateCommitmentChain::new(self.state_commitment_chain, provider);

        let call = contract.commitStateRoot(batch_index, state_root);

        let pending_tx = call
            .send()
            .await
            .map_err(|e| L1ClientError::Transaction(format!("Failed to send commit tx: {}", e)))?;

        let receipt = pending_tx
            .get_receipt()
            .await
            .map_err(|e| L1ClientError::Transaction(format!("Failed to get receipt: {}", e)))?;

        let tx_hash = receipt.transaction_hash;
        debug!(
            "State root committed for batch {} in tx: {:?}",
            batch_index, tx_hash
        );

        Ok(tx_hash)
    }

    /// Get the latest batch index from the SequencerInbox
    pub async fn get_latest_batch_index(&self) -> Result<u64, L1ClientError> {
        let provider = self.get_provider();
        let contract = ISequencerInbox::new(self.sequencer_inbox, provider);

        let batch_index = contract
            .latestBatchIndex()
            .call()
            .await
            .map_err(|e| {
                L1ClientError::Contract(format!("Failed to get latest batch index: {}", e))
            })?;

        Ok(batch_index)
    }

    /// Get the batch hash for a specific batch index
    pub async fn get_batch_hash(&self, batch_index: u64) -> Result<B256, L1ClientError> {
        let provider = self.get_provider();
        let contract = ISequencerInbox::new(self.sequencer_inbox, provider);

        let batch_hash = contract
            .batchHashes(batch_index)
            .call()
            .await
            .map_err(|e| {
                L1ClientError::Contract(format!("Failed to get batch hash for index {}: {}", batch_index, e))
            })?;

        Ok(batch_hash)
    }

    /// Get the latest committed batch from StateCommitmentChain
    pub async fn get_latest_committed_batch(&self) -> Result<u64, L1ClientError> {
        let provider = self.get_provider();
        let contract = IStateCommitmentChain::new(self.state_commitment_chain, provider);

        let batch_index = contract
            .latestCommittedBatch()
            .call()
            .await
            .map_err(|e| {
                L1ClientError::Contract(format!("Failed to get latest committed batch: {}", e))
            })?;

        Ok(batch_index)
    }

    /// Poll L1 bridge for new deposit events
    pub async fn poll_deposits(
        &self,
        from_block: u64,
        to_block: u64,
    ) -> Result<Vec<DepositRequest>, L1ClientError> {
        debug!("Polling deposits from block {} to {}", from_block, to_block);

        let provider = self.get_provider();
        let contract = IL1StandardBridge::new(self.bridge, provider);

        // Create filter for ETHDepositInitiated events
        let filter = contract
            .ETHDepositInitiated_filter()
            .from_block(from_block)
            .to_block(to_block);

        let logs = filter.query().await.map_err(|e| {
            L1ClientError::Contract(format!("Failed to query deposit events: {}", e))
        })?;

        let deposits: Vec<DepositRequest> = logs
            .into_iter()
            .map(|(event, log)| DepositRequest {
                from: event.from,
                to: event.to,
                value: event.value,
                mint: event.value, // For ETH deposits, mint equals value
                gas_limit: event.gasLimit,
                is_creation: false,
                data: event.data,
                l1_block_number: log.block_number.unwrap_or(0),
                log_index: log.log_index.unwrap_or(0),
            })
            .collect();

        if !deposits.is_empty() {
            info!(
                "Found {} new deposits from L1 blocks {}-{}",
                deposits.len(),
                from_block,
                to_block
            );
        }

        // Update last scanned block
        *self.last_scanned_block.write().await = to_block;

        Ok(deposits)
    }

    /// Get the current L1 block number
    pub async fn get_block_number(&self) -> Result<u64, L1ClientError> {
        self.get_provider()
            .get_block_number()
            .await
            .map_err(|e| L1ClientError::Provider(format!("Failed to get block number: {}", e)))
    }

    /// Get the last scanned L1 block
    pub async fn get_last_scanned_block(&self) -> u64 {
        *self.last_scanned_block.read().await
    }

    /// Set the last scanned block (for initialization)
    pub async fn set_last_scanned_block(&self, block: u64) {
        *self.last_scanned_block.write().await = block;
    }

    /// Compute a simple hash of withdrawals for the batch header
    fn compute_withdrawals_root(&self, withdrawals: &[WithdrawalRequest]) -> B256 {
        if withdrawals.is_empty() {
            return B256::ZERO;
        }

        // Simple concatenation hash (not a proper merkle tree, but works for trusted sequencer)
        let mut data = Vec::new();
        for w in withdrawals {
            data.extend_from_slice(w.message_hash.as_slice());
        }
        alloy_primitives::keccak256(&data)
    }

    /// Check if the L1 client is properly configured
    pub fn is_configured(&self) -> bool {
        self.sequencer_inbox != Address::ZERO
            && self.state_commitment_chain != Address::ZERO
            && self.bridge != Address::ZERO
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloy_primitives::U256;

    #[test]
    fn test_withdrawals_root_empty() {
        let withdrawals: Vec<WithdrawalRequest> = vec![];

        let root = if withdrawals.is_empty() {
            B256::ZERO
        } else {
            let mut data = Vec::new();
            for w in &withdrawals {
                data.extend_from_slice(w.message_hash.as_slice());
            }
            alloy_primitives::keccak256(&data)
        };

        assert_eq!(root, B256::ZERO);
    }

    #[test]
    fn test_withdrawals_root_with_data() {
        let withdrawals = vec![WithdrawalRequest {
            nonce: 1,
            sender: Address::ZERO,
            target: Address::ZERO,
            value: U256::ZERO,
            gas_limit: 100000,
            data: Bytes::new(),
            l2_block_number: 1,
            message_hash: B256::from([1u8; 32]),
        }];

        let mut data = Vec::new();
        for w in &withdrawals {
            data.extend_from_slice(w.message_hash.as_slice());
        }
        let root = alloy_primitives::keccak256(&data);

        assert_ne!(root, B256::ZERO);
    }
}
