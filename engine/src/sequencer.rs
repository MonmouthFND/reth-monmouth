use crate::config::SequencerConfig;
use crate::l1_client::L1Client;
use alloy_consensus::Transaction;
use alloy_primitives::B256;
use monmouth_primitives::{MessageQueue, SequencerBatch, WithdrawalRequest};
use parking_lot::RwLock;
use reth_primitives::TransactionSigned;
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio::time::interval;
use tracing::{debug, info, warn};

pub struct L2Sequencer {
    config: SequencerConfig,
    current_l1_block: Arc<RwLock<(u64, B256)>>,
    pending_transactions: Arc<RwLock<Vec<TransactionSigned>>>,
    message_queue: MessageQueue,
    /// Optional L1 client for submitting batches and monitoring deposits
    l1_client: Option<Arc<L1Client>>,
    /// Current batch index (starts at 0, increments with each submission)
    batch_index: Arc<RwLock<u64>>,
    /// Parent batch hash for chaining
    parent_batch_hash: Arc<RwLock<B256>>,
    block_producer_handle: Option<tokio::task::JoinHandle<()>>,
    batch_submitter_handle: Option<tokio::task::JoinHandle<()>>,
    deposit_poller_handle: Option<tokio::task::JoinHandle<()>>,
    shutdown_tx: Option<mpsc::Sender<()>>,
}

impl L2Sequencer {
    pub fn new(config: SequencerConfig) -> Self {
        Self {
            config,
            current_l1_block: Arc::new(RwLock::new((0, B256::ZERO))),
            pending_transactions: Arc::new(RwLock::new(Vec::new())),
            message_queue: MessageQueue::new(),
            l1_client: None,
            batch_index: Arc::new(RwLock::new(0)),
            parent_batch_hash: Arc::new(RwLock::new(B256::ZERO)),
            block_producer_handle: None,
            batch_submitter_handle: None,
            deposit_poller_handle: None,
            shutdown_tx: None,
        }
    }

    /// Create a new sequencer with L1 client for batch submission
    pub fn with_l1_client(mut self, l1_client: L1Client) -> Self {
        self.l1_client = Some(Arc::new(l1_client));
        self
    }

    pub async fn start(&mut self) -> Result<SequencerHandle, Box<dyn std::error::Error>> {
        info!("Starting L2 sequencer");

        // If L1 client is configured, sync batch index and parent batch hash from L1
        if let Some(l1_client) = &self.l1_client {
            match l1_client.get_latest_batch_index().await {
                Ok(index) => {
                    *self.batch_index.write() = index;
                    info!("Synced batch index from L1: {}", index);

                    // If there are previous batches, get the last batch hash as parent
                    if index > 0 {
                        match l1_client.get_batch_hash(index - 1).await {
                            Ok(hash) => {
                                *self.parent_batch_hash.write() = hash;
                                info!("Synced parent batch hash from L1: {:?}", hash);
                            }
                            Err(e) => {
                                warn!("Failed to sync parent batch hash from L1: {}", e);
                            }
                        }
                    }
                }
                Err(e) => {
                    warn!("Failed to sync batch index from L1: {}", e);
                }
            }
        }

        let (shutdown_tx, mut shutdown_rx) = mpsc::channel(1);
        self.shutdown_tx = Some(shutdown_tx.clone());

        let pending_txs = self.pending_transactions.clone();
        let config = self.config.clone();
        let current_l1 = self.current_l1_block.clone();

        let block_producer = tokio::spawn(async move {
            let mut interval = interval(config.block_time);

            loop {
                tokio::select! {
                    _ = interval.tick() => {
                        Self::produce_block(&pending_txs, &config, &current_l1).await;
                    }
                    _ = shutdown_rx.recv() => {
                        info!("Block producer shutting down");
                        break;
                    }
                }
            }
        });

        self.block_producer_handle = Some(block_producer);

        // Set up batch submitter with L1 client
        let (shutdown_tx2, mut shutdown_rx2) = mpsc::channel(1);
        let config2 = self.config.clone();
        let message_queue = self.message_queue.clone();
        let l1_client = self.l1_client.clone();
        let batch_index = self.batch_index.clone();
        let parent_batch_hash = self.parent_batch_hash.clone();
        let current_l1_for_batch = self.current_l1_block.clone();

        let batch_submitter = tokio::spawn(async move {
            let mut interval = interval(config2.batch_submission_frequency);

            loop {
                tokio::select! {
                    _ = interval.tick() => {
                        Self::submit_batch(
                            &l1_client,
                            &message_queue,
                            &batch_index,
                            &parent_batch_hash,
                            &current_l1_for_batch,
                        ).await;
                    }
                    _ = shutdown_rx2.recv() => {
                        info!("Batch submitter shutting down");
                        break;
                    }
                }
            }
        });

        self.batch_submitter_handle = Some(batch_submitter);

        // Set up deposit poller if L1 client is configured
        let (shutdown_tx3, mut shutdown_rx3) = mpsc::channel(1);
        if let Some(l1_client) = &self.l1_client {
            let l1 = l1_client.clone();
            let poll_interval = self
                .config
                .l1_client_config
                .as_ref()
                .map(|c| c.deposit_poll_interval)
                .unwrap_or(std::time::Duration::from_secs(12));

            let deposit_poller = tokio::spawn(async move {
                let mut interval = interval(poll_interval);

                loop {
                    tokio::select! {
                        _ = interval.tick() => {
                            Self::poll_l1_deposits(&l1).await;
                        }
                        _ = shutdown_rx3.recv() => {
                            info!("Deposit poller shutting down");
                            break;
                        }
                    }
                }
            });

            self.deposit_poller_handle = Some(deposit_poller);
        }

        Ok(SequencerHandle {
            shutdown_tx: shutdown_tx2,
            shutdown_tx_deposit: shutdown_tx3,
            pending_transactions: self.pending_transactions.clone(),
        })
    }

