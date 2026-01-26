use alloy_primitives::Address;
use monmouth_primitives::{
    L2MessageInput, L2MessageOutput, MessageQueue, L2_MESSAGE_PASSER_PRECOMPILE,
    SVM_ROUTER_PRECOMPILE,
};
use once_cell::sync::Lazy;
use revm_primitives::{
    Bytes as RevmBytes, Precompile, PrecompileErrors, PrecompileOutput, PrecompileResult,
};
use std::collections::HashMap;
use tracing::{debug, warn};

// =============================================================================
// MONMOUTH PRECOMPILES
// =============================================================================
// Note: AI/ML operations (inference, vector search, intent parsing) happen
// OFF-CHAIN via LLM API calls and tool use. On-chain ML is not feasible -
// even local MLX setups are slow, putting ML into blockchain consensus is
// impractical. The blockchain is for settlement and verification only.
//
// Active precompiles:
// - 0x1003: SVM Router - Cross-chain Solana VM execution
// - 0x4200: L2 Message Passer - L1↔L2 bridging
// =============================================================================

/// Global message queue for L2 messages
/// Shared across all precompile invocations
static MESSAGE_QUEUE: Lazy<MessageQueue> = Lazy::new(MessageQueue::new);

#[derive(Clone)]
pub struct MonmouthPrecompileSet {
    precompiles: HashMap<Address, Precompile>,
}

impl Default for MonmouthPrecompileSet {
    fn default() -> Self {
        Self::new()
    }
}

