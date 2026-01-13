use alloy_primitives::{Address, Bytes, U256};
use serde::{Deserialize, Serialize};

pub const AI_INFERENCE_PRECOMPILE: Address = Address::new([
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x10, 0x00,
]);

pub const VECTOR_SIMILARITY_PRECOMPILE: Address = Address::new([
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x10, 0x01,
]);

pub const INTENT_PARSER_PRECOMPILE: Address = Address::new([
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x10, 0x02,
]);

pub const SVM_ROUTER_PRECOMPILE: Address = Address::new([
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x10, 0x03,
]);

pub const L2_MESSAGE_PASSER_PRECOMPILE: Address = Address::new([
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x42, 0x00,
]);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrecompileCall {
    pub address: Address,
    pub input: Bytes,
    pub gas_limit: u64,
    pub context: PrecompileContext,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrecompileContext {
    pub caller: Address,
    pub value: U256,
    pub block_number: u64,
    pub timestamp: u64,
    pub chain_id: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrecompileResult {
    pub output: Bytes,
    pub gas_used: u64,
    pub success: bool,
    pub revert_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiInferenceInput {
    pub model_id: u32,
    pub input_data: Bytes,
    pub max_tokens: u32,
    pub temperature: u32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum SimilarityMetric {
    Cosine,
    Euclidean,
    DotProduct,
}

impl Default for SimilarityMetric {
    fn default() -> Self {
        Self::Cosine
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorSimilarityInput {
    /// Query vector to compare against
    pub query_vector: Vec<f32>,
    /// Candidate vectors to compare (if provided, ignores collection_id)
    pub candidate_vectors: Option<Vec<Vec<f32>>>,
    /// Collection ID for ExEx-based vector store (used if candidate_vectors is None)
    pub collection_id: Option<u32>,
    /// Number of top results to return
    pub top_k: u32,
    /// Minimum similarity threshold (0.0 - 1.0 for cosine)
    pub threshold: f32,
    /// Similarity metric to use
    pub metric: SimilarityMetric,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorSimilarityResult {
    /// Index of the vector in the input array
    pub index: u32,
    /// Similarity score (interpretation depends on metric)
    pub score: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorSimilarityOutput {
    /// Whether the operation succeeded
    pub success: bool,
    /// Top-k results sorted by score (descending for similarity, ascending for distance)
    pub results: Vec<VectorSimilarityResult>,
    /// Error message if failed
    pub error: Option<String>,
    /// Gas used for computation
    pub gas_used: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntentParserInput {
    pub raw_intent: String,
    pub context: Option<Bytes>,
    pub max_steps: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SvmRouterInput {
    pub program_id: Bytes,
    pub instruction_data: Bytes,
    pub accounts: Vec<SvmAccount>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SvmAccount {
    pub pubkey: Bytes,
    pub is_signer: bool,
    pub is_writable: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum L2MessageType {
    Deposit,        // L1 → L2: User deposits funds
    Withdrawal,     // L2 → L1: User initiates withdrawal
    StateRoot,      // L2 → L1: Sequencer submits state proof
    CrossLayerCall, // Contract-to-contract message
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct L2Message {
    pub msg_type: L2MessageType,
    pub sender: Address,
    pub recipient: Address,
    pub value: U256,
    pub data: Bytes,
    pub nonce: u64,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct L2MessageInput {
    pub message: L2Message,
    pub signature: Option<Bytes>, // Optional signature for validation
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct L2MessageOutput {
    pub success: bool,
    pub message_hash: Bytes,
    pub error: Option<String>,
}
