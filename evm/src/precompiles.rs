use alloy_primitives::Address;
use monmouth_primitives::{
    L2MessageInput, L2MessageOutput, MessageQueue, SimilarityMetric, VectorSimilarityInput,
    VectorSimilarityOutput, VectorSimilarityResult, AI_INFERENCE_PRECOMPILE,
    INTENT_PARSER_PRECOMPILE, L2_MESSAGE_PASSER_PRECOMPILE, SVM_ROUTER_PRECOMPILE,
    VECTOR_SIMILARITY_PRECOMPILE,
};
use once_cell::sync::Lazy;
use revm_primitives::{
    Bytes as RevmBytes, Precompile, PrecompileErrors, PrecompileOutput, PrecompileResult,
};
use std::collections::HashMap;
use tracing::{debug, warn};

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
            return Err(PrecompileErrors::Error(
                revm_primitives::precompile::PrecompileError::OutOfGas,
            ));
        }

        let output = RevmBytes::from(vec![0x01; 32]);

        Ok(PrecompileOutput::new(gas_used, output))
    }
}

/// Vector Similarity Precompile (0x1001)
///
/// Computes similarity between a query vector and candidate vectors using
/// various distance metrics (cosine, euclidean, dot product).
///
/// # Input Format
/// JSON-encoded VectorSimilarityInput:
/// - query_vector: Vec<f32> - The query vector
/// - candidate_vectors: Option<Vec<Vec<f32>>> - Vectors to compare against
/// - collection_id: Option<u32> - For ExEx-based vector store (future)
/// - top_k: u32 - Number of top results to return
/// - threshold: f32 - Minimum similarity threshold
/// - metric: SimilarityMetric - Cosine, Euclidean, or DotProduct
///
/// # Output Format
/// JSON-encoded VectorSimilarityOutput with top-k results
///
/// # Gas Model
/// BASE_GAS + (dimensions * num_vectors * GAS_PER_OP)
///
/// # Determinism
/// All floating-point operations use f64 intermediates and round to 6 decimal
/// places to ensure consensus across heterogeneous hardware (Intel, AMD, ARM).
/// Sorting uses deterministic tie-breaking by index.
pub struct VectorSimilarityPrecompile;

impl VectorSimilarityPrecompile {
    /// Base gas cost for precompile invocation
    const BASE_GAS: u64 = 1_000;
    /// Gas per dimension per vector comparison
    const GAS_PER_DIMENSION: u64 = 2;
    /// Additional gas for metric-specific overhead
    const COSINE_OVERHEAD: u64 = 50; // sqrt operations
    const EUCLIDEAN_OVERHEAD: u64 = 25; // single sqrt
    /// Maximum supported dimensions (prevent DoS)
    const MAX_DIMENSIONS: usize = 4096;
    /// Maximum number of candidate vectors
    const MAX_CANDIDATES: usize = 1000;
    /// Precision multiplier for deterministic rounding (6 decimal places)
    const PRECISION_MULTIPLIER: f64 = 1_000_000.0;

