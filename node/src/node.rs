use crate::args::MonmouthNodeArgs;
use monmouth_chain_config::MONMOUTH_CHAIN_SPEC;
use monmouth_evm::MonmouthEvmConfig;
use reth_node_api::{ConfigureEvm, EngineValidator, NodeTypesWithEngine};
use reth_node_builder::{
    components::{ComponentsBuilder, ConsensusBuilder, ExecutorBuilder, NetworkBuilder, PayloadServiceBuilder, PoolBuilder},
    BuilderContext, Node, NodeAdapter, NodeComponentsBuilder, PayloadBuilderConfig,
};
use reth_node_ethereum::{
    EthEngineTypes, EthEvmConfig, EthExecutorProvider, EthereumConsensusBuilder,
    EthereumEngineValidator, EthereumNetworkBuilder, EthereumPayloadBuilder, EthereumPoolBuilder,
};
use reth_primitives::Header;
use std::sync::Arc;

#[derive(Debug, Clone)]
pub struct MonmouthNode;

impl MonmouthNode {
    pub fn components(args: &MonmouthNodeArgs) -> MonmouthComponentsBuilder {
        MonmouthComponentsBuilder {
            args: args.clone(),
        }
    }
}

impl NodeTypesWithEngine for MonmouthNode {
    type Engine = EthEngineTypes;
}

impl Node<Self> for MonmouthNode {
    type ComponentsBuilder = MonmouthComponentsBuilder;
    type AddOns = ();

    fn components_builder(&self) -> Self::ComponentsBuilder {
        MonmouthComponentsBuilder::default()
    }

    fn add_ons(&self) -> Self::AddOns {
        ()
    }
}

#[derive(Debug, Clone, Default)]
pub struct MonmouthComponentsBuilder {
    args: MonmouthNodeArgs,
}

impl MonmouthComponentsBuilder {
    pub fn new(args: MonmouthNodeArgs) -> Self {
        Self { args }
    }
}

impl<Node> NodeComponentsBuilder<Node> for MonmouthComponentsBuilder
where
    Node: NodeTypesWithEngine<Engine = EthEngineTypes>,
{
    type Components = Components<Node>;

    async fn build_components(
        self,
        context: &BuilderContext<Node>,
    ) -> eyre::Result<Self::Components> {
        let evm_config = MonmouthEvmConfig::new(MONMOUTH_CHAIN_SPEC.clone());
        
        let pool = PoolBuilder::default().build(context)?;
        
        let network = NetworkBuilder::default().build(context, pool.clone()).await?;
        
        let executor = ExecutorBuilder::default().build(
            context,
            pool.clone(),
            evm_config.clone(),
        )?;
        
        let consensus = ConsensusBuilder::default().build(context)?;
        
        let payload_builder = PayloadServiceBuilder::default().build(
            context,
            pool.clone(),
            executor.clone(),
            consensus.clone(),
            evm_config.clone(),
        )?;

        Ok(Components {
            pool,
            network,
            executor,
            consensus,
            payload_builder,
            evm_config,
        })
    }
}

#[derive(Debug)]
pub struct Components<Node: NodeTypesWithEngine> {
    pub pool: Node::Pool,
    pub network: Node::Network,
    pub executor: Node::Executor,
    pub consensus: Node::Consensus,
    pub payload_builder: Node::PayloadBuilder,
    pub evm_config: MonmouthEvmConfig,
}