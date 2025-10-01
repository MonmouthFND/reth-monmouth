use alloy_primitives::U256;
use monmouth_primitives::{
    ClassificationResult, ExecutionPlan,
    TransactionContext, TransactionType, ExecutionPath, IntentClassification,
};
use reth_primitives::TransactionSigned;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ExExClientError {
    #[error("Connection error: {0}")]
    Connection(String),
    #[error("RPC error: {0}")]
    Rpc(String),
    #[error("Serialization error: {0}")]
    Serialization(String),
}

pub struct ExExClient {
    endpoint: String,
}

impl ExExClient {
    pub fn new(endpoint: &str) -> Result<Self, ExExClientError> {
        Ok(Self {
            endpoint: endpoint.to_string(),
        })
    }

    pub async fn classify_transaction(
        &self,
        _tx: TransactionSigned,
    ) -> Result<ClassificationResult, ExExClientError> {
        Ok(ClassificationResult {
            tx_type: TransactionType::StandardEvm,
            execution_path: ExecutionPath::EvmOnly,
            confidence: 0.95,
            intent: Some(IntentClassification::Unknown),
            requires_context: false,
            estimated_compute_units: None,
        })
    }

    pub async fn fetch_context(
        &self,
        _tx: TransactionSigned,
    ) -> Result<Vec<TransactionContext>, ExExClientError> {
        Ok(Vec::new())
    }

    pub async fn create_execution_plan(
        &self,
        _tx: TransactionSigned,
        _classification: ClassificationResult,
    ) -> Result<ExecutionPlan, ExExClientError> {
        Ok(ExecutionPlan {
            steps: vec![],
            total_gas_estimate: U256::from(21000u64),
            requires_witness: false,
            parallel_execution: false,
        })
    }

    pub async fn health_check(&self) -> Result<bool, ExExClientError> {
        Ok(true)
    }
}