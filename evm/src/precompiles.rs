use alloy_primitives::{Address, Bytes, B256, U256};
use monmouth_primitives::{
    AI_INFERENCE_PRECOMPILE, INTENT_PARSER_PRECOMPILE, L2_MESSAGE_PASSER_PRECOMPILE,
    SVM_ROUTER_PRECOMPILE, VECTOR_SIMILARITY_PRECOMPILE,
};
use revm_primitives::{Precompile, PrecompileError, PrecompileOutput, PrecompileResult};
use std::collections::HashMap;
use tracing::debug;

#[derive(Clone)]
pub struct MonmouthPrecompileSet {
    precompiles: HashMap<Address, Box<dyn Precompile>>,
}

impl MonmouthPrecompileSet {
    pub fn new() -> Self {
        let mut precompiles = HashMap::new();
        
        precompiles.insert(
            AI_INFERENCE_PRECOMPILE,
            Box::new(AiInferencePrecompile) as Box<dyn Precompile>,
        );
        
        precompiles.insert(
            VECTOR_SIMILARITY_PRECOMPILE,
            Box::new(VectorSimilarityPrecompile) as Box<dyn Precompile>,
        );
        
        precompiles.insert(
            INTENT_PARSER_PRECOMPILE,
            Box::new(IntentParserPrecompile) as Box<dyn Precompile>,
        );
        
        precompiles.insert(
            SVM_ROUTER_PRECOMPILE,
            Box::new(SvmRouterPrecompile) as Box<dyn Precompile>,
        );
        
        precompiles.insert(
            L2_MESSAGE_PASSER_PRECOMPILE,
            Box::new(L2MessagePasserPrecompile) as Box<dyn Precompile>,
        );
        
        Self { precompiles }
    }

    pub fn get(&self, address: &Address) -> Option<&Box<dyn Precompile>> {
        self.precompiles.get(address)
    }
}

pub struct AiInferencePrecompile;

impl Precompile for AiInferencePrecompile {
    fn call(&mut self, input: &Bytes, gas_limit: u64) -> PrecompileResult {
        debug!("AI Inference precompile called with {} bytes", input.len());
        
        const BASE_GAS: u64 = 50_000;
        const GAS_PER_BYTE: u64 = 100;
        
        let gas_used = BASE_GAS + (input.len() as u64 * GAS_PER_BYTE);
        
        if gas_used > gas_limit {
            return Err(PrecompileError::OutOfGas);
        }
        
        let output = Bytes::from(vec![0x01; 32]);
        
        Ok(PrecompileOutput {
            bytes: output,
            gas_used,
        })
    }
}

impl Clone for AiInferencePrecompile {
    fn clone(&self) -> Self {
        Self
    }
}

pub struct VectorSimilarityPrecompile;

impl Precompile for VectorSimilarityPrecompile {
    fn call(&mut self, input: &Bytes, gas_limit: u64) -> PrecompileResult {
        debug!("Vector Similarity precompile called with {} bytes", input.len());
        
        const BASE_GAS: u64 = 30_000;
        const GAS_PER_DIMENSION: u64 = 500;
        
        let dimensions = input.len() / 4;
        let gas_used = BASE_GAS + (dimensions as u64 * GAS_PER_DIMENSION);
        
        if gas_used > gas_limit {
            return Err(PrecompileError::OutOfGas);
        }
        
        let output = Bytes::from(vec![0x00; 32]);
        
        Ok(PrecompileOutput {
            bytes: output,
            gas_used,
        })
    }
}

impl Clone for VectorSimilarityPrecompile {
    fn clone(&self) -> Self {
        Self
    }
}

pub struct IntentParserPrecompile;

impl Precompile for IntentParserPrecompile {
    fn call(&mut self, input: &Bytes, gas_limit: u64) -> PrecompileResult {
        debug!("Intent Parser precompile called with {} bytes", input.len());
        
        const BASE_GAS: u64 = 40_000;
        const GAS_PER_CHAR: u64 = 50;
        
        let gas_used = BASE_GAS + (input.len() as u64 * GAS_PER_CHAR);
        
        if gas_used > gas_limit {
            return Err(PrecompileError::OutOfGas);
        }
        
        let output = Bytes::from(vec![0x02; 64]);
        
        Ok(PrecompileOutput {
            bytes: output,
            gas_used,
        })
    }
}

impl Clone for IntentParserPrecompile {
    fn clone(&self) -> Self {
        Self
    }
}

pub struct SvmRouterPrecompile;

impl Precompile for SvmRouterPrecompile {
    fn call(&mut self, input: &Bytes, gas_limit: u64) -> PrecompileResult {
        debug!("SVM Router precompile called with {} bytes", input.len());
        
        const BASE_GAS: u64 = 100_000;
        const GAS_PER_INSTRUCTION: u64 = 1000;
        
        let instructions = input.len() / 32;
        let gas_used = BASE_GAS + (instructions as u64 * GAS_PER_INSTRUCTION);
        
        if gas_used > gas_limit {
            return Err(PrecompileError::OutOfGas);
        }
        
        let output = Bytes::from(vec![0x03; 32]);
        
        Ok(PrecompileOutput {
            bytes: output,
            gas_used,
        })
    }
}

impl Clone for SvmRouterPrecompile {
    fn clone(&self) -> Self {
        Self
    }
}

pub struct L2MessagePasserPrecompile;

impl Precompile for L2MessagePasserPrecompile {
    fn call(&mut self, input: &Bytes, gas_limit: u64) -> PrecompileResult {
        debug!("L2 Message Passer precompile called with {} bytes", input.len());
        
        const BASE_GAS: u64 = 25_000;
        const GAS_PER_BYTE: u64 = 16;
        
        let gas_used = BASE_GAS + (input.len() as u64 * GAS_PER_BYTE);
        
        if gas_used > gas_limit {
            return Err(PrecompileError::OutOfGas);
        }
        
        let mut output = vec![0x00; 32];
        output[31] = 0x01;
        
        Ok(PrecompileOutput {
            bytes: Bytes::from(output),
            gas_used,
        })
    }
}

impl Clone for L2MessagePasserPrecompile {
    fn clone(&self) -> Self {
        Self
    }
}