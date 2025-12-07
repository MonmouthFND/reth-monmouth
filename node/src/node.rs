use monmouth_chain_config::MONMOUTH_CHAIN_SPEC;
use monmouth_evm::MonmouthEvmConfig;
use reth_chainspec::{ChainSpec, EthChainSpec, EthereumHardforks, Hardforks};
use reth_ethereum_engine_primitives::{
    EthBuiltPayload, EthEngineTypes, EthPayloadAttributes, EthPayloadBuilderAttributes,
};
use reth_ethereum_primitives::EthPrimitives;
use reth_evm::eth::spec::EthExecutorSpec;
use reth_node_builder::{
    components::{BasicPayloadServiceBuilder, ComponentsBuilder, ExecutorBuilder},
    node::{FullNodeTypes, NodeTypes},
    BuilderContext, Node, NodeAdapter,
};
use reth_node_ethereum::{
    EthereumAddOns, EthereumConsensusBuilder, EthereumEngineValidatorBuilder,
    EthereumEthApiBuilder, EthereumNetworkBuilder, EthereumPayloadBuilder, EthereumPoolBuilder,
};
use reth_payload_primitives::PayloadTypes;
use reth_provider::EthStorage;

/// Monmouth L2 node type configuration
#[derive(Debug, Default, Clone, Copy)]
#[non_exhaustive]
pub struct MonmouthNode;

impl MonmouthNode {
    /// Returns a [`ComponentsBuilder`] configured for Monmouth L2 node
    pub fn components<Node>() -> ComponentsBuilder<
        Node,
        EthereumPoolBuilder,
        BasicPayloadServiceBuilder<EthereumPayloadBuilder>,
        EthereumNetworkBuilder,
        MonmouthExecutorBuilder,
        EthereumConsensusBuilder,
    >
    where
        Node: FullNodeTypes<
            Types: NodeTypes<
                ChainSpec: Hardforks + EthChainSpec + EthereumHardforks + EthExecutorSpec,
                Primitives = EthPrimitives,
            >,
        >,
        <Node::Types as NodeTypes>::Payload: PayloadTypes<
            BuiltPayload = EthBuiltPayload,
            PayloadAttributes = EthPayloadAttributes,
            PayloadBuilderAttributes = EthPayloadBuilderAttributes,
        >,
    {
        ComponentsBuilder::default()
            .node_types::<Node>()
            .pool(EthereumPoolBuilder::default())
            .executor(MonmouthExecutorBuilder::default())
            .payload(BasicPayloadServiceBuilder::default())
            .network(EthereumNetworkBuilder::default())
            .consensus(EthereumConsensusBuilder::default())
    }
}

impl NodeTypes for MonmouthNode {
    type Primitives = EthPrimitives;
    type ChainSpec = ChainSpec;
    type Storage = EthStorage;
    type Payload = EthEngineTypes;
}

impl<N> Node<N> for MonmouthNode
where
    N: FullNodeTypes<Types = Self>,
{
    type ComponentsBuilder = ComponentsBuilder<
        N,
        EthereumPoolBuilder,
        BasicPayloadServiceBuilder<EthereumPayloadBuilder>,
        EthereumNetworkBuilder,
        MonmouthExecutorBuilder,
        EthereumConsensusBuilder,
    >;

    type AddOns =
        EthereumAddOns<NodeAdapter<N>, EthereumEthApiBuilder, EthereumEngineValidatorBuilder>;

    fn components_builder(&self) -> Self::ComponentsBuilder {
        Self::components()
    }

    fn add_ons(&self) -> Self::AddOns {
        EthereumAddOns::default()
    }
}

/// Monmouth executor builder that uses custom EVM config
#[derive(Debug, Default, Clone, Copy)]
#[non_exhaustive]
pub struct MonmouthExecutorBuilder;

impl<Types, Node> ExecutorBuilder<Node> for MonmouthExecutorBuilder
where
    Types: NodeTypes<
        ChainSpec: Hardforks + EthChainSpec + EthereumHardforks + EthExecutorSpec,
        Primitives = EthPrimitives,
    >,
    Node: FullNodeTypes<Types = Types>,
{
    type EVM = MonmouthEvmConfig;

    async fn build_evm(self, _ctx: &BuilderContext<Node>) -> eyre::Result<Self::EVM> {
        let evm_config = MonmouthEvmConfig::new(MONMOUTH_CHAIN_SPEC.clone());
        Ok(evm_config)
    }
}