    async fn produce_block(
        pending_txs: &Arc<RwLock<Vec<TransactionSigned>>>,
        config: &SequencerConfig,
        _current_l1: &Arc<RwLock<(u64, B256)>>,
    ) {
        let mut txs = pending_txs.write();

        if txs.is_empty() {
            debug!("No pending transactions, skipping block production");
            return;
        }

        let mut block_txs = Vec::new();
        let mut total_gas = 0u64;

        while !txs.is_empty() && block_txs.len() < config.max_block_size {
            if let Some(tx) = txs.first() {
                let gas_limit = tx.gas_limit();

                if total_gas + gas_limit <= config.max_block_gas {
                    block_txs.push(txs.remove(0));
                    total_gas += gas_limit;
                } else {
                    break;
                }
            }
        }

        if !block_txs.is_empty() {
            info!(
                "Produced block with {} transactions, {} gas used",
                block_txs.len(),
                total_gas
            );
        }
    }

    async fn submit_batch(
        l1_client: &Option<Arc<L1Client>>,
        message_queue: &MessageQueue,
        batch_index: &Arc<RwLock<u64>>,
        parent_batch_hash: &Arc<RwLock<B256>>,
        current_l1: &Arc<RwLock<(u64, B256)>>,
    ) {
        debug!("Preparing batch for L1 submission");

        // Collect pending withdrawal messages
        let mut withdrawals = Vec::new();
        let withdrawal_count = message_queue.withdrawal_count();

        if withdrawal_count > 0 {
            info!(
                "Processing {} pending withdrawals for batch submission",
                withdrawal_count
            );

            // Dequeue all pending withdrawals
            while let Some(l2_message) = message_queue.dequeue_withdrawal() {
                let withdrawal = WithdrawalRequest {
                    nonce: l2_message.nonce,
                    sender: l2_message.sender,
                    target: l2_message.recipient,
                    value: l2_message.value,
                    gas_limit: 100_000,
                    data: l2_message.data.clone(),
                    l2_block_number: 0,
                    message_hash: B256::ZERO,
                };
                withdrawals.push(withdrawal);
            }

            info!(
                "Included {} withdrawals in batch submission",
                withdrawals.len()
            );
        }

        // If no L1 client, just log
        let Some(client) = l1_client else {
            if !withdrawals.is_empty() {
                debug!(
                    "L1 client not configured, skipping batch with {} withdrawals",
                    withdrawals.len()
                );
            }
            return;
        };

        // Get current batch info
        // Note: current_index is synced from L1's latestBatchIndex which is the NEXT batch to submit
        let current_index = *batch_index.read();
        let parent_hash = *parent_batch_hash.read();
        let (epoch_num, epoch_hash) = *current_l1.read();

        // Build the batch
        let batch = SequencerBatch {
            batch_index: current_index,
            parent_batch_hash: parent_hash,
            epoch_num,
            epoch_hash,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            state_root: B256::ZERO, // Would be computed from actual state
            sequencer_address: alloy_primitives::Address::ZERO, // Would be from config
            transactions: Vec::new(), // Would include actual transactions
            withdrawals,
        };

        // Submit batch to L1
        match client.submit_batch(&batch).await {
            Ok(batch_hash) => {
                info!(
                    "Batch {} submitted successfully! L1 tx: {:?}",
                    batch.batch_index, batch_hash
                );

                // Update batch index and parent hash for next batch
                *batch_index.write() = batch.batch_index + 1;
                // Use the computed batch_hash as parent_batch_hash for next batch
                *parent_batch_hash.write() = batch_hash;

                // Also commit state root
                if let Err(e) = client
                    .commit_state_root(batch.batch_index, batch.state_root)
                    .await
                {
                    warn!("Failed to commit state root: {}", e);
                }
            }
            Err(e) => {
                warn!("Failed to submit batch to L1: {}", e);
            }
        }
    }

