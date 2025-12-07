use alloy_primitives::{Address, Bytes, U256};
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum IntentClassification {
    Swap,
    Transfer,
    Lending,
    Staking,
    NftOperation,
    AiInference,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TransactionType {
    StandardEvm,
    AgentIntent,
    SvmComputation,
    HybridExecution,
    RagQuery,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ExecutionPath {
    EvmOnly,
    SvmOnly,
    HybridEvmSvm,
    RagEnhanced,
    DeferredExecution,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClassificationResult {
    pub tx_type: TransactionType,
    pub execution_path: ExecutionPath,
    pub confidence: f64,
    pub intent: Option<IntentClassification>,
    pub requires_context: bool,
    pub estimated_compute_units: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionPlan {
    pub steps: Vec<ExecutionStep>,
    pub total_gas_estimate: U256,
    pub requires_witness: bool,
    pub parallel_execution: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionStep {
    pub step_type: StepType,
    pub target: Option<Address>,
    pub data: Bytes,
    pub gas_limit: u64,
    pub value: U256,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum StepType {
    EvmCall,
    SvmExecution,
    RagLookup,
    IntentParsing,
    StateUpdate,
    Verification,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionContext {
    pub context_type: ContextType,
    pub data: Bytes,
    pub relevance_score: f64,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ContextType {
    AgentHistory,
    MarketData,
    CodeAnalysis,
    IntentSimilar,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentPoolConfig {
    pub exex_endpoint: String,
    pub max_classification_time: Duration,
    pub confidence_threshold: f64,
    pub enable_preexec_analysis: bool,
    pub enable_context_fetching: bool,
    pub max_pending_intents: usize,
}

impl Default for AgentPoolConfig {
    fn default() -> Self {
        Self {
            exex_endpoint: "http://127.0.0.1:50051".to_string(),
            max_classification_time: Duration::from_millis(100),
            confidence_threshold: 0.7,
            enable_preexec_analysis: true,
            enable_context_fetching: true,
            max_pending_intents: 1000,
        }
    }
}