    pub fn run(input: &RevmBytes, gas_limit: u64) -> PrecompileResult {
        debug!(
            "Vector Similarity precompile called with {} bytes",
            input.len()
        );

        // Parse input as JSON-encoded VectorSimilarityInput
        let sim_input: VectorSimilarityInput = match serde_json::from_slice(input) {
            Ok(input) => input,
            Err(e) => {
                warn!("Failed to parse VectorSimilarityInput: {}", e);
                return Ok(PrecompileOutput::new(
                    Self::BASE_GAS,
                    Self::encode_error("Invalid input format"),
                ));
            }
        };

        // Validate input
        if let Err(output) = Self::validate_input(&sim_input) {
            return Ok(PrecompileOutput::new(Self::BASE_GAS, output));
        }

        // Get candidate vectors (or return error if collection_id is used - not yet supported)
        let candidates = match &sim_input.candidate_vectors {
            Some(vecs) => vecs.clone(),
            None => {
                // Collection-based lookup would go through ExEx service
                // For now, return an error as this requires ExEx integration
                return Ok(PrecompileOutput::new(
                    Self::BASE_GAS,
                    Self::encode_error("Collection-based lookup not yet supported. Provide candidate_vectors."),
                ));
            }
        };

        // Calculate gas cost
        let gas_used = Self::calculate_gas(
            sim_input.query_vector.len(),
            candidates.len(),
            sim_input.metric,
        );

        if gas_used > gas_limit {
            return Err(PrecompileErrors::Error(
                revm_primitives::precompile::PrecompileError::OutOfGas,
            ));
        }

        // Compute similarities
        let mut results: Vec<VectorSimilarityResult> = candidates
            .iter()
            .enumerate()
            .filter_map(|(idx, candidate)| {
                // Skip vectors with mismatched dimensions
                if candidate.len() != sim_input.query_vector.len() {
                    return None;
                }

                let score = Self::compute_similarity(
                    &sim_input.query_vector,
                    candidate,
                    sim_input.metric,
                );

                // Apply threshold filter
                let passes_threshold = match sim_input.metric {
                    SimilarityMetric::Cosine | SimilarityMetric::DotProduct => {
                        score >= sim_input.threshold
                    }
                    SimilarityMetric::Euclidean => {
                        // For distance, lower is better
                        score <= sim_input.threshold
                    }
                };

                if passes_threshold {
                    Some(VectorSimilarityResult {
                        index: idx as u32,
                        score,
                    })
                } else {
                    None
                }
            })
            .collect();

        // Sort results deterministically (descending for similarity, ascending for distance)
        // Use tie-breaking by index to ensure consistent ordering across all nodes
        match sim_input.metric {
            SimilarityMetric::Cosine | SimilarityMetric::DotProduct => {
                results.sort_by(|a, b| {
                    // Convert to integer for deterministic comparison (scores already rounded)
                    let a_int = (a.score * Self::PRECISION_MULTIPLIER as f32) as i64;
                    let b_int = (b.score * Self::PRECISION_MULTIPLIER as f32) as i64;
                    // Descending by score, then ascending by index for tie-breaking
                    b_int.cmp(&a_int).then(a.index.cmp(&b.index))
                });
            }
            SimilarityMetric::Euclidean => {
                results.sort_by(|a, b| {
                    // Convert to integer for deterministic comparison
                    let a_int = (a.score * Self::PRECISION_MULTIPLIER as f32) as i64;
                    let b_int = (b.score * Self::PRECISION_MULTIPLIER as f32) as i64;
                    // Ascending by distance, then ascending by index for tie-breaking
                    a_int.cmp(&b_int).then(a.index.cmp(&b.index))
                });
            }
        }

        // Truncate to top_k
        results.truncate(sim_input.top_k as usize);

        // Build output
        let output = VectorSimilarityOutput {
            success: true,
            results,
            error: None,
            gas_used,
        };

        let output_bytes = match serde_json::to_vec(&output) {
            Ok(bytes) => RevmBytes::from(bytes),
            Err(e) => {
                warn!("Failed to encode VectorSimilarityOutput: {}", e);
                Self::encode_error("Failed to encode output")
            }
        };

        Ok(PrecompileOutput::new(gas_used, output_bytes))
    }

    /// Validate input parameters
    fn validate_input(input: &VectorSimilarityInput) -> Result<(), RevmBytes> {
        // Check query vector dimensions
        if input.query_vector.is_empty() {
            return Err(Self::encode_error("Query vector cannot be empty"));
        }
        if input.query_vector.len() > Self::MAX_DIMENSIONS {
            return Err(Self::encode_error(&format!(
                "Query vector exceeds maximum dimensions ({})",
                Self::MAX_DIMENSIONS
            )));
        }

        // Check candidate vectors
        if let Some(candidates) = &input.candidate_vectors {
            if candidates.is_empty() {
                return Err(Self::encode_error("Candidate vectors cannot be empty"));
            }
            if candidates.len() > Self::MAX_CANDIDATES {
                return Err(Self::encode_error(&format!(
                    "Too many candidate vectors (max {})",
                    Self::MAX_CANDIDATES
                )));
            }
        }

        // Check top_k is reasonable
        if input.top_k == 0 {
            return Err(Self::encode_error("top_k must be at least 1"));
        }

        // Check threshold is valid
        if !input.threshold.is_finite() {
            return Err(Self::encode_error("Threshold must be a finite number"));
        }

        Ok(())
    }

