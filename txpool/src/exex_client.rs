use alloy_consensus::Transaction;
use alloy_primitives::U256;
use monmouth_exex_host::proto::{
    ex_ex_service_client::ExExServiceClient, ClassificationResponse, ExecutionPlanRequest,
    ExecutionPlanResponse, Transaction as ProtoTransaction, TransactionRequest,
};
use monmouth_primitives::{
    ClassificationResult, ExecutionPath, ExecutionPlan, ExecutionStep, IntentClassification,
    StepType, TransactionContext, TransactionType,
};
use reth_primitives::TransactionSigned;
use thiserror::Error;
use tonic::transport::Channel;
use tracing::debug;

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
    client: ExExServiceClient<Channel>,
    endpoint: String,
}

impl ExExClient {
    pub async fn connect(endpoint: &str) -> Result<Self, ExExClientError> {
        let client = ExExServiceClient::connect(endpoint.to_string())
            .await
            .map_err(|e| ExExClientError::Connection(e.to_string()))?;

        debug!("Connected to ExEx service at {}", endpoint);

        Ok(Self {
            client,
            endpoint: endpoint.to_string(),
        })
    }

    /// Creates a new client (lazy connection - connects on first call)
    pub fn new(endpoint: &str) -> Result<Self, ExExClientError> {
        // For backwards compatibility, create a placeholder that will connect lazily
        // In practice, prefer using `connect()` for async initialization
        Ok(Self {
            client: ExExServiceClient::new(
                Channel::builder(
                    endpoint.parse().map_err(|e| {
                        ExExClientError::Connection(format!("Invalid endpoint: {e}"))
                    })?,
                )
                .connect_lazy(),
            ),
            endpoint: endpoint.to_string(),
        })
    }

    pub fn endpoint(&self) -> &str {
        &self.endpoint
    }

    fn tx_to_proto(tx: &TransactionSigned) -> ProtoTransaction {
        ProtoTransaction {
            hash: tx.hash().as_slice().to_vec(),
            from: String::new(), // Would need to recover sender
            to: tx.to().map(|a| format!("{a:?}")),
            value: tx.value().to_be_bytes_vec(),
            input: tx.input().to_vec(),
            gas_limit: tx.gas_limit(),
            nonce: tx.nonce(),
        }
    }

    fn parse_tx_type(s: &str) -> TransactionType {
        match s {
            "StandardEvm" => TransactionType::StandardEvm,
            "AgentIntent" => TransactionType::AgentIntent,
            "SvmComputation" => TransactionType::SvmComputation,
            "HybridExecution" => TransactionType::HybridExecution,
            "RagQuery" => TransactionType::RagQuery,
            _ => TransactionType::StandardEvm,
        }
    }

    fn parse_execution_path(s: &str) -> ExecutionPath {
        match s {
            "EvmOnly" => ExecutionPath::EvmOnly,
            "SvmOnly" => ExecutionPath::SvmOnly,
            "HybridEvmSvm" => ExecutionPath::HybridEvmSvm,
            "RagEnhanced" => ExecutionPath::RagEnhanced,
            "DeferredExecution" => ExecutionPath::DeferredExecution,
            _ => ExecutionPath::EvmOnly,
        }
    }

    fn parse_intent(s: &str) -> IntentClassification {
        match s {
            "Swap" => IntentClassification::Swap,
            "Transfer" => IntentClassification::Transfer,
            "Lending" => IntentClassification::Lending,
            "Staking" => IntentClassification::Staking,
            "NftOperation" => IntentClassification::NftOperation,
            "AiInference" => IntentClassification::AiInference,
            _ => IntentClassification::Unknown,
        }
    }

    fn parse_step_type(s: &str) -> StepType {
        match s {
            "EvmCall" => StepType::EvmCall,
            "SvmExecution" => StepType::SvmExecution,
            "RagLookup" => StepType::RagLookup,
            "IntentParsing" => StepType::IntentParsing,
            "StateUpdate" => StepType::StateUpdate,
            "Verification" => StepType::Verification,
            _ => StepType::EvmCall,
        }
    }

    fn response_to_classification(resp: ClassificationResponse) -> ClassificationResult {
        ClassificationResult {
            tx_type: Self::parse_tx_type(&resp.tx_type),
            execution_path: Self::parse_execution_path(&resp.execution_path),
            confidence: resp.confidence,
            intent: resp.intent.map(|s| Self::parse_intent(&s)),
            requires_context: resp.requires_context,
            estimated_compute_units: resp.estimated_compute_units,
        }
    }

