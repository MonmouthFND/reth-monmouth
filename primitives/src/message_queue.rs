use crate::precompiles::{L2Message, L2MessageType};
use alloy_primitives::B256;
use parking_lot::RwLock;
use std::collections::VecDeque;
use std::sync::Arc;

/// Thread-safe message queue for L2 messages
#[derive(Clone)]
pub struct MessageQueue {
    pending_withdrawals: Arc<RwLock<VecDeque<L2Message>>>,
    pending_deposits: Arc<RwLock<VecDeque<L2Message>>>,
    state_roots: Arc<RwLock<VecDeque<L2Message>>>,
    processed_messages: Arc<RwLock<Vec<B256>>>, // Hash of processed messages
}

impl MessageQueue {
    pub fn new() -> Self {
        Self {
            pending_withdrawals: Arc::new(RwLock::new(VecDeque::new())),
            pending_deposits: Arc::new(RwLock::new(VecDeque::new())),
            state_roots: Arc::new(RwLock::new(VecDeque::new())),
            processed_messages: Arc::new(RwLock::new(Vec::new())),
        }
    }

    /// Enqueue a message based on its type
    pub fn enqueue(&self, message: L2Message) -> Result<B256, String> {
        let message_hash = self.compute_message_hash(&message);

        // Check if already processed
        if self.is_processed(&message_hash) {
            return Err("Message already processed".to_string());
        }

        match message.msg_type {
            L2MessageType::Deposit => {
                self.pending_deposits.write().push_back(message);
            }
            L2MessageType::Withdrawal => {
                self.pending_withdrawals.write().push_back(message);
            }
            L2MessageType::StateRoot => {
                self.state_roots.write().push_back(message);
            }
            L2MessageType::CrossLayerCall => {
                // For now, treat as withdrawal (will be routed properly later)
                self.pending_withdrawals.write().push_back(message);
            }
        }

        // Mark as processed
        self.processed_messages.write().push(message_hash);

        Ok(message_hash)
    }

    /// Dequeue a withdrawal message (used by sequencer)
    pub fn dequeue_withdrawal(&self) -> Option<L2Message> {
        self.pending_withdrawals.write().pop_front()
    }

    /// Dequeue a deposit message
    pub fn dequeue_deposit(&self) -> Option<L2Message> {
        self.pending_deposits.write().pop_front()
    }

    /// Peek at pending withdrawals without removing
    pub fn peek_withdrawals(&self) -> Vec<L2Message> {
        self.pending_withdrawals.read().iter().cloned().collect()
    }

    /// Get count of pending withdrawals
    pub fn withdrawal_count(&self) -> usize {
        self.pending_withdrawals.read().len()
    }

    /// Get count of pending deposits
    pub fn deposit_count(&self) -> usize {
        self.pending_deposits.read().len()
    }

    /// Check if a message has been processed
    pub fn is_processed(&self, hash: &B256) -> bool {
        self.processed_messages.read().contains(hash)
    }

    /// Compute hash of a message for deduplication
    fn compute_message_hash(&self, message: &L2Message) -> B256 {
        use alloy_primitives::keccak256;

        // Create a deterministic encoding of the message
        let mut data = Vec::new();
        data.extend_from_slice(&[message.msg_type as u8]);
        data.extend_from_slice(message.sender.as_slice());
        data.extend_from_slice(message.recipient.as_slice());
        data.extend_from_slice(&message.value.to_be_bytes::<32>());
        data.extend_from_slice(&message.data);
        data.extend_from_slice(&message.nonce.to_be_bytes());
        data.extend_from_slice(&message.timestamp.to_be_bytes());

        keccak256(&data)
    }

    /// Clear all queues (for testing)
    #[cfg(test)]
    pub fn clear(&self) {
        self.pending_withdrawals.write().clear();
        self.pending_deposits.write().clear();
        self.state_roots.write().clear();
        self.processed_messages.write().clear();
    }
}

impl Default for MessageQueue {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloy_primitives::{Address, Bytes, U256};

    fn create_test_message(msg_type: L2MessageType, nonce: u64) -> L2Message {
        L2Message {
            msg_type,
            sender: Address::ZERO,
            recipient: Address::ZERO,
            value: U256::from(1000),
            data: Bytes::new(),
            nonce,
            timestamp: 123456,
        }
    }

    #[test]
    fn test_enqueue_withdrawal() {
        let queue = MessageQueue::new();
        let msg = create_test_message(L2MessageType::Withdrawal, 1);

        let result = queue.enqueue(msg);
        assert!(result.is_ok());
        assert_eq!(queue.withdrawal_count(), 1);
    }

    #[test]
    fn test_dequeue_withdrawal() {
        let queue = MessageQueue::new();
        let msg = create_test_message(L2MessageType::Withdrawal, 1);

        queue.enqueue(msg.clone()).unwrap();
        let dequeued = queue.dequeue_withdrawal();

        assert!(dequeued.is_some());
        assert_eq!(dequeued.unwrap().nonce, 1);
        assert_eq!(queue.withdrawal_count(), 0);
    }

    #[test]
    fn test_duplicate_message() {
        let queue = MessageQueue::new();
        let msg = create_test_message(L2MessageType::Withdrawal, 1);

        let result1 = queue.enqueue(msg.clone());
        let result2 = queue.enqueue(msg.clone());

        assert!(result1.is_ok());
        assert!(result2.is_err());
        assert_eq!(queue.withdrawal_count(), 1);
    }

    #[test]
    fn test_message_types() {
        let queue = MessageQueue::new();

        queue.enqueue(create_test_message(L2MessageType::Withdrawal, 1)).unwrap();
        queue.enqueue(create_test_message(L2MessageType::Deposit, 2)).unwrap();

        assert_eq!(queue.withdrawal_count(), 1);
        assert_eq!(queue.deposit_count(), 1);
    }
}