impl MonmouthPrecompileSet {
    pub fn new() -> Self {
        let mut precompiles = HashMap::new();

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

pub struct SvmRouterPrecompile;

impl SvmRouterPrecompile {
    pub fn run(input: &RevmBytes, gas_limit: u64) -> PrecompileResult {
        debug!("SVM Router precompile called with {} bytes", input.len());

        const BASE_GAS: u64 = 100_000;
        const GAS_PER_INSTRUCTION: u64 = 1000;

        let instructions = input.len() / 32;
        let gas_used = BASE_GAS + (instructions as u64 * GAS_PER_INSTRUCTION);

        if gas_used > gas_limit {
            return Err(PrecompileErrors::Error(
                revm_primitives::precompile::PrecompileError::OutOfGas,
            ));
        }

        let output = RevmBytes::from(vec![0x03; 32]);

        Ok(PrecompileOutput::new(gas_used, output))
    }
}

pub struct L2MessagePasserPrecompile;

impl L2MessagePasserPrecompile {
    pub fn run(input: &RevmBytes, gas_limit: u64) -> PrecompileResult {
        debug!(
            "L2 Message Passer precompile called with {} bytes",
            input.len()
        );

        // Gas constants
        const BASE_GAS: u64 = 25_000;
        const GAS_PER_BYTE: u64 = 16;
        const GAS_FOR_STORAGE: u64 = 20_000; // Additional gas for message storage

        // Calculate minimum gas needed
        let gas_for_data = input.len() as u64 * GAS_PER_BYTE;
        let total_gas = BASE_GAS + gas_for_data + GAS_FOR_STORAGE;

        if total_gas > gas_limit {
            return Err(PrecompileErrors::Error(
                revm_primitives::precompile::PrecompileError::OutOfGas,
            ));
        }

        // Parse input as JSON-encoded L2MessageInput
        let message_input: L2MessageInput = match serde_json::from_slice(input) {
            Ok(input) => input,
            Err(e) => {
                warn!("Failed to parse L2MessageInput: {}", e);
                // Return error encoded as bytes
                let output = Self::encode_error("Invalid input format");
                return Ok(PrecompileOutput::new(BASE_GAS, output));
            }
        };

        // Enqueue the message
        let result = match MESSAGE_QUEUE.enqueue(message_input.message) {
            Ok(message_hash) => {
                debug!("L2 message enqueued with hash: {:?}", message_hash);
                L2MessageOutput {
                    success: true,
                    message_hash: message_hash.to_vec().into(),
                    error: None,
                }
            }
            Err(e) => {
                warn!("Failed to enqueue L2 message: {}", e);
                L2MessageOutput {
                    success: false,
                    message_hash: vec![0u8; 32].into(),
                    error: Some(e),
                }
            }
        };

        // Encode output as JSON
        let output_bytes = match serde_json::to_vec(&result) {
            Ok(bytes) => RevmBytes::from(bytes),
            Err(e) => {
                warn!("Failed to encode L2MessageOutput: {}", e);
                Self::encode_error("Failed to encode output")
            }
        };

        Ok(PrecompileOutput::new(total_gas, output_bytes))
    }

    /// Helper to encode error messages
    fn encode_error(msg: &str) -> RevmBytes {
        let error_output = L2MessageOutput {
            success: false,
            message_hash: vec![0u8; 32].into(),
            error: Some(msg.to_string()),
        };

        serde_json::to_vec(&error_output)
            .map(RevmBytes::from)
            .unwrap_or_else(|_| RevmBytes::from(vec![0u8; 32]))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloy_primitives::{Address, Bytes, U256};
    use monmouth_primitives::{L2Message, L2MessageInput, L2MessageType};

    fn create_test_message(nonce: u64) -> L2MessageInput {
        L2MessageInput {
            message: L2Message {
                msg_type: L2MessageType::Withdrawal,
                sender: Address::from([1u8; 20]),
                recipient: Address::from([2u8; 20]),
                value: U256::from(1000),
                data: Bytes::from(vec![1, 2, 3, 4]),
                nonce,
                timestamp: 123456,
            },
            signature: None,
        }
    }

    #[test]
    fn test_l2_message_passer_success() {
        let message_input = create_test_message(1);
        let input_bytes = serde_json::to_vec(&message_input).unwrap();
        let input = RevmBytes::from(input_bytes);

        let result = L2MessagePasserPrecompile::run(&input, 1_000_000);
        assert!(result.is_ok());

        let output = result.unwrap();
        assert!(output.gas_used > 0);

        let output_data: L2MessageOutput = serde_json::from_slice(&output.bytes).unwrap();
        assert!(output_data.success);
        assert!(output_data.error.is_none());
        assert_ne!(output_data.message_hash, Bytes::from(vec![0u8; 32]));
    }

    #[test]
    fn test_l2_message_passer_duplicate() {
        let message_input = create_test_message(2);
        let input_bytes = serde_json::to_vec(&message_input).unwrap();
        let input = RevmBytes::from(input_bytes.clone());

        // First call should succeed
        let result1 = L2MessagePasserPrecompile::run(&input, 1_000_000);
        assert!(result1.is_ok());

        // Second call with same message should fail
        let result2 = L2MessagePasserPrecompile::run(&RevmBytes::from(input_bytes), 1_000_000);
        assert!(result2.is_ok()); // Still returns Ok, but with error in output

        let output = result2.unwrap();
        let output_data: L2MessageOutput = serde_json::from_slice(&output.bytes).unwrap();
        assert!(!output_data.success);
        assert!(output_data.error.is_some());
        assert_eq!(output_data.error.unwrap(), "Message already processed");
    }

    #[test]
    fn test_l2_message_passer_invalid_input() {
        let invalid_input = RevmBytes::from(vec![0xff, 0xff, 0xff]); // Invalid JSON

        let result = L2MessagePasserPrecompile::run(&invalid_input, 1_000_000);
        assert!(result.is_ok()); // Returns Ok but with error in output

        let output = result.unwrap();
        let output_data: L2MessageOutput = serde_json::from_slice(&output.bytes).unwrap();
        assert!(!output_data.success);
        assert_eq!(output_data.error, Some("Invalid input format".to_string()));
    }

    #[test]
    fn test_l2_message_passer_out_of_gas() {
        let message_input = create_test_message(3);
        let input_bytes = serde_json::to_vec(&message_input).unwrap();
        let input = RevmBytes::from(input_bytes);

        // Provide insufficient gas
        let result = L2MessagePasserPrecompile::run(&input, 1000);
        assert!(result.is_err());
    }

    #[test]
    fn test_l2_message_passer_different_message_types() {
        // Test deposit message
        let mut deposit_msg = create_test_message(4);
        deposit_msg.message.msg_type = L2MessageType::Deposit;
        let input = RevmBytes::from(serde_json::to_vec(&deposit_msg).unwrap());

        let result = L2MessagePasserPrecompile::run(&input, 1_000_000);
        assert!(result.is_ok());

        let output = result.unwrap();
        let output_data: L2MessageOutput = serde_json::from_slice(&output.bytes).unwrap();
        assert!(output_data.success);

        // Test state root message
        let mut state_root_msg = create_test_message(5);
        state_root_msg.message.msg_type = L2MessageType::StateRoot;
        let input = RevmBytes::from(serde_json::to_vec(&state_root_msg).unwrap());

        let result = L2MessagePasserPrecompile::run(&input, 1_000_000);
        assert!(result.is_ok());

        let output = result.unwrap();
        let output_data: L2MessageOutput = serde_json::from_slice(&output.bytes).unwrap();
        assert!(output_data.success);
    }

    #[test]
    fn test_gas_calculation() {
        let message_input = create_test_message(6);
        let input_bytes = serde_json::to_vec(&message_input).unwrap();
        let input = RevmBytes::from(input_bytes.clone());

        let result = L2MessagePasserPrecompile::run(&input, 1_000_000).unwrap();

        // Gas should be: BASE_GAS (25_000) + (input_len * GAS_PER_BYTE (16)) + GAS_FOR_STORAGE (20_000)
        let expected_gas = 25_000 + (input_bytes.len() as u64 * 16) + 20_000;
        assert_eq!(result.gas_used, expected_gas);
    }
}