    fn response_to_execution_plan(resp: ExecutionPlanResponse) -> ExecutionPlan {
        let steps = resp
            .steps
            .into_iter()
            .map(|s| ExecutionStep {
                step_type: Self::parse_step_type(&s.step_type),
                target: s.target.and_then(|t| t.parse().ok()),
                data: s.data.into(),
                gas_limit: s.gas_limit,
                value: U256::from_be_slice(&s.value),
            })
            .collect();

        ExecutionPlan {
            steps,
            total_gas_estimate: U256::from_be_slice(&resp.total_gas_estimate),
            requires_witness: resp.requires_witness,
            parallel_execution: resp.parallel_execution,
        }
    }

    pub async fn classify_transaction(
        &mut self,
        tx: TransactionSigned,
    ) -> Result<ClassificationResult, ExExClientError> {
        let request = TransactionRequest {
            transaction: Some(Self::tx_to_proto(&tx)),
        };

        let response = self
            .client
            .classify_transaction(request)
            .await
            .map_err(|e| ExExClientError::Rpc(e.to_string()))?;

        let classification = Self::response_to_classification(response.into_inner());
        debug!(
            "Classified tx {:?} as {:?} with confidence {:.2}",
            tx.hash(),
            classification.tx_type,
            classification.confidence
        );

        Ok(classification)
    }

    pub async fn fetch_context(
        &mut self,
        tx: TransactionSigned,
    ) -> Result<Vec<TransactionContext>, ExExClientError> {
        let request = TransactionRequest {
            transaction: Some(Self::tx_to_proto(&tx)),
        };

        let response = self
            .client
            .fetch_context(request)
            .await
            .map_err(|e| ExExClientError::Rpc(e.to_string()))?;

        let contexts = response
            .into_inner()
            .contexts
            .into_iter()
            .map(|c| TransactionContext {
                context_type: match c.context_type.as_str() {
                    "AgentHistory" => monmouth_primitives::ContextType::AgentHistory,
                    "MarketData" => monmouth_primitives::ContextType::MarketData,
                    "CodeAnalysis" => monmouth_primitives::ContextType::CodeAnalysis,
                    "IntentSimilar" => monmouth_primitives::ContextType::IntentSimilar,
                    _ => monmouth_primitives::ContextType::AgentHistory,
                },
                data: c.data.into(),
                relevance_score: c.relevance_score,
                timestamp: c.timestamp,
            })
            .collect();

        Ok(contexts)
    }

    pub async fn create_execution_plan(
        &mut self,
        tx: TransactionSigned,
        classification: ClassificationResult,
    ) -> Result<ExecutionPlan, ExExClientError> {
        let classification_proto = monmouth_exex_host::proto::ClassificationResponse {
            tx_type: format!("{:?}", classification.tx_type),
            execution_path: format!("{:?}", classification.execution_path),
            confidence: classification.confidence,
            intent: classification.intent.map(|i| format!("{i:?}")),
            requires_context: classification.requires_context,
            estimated_compute_units: classification.estimated_compute_units,
        };

        let request = ExecutionPlanRequest {
            transaction: Some(Self::tx_to_proto(&tx)),
            classification: Some(classification_proto),
        };

        let response = self
            .client
            .create_execution_plan(request)
            .await
            .map_err(|e| ExExClientError::Rpc(e.to_string()))?;

        Ok(Self::response_to_execution_plan(response.into_inner()))
    }

    pub async fn health_check(&mut self) -> Result<bool, ExExClientError> {
        let response = self
            .client
            .health_check(monmouth_exex_host::proto::Empty {})
            .await
            .map_err(|e| ExExClientError::Rpc(e.to_string()))?;

        let health = response.into_inner();
        debug!(
            "ExEx service healthy: {}, version: {}, uptime: {}s",
            health.healthy, health.version, health.uptime_seconds
        );

        Ok(health.healthy)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_tx_type() {
        assert_eq!(
            ExExClient::parse_tx_type("StandardEvm"),
            TransactionType::StandardEvm
        );
        assert_eq!(
            ExExClient::parse_tx_type("AgentIntent"),
            TransactionType::AgentIntent
        );
        assert_eq!(
            ExExClient::parse_tx_type("unknown"),
            TransactionType::StandardEvm
        );
    }

    #[test]
    fn test_parse_execution_path() {
        assert_eq!(
            ExExClient::parse_execution_path("EvmOnly"),
            ExecutionPath::EvmOnly
        );
        assert_eq!(
            ExExClient::parse_execution_path("HybridEvmSvm"),
            ExecutionPath::HybridEvmSvm
        );
        assert_eq!(
            ExExClient::parse_execution_path("unknown"),
            ExecutionPath::EvmOnly
        );
    }

    #[test]
    fn test_parse_intent() {
        assert_eq!(ExExClient::parse_intent("Swap"), IntentClassification::Swap);
        assert_eq!(
            ExExClient::parse_intent("Transfer"),
            IntentClassification::Transfer
        );
        assert_eq!(
            ExExClient::parse_intent("unknown"),
            IntentClassification::Unknown
        );
    }
}