    /// Calculate gas cost based on input parameters
    fn calculate_gas(dimensions: usize, num_vectors: usize, metric: SimilarityMetric) -> u64 {
        let base = Self::BASE_GAS;
        let dimension_cost = (dimensions as u64) * (num_vectors as u64) * Self::GAS_PER_DIMENSION;

        let metric_overhead = match metric {
            SimilarityMetric::Cosine => Self::COSINE_OVERHEAD * (num_vectors as u64),
            SimilarityMetric::Euclidean => Self::EUCLIDEAN_OVERHEAD * (num_vectors as u64),
            SimilarityMetric::DotProduct => 0,
        };

        base + dimension_cost + metric_overhead
    }

    /// Compute similarity/distance between two vectors
    /// All computations use f64 intermediates and round to 6 decimal places
    /// for deterministic results across different CPU architectures.
    fn compute_similarity(a: &[f32], b: &[f32], metric: SimilarityMetric) -> f32 {
        match metric {
            SimilarityMetric::Cosine => Self::cosine_similarity(a, b),
            SimilarityMetric::Euclidean => Self::euclidean_distance(a, b),
            SimilarityMetric::DotProduct => Self::dot_product(a, b),
        }
    }

    /// Round a f64 value to 6 decimal places for deterministic consensus
    #[inline]
    fn round_to_precision(value: f64) -> f32 {
        ((value * Self::PRECISION_MULTIPLIER).round() / Self::PRECISION_MULTIPLIER) as f32
    }

    /// Cosine similarity: dot(a,b) / (||a|| * ||b||)
    /// Returns value in range [-1, 1], where 1 = identical direction
    /// Uses f64 intermediates for precision, rounds output for determinism
    fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
        // Use f64 for intermediate calculations to reduce floating-point errors
        let dot: f64 = a.iter().zip(b.iter()).map(|(x, y)| (*x as f64) * (*y as f64)).sum();
        let norm_a: f64 = a.iter().map(|x| (*x as f64) * (*x as f64)).sum::<f64>().sqrt();
        let norm_b: f64 = b.iter().map(|x| (*x as f64) * (*x as f64)).sum::<f64>().sqrt();

        if norm_a == 0.0 || norm_b == 0.0 {
            return 0.0;
        }

