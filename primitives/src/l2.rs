use alloy_consensus::{EthereumTxEnvelope, TxEip4844};
use alloy_primitives::{Address, Bytes, B256, U256};
use reth_primitives::{Block, Transaction};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct L2Block {
    pub l1_block_number: u64,
    pub l1_block_hash: B256,
    pub l1_timestamp: u64,
    pub l2_block: Block,
    pub batch_index: u64,
    pub batch_timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct L2Transaction {
    pub inner: Transaction,
    pub l1_cost: U256,
    pub l1_fee: U256,
    pub l1_gas_used: u64,
    pub l1_gas_price: U256,
    pub l1_scalar: U256,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SequencerBatch {
    pub batch_index: u64,
    pub parent_batch_hash: B256,
    pub epoch_num: u64,
    pub epoch_hash: B256,
    pub timestamp: u64,
    pub transactions: Vec<EthereumTxEnvelope<TxEip4844>>,
    pub state_root: B256,
    pub sequencer_address: Address,
    pub withdrawals: Vec<WithdrawalRequest>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct L1DataAvailability {
    pub batch_index: u64,
    pub tx_hash: B256,
    pub block_number: u64,
    pub data_commitment: B256,
    pub blob_hashes: Vec<B256>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WithdrawalRequest {
    pub nonce: u64,
    pub sender: Address,
    pub target: Address,
    pub value: U256,
    pub gas_limit: u64,
    pub data: Bytes,
    pub l2_block_number: u64,
    pub message_hash: B256,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DepositRequest {
    pub from: Address,
    pub to: Address,
    pub value: U256,
    pub mint: U256,
    pub gas_limit: u64,
    pub is_creation: bool,
    pub data: Bytes,
    pub l1_block_number: u64,
    pub log_index: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct L2Config {
    pub l1_chain_id: u64,
    pub l2_chain_id: u64,
    pub l1_rpc_url: String,
    pub batch_submission_frequency: u64,
    pub max_batch_size: usize,
    pub enable_compression: bool,
    pub sequencer_private_key: Option<String>,
    pub l1_contract_addresses: L1ContractAddresses,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct L1ContractAddresses {
    pub l1_cross_domain_messenger: Address,
    pub l1_standard_bridge: Address,
    pub state_commitment_chain: Address,
    pub canonical_transaction_chain: Address,
    pub bond_manager: Address,
}

impl Default for L2Config {
    fn default() -> Self {
        Self {
            l1_chain_id: 1,
            l2_chain_id: super::MONMOUTH_CHAIN_ID,
            l1_rpc_url: "http://localhost:8545".to_string(),
            batch_submission_frequency: 12,
            max_batch_size: 1000,
            enable_compression: true,
            sequencer_private_key: None,
            l1_contract_addresses: L1ContractAddresses {
                l1_cross_domain_messenger: Address::ZERO,
                l1_standard_bridge: Address::ZERO,
                state_commitment_chain: Address::ZERO,
                canonical_transaction_chain: Address::ZERO,
                bond_manager: Address::ZERO,
            },
        }
    }
}
