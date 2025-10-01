use std::sync::Arc;
use alloy_primitives::Address;
use monmouth_chain_config::MONMOUTH_CHAIN_SPEC;
use reth_chainspec::ChainSpec;
use reth_evm::{ConfigureEngineEvm, EvmEnvFor, ExecutionCtxFor, ExecutableTxIterator};
use reth_evm_ethereum::EthEvmConfig;
use reth_node_api::ConfigureEvm;
use revm_primitives::Precompile;
use std::collections::HashMap;

use crate::precompiles::MonmouthPrecompileSet;

/// Monmouth EVM configuration that extends Ethereum's EVM config
/// with custom precompiles for AI/ML operations
#[derive(Debug, Clone)]
pub struct MonmouthEvmConfig {
    /// Base Ethereum EVM configuration
    inner: EthEvmConfig,
    /// Custom precompiles for Monmouth
    precompiles: Arc<HashMap<Address, Precompile>>,
}

impl MonmouthEvmConfig {
    /// Create a new Monmouth EVM config with custom precompiles
    pub fn new(chain_spec: Arc<ChainSpec>) -> Self {
        let inner = EthEvmConfig::new(chain_spec);
        let precompile_set = MonmouthPrecompileSet::new();
        let precompiles = Arc::new(precompile_set.get_precompiles());

        Self {
            inner,
            precompiles,
        }
    }

    /// Create Monmouth config using the default chain spec
    pub fn default_monmouth() -> Self {
        Self::new(MONMOUTH_CHAIN_SPEC.clone())
    }

    /// Get the custom precompiles map
    pub fn precompiles(&self) -> &HashMap<Address, Precompile> {
        &self.precompiles
    }
}

// Delegate ConfigureEvm implementation to the inner EthEvmConfig
impl ConfigureEvm for MonmouthEvmConfig {
    type Primitives = <EthEvmConfig as ConfigureEvm>::Primitives;
    type Error = <EthEvmConfig as ConfigureEvm>::Error;
    type NextBlockEnvCtx = <EthEvmConfig as ConfigureEvm>::NextBlockEnvCtx;
    type BlockExecutorFactory = <EthEvmConfig as ConfigureEvm>::BlockExecutorFactory;
    type BlockAssembler = <EthEvmConfig as ConfigureEvm>::BlockAssembler;

    fn block_executor_factory(&self) -> &Self::BlockExecutorFactory {
        self.inner.block_executor_factory()
    }

    fn block_assembler(&self) -> &Self::BlockAssembler {
        self.inner.block_assembler()
    }

    fn evm_env(
        &self,
        header: &<<Self as ConfigureEvm>::Primitives as reth_primitives_traits::NodePrimitives>::BlockHeader,
    ) -> reth_evm::env::EvmEnv<<<<Self as ConfigureEvm>::BlockExecutorFactory as reth_evm::block::BlockExecutorFactory>::EvmFactory as reth_evm::evm::EvmFactory>::Spec> {
        self.inner.evm_env(header)
    }

    fn next_evm_env(
        &self,
        parent: &<<Self as ConfigureEvm>::Primitives as reth_primitives_traits::NodePrimitives>::BlockHeader,
        attributes: &<Self as ConfigureEvm>::NextBlockEnvCtx,
    ) -> Result<reth_evm::env::EvmEnv<<<<Self as ConfigureEvm>::BlockExecutorFactory as reth_evm::block::BlockExecutorFactory>::EvmFactory as reth_evm::evm::EvmFactory>::Spec>, <Self as ConfigureEvm>::Error> {
        self.inner.next_evm_env(parent, attributes)
    }

    fn context_for_block<'a>(
        &self,
        block: &'a reth_primitives::SealedBlock<<<Self as ConfigureEvm>::Primitives as reth_primitives_traits::NodePrimitives>::Block>,
    ) -> <<Self as ConfigureEvm>::BlockExecutorFactory as reth_evm::block::BlockExecutorFactory>::ExecutionCtx<'a> {
        self.inner.context_for_block(block)
    }

    fn context_for_next_block(
        &self,
        parent: &reth_primitives::SealedHeader<<<Self as ConfigureEvm>::Primitives as reth_primitives_traits::NodePrimitives>::BlockHeader>,
        attributes: <Self as ConfigureEvm>::NextBlockEnvCtx,
    ) -> <<Self as ConfigureEvm>::BlockExecutorFactory as reth_evm::block::BlockExecutorFactory>::ExecutionCtx<'_> {
        self.inner.context_for_next_block(parent, attributes)
    }
}

// Delegate ConfigureEngineEvm implementation to the inner EthEvmConfig
impl<ExecutionData> ConfigureEngineEvm<ExecutionData> for MonmouthEvmConfig
where
    EthEvmConfig: ConfigureEngineEvm<ExecutionData>,
{
    fn evm_env_for_payload(&self, payload: &ExecutionData) -> EvmEnvFor<Self> {
        self.inner.evm_env_for_payload(payload)
    }

    fn context_for_payload<'a>(&self, payload: &'a ExecutionData) -> ExecutionCtxFor<'a, Self> {
        self.inner.context_for_payload(payload)
    }

    fn tx_iterator_for_payload(&self, payload: &ExecutionData) -> impl ExecutableTxIterator<Self> {
        self.inner.tx_iterator_for_payload(payload)
    }
}