    /// Poll L1 for new deposits
    async fn poll_l1_deposits(l1_client: &L1Client) {
        let last_scanned = l1_client.get_last_scanned_block().await;

        let current_block = match l1_client.get_block_number().await {
            Ok(block) => block,
            Err(e) => {
                warn!("Failed to get L1 block number: {}", e);
                return;
            }
        };

        // Only poll if there are new blocks
        if current_block <= last_scanned {
            return;
        }

        // Limit to 10 blocks per query (Alchemy free tier limit)
        const MAX_BLOCK_RANGE: u64 = 10;

        let from_block = if last_scanned == 0 {
            // On first poll, start from recent blocks (within limit)
            current_block.saturating_sub(MAX_BLOCK_RANGE - 1)
        } else {
            last_scanned + 1
        };

        // Cap to_block to respect max range
        let to_block = std::cmp::min(current_block, from_block + MAX_BLOCK_RANGE - 1);

        match l1_client.poll_deposits(from_block, to_block).await {
            Ok(deposits) => {
                if !deposits.is_empty() {
                    info!(
                        "Found {} deposits from L1 blocks {}-{}",
                        deposits.len(),
                        from_block,
                        current_block
                    );
                    // TODO: Process deposits and inject into L2 state
                    // For now just log them
                    for deposit in &deposits {
                        debug!(
                            "Deposit: {} ETH from {:?} to {:?}",
                            deposit.value, deposit.from, deposit.to
                        );
                    }
                }
            }
            Err(e) => {
                warn!("Failed to poll deposits: {}", e);
            }
        }
    }

    pub async fn add_transaction(&self, tx: TransactionSigned) {
        self.pending_transactions.write().push(tx);
        debug!("Added transaction to pending pool");
    }

    pub fn pending_transaction_count(&self) -> usize {
        self.pending_transactions.read().len()
    }

    pub async fn shutdown(&mut self) {
        info!("Shutting down L2 sequencer");

        if let Some(tx) = &self.shutdown_tx {
            let _ = tx.send(()).await;
        }

        if let Some(handle) = self.block_producer_handle.take() {
            let _ = handle.await;
        }

        if let Some(handle) = self.batch_submitter_handle.take() {
            let _ = handle.await;
        }

        if let Some(handle) = self.deposit_poller_handle.take() {
            let _ = handle.await;
        }
    }
}

#[derive(Clone)]
pub struct SequencerHandle {
    shutdown_tx: mpsc::Sender<()>,
    shutdown_tx_deposit: mpsc::Sender<()>,
    pending_transactions: Arc<RwLock<Vec<TransactionSigned>>>,
}

impl SequencerHandle {
    pub async fn add_transaction(&self, tx: TransactionSigned) {
        self.pending_transactions.write().push(tx);
    }

    pub fn pending_count(&self) -> usize {
        self.pending_transactions.read().len()
    }

    pub async fn shutdown(self) {
        let _ = self.shutdown_tx.send(()).await;
        let _ = self.shutdown_tx_deposit.send(()).await;
    }
}
