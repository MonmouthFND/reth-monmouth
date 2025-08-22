use alloy_primitives::{Address, Bytes, B256, U256};
use monmouth_chain_config::MONMOUTH_CHAIN_SPEC;
use monmouth_primitives::MIN_BASE_FEE_PER_GAS;
use reth_chainspec::ChainSpec;
use reth_evm::{ConfigureEvm, ConfigureEvmEnv};
use reth_primitives::{Header, TransactionSigned};
use reth_revm::{Database, Evm, EvmBuilder};
use revm_primitives::{
    AnalysisKind, BlobExcessGasAndPrice, BlockEnv, CfgEnv, CfgEnvWithHandlerCfg,
    Env, EnvWithHandlerCfg, SpecId, TxEnv,
};
use std::sync::Arc;

use crate::precompiles::MonmouthPrecompileSet;

#[derive(Debug, Clone)]
pub struct MonmouthEvmConfig {
    chain_spec: Arc<ChainSpec>,
}

impl MonmouthEvmConfig {
    pub fn new(chain_spec: Arc<ChainSpec>) -> Self {
        Self { chain_spec }
    }

    pub fn default_monmouth() -> Self {
        Self::new(MONMOUTH_CHAIN_SPEC.clone())
    }
}

impl ConfigureEvm for MonmouthEvmConfig {
    type DefaultExternalContext<'a> = ();

    fn evm<'a, DB: Database + 'a>(&self, db: DB) -> Evm<'a, (), DB> {
        let spec_id = SpecId::PRAGUE;
        
        EvmBuilder::default()
            .with_db(db)
            .with_spec_id(spec_id)
            .append_handler_register(|handler| {
                let precompiles = MonmouthPrecompileSet::new();
                handler.pre_execution.load_precompiles = Arc::new(move || precompiles.clone());
            })
            .build()
    }

    fn evm_with_env<'a, DB: Database + 'a>(
        &self,
        db: DB,
        env: EnvWithHandlerCfg,
    ) -> Evm<'a, (), DB> {
        let mut evm = self.evm(db);
        evm.context.evm.env = env.env;
        evm
    }

    fn evm_with_env_and_inspector<'a, DB, I>(
        &self,
        db: DB,
        env: EnvWithHandlerCfg,
        inspector: I,
    ) -> Evm<'a, I, DB>
    where
        DB: Database + 'a,
        I: reth_revm::inspector::Inspector<DB>,
    {
        EvmBuilder::default()
            .with_db(db)
            .with_external_context(inspector)
            .with_env_with_handler_cfg(env)
            .append_handler_register(|handler| {
                let precompiles = MonmouthPrecompileSet::new();
                handler.pre_execution.load_precompiles = Arc::new(move || precompiles.clone());
            })
            .build()
    }
}

impl ConfigureEvmEnv for MonmouthEvmConfig {
    fn fill_tx_env(&self, tx_env: &mut TxEnv, transaction: &TransactionSigned, sender: Address) {
        tx_env.caller = sender;
        tx_env.gas_limit = transaction.gas_limit();
        tx_env.gas_price = U256::from(transaction.max_fee_per_gas());
        tx_env.gas_priority_fee = transaction.max_priority_fee_per_gas().map(U256::from);
        tx_env.transact_to = transaction.to().into();
        tx_env.value = transaction.value();
        tx_env.data = transaction.input().clone();
        tx_env.chain_id = Some(self.chain_spec.chain.id());
        tx_env.nonce = Some(transaction.nonce());
        tx_env.access_list = transaction.access_list().cloned().map(Into::into).unwrap_or_default();
        tx_env.blob_hashes = transaction.blob_hashes().to_vec();
        tx_env.max_fee_per_blob_gas = transaction.max_fee_per_blob_gas().map(Into::into);
    }

    fn fill_cfg_env(
        &self,
        cfg_env: &mut CfgEnvWithHandlerCfg,
        header: &Header,
        total_difficulty: U256,
    ) {
        cfg_env.chain_id = self.chain_spec.chain.id();
        cfg_env.perf_analyse_created_bytecodes = AnalysisKind::default();
        cfg_env.limit_contract_code_size = Some(0x6000);
        cfg_env.memory_limit = 2_usize.pow(32) - 1;
        cfg_env.disable_balance_check = false;
        cfg_env.disable_block_gas_limit = false;
        cfg_env.disable_eip3607 = false;
        cfg_env.disable_gas_refund = false;
        cfg_env.disable_base_fee = false;
        cfg_env.disable_beneficiary_reward = false;
    }

    fn fill_block_env(&self, block_env: &mut BlockEnv, header: &Header, after_merge: bool) {
        block_env.number = U256::from(header.number);
        block_env.coinbase = header.beneficiary;
        block_env.timestamp = U256::from(header.timestamp);
        block_env.gas_limit = U256::from(header.gas_limit);
        block_env.basefee = U256::from(header.base_fee_per_gas.unwrap_or(1_000_000_000));
        block_env.difficulty = U256::ZERO;
        block_env.prevrandao = Some(header.mix_hash);
        block_env.blob_excess_gas_and_price = header.excess_blob_gas.map(|excess| {
            BlobExcessGasAndPrice::new(excess)
        });
    }
}