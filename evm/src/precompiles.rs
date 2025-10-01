use alloy_primitives::Address;
use monmouth_primitives::{
    AI_INFERENCE_PRECOMPILE, INTENT_PARSER_PRECOMPILE, L2_MESSAGE_PASSER_PRECOMPILE,
    SVM_ROUTER_PRECOMPILE, VECTOR_SIMILARITY_PRECOMPILE,
};
use revm_primitives::{Bytes as RevmBytes, Precompile, PrecompileOutput, PrecompileErrors, PrecompileResult};
use std::collections::HashMap;
use tracing::debug;

#[derive(Clone)]
pub struct MonmouthPrecompileSet {
    precompiles: HashMap<Address, Precompile>,
}

impl MonmouthPrecompileSet {
    pub fn new() -> Self {
        let mut precompiles = HashMap::new();

        precompiles.insert(
            AI_INFERENCE_PRECOMPILE,
            Precompile::Standard(AiInferencePrecompile::run as _),
        );

        precompiles.insert(
            VECTOR_SIMILARITY_PRECOMPILE,
            Precompile::Standard(VectorSimilarityPrecompile::run as _),
        );

        precompiles.insert(
            INTENT_PARSER_PRECOMPILE,
            Precompile::Standard(IntentParserPrecompile::run as _),
        );

        precompiles.insert(
            SVM_ROUTER_PRECOMPILE,
            Precompile::Standard(SvmRouterPrecompile::run as _),
        );

        precompiles.insert(
            L2_MESSAGE_PASSER_PRECOMPILE,
            Precompile::Standard(L2MessagePasserPrecompile::run as _),
        );

        Self { precompiles }
    }

    pub fn get_precompiles(&self) -> HashMap<Address, Precompile> {
        self.precompiles.clone()
    }
}

pub struct AiInferencePrecompile;

impl AiInferencePrecompile {
    pub fn run(input: &RevmBytes, gas_limit: u64) -> PrecompileResult {
        debug!("AI Inference precompile called with {} bytes", input.len());

        const BASE_GAS: u64 = 50_000;
        const GAS_PER_BYTE: u64 = 100;

        let gas_used = BASE_GAS + (input.len() as u64 * GAS_PER_BYTE);

        if gas_used > gas_limit {
            return Err(PrecompileErrors::Error(revm_primitives::precompile::PrecompileError::OutOfGas));
        }

        let output = RevmBytes::from(vec![0x01; 32]);

        Ok(PrecompileOutput::new(gas_used, output))
    }
}

pub struct VectorSimilarityPrecompile;

impl VectorSimilarityPrecompile {
    pub fn run(input: &RevmBytes, gas_limit: u64) -> PrecompileResult {
        debug!("Vector Similarity precompile called with {} bytes", input.len());

        const BASE_GAS: u64 = 30_000;
        const GAS_PER_DIMENSION: u64 = 500;

        let dimensions = input.len() / 4;
        let gas_used = BASE_GAS + (dimensions as u64 * GAS_PER_DIMENSION);

        if gas_used > gas_limit {
            return Err(PrecompileErrors::Error(revm_primitives::precompile::PrecompileError::OutOfGas));
        }

        let output = RevmBytes::from(vec![0x00; 32]);

        Ok(PrecompileOutput::new(gas_used, output))
    }
}

pub struct IntentParserPrecompile;

impl IntentParserPrecompile {
    pub fn run(input: &RevmBytes, gas_limit: u64) -> PrecompileResult {
        debug!("Intent Parser precompile called with {} bytes", input.len());

        const BASE_GAS: u64 = 40_000;
        const GAS_PER_CHAR: u64 = 50;

        let gas_used = BASE_GAS + (input.len() as u64 * GAS_PER_CHAR);

        if gas_used > gas_limit {
            return Err(PrecompileErrors::Error(revm_primitives::precompile::PrecompileError::OutOfGas));
        }

        let output = RevmBytes::from(vec![0x02; 64]);

        Ok(PrecompileOutput::new(gas_used, output))
    }
}

pub struct SvmRouterPrecompile;

impl SvmRouterPrecompile {
    pub fn run(input: &RevmBytes, gas_limit: u64) -> PrecompileResult {
        debug!("SVM Router precompile called with {} bytes", input.len());

        const BASE_GAS: u64 = 100_000;
        const GAS_PER_INSTRUCTION: u64 = 1000;

        let instructions = input.len() / 32;
        let gas_used = BASE_GAS + (instructions as u64 * GAS_PER_INSTRUCTION);

        if gas_used > gas_limit {
            return Err(PrecompileErrors::Error(revm_primitives::precompile::PrecompileError::OutOfGas));
        }

        let output = RevmBytes::from(vec![0x03; 32]);

        Ok(PrecompileOutput::new(gas_used, output))
    }
}

pub struct L2MessagePasserPrecompile;

impl L2MessagePasserPrecompile {
    pub fn run(input: &RevmBytes, gas_limit: u64) -> PrecompileResult {
        debug!("L2 Message Passer precompile called with {} bytes", input.len());

        const BASE_GAS: u64 = 25_000;
        const GAS_PER_BYTE: u64 = 16;

        let gas_used = BASE_GAS + (input.len() as u64 * GAS_PER_BYTE);

        if gas_used > gas_limit {
            return Err(PrecompileErrors::Error(revm_primitives::precompile::PrecompileError::OutOfGas));
        }

        let mut output = vec![0x00; 32];
        output[31] = 0x01;

        Ok(PrecompileOutput::new(gas_used, RevmBytes::from(output)))
    }
}