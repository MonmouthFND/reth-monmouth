use crate::batch_builder::BatchBuilder;
use crate::config::SequencerConfig;
use alloy_primitives::B256;
use alloy_consensus::Transaction;
use parking_lot::RwLock;
use reth_primitives::TransactionSigned;
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio::time::interval;
use tracing::{debug, info};

pub struct L2Sequencer {
    config: SequencerConfig,
    batch_builder: BatchBuilder,
    current_l1_block: Arc<RwLock<(u64, B256)>>,
    pending_transactions: Arc<RwLock<Vec<TransactionSigned>>>,
    block_producer_handle: Option<tokio::task::JoinHandle<()>>,
    batch_submitter_handle: Option<tokio::task::JoinHandle<()>>,
    shutdown_tx: Option<mpsc::Sender<()>>,
}

impl L2Sequencer {
    pub fn new(config: SequencerConfig) -> Self {
        Self {
            config: config.clone(),
            batch_builder: BatchBuilder::new(config.max_batch_size, config.enable_compression),
            current_l1_block: Arc::new(RwLock::new((0, B256::ZERO))),
            pending_transactions: Arc::new(RwLock::new(Vec::new())),
            block_producer_handle: None,
            batch_submitter_handle: None,
            shutdown_tx: None,
        }
    }

    pub async fn start(&mut self) -> Result<SequencerHandle, Box<dyn std::error::Error>> {
        info!("Starting L2 sequencer");

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

        let (shutdown_tx2, mut shutdown_rx2) = mpsc::channel(1);
        let config2 = self.config.clone();

        let batch_submitter = tokio::spawn(async move {
            let mut interval = interval(config2.batch_submission_frequency);
            
            loop {
                tokio::select! {
                    _ = interval.tick() => {
                        Self::submit_batch(&config2).await;
                    }
                    _ = shutdown_rx2.recv() => {
                        info!("Batch submitter shutting down");
                        break;
                    }
                }
            }
        });

        self.batch_submitter_handle = Some(batch_submitter);

        Ok(SequencerHandle {
            shutdown_tx: shutdown_tx2,
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

    async fn submit_batch(_config: &SequencerConfig) {
        debug!("Submitting batch to L1");
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
    }
}

#[derive(Clone)]
pub struct SequencerHandle {
    shutdown_tx: mpsc::Sender<()>,
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
    }
}