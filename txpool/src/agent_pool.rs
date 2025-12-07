use alloy_primitives::B256;
use monmouth_primitives::{
    AgentPoolConfig, ClassificationResult, ExecutionPath, ExecutionPlan, TransactionContext,
};
use parking_lot::RwLock;
use reth_primitives::TransactionSigned;
use reth_transaction_pool::TransactionPool;
use std::{collections::HashMap, sync::Arc, time::Instant};
use tokio::sync::Mutex as AsyncMutex;
use tracing::{debug, error, info, warn};

use crate::classifier::TransactionClassifier;
use crate::exex_client::ExExClient;

pub struct AgentAwarePool<P> {
    inner: P,
    config: AgentPoolConfig,
    classifier: Arc<dyn TransactionClassifier>,
    exex_client: Option<Arc<AsyncMutex<ExExClient>>>,
    classified_txs: Arc<RwLock<HashMap<B256, ClassificationResult>>>,
    execution_plans: Arc<RwLock<HashMap<B256, ExecutionPlan>>>,
    contexts: Arc<RwLock<HashMap<B256, Vec<TransactionContext>>>>,
}

impl<P> AgentAwarePool<P>
where
    P: TransactionPool,
{
    pub fn new(
        inner: P,
        config: AgentPoolConfig,
        classifier: Arc<dyn TransactionClassifier>,
    ) -> Self {
        let exex_client = if !config.exex_endpoint.is_empty() {
            match ExExClient::new(&config.exex_endpoint) {
                Ok(client) => {
                    info!(
                        "ExEx client configured for endpoint: {}",
                        config.exex_endpoint
                    );
                    Some(Arc::new(AsyncMutex::new(client)))
                }
                Err(e) => {
                    warn!("Failed to create ExEx client: {}", e);
                    None
                }
            }
        } else {
            debug!("No ExEx endpoint configured, using local classifier only");
            None
        };

        Self {
            inner,
            config,
            classifier,
            exex_client,
            classified_txs: Arc::new(RwLock::new(HashMap::new())),
            execution_plans: Arc::new(RwLock::new(HashMap::new())),
            contexts: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Create with an async-connected ExEx client
    pub async fn with_connected_client(
        inner: P,
        config: AgentPoolConfig,
        classifier: Arc<dyn TransactionClassifier>,
    ) -> Self {
        let exex_client = if !config.exex_endpoint.is_empty() {
            match ExExClient::connect(&config.exex_endpoint).await {
                Ok(client) => {
                    info!("Connected to ExEx service at {}", config.exex_endpoint);
                    Some(Arc::new(AsyncMutex::new(client)))
                }
                Err(e) => {
                    warn!("Failed to connect to ExEx service: {}", e);
                    None
                }
            }
        } else {
            None
        };

        Self {
            inner,
            config,
            classifier,
            exex_client,
            classified_txs: Arc::new(RwLock::new(HashMap::new())),
            execution_plans: Arc::new(RwLock::new(HashMap::new())),
            contexts: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn classify_transaction(&self, tx: &TransactionSigned) -> ClassificationResult {
        let start = Instant::now();
        let tx_hash = tx.hash();

        if let Some(exex) = &self.exex_client {
            match tokio::time::timeout(self.config.max_classification_time, async {
                let mut client = exex.lock().await;
                client.classify_transaction(tx.clone()).await
            })
            .await
            {
                Ok(Ok(result)) => {
                    debug!(
                        "Transaction {} classified as {:?} with confidence {:.2} in {:?}",
                        tx_hash,
                        result.tx_type,
                        result.confidence,
                        start.elapsed()
                    );

                    if result.confidence >= self.config.confidence_threshold {
                        self.classified_txs.write().insert(*tx_hash, result.clone());
                        return result;
                    }
                }
                Ok(Err(e)) => {
                    warn!("ExEx classification failed for {}: {}", tx_hash, e);
                }
                Err(_) => {
                    warn!("ExEx classification timed out for {}", tx_hash);
                }
            }
        }

        // Fallback to local heuristic classifier
        let fallback_result = self.classifier.classify(tx).await;
        debug!(
            "Using fallback classifier for {}: {:?}",
            tx_hash, fallback_result.tx_type
        );
        self.classified_txs
            .write()
            .insert(*tx_hash, fallback_result.clone());
        fallback_result
    }

    pub async fn fetch_context(&self, tx: &TransactionSigned) -> Vec<TransactionContext> {
        if !self.config.enable_context_fetching {
            return Vec::new();
        }

        let tx_hash = tx.hash();

        if let Some(exex) = &self.exex_client {
            let res = {
                let mut client = exex.lock().await;
                client.fetch_context(tx.clone()).await
            };
            match res {
                Ok(contexts) => {
                    debug!(
                        "Fetched {} contexts for transaction {}",
                        contexts.len(),
                        tx_hash
                    );
                    self.contexts.write().insert(*tx_hash, contexts.clone());
                    return contexts;
                }
                Err(e) => {
                    warn!("Failed to fetch context for {}: {}", tx_hash, e);
                }
            }
        }

        Vec::new()
    }

    pub async fn create_execution_plan(
        &self,
        tx: &TransactionSigned,
        classification: &ClassificationResult,
    ) -> Option<ExecutionPlan> {
        if !matches!(
            classification.execution_path,
            ExecutionPath::HybridEvmSvm | ExecutionPath::RagEnhanced
        ) {
            return None;
        }

        let tx_hash = tx.hash();

        if let Some(exex) = &self.exex_client {
            let res = {
                let mut client = exex.lock().await;
                client
                    .create_execution_plan(tx.clone(), classification.clone())
                    .await
            };
            match res {
                Ok(plan) => {
                    info!(
                        "Created execution plan for {} with {} steps",
                        tx_hash,
                        plan.steps.len()
                    );
                    self.execution_plans.write().insert(*tx_hash, plan.clone());
                    return Some(plan);
                }
                Err(e) => {
                    error!("Failed to create execution plan for {}: {}", tx_hash, e);
                }
            }
        }

        None
    }

    pub async fn health_check(&self) -> bool {
        if let Some(exex) = &self.exex_client {
            let res = {
                let mut client = exex.lock().await;
                client.health_check().await
            };
            match res {
                Ok(healthy) => return healthy,
                Err(e) => {
                    warn!("ExEx health check failed: {}", e);
                }
            }
        }
        false
    }

    pub fn get_classification(&self, tx_hash: &B256) -> Option<ClassificationResult> {
        self.classified_txs.read().get(tx_hash).cloned()
    }

    pub fn get_execution_plan(&self, tx_hash: &B256) -> Option<ExecutionPlan> {
        self.execution_plans.read().get(tx_hash).cloned()
    }

    pub fn get_context(&self, tx_hash: &B256) -> Vec<TransactionContext> {
        self.contexts
            .read()
            .get(tx_hash)
            .cloned()
            .unwrap_or_default()
    }

    pub fn inner(&self) -> &P {
        &self.inner
    }

    pub fn config(&self) -> &AgentPoolConfig {
        &self.config
    }
}

pub struct AgentPoolBuilder {
    config: AgentPoolConfig,
    classifier: Option<Arc<dyn TransactionClassifier>>,
}

impl AgentPoolBuilder {
    pub fn new() -> Self {
        Self {
            config: AgentPoolConfig::default(),
            classifier: None,
        }
    }

    pub fn with_config(mut self, config: AgentPoolConfig) -> Self {
        self.config = config;
        self
    }

    pub fn with_classifier(mut self, classifier: Arc<dyn TransactionClassifier>) -> Self {
        self.classifier = Some(classifier);
        self
    }

    pub fn with_exex_endpoint(mut self, endpoint: String) -> Self {
        self.config.exex_endpoint = endpoint;
        self
    }

    pub fn build<P: TransactionPool>(self, inner: P) -> AgentAwarePool<P> {
        let classifier = self
            .classifier
            .unwrap_or_else(|| Arc::new(crate::classifier::HeuristicClassifier::new()));

        AgentAwarePool::new(inner, self.config, classifier)
    }

    pub async fn build_connected<P: TransactionPool>(self, inner: P) -> AgentAwarePool<P> {
        let classifier = self
            .classifier
            .unwrap_or_else(|| Arc::new(crate::classifier::HeuristicClassifier::new()));

        AgentAwarePool::with_connected_client(inner, self.config, classifier).await
    }
}

impl Default for AgentPoolBuilder {
    fn default() -> Self {
        Self::new()
    }
}