        let result = dot / (norm_a * norm_b);
        Self::round_to_precision(result)
    }

    /// Euclidean distance: sqrt(sum((a[i] - b[i])^2))
    /// Returns value >= 0, where 0 = identical
    /// Uses f64 intermediates for precision, rounds output for determinism
    fn euclidean_distance(a: &[f32], b: &[f32]) -> f32 {
        let sum_sq: f64 = a.iter()
            .zip(b.iter())
            .map(|(x, y)| {
                let diff = (*x as f64) - (*y as f64);
                diff * diff
            })
            .sum();

        Self::round_to_precision(sum_sq.sqrt())
    }

    /// Dot product: sum(a[i] * b[i])
    /// Uses f64 intermediates for precision, rounds output for determinism
    fn dot_product(a: &[f32], b: &[f32]) -> f32 {
        let result: f64 = a.iter().zip(b.iter()).map(|(x, y)| (*x as f64) * (*y as f64)).sum();
        Self::round_to_precision(result)
    }

    /// Helper to encode error messages
    fn encode_error(msg: &str) -> RevmBytes {
        let error_output = VectorSimilarityOutput {
            success: false,
            results: vec![],
            error: Some(msg.to_string()),
            gas_used: Self::BASE_GAS,
        };

        serde_json::to_vec(&error_output)
            .map(RevmBytes::from)
            .unwrap_or_else(|_| RevmBytes::from(vec![0u8; 32]))
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
            return Err(PrecompileErrors::Error(
                revm_primitives::precompile::PrecompileError::OutOfGas,
            ));
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
    use monmouth_primitives::{L2Message, L2MessageInput, L2MessageType, SimilarityMetric, VectorSimilarityInput};

    // ==================== Vector Similarity Tests ====================

    fn create_vector_input(
        query: Vec<f32>,
        candidates: Vec<Vec<f32>>,
        metric: SimilarityMetric,
        top_k: u32,
        threshold: f32,
    ) -> VectorSimilarityInput {
        VectorSimilarityInput {
            query_vector: query,
            candidate_vectors: Some(candidates),
            collection_id: None,
            top_k,
            threshold,
            metric,
        }
    }

    #[test]
    fn test_vector_similarity_cosine_basic() {
        // Query vector: [1, 0, 0]
        // Candidates: [1, 0, 0] (identical), [0, 1, 0] (orthogonal), [0.707, 0.707, 0] (45 degrees)
        let input = create_vector_input(
            vec![1.0, 0.0, 0.0],
            vec![
                vec![1.0, 0.0, 0.0],   // cosine = 1.0
                vec![0.0, 1.0, 0.0],   // cosine = 0.0
                vec![0.707, 0.707, 0.0], // cosine ≈ 0.707
            ],
            SimilarityMetric::Cosine,
            3,
            -1.0, // Accept all
        );

        let input_bytes = RevmBytes::from(serde_json::to_vec(&input).unwrap());
        let result = VectorSimilarityPrecompile::run(&input_bytes, 1_000_000);

        assert!(result.is_ok());
        let output = result.unwrap();
        let parsed: VectorSimilarityOutput = serde_json::from_slice(&output.bytes).unwrap();

        assert!(parsed.success);
        assert_eq!(parsed.results.len(), 3);
        // Results should be sorted by similarity (descending)
        assert_eq!(parsed.results[0].index, 0); // cosine = 1.0
        assert!((parsed.results[0].score - 1.0).abs() < 0.001);
        assert_eq!(parsed.results[1].index, 2); // cosine ≈ 0.707
        assert!((parsed.results[1].score - 0.707).abs() < 0.01);
        assert_eq!(parsed.results[2].index, 1); // cosine = 0.0
    }

    #[test]
    fn test_vector_similarity_euclidean_basic() {
        // Query vector: [0, 0, 0]
        // Candidates: [1, 0, 0] (distance = 1), [3, 4, 0] (distance = 5), [0, 0, 0] (distance = 0)
        let input = create_vector_input(
            vec![0.0, 0.0, 0.0],
            vec![
                vec![1.0, 0.0, 0.0],   // distance = 1
                vec![3.0, 4.0, 0.0],   // distance = 5
                vec![0.0, 0.0, 0.0],   // distance = 0
            ],
            SimilarityMetric::Euclidean,
            3,
            10.0, // Accept all within distance 10
        );

        let input_bytes = RevmBytes::from(serde_json::to_vec(&input).unwrap());
        let result = VectorSimilarityPrecompile::run(&input_bytes, 1_000_000);

        assert!(result.is_ok());
        let output = result.unwrap();
        let parsed: VectorSimilarityOutput = serde_json::from_slice(&output.bytes).unwrap();

        assert!(parsed.success);
        assert_eq!(parsed.results.len(), 3);
        // Results should be sorted by distance (ascending)
        assert_eq!(parsed.results[0].index, 2); // distance = 0
        assert!((parsed.results[0].score - 0.0).abs() < 0.001);
        assert_eq!(parsed.results[1].index, 0); // distance = 1
        assert!((parsed.results[1].score - 1.0).abs() < 0.001);
        assert_eq!(parsed.results[2].index, 1); // distance = 5
        assert!((parsed.results[2].score - 5.0).abs() < 0.001);
    }

    #[test]
    fn test_vector_similarity_dot_product() {
        // Query vector: [1, 2, 3]
        // Candidates to compute dot product
        let input = create_vector_input(
            vec![1.0, 2.0, 3.0],
            vec![
                vec![1.0, 1.0, 1.0],   // dot = 1 + 2 + 3 = 6
                vec![2.0, 2.0, 2.0],   // dot = 2 + 4 + 6 = 12
                vec![0.0, 0.0, 0.0],   // dot = 0
            ],
            SimilarityMetric::DotProduct,
            3,
            -100.0, // Accept all
        );

        let input_bytes = RevmBytes::from(serde_json::to_vec(&input).unwrap());
        let result = VectorSimilarityPrecompile::run(&input_bytes, 1_000_000);

        assert!(result.is_ok());
        let output = result.unwrap();
        let parsed: VectorSimilarityOutput = serde_json::from_slice(&output.bytes).unwrap();

        assert!(parsed.success);
        assert_eq!(parsed.results.len(), 3);
        // Results should be sorted by dot product (descending)
        assert_eq!(parsed.results[0].index, 1); // dot = 12
        assert_eq!(parsed.results[1].index, 0); // dot = 6
        assert_eq!(parsed.results[2].index, 2); // dot = 0
    }

    #[test]
    fn test_vector_similarity_threshold_filter() {
        let input = create_vector_input(
            vec![1.0, 0.0, 0.0],
            vec![
                vec![1.0, 0.0, 0.0],   // cosine = 1.0
                vec![0.0, 1.0, 0.0],   // cosine = 0.0
                vec![0.707, 0.707, 0.0], // cosine ≈ 0.707
            ],
            SimilarityMetric::Cosine,
            10,
            0.5, // Only accept cosine >= 0.5
        );

        let input_bytes = RevmBytes::from(serde_json::to_vec(&input).unwrap());
        let result = VectorSimilarityPrecompile::run(&input_bytes, 1_000_000);

        assert!(result.is_ok());
        let output = result.unwrap();
        let parsed: VectorSimilarityOutput = serde_json::from_slice(&output.bytes).unwrap();

        assert!(parsed.success);
        // Only vectors 0 and 2 should pass threshold
        assert_eq!(parsed.results.len(), 2);
        assert_eq!(parsed.results[0].index, 0); // cosine = 1.0
        assert_eq!(parsed.results[1].index, 2); // cosine ≈ 0.707
    }

    #[test]
    fn test_vector_similarity_top_k_limit() {
        let input = create_vector_input(
            vec![1.0, 0.0],
            vec![
                vec![1.0, 0.0],
                vec![0.9, 0.1],
                vec![0.8, 0.2],
                vec![0.7, 0.3],
            ],
            SimilarityMetric::Cosine,
            2, // Only return top 2
            -1.0,
        );

        let input_bytes = RevmBytes::from(serde_json::to_vec(&input).unwrap());
        let result = VectorSimilarityPrecompile::run(&input_bytes, 1_000_000);

        assert!(result.is_ok());
        let output = result.unwrap();
        let parsed: VectorSimilarityOutput = serde_json::from_slice(&output.bytes).unwrap();

        assert!(parsed.success);
        assert_eq!(parsed.results.len(), 2);
    }

    #[test]
    fn test_vector_similarity_empty_query() {
        let input = VectorSimilarityInput {
            query_vector: vec![],
            candidate_vectors: Some(vec![vec![1.0, 0.0]]),
            collection_id: None,
            top_k: 1,
            threshold: 0.0,
            metric: SimilarityMetric::Cosine,
        };

        let input_bytes = RevmBytes::from(serde_json::to_vec(&input).unwrap());
        let result = VectorSimilarityPrecompile::run(&input_bytes, 1_000_000);

        assert!(result.is_ok());
        let output = result.unwrap();
        let parsed: VectorSimilarityOutput = serde_json::from_slice(&output.bytes).unwrap();

        assert!(!parsed.success);
        assert!(parsed.error.is_some());
        assert!(parsed.error.unwrap().contains("cannot be empty"));
    }

    #[test]
    fn test_vector_similarity_dimension_mismatch() {
        // Query is 3D, one candidate is 2D
        let input = create_vector_input(
            vec![1.0, 0.0, 0.0],
            vec![
                vec![1.0, 0.0, 0.0],   // 3D - matches
                vec![1.0, 0.0],        // 2D - mismatched, should be skipped
            ],
            SimilarityMetric::Cosine,
            10,
            -1.0,
        );

        let input_bytes = RevmBytes::from(serde_json::to_vec(&input).unwrap());
        let result = VectorSimilarityPrecompile::run(&input_bytes, 1_000_000);

        assert!(result.is_ok());
        let output = result.unwrap();
        let parsed: VectorSimilarityOutput = serde_json::from_slice(&output.bytes).unwrap();

        assert!(parsed.success);
        // Only the matching dimension vector should be in results
        assert_eq!(parsed.results.len(), 1);
        assert_eq!(parsed.results[0].index, 0);
    }

    #[test]
    fn test_vector_similarity_gas_calculation() {
        // 384 dimensions, 10 vectors, cosine
        let gas = VectorSimilarityPrecompile::calculate_gas(384, 10, SimilarityMetric::Cosine);

        // BASE (1000) + (384 * 10 * 2) + (50 * 10) = 1000 + 7680 + 500 = 9180
        assert_eq!(gas, 9180);

        // Euclidean should have lower overhead
        let gas_euc = VectorSimilarityPrecompile::calculate_gas(384, 10, SimilarityMetric::Euclidean);
        // BASE (1000) + (384 * 10 * 2) + (25 * 10) = 1000 + 7680 + 250 = 8930
        assert_eq!(gas_euc, 8930);

        // Dot product has no overhead
        let gas_dot = VectorSimilarityPrecompile::calculate_gas(384, 10, SimilarityMetric::DotProduct);
        // BASE (1000) + (384 * 10 * 2) + 0 = 1000 + 7680 = 8680
        assert_eq!(gas_dot, 8680);
    }

    #[test]
    fn test_vector_similarity_out_of_gas() {
        let input = create_vector_input(
            vec![1.0; 1000],
            vec![vec![1.0; 1000]; 100],
            SimilarityMetric::Cosine,
            10,
            0.0,
        );

        let input_bytes = RevmBytes::from(serde_json::to_vec(&input).unwrap());
        // Provide very little gas
        let result = VectorSimilarityPrecompile::run(&input_bytes, 100);

        assert!(result.is_err());
    }

    #[test]
    fn test_vector_similarity_high_dimensional() {
        // Test with 384-dimensional vectors (common for embeddings)
        let query = vec![0.1; 384];
        let candidates = vec![
            vec![0.1; 384], // identical
            vec![0.2; 384], // similar
            vec![-0.1; 384], // opposite
        ];

        let input = create_vector_input(
            query,
            candidates,
            SimilarityMetric::Cosine,
            3,
            -1.0,
        );

        let input_bytes = RevmBytes::from(serde_json::to_vec(&input).unwrap());
        let result = VectorSimilarityPrecompile::run(&input_bytes, 1_000_000);

        assert!(result.is_ok());
        let output = result.unwrap();
        let parsed: VectorSimilarityOutput = serde_json::from_slice(&output.bytes).unwrap();

        assert!(parsed.success);
        assert_eq!(parsed.results.len(), 3);
        // Identical should be first with cosine = 1.0
        assert_eq!(parsed.results[0].index, 0);
        assert!((parsed.results[0].score - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_vector_similarity_zero_vector() {
        // Zero vector should return 0 similarity
        let input = create_vector_input(
            vec![0.0, 0.0, 0.0],
            vec![vec![1.0, 0.0, 0.0]],
            SimilarityMetric::Cosine,
            1,
            -1.0,
        );

        let input_bytes = RevmBytes::from(serde_json::to_vec(&input).unwrap());
        let result = VectorSimilarityPrecompile::run(&input_bytes, 1_000_000);

        assert!(result.is_ok());
        let output = result.unwrap();
        let parsed: VectorSimilarityOutput = serde_json::from_slice(&output.bytes).unwrap();

        assert!(parsed.success);
        assert_eq!(parsed.results[0].score, 0.0);
    }

    #[test]
    fn test_vector_similarity_determinism() {
        // This test verifies that scores are rounded to 6 decimal places
        // ensuring deterministic results across different CPU architectures.

        // Create vectors that would produce non-terminating decimals
        let input = create_vector_input(
            vec![1.0, 2.0, 3.0],
            vec![
                vec![1.1, 2.1, 3.1],  // Slightly different
                vec![1.0, 2.0, 3.0],  // Identical (should be exactly 1.0)
            ],
            SimilarityMetric::Cosine,
            2,
            -1.0,
        );

        let input_bytes = RevmBytes::from(serde_json::to_vec(&input).unwrap());

        // Run multiple times - results should be identical
        let result1 = VectorSimilarityPrecompile::run(&input_bytes, 1_000_000).unwrap();
        let result2 = VectorSimilarityPrecompile::run(&input_bytes, 1_000_000).unwrap();

        let parsed1: VectorSimilarityOutput = serde_json::from_slice(&result1.bytes).unwrap();
        let parsed2: VectorSimilarityOutput = serde_json::from_slice(&result2.bytes).unwrap();

        // Verify exact equality (determinism)
        assert_eq!(parsed1.results.len(), parsed2.results.len());
        for (r1, r2) in parsed1.results.iter().zip(parsed2.results.iter()) {
            assert_eq!(r1.index, r2.index, "Index mismatch - non-deterministic sorting");
            assert_eq!(r1.score, r2.score, "Score mismatch - non-deterministic calculation");
        }

        // Verify identical vectors produce exactly 1.0
        let identical_result = parsed1.results.iter().find(|r| r.index == 1).unwrap();
        assert_eq!(identical_result.score, 1.0, "Identical vectors should have cosine similarity of exactly 1.0");

        // Verify scores are rounded (6 decimal places means 7 significant digits max)
        for result in &parsed1.results {
            let score_str = format!("{:.7}", result.score);
            let decimal_places = score_str.split('.').nth(1).map(|s| s.trim_end_matches('0').len()).unwrap_or(0);
            assert!(decimal_places <= 6, "Score {} has more than 6 decimal places", result.score);
        }
    }

    #[test]
    fn test_vector_similarity_deterministic_sorting() {
        // Test that sorting is deterministic with tie-breaking by index
        let input = create_vector_input(
            vec![1.0, 0.0],
            vec![
                vec![1.0, 0.0],  // score = 1.0, index = 0
                vec![1.0, 0.0],  // score = 1.0, index = 1 (tie)
                vec![1.0, 0.0],  // score = 1.0, index = 2 (tie)
            ],
            SimilarityMetric::Cosine,
            3,
            -1.0,
        );

        let input_bytes = RevmBytes::from(serde_json::to_vec(&input).unwrap());
        let result = VectorSimilarityPrecompile::run(&input_bytes, 1_000_000).unwrap();
        let parsed: VectorSimilarityOutput = serde_json::from_slice(&result.bytes).unwrap();

        // All scores are equal, so order should be by index (ascending)
        assert_eq!(parsed.results[0].index, 0);
        assert_eq!(parsed.results[1].index, 1);
        assert_eq!(parsed.results[2].index, 2);
    }

    // ==================== L2 Message Passer Tests ====================

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
