# Precompile and ExEx Implementation Research

*Generated: December 2024*

This document contains research findings from 5 specialized agents investigating implementation approaches for Monmouth's custom EVM precompiles and ExEx services.

## Table of Contents

1. [AI Inference Precompile (0x1000)](#1-ai-inference-precompile-0x1000)
2. [Vector Similarity Precompile (0x1001)](#2-vector-similarity-precompile-0x1001)
3. [Intent Parser Precompile (0x1002)](#3-intent-parser-precompile-0x1002)
4. [SVM Router Precompile (0x1003)](#4-svm-router-precompile-0x1003)
5. [ExEx Service Implementation Patterns](#5-exex-service-implementation-patterns)
6. [Implementation Priority](#6-implementation-priority)

---

## 1. AI Inference Precompile (0x1000)

### Recommended Architecture: 3-Tier Hybrid

```
┌─────────────────────────────────────────────────────────────┐
│                    AI INFERENCE PRECOMPILE                  │
├─────────────────────────────────────────────────────────────┤
│  TIER 1: Direct (< 10MB models)                             │
│  • Use `tract` crate for ONNX inference                     │
│  • Pure Rust, no external deps                              │
│  • ~70μs on ARM for small CNNs                              │
│  • Examples: MobileNet, SqueezeNet, small classifiers       │
├─────────────────────────────────────────────────────────────┤
│  TIER 2: ExEx Delegation (10MB - 1GB models)                │
│  • Optimistic ML (opML) pattern from ORA Protocol           │
│  • Submit to ExEx service, return result hash               │
│  • Fraud proof via bisection protocol                       │
│  • Dispute window: 60s - 5min                               │
│  • Examples: BERT, GPT-2, medium transformers               │
├─────────────────────────────────────────────────────────────┤
│  TIER 3: TEE Execution (> 1GB or proprietary)               │
│  • Intel TDX / AMD SEV-SNP / NVIDIA H100 TEE                │
│  • Cryptographic attestation proofs                         │
│  • Model weights remain private                             │
│  • Examples: LLaMA 7B+, Stable Diffusion, proprietary AI    │
└─────────────────────────────────────────────────────────────┘
```

### Key Libraries

| Library | Use Case | Trade-offs |
|---------|----------|------------|
| `tract-onnx` | Tier 1 direct inference | Pure Rust, 85% ONNX coverage, CPU-only |
| `ort` (ONNX Runtime) | Tier 2 with GPU | C++ deps, full ONNX support, CUDA |
| `burn` | Rust-native training + inference | Modern API, no ONNX import yet |
| EZKL | zkML proofs | Cryptographic verification, 10-100x overhead |

### Gas Cost Model (from ML2SC 2024 research)

```
Total Gas = BASE_COST + (WEIGHTS × WEIGHT_GAS) + (OPS × OP_GAS)

Where:
- BASE_COST: 50,000 - 100,000 (setup overhead)
- WEIGHT_GAS: 200-500 per parameter
- OP_GAS: 100-1,000 per operation (MAC, activation)

Example: 1000-parameter MLP
= 75,000 + (1000 × 300) + (1000 × 150) = 525,000 gas
```

### Red Flags to Avoid

1. **Don't run > 1000 params directly in EVM** - gas costs explode exponentially
2. **Don't use zkML for models > 1B params** - proving overhead is superlinear
3. **EVM lacks f32/f64** - must use fixed-point encoding
4. **Don't skip fraud proofs in opML** - or you're just trusting off-chain

### Sources

- [ORA Protocol opML Documentation](https://docs.ora.io/doc/onchain-ai-oracle-oao/fraud-proof-virtual-machine-fpvm-and-frameworks/opML)
- [Tract GitHub - Sonos/tract](https://github.com/sonos/tract)
- [ML2SC: Deploying ML Models as Smart Contracts (2024)](https://arxiv.org/html/2404.16967v1)
- [EZKL zkML Documentation](https://docs.ezkl.xyz/security/)
- [Phala: GPU TEE for Decentralized AI](https://phala.com/posts/beyond-sgx-embracing-gpu-tee-for-decentralized-ai-dagi)

---

## 2. Vector Similarity Precompile (0x1001)

### Recommended Architecture: On-Chain + Off-Chain Hybrid

```
┌─────────────────────────────────────────────────────────────┐
│                VECTOR SIMILARITY PRECOMPILE                  │
├─────────────────────────────────────────────────────────────┤
│  ON-CHAIN (small datasets < 1000 vectors)                   │
│  • SimSIMD for SIMD-optimized distance metrics              │
│  • 200x faster than naive implementation                    │
│  • Cosine, Euclidean, Dot Product                           │
│  • Direct computation in precompile                         │
├─────────────────────────────────────────────────────────────┤
│  OFF-CHAIN via ExEx (large datasets > 10k vectors)          │
│  • HNSW index using `hnsw_rs` crate                         │
│  • Approximate Nearest Neighbor (ANN) search                │
│  • Sub-millisecond queries on millions of vectors           │
│  • Returns results + Merkle proofs for verification         │
└─────────────────────────────────────────────────────────────┘
```

### HNSW Configuration (for ExEx service)

```rust
// Optimal parameters for RAG/embedding use cases
let max_connections = 16;    // M parameter (12-24 typical)
let ef_construction = 200;   // Build-time search width
let ef_search = 100;         // Query-time search width

// Creates hierarchical graph structure
// O(log N) search complexity
// 95%+ recall with proper tuning
```

### Gas Cost Formula

```
Gas = BASE(500) + (dimensions × num_vectors × 0.5) + metric_overhead

Metric Overhead:
- Cosine: 50 × num_vectors (sqrt operations)
- Euclidean: 25 × num_vectors (single sqrt)
- Dot Product: 0 (simplest)

Example: 384-dim embeddings, 100 vectors, cosine
= 500 + (384 × 100 × 0.5) + (50 × 100) = 24,700 gas
```

### Key Libraries

| Library | Use Case | Notes |
|---------|----------|-------|
| SimSIMD | On-chain SIMD metrics | AVX2/AVX-512/NEON, 200x faster |
| `hnsw_rs` | Off-chain ANN index | Production-ready, v0.3+ |
| Qdrant | Full vector DB | Rust-native, REST/gRPC API |

### Red Flags to Avoid

1. **Don't store vectors on-chain** - 10,000 384-dim vectors = ~$300k in storage gas
2. **Use deterministic SIMD** - runtime CPU detection can break consensus
3. **Don't implement HNSW from scratch** - use battle-tested libraries
4. **Validate input size** - DoS via massive dimension counts

### Sources

- [SimSIMD GitHub Repository](https://github.com/ashvardanian/SimSIMD)
- [hnsw_rs Rust Crate](https://crates.io/crates/hnsw_rs)
- [Qdrant Vector Database](https://qdrant.tech)
- [Pinecone HNSW Technical Guide](https://www.pinecone.io/learn/series/faiss/hnsw/)

---

## 3. Intent Parser Precompile (0x1002)

### Recommended Architecture: Rule-Based + ML Hybrid

```
┌─────────────────────────────────────────────────────────────┐
│                  INTENT PARSER PRECOMPILE                    │
├─────────────────────────────────────────────────────────────┤
│  TIER 1: Rule-Based (< 1ms, high confidence)                │
│  • Regex patterns for common intents                        │
│  • "swap 100 ETH for USDC" → structured SwapIntent          │
│  • "send 5 ETH to 0x..." → structured TransferIntent        │
│  • Deterministic, on-chain execution                        │
│  • Cover 10-20 most common patterns                         │
├─────────────────────────────────────────────────────────────┤
│  TIER 2: ML via ExEx (10-50ms, medium confidence)           │
│  • DistilBERT (~10MB quantized) for complex intents         │
│  • Handles paraphrasing and context                         │
│  • Returns confidence score                                 │
├─────────────────────────────────────────────────────────────┤
│  TIER 3: User Clarification (confidence < 0.7)              │
│  • Return possible interpretations                          │
│  • Request user to select correct one                       │
│  • Prevents incorrect execution of ambiguous intents        │
└─────────────────────────────────────────────────────────────┘
```

### ERC-7683 Output Format (Cross-Chain Standard)

```rust
// Standardized intent representation
struct CrossChainOrder {
    settlement_contract: Address,
    swapper: Address,
    nonce: U256,
    origin_chain_id: U256,
    initiate_deadline: u32,
    fill_deadline: u32,
    order_data: Vec<u8>,  // ABI-encoded order params
}

// Resolved order for solver execution
struct ResolvedCrossChainOrder {
    user: Address,
    max_spent: Vec<Output>,      // What user provides
    min_received: Vec<Output>,   // What user expects
    fill_instructions: Vec<FillInstruction>,
}
```

### Rule-Based Parser Patterns

```rust
lazy_static! {
    static ref SWAP_PATTERN: Regex = Regex::new(
        r"swap (\d+\.?\d*) (\w+) for (\w+)"
    ).unwrap();

    static ref TRANSFER_PATTERN: Regex = Regex::new(
        r"send (\d+\.?\d*) (\w+) to (0x[a-fA-F0-9]{40})"
    ).unwrap();

    static ref BRIDGE_PATTERN: Regex = Regex::new(
        r"bridge (\d+\.?\d*) (\w+) to (\w+)"
    ).unwrap();
}
```

### Confidence Thresholds

| Confidence | Action |
|------------|--------|
| >= 0.95 | Execute immediately (rule-based match) |
| 0.7 - 0.95 | Execute with ML result |
| < 0.7 | Request user clarification |

### Gas Cost Model

```
Gas = INPUT_VALIDATION(3,000) + RULE_PARSING(10,000) + [ExEx_CALL(50,000-100,000)]

Simple rule-based: 13,000 gas
Complex ML-based: 108,000 gas
```

### Red Flags to Avoid

1. **Don't run LLMs in precompile** - impossible, would cost billions of gas
2. **Limit intent length** - max 512 chars to prevent DoS
3. **Validate extracted addresses** - check against blocklists
4. **Don't trust low-confidence results** - can drain user funds

### Sources

- [ERC-7683: Cross Chain Intents Standard](https://eips.ethereum.org/EIPS/eip-7683)
- [Essential's Intent Definition](https://blog.essential.builders/a-slightly-more-formal-definition-of-intents/)
- [CoW Protocol Intents](https://docs.cow.fi/cow-protocol/concepts/introduction/intents)
- [Intent Detection in the Age of LLMs (2024)](https://arxiv.org/html/2410.01627v1)

---

## 4. SVM Router Precompile (0x1003)

### Recommended Architecture: Phased Implementation

```
┌─────────────────────────────────────────────────────────────┐
│                   SVM ROUTER PRECOMPILE                      │
├─────────────────────────────────────────────────────────────┤
│  PHASE 1: Remote Execution (2-4 weeks)                      │
│  • Thin gRPC client in precompile                           │
│  • Delegate to ExEx service running SVM                     │
│  • Minimal security risk, immediate functionality           │
├─────────────────────────────────────────────────────────────┤
│  PHASE 2: Embedded SVM (6-10 weeks)                         │
│  • Integrate `solana-svm` crate v3.0+                       │
│  • TransactionBatchProcessor as primary interface           │
│  • Whitelist of pre-deployed programs                       │
│  • Account state mapping via PDAs                           │
├─────────────────────────────────────────────────────────────┤
│  PHASE 3: Full Integration (8-12 weeks)                     │
│  • Dynamic program loading                                  │
│  • Cross-Program Invocation (CPI) support                   │
│  • Program Derived Addresses (PDAs)                         │
│  • Performance optimization                                 │
└─────────────────────────────────────────────────────────────┘
```

### EVM <-> SVM Fundamental Differences

| Aspect | EVM | SVM |
|--------|-----|-----|
| State model | Contract stores its own state | Programs are stateless, state in separate accounts |
| Code mutability | Immutable | Upgradeable via BPFLoaderUpgradeable |
| Account size | Unlimited (via SSTORE) | 10MB per account max |
| Tx account limit | No limit | 64 accounts per transaction |
| Compute unit | Gas | Compute Units (CU) |
| Default limit | 30M gas/block | 200,000 CU/tx (1.4M max) |

### Gas <-> Compute Unit Translation

```rust
// Conservative ratio: 1 EVM gas ≈ 10 Solana CU
const GAS_TO_CU_RATIO: u64 = 10;
const MAX_COMPUTE_UNITS: u64 = 1_400_000;

fn translate_gas_to_cu(evm_gas: u64) -> u64 {
    evm_gas
        .saturating_mul(GAS_TO_CU_RATIO)
        .min(MAX_COMPUTE_UNITS)
}

fn translate_cu_to_gas(compute_units: u64) -> u64 {
    const CROSS_VM_OVERHEAD: u64 = 5000;
    (compute_units / GAS_TO_CU_RATIO) + CROSS_VM_OVERHEAD
}
```

### Account Derivation (EVM -> SVM)

```rust
// Derive Solana account from EVM address
fn derive_svm_account(evm_address: Address, program_id: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[b"evm_account", evm_address.as_bytes()],
        program_id,
    ).0
}

// Must pre-declare all accounts (Solana requirement)
struct SvmRouterInput {
    pub program_id: Bytes,           // 32-byte Solana program ID
    pub instruction_data: Bytes,      // Serialized instruction
    pub accounts: Vec<SvmAccount>,    // Pre-derived account list (max 64)
}
```

### Security Measures

```rust
pub struct SvmExecutionLimits {
    max_compute_units: u64,      // Cap at 1.4M CU
    max_account_data_size: u64,  // Cap at 10MB
    max_accounts: usize,          // Cap at 64
    max_call_depth: u8,           // SVM CPI depth = 4
    timeout: Duration,            // Hard timeout (5 seconds)
}
```

### Red Flags to Avoid

1. **Don't share memory between VMs** - incompatible models, security risk
2. **Pre-declare all accounts** - Solana requires this for parallel execution
3. **Handle BPF verifier overhead** - first load can take 50-200ms
4. **10MB account limit** - don't assume EVM's unlimited storage
5. **CPI depth limit = 4** - track call depth to prevent failures

### Sources

- [Helius: What is the Solana Virtual Machine (SVM)?](https://www.helius.dev/blog/solana-virtual-machine)
- [Anza's New SVM API](https://www.anza.xyz/blog/anzas-new-svm-api)
- [Solana EVM to SVM Guide](https://solana.com/developers/evm-to-svm/accounts)
- [Neon EVM Architecture Documentation](https://neonevm.org/docs/architecture/eth_sol_solution)

---

## 5. ExEx Service Implementation Patterns

### Current Stub Methods (need implementation)

| Method | Current State | Recommended Implementation |
|--------|--------------|---------------------------|
| `classify_transaction` | Returns hardcoded "StandardEvm" | GNN-based classifier with feature engineering |
| `fetch_context` | Returns empty contexts | Vector DB (Qdrant) for RAG retrieval |
| `create_execution_plan` | Returns empty plan | DAG builder from parsed intent |

### Proposed Proto Extensions

```protobuf
// Add to exex-host/proto/exex.proto

// Vector Store Service
rpc SearchVectors(VectorSearchRequest) returns (VectorSearchResponse);
rpc IndexVectors(VectorIndexRequest) returns (VectorIndexResponse);

message VectorSearchRequest {
    repeated float query = 1;
    uint32 top_k = 2;
    uint32 collection_id = 3;
    float threshold = 4;
    string metric = 5; // "cosine", "euclidean", "dot"
}

message VectorSearchResponse {
    repeated VectorSearchResult results = 1;
    bytes merkle_proof = 2;  // For on-chain verification
}

// AI Inference Service
rpc RunInference(InferenceRequest) returns (InferenceResponse);

message InferenceRequest {
    uint32 model_id = 1;
    bytes input_data = 2;
    uint32 max_tokens = 3;
    uint32 temperature = 4;
}

message InferenceResponse {
    bytes output_data = 1;
    uint64 compute_units_used = 2;
    bytes execution_hash = 3;  // For fraud proofs
    bytes signature = 4;       // Validator signature
}

// SVM Execution Service
rpc ExecuteSvm(SvmExecuteRequest) returns (SvmExecuteResponse);

message SvmExecuteRequest {
    bytes program_id = 1;
    bytes instruction_data = 2;
    repeated SvmAccountMeta accounts = 3;
    uint64 compute_units = 4;
}

message SvmExecuteResponse {
    bool success = 1;
    bytes output = 2;
    uint64 compute_units_used = 3;
    string error = 4;
}

// Intent Parsing Service
rpc ParseIntent(IntentRequest) returns (ParsedIntent);

message IntentRequest {
    string raw_intent = 1;
    string context = 2;
    uint32 max_steps = 3;
}

message ParsedIntent {
    repeated ExecutionStep steps = 1;
    double confidence = 2;
    repeated string ambiguities = 3;
}
```

### Recommended Dependencies for ExEx

```toml
[dependencies]
# Vector similarity
hnsw_rs = "0.3"
simsimd = "6.0"

# ML inference
tract-onnx = "0.22"
ort = "2.0"  # ONNX Runtime with GPU

# SVM execution
solana-svm = "3.0"
solana-program-runtime = "3.0"

# gRPC
tonic = "0.12"
prost = "0.13"

# Storage
rocksdb = "0.22"
```

---

## 6. Implementation Priority

| Priority | Precompile | Complexity | Value | Status |
|----------|-----------|------------|-------|--------|
| 1 | **Vector Similarity** | Medium | High (enables RAG) | Implemented |
| 2 | **Intent Parser** | Medium | High (enables NL interface) | Stub |
| 3 | **AI Inference** | High | Medium (depends on use case) | Stub |
| 4 | **SVM Router** | Very High | Medium (cross-chain niche) | Stub |

### Recommended Starting Point

Vector Similarity (0x1001) is now implemented with on-chain computation. Next step is ExEx integration for large-scale HNSW indexing.

---

## Appendix: Implementation Complete

### Vector Similarity Precompile (0x1001) - IMPLEMENTED

Location: `evm/src/precompiles.rs:90-346`

Features:
- 3 distance metrics (cosine, euclidean, dot product)
- Top-k selection with threshold filtering
- Gas model: `BASE(1000) + dimensions × vectors × 2 + metric_overhead`
- Input validation (max 4096 dimensions, 1000 candidates)
- 13 comprehensive unit tests (all passing)

Types added to `primitives/src/precompiles.rs`:
- `SimilarityMetric` enum
- `VectorSimilarityInput` (enhanced)
- `VectorSimilarityResult`
- `VectorSimilarityOutput`
