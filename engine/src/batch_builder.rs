use alloy_primitives::{Bytes, B256};
use monmouth_primitives::SequencerBatch;
use reth_primitives::{Block, TransactionSigned};
use std::collections::VecDeque;
use tracing::{debug, info};

pub struct BatchBuilder {
    max_batch_size: usize,
    enable_compression: bool,
    pending_blocks: VecDeque<Block>,
    current_batch_index: u64,
}

impl BatchBuilder {
    pub fn new(max_batch_size: usize, enable_compression: bool) -> Self {
        Self {
            max_batch_size,
            enable_compression,
            pending_blocks: VecDeque::new(),
            current_batch_index: 0,
        }
    }

    pub fn add_block(&mut self, block: Block) {
        self.pending_blocks.push_back(block);
        debug!("Added block to batch builder, {} blocks pending", self.pending_blocks.len());
    }

    pub fn should_submit_batch(&self) -> bool {
        self.pending_blocks.len() >= self.max_batch_size
    }

    pub fn build_batch(&mut self) -> Option<SequencerBatch> {
        if self.pending_blocks.is_empty() {
            return None;
        }

        let mut transactions = Vec::new();
        let mut state_root = B256::ZERO;

        while !self.pending_blocks.is_empty() && transactions.len() < self.max_batch_size * 100 {
            if let Some(block) = self.pending_blocks.pop_front() {
                state_root = block.header.state_root;
                transactions.extend(block.body);
            }
        }

        if transactions.is_empty() {
            return None;
        }

        let batch = SequencerBatch {
            batch_index: self.current_batch_index,
            parent_batch_hash: B256::ZERO,
            epoch_num: 0,
            epoch_hash: B256::ZERO,
            timestamp: 0,
            transactions,
            state_root,
            sequencer_address: Default::default(),
        };

        self.current_batch_index += 1;

        info!(
            "Built batch {} with {} transactions",
            batch.batch_index,
            batch.transactions.len()
        );

        Some(batch)
    }

    pub fn compress_batch(&self, batch: &SequencerBatch) -> Bytes {
        if self.enable_compression {
            let serialized = bincode::serialize(batch).unwrap_or_default();
            Bytes::from(serialized)
        } else {
            let serialized = bincode::serialize(batch).unwrap_or_default();
            Bytes::from(serialized)
        }
    }

    pub fn pending_blocks_count(&self) -> usize {
        self.pending_blocks.len()
    }

    pub fn clear_pending(&mut self) {
        self.pending_blocks.clear();
    }
}