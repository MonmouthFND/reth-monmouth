use alloy_primitives::{Address, Bytes, U256};
use serde::{Deserialize, Serialize};

pub const AI_INFERENCE_PRECOMPILE: Address = Address::new([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10, 0x00]);

pub const VECTOR_SIMILARITY_PRECOMPILE: Address = Address::new([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10, 0x01]);

pub const INTENT_PARSER_PRECOMPILE: Address = Address::new([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10, 0x02]);

pub const SVM_ROUTER_PRECOMPILE: Address = Address::new([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10, 0x03]);

pub const L2_MESSAGE_PASSER_PRECOMPILE: Address = Address::new([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x42, 0x00]);

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorSimilarityInput {
    pub query_vector: Vec<f32>,
    pub collection_id: u32,
    pub top_k: u32,
    pub threshold: f32,
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