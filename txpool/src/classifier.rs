use alloy_consensus::transaction::Transaction;
use alloy_primitives::{hex, Address};
use async_trait::async_trait;
use monmouth_primitives::{
    ClassificationResult, ExecutionPath, IntentClassification, TransactionType,
};
use reth_primitives::TransactionSigned;

#[async_trait]
pub trait TransactionClassifier: Send + Sync {
    async fn classify(&self, tx: &TransactionSigned) -> ClassificationResult;
}

pub struct HeuristicClassifier;

impl Default for HeuristicClassifier {
    fn default() -> Self {
        Self::new()
    }
}

impl HeuristicClassifier {
    pub fn new() -> Self {
        Self
    }

    fn detect_intent(&self, tx: &TransactionSigned) -> IntentClassification {
        let data = tx.input();

        if data.len() < 4 {
            return IntentClassification::Transfer;
        }

        let selector = &data[0..4];

        match hex::encode(selector).as_str() {
            "a9059cbb" => IntentClassification::Transfer,
            "095ea7b3" => IntentClassification::Transfer,
            "23b872dd" => IntentClassification::Transfer,

            "38ed1739" | "7ff36ab5" | "18cbafe5" | "fb3bdb41" => IntentClassification::Swap,

            "e8e33700" | "f305d719" | "02751cec" | "054d50d4" => IntentClassification::Lending,

            "a694fc3a" | "2e1a7d4d" | "379607f5" => IntentClassification::Staking,

            "42842e0e" | "b88d4fde" if self.is_nft_contract(tx.to()) => {
                IntentClassification::NftOperation
            }

            _ if data.len() > 1000 => IntentClassification::AiInference,

            _ => IntentClassification::Unknown,
        }
    }

    fn is_nft_contract(&self, _to: Option<Address>) -> bool {
        false
    }

    fn determine_execution_path(
        &self,
        intent: &IntentClassification,
        data_size: usize,
    ) -> ExecutionPath {
        match intent {
            IntentClassification::AiInference => ExecutionPath::RagEnhanced,
            IntentClassification::Swap if data_size > 500 => ExecutionPath::HybridEvmSvm,
            _ if data_size > 10000 => ExecutionPath::DeferredExecution,
            _ => ExecutionPath::EvmOnly,
        }
    }

    fn calculate_confidence(&self, intent: &IntentClassification, data_size: usize) -> f64 {
        match intent {
            IntentClassification::Transfer => 0.9,
            IntentClassification::Swap => 0.85,
            IntentClassification::Lending => 0.8,
            IntentClassification::Staking => 0.8,
            IntentClassification::NftOperation => 0.75,
            IntentClassification::AiInference => 0.7,
            IntentClassification::Unknown => {
                if data_size < 100 {
                    0.6
                } else {
                    0.5
                }
            }
        }
    }
}

#[async_trait]
impl TransactionClassifier for HeuristicClassifier {
    async fn classify(&self, tx: &TransactionSigned) -> ClassificationResult {
        let intent = self.detect_intent(tx);
        let data_size = tx.input().len();
        let execution_path = self.determine_execution_path(&intent, data_size);
        let confidence = self.calculate_confidence(&intent, data_size);

        let tx_type = match &execution_path {
            ExecutionPath::EvmOnly => TransactionType::StandardEvm,
            ExecutionPath::SvmOnly => TransactionType::SvmComputation,
            ExecutionPath::HybridEvmSvm => TransactionType::HybridExecution,
            ExecutionPath::RagEnhanced => TransactionType::RagQuery,
            ExecutionPath::DeferredExecution => TransactionType::AgentIntent,
        };

        let requires_context = matches!(
            execution_path,
            ExecutionPath::RagEnhanced | ExecutionPath::HybridEvmSvm
        );

        let estimated_compute_units = if matches!(
            execution_path,
            ExecutionPath::SvmOnly | ExecutionPath::HybridEvmSvm
        ) {
            Some((data_size as u64) * 100)
        } else {
            None
        };

        ClassificationResult {
            tx_type,
            execution_path,
            confidence,
            intent: Some(intent),
            requires_context,
            estimated_compute_units,
        }
    }
}
