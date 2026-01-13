# Building AI-Native Blockchain Precompiles: Architecture Deep Dive

*A comprehensive guide to implementing AI inference, vector similarity, intent parsing, and cross-VM execution in an EVM-compatible L2*

---

## Introduction

As blockchain technology evolves beyond simple token transfers, there's growing demand for on-chain AI capabilities. But how do you run machine learning models, semantic search, or natural language processing in a deterministic, gas-metered environment designed for simple arithmetic?

This guide explores the architecture decisions, trade-offs, and best practices for building four AI-native precompiles:

1. **AI Inference (0x1000)** - Run ML models with verifiable results
2. **Vector Similarity (0x1001)** - Semantic search for RAG and embeddings
3. **Intent Parser (0x1002)** - Natural language to structured transactions
4. **SVM Router (0x1003)** - Execute Solana programs from EVM

Each precompile faces unique challenges around determinism, gas pricing, and security. Let's dive in.

---

## The Determinism Problem

Before exploring each precompile, we need to address the elephant in the room: **blockchain consensus requires deterministic execution**. Every node must produce identical results for the same input.

This is trivial for integer arithmetic but becomes challenging when dealing with:

- **Floating-point operations** - IEEE 754 doesn't guarantee identical results across Intel, AMD, and ARM processors
- **ML inference** - GPUs are non-deterministic; model outputs can vary
- **Natural language** - Ambiguity is inherent in human language
- **External state** - Solana's clock differs from EVM's block timestamp

**The solution pattern we'll use throughout:**

```
On-chain: Deterministic verification/computation
Off-chain: Complex processing via ExEx services
Bridge: Structured, verifiable outputs
```

---

## 1. AI Inference Precompile (0x1000)

### The Challenge

Running a neural network on-chain seems straightforward until you consider:

- A ResNet-50 requires ~4 billion floating-point operations per inference
- EVM gas limits cap at 30M per block
- Floating-point math isn't deterministic across CPU architectures
- Model weights for GPT-2 alone exceed 500MB

**Pure on-chain inference for models >10K parameters is impractical.**

### Architecture Options

| Approach | How It Works | Latency | Trust Model | Cost |
|----------|--------------|---------|-------------|------|
| **TEE (Intel SGX)** | Run inference in secure enclave, verify attestation on-chain | ~100ms | Hardware | Low |
| **zkML (EZKL/Giza)** | Generate zero-knowledge proof of correct inference | 10s-10min | Mathematical | $1-10/inference |
| **Optimistic** | Assume correctness, allow fraud proofs | ~100ms | Economic | Low |
| **On-chain Quantized** | Run tiny INT8 models directly in EVM | <10ms | Full | High gas |

### Recommended Architecture

**Phase 1: TEE-Based Inference**

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Smart Contract │────▶│  AI Precompile   │────▶│  ExEx Service   │
│   (caller)       │     │  (0x1000)        │     │  (SGX Enclave)  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │                         │
                               │  Verify SGX Quote       │  Run ONNX Model
                               │  Check enclave hash     │  Return result + attestation
                               ▼                         ▼
                        ┌──────────────────────────────────┐
                        │  Return verified inference result │
                        └──────────────────────────────────┘
```

The precompile:
1. Receives model ID and input tensor
2. Forwards to ExEx service running in Intel SGX
3. Verifies the SGX attestation quote
4. Returns the inference result

**Phase 2: Add zkML for High-Security Use Cases**

For DeFi applications where millions of dollars depend on model outputs, add optional zkML verification:

```rust
pub enum VerificationMethod {
    Tee(TeeAttestation),      // Fast, hardware trust
    ZkProof(ZkProofData),     // Slow, mathematical trust
}
```

Users can choose their trust/latency trade-off.

### Gas Model

```rust
const BASE_GAS: u64 = 50_000;
const FLOPS_PER_GAS_UNIT: u64 = 1_000;

// ResNet-50 inference (~4B FLOPs):
// 50,000 + (4,000,000,000 / 1,000) = 4,050,000 gas
```

### Security Considerations

1. **Rate limiting** - Prevent model extraction via repeated queries
2. **Input validation** - Cap tensor sizes to prevent DoS
3. **Attestation freshness** - SGX quotes must be <5 minutes old
4. **Model registry governance** - Stake required to register models

### Key Insight

> GPU inference is non-deterministic ([ONNX Runtime Issue #4611](https://github.com/microsoft/onnxruntime/issues/4611)). Always use CPU execution for consensus-critical operations.

### Further Reading

- [EZKL Documentation](https://docs.ezkl.xyz/) - zkML framework
- [Giza/Orion](https://orion.gizatech.xyz/) - STARK-based ML on Cairo
- [Ritual Network](https://ritual.net/) - Decentralized AI infrastructure
- [The Definitive Guide to zkML (2025)](https://blog.icme.io/the-definitive-guide-to-zkml-2025/)

---

## 2. Vector Similarity Precompile (0x1001)

### The Challenge

Vector similarity powers semantic search, RAG (Retrieval-Augmented Generation), and embedding-based recommendations. But computing cosine similarity between high-dimensional vectors involves:

- Floating-point operations (determinism issues)
- O(n × d) complexity for n vectors of dimension d
- Sorting results (non-deterministic with floating-point ties)

### The Solution: Precision-Controlled Computation

The key insight is using **f64 intermediate calculations with deterministic rounding**:

```rust
/// Round to 6 decimal places for deterministic consensus
fn round_to_precision(value: f64) -> f32 {
    const PRECISION_MULTIPLIER: f64 = 1_000_000.0;
    ((value * PRECISION_MULTIPLIER).round() / PRECISION_MULTIPLIER) as f32
}

/// Cosine similarity with deterministic output
fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    // Use f64 for intermediate calculations
    let dot: f64 = a.iter().zip(b.iter())
        .map(|(x, y)| (*x as f64) * (*y as f64))
        .sum();
    let norm_a: f64 = a.iter().map(|x| (*x as f64).powi(2)).sum::<f64>().sqrt();
    let norm_b: f64 = b.iter().map(|x| (*x as f64).powi(2)).sum::<f64>().sqrt();

    round_to_precision(dot / (norm_a * norm_b))
}
```

### Deterministic Sorting

Even with rounded scores, ties can occur. We enforce deterministic ordering:

```rust
results.sort_by(|a, b| {
    // Convert to integer for exact comparison
    let a_int = (a.score * 1_000_000.0) as i64;
    let b_int = (b.score * 1_000_000.0) as i64;
    // Descending by score, then ascending by index (tie-breaker)
    b_int.cmp(&a_int).then(a.index.cmp(&b.index))
});
```

### Practical Limits

With a 30M block gas limit:

```
Max calldata: 30M / 16 gas per byte ≈ 1.8 MB
As f32 vectors: 1.8 MB / 4 bytes ≈ 468,750 floats
At 384 dimensions: ~1,220 vectors max
Practical limit (with computation): ~800 vectors
```

**For larger-scale search, use ExEx services with on-chain verification.**

### Architecture: Hybrid On-Chain + ExEx

```
┌─────────────────────────────────────────────────────────────┐
│                     Smart Contract                          │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┴─────────────────────┐
        ▼                                           ▼
┌───────────────────┐                   ┌───────────────────┐
│  Small Batch      │                   │  Large Scale      │
│  (<500 vectors)   │                   │  (>500 vectors)   │
└───────────────────┘                   └───────────────────┘
        │                                           │
        ▼                                           ▼
┌───────────────────┐                   ┌───────────────────┐
│  On-Chain         │                   │  ExEx Vector      │
│  Exact Search     │                   │  Store (ANN)      │
│  (Precompile)     │                   │  + Verification   │
└───────────────────┘                   └───────────────────┘
```

### Gas Model

```rust
const BASE_GAS: u64 = 3_000;
const GAS_PER_DIMENSION: u64 = 6;
const COSINE_OVERHEAD: u64 = 150;  // sqrt operations
const EUCLIDEAN_OVERHEAD: u64 = 75;

fn calculate_gas(dims: usize, vectors: usize, metric: Metric) -> u64 {
    BASE_GAS
        + (dims * vectors * GAS_PER_DIMENSION) as u64
        + metric_overhead(metric) * vectors as u64
        + sort_cost(vectors)  // O(n log n)
}
```

### Use Cases

1. **RAG for Smart Contracts** - Retrieve relevant context before execution
2. **Intent Verification** - Match user intent against historical patterns
3. **Security Auditing** - Find similar code patterns to known vulnerabilities
4. **Agent Memory** - Semantic search over agent activity history

### Anti-Patterns to Avoid

- **Building HNSW/IVF indices on-chain** - State explosion, use ExEx
- **Using f32 intermediates** - Accumulates errors in high dimensions
- **Parallel reduction** - Different summation order = different results
- **Ignoring calldata costs** - 16 gas/byte adds up fast

---

## 3. Intent Parser Precompile (0x1002)

### The Challenge

Translating "send 100 USDC to vitalik.eth" into a structured transaction requires:

- Natural language understanding
- Entity extraction (addresses, amounts, tokens)
- Handling ambiguity ("send" vs "swap" vs "bridge")
- Multi-language support

**But NLP models are non-deterministic and expensive.**

### The Solution: Rule-Based Parsing with ExEx Fallback

```
┌─────────────────────────────────────────────────────────────┐
│                      User Input                              │
│              "send 100 USDC to 0x742d..."                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Phase 1: Rule-Based Parser                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Tokenize    │─▶│ Regex Match │─▶│ Validate    │         │
│  │             │  │ (addresses, │  │ (amounts,   │         │
│  │             │  │  amounts)   │  │  tokens)    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
           │                                    │
           │ Success                            │ Ambiguous
           ▼                                    ▼
┌─────────────────────┐              ┌─────────────────────┐
│  Structured Intent  │              │  ExEx NLP Service   │
│  {                  │              │  (temperature=0)    │
│    type: "Transfer",│              │                     │
│    recipient: "0x.."│              │  Deterministic LLM  │
│    amount: "100",   │              │  response           │
│    token: "USDC"    │              │                     │
│  }                  │              └─────────────────────┘
└─────────────────────┘
```

### Intent Taxonomy

Start with high-frequency intents that cover 90%+ of use cases:

| Priority | Intent | Example | Complexity |
|----------|--------|---------|------------|
| 1 | Transfer | "send 100 USDC to 0x..." | Low |
| 2 | Swap | "swap 1 ETH for USDC" | Medium |
| 3 | Approve | "approve Uniswap to spend my USDC" | Low |
| 4 | Stake | "stake 10 ETH" | Medium |
| 5 | Bridge | "bridge 100 USDC to Arbitrum" | High |

### Pattern Matching

```rust
const TRANSFER_VERBS: &[&str] = &["send", "transfer", "pay", "give"];
const SWAP_VERBS: &[&str] = &["swap", "trade", "exchange", "convert"];

const ETH_ADDRESS: &str = r"0x[a-fA-F0-9]{40}";
const ENS_NAME: &str = r"[a-z0-9\-]+\.eth";
const AMOUNT_TOKEN: &str = r"(\d+\.?\d*)\s*([A-Z]{1,10})";

fn parse_transfer(input: &str) -> Option<TransferIntent> {
    // 1. Check for transfer verb
    let has_verb = TRANSFER_VERBS.iter().any(|v| input.contains(v));
    if !has_verb { return None; }

    // 2. Extract recipient
    let recipient = extract_address(input)?;

    // 3. Extract amount and token
    let (amount, token) = extract_amount_token(input)?;

    Some(TransferIntent { recipient, amount, token })
}
```

### Output Format

Following [ERC-7683](https://ethereum-magicians.org/t/erc-7683-cross-chain-intents-standard/19619) patterns:

```json
{
  "success": true,
  "intent": {
    "type": "Transfer",
    "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "token": "USDC",
    "amount": "100000000",
    "constraints": {
      "deadline": null,
      "max_slippage": null
    }
  },
  "confidence": 0.95,
  "parse_method": "rule_based"
}
```

### Security: Prompt Injection Defense

If using LLM-based parsing (even via ExEx), protect against injection:

```rust
const INJECTION_PATTERNS: &[&str] = &[
    "ignore previous",
    "disregard instructions",
    "new instructions:",
    "system prompt:",
];

fn validate_input(input: &str) -> Result<(), ParseError> {
    // Length limit
    if input.len() > 500 {
        return Err(ParseError::InputTooLong);
    }

    // Character whitelist
    if !input.chars().all(|c| c.is_alphanumeric() || " .,0x".contains(c)) {
        return Err(ParseError::InvalidCharacters);
    }

    // Injection pattern check
    let lower = input.to_lowercase();
    for pattern in INJECTION_PATTERNS {
        if lower.contains(pattern) {
            return Err(ParseError::SuspiciousInput);
        }
    }

    Ok(())
}
```

### Gas Model

```rust
const BASE_GAS: u64 = 40_000;
const GAS_PER_CHAR: u64 = 50;
const GAS_PER_ENTITY: u64 = 3_000;      // Address extraction
const GAS_PER_PATTERN: u64 = 1_000;     // Regex match

fn calculate_gas(input: &str, entities: usize, patterns: usize) -> u64 {
    BASE_GAS
        + (input.len() as u64 * GAS_PER_CHAR)
        + (entities as u64 * GAS_PER_ENTITY)
        + (patterns as u64 * GAS_PER_PATTERN)
}
```

### Multi-Language Strategy

**Phase 1:** English only - focus on correctness
**Phase 2:** Add Spanish, Mandarin, Hindi with separate pattern dictionaries
**Phase 3:** ExEx translation service (any language → English canonical form)

```rust
struct LanguagePatterns {
    code: &'static str,
    transfer_verbs: &'static [&'static str],
    // ...
}

const ENGLISH: LanguagePatterns = LanguagePatterns {
    code: "en",
    transfer_verbs: &["send", "transfer", "pay"],
};

const SPANISH: LanguagePatterns = LanguagePatterns {
    code: "es",
    transfer_verbs: &["enviar", "transferir", "pagar"],
};
```

---

## 4. SVM Router Precompile (0x1003)

### The Challenge

Executing Solana programs from an EVM chain requires bridging two fundamentally different virtual machines:

| Aspect | EVM | SVM |
|--------|-----|-----|
| Account Model | Contract storage | Separate account data |
| Execution | Stateful contracts | Stateless programs |
| Gas/Compute | Gas (21k base) | Compute Units (200k default) |
| Signatures | secp256k1 | ed25519 |
| Max Accounts | Unlimited | 64 per transaction |

### Architecture Options

**Option 1: Remote Execution via ExEx (Recommended for MVP)**

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ EVM Contract │────▶│ SVM Router   │────▶│ ExEx Service │
│              │     │ Precompile   │     │ (port 50052) │
└──────────────┘     └──────────────┘     └──────────────┘
                            │                     │
                            │ Queue instruction   │ Execute on
                            │ Return exec_id      │ embedded SVM
                            ▼                     ▼
                     ┌─────────────────────────────────┐
                     │ Async result via state commit   │
                     └─────────────────────────────────┘
```

**Timeline:** 3-4 weeks
**Pros:** Fast to implement, isolated failure domain
**Cons:** Asynchronous (UX friction)

**Option 2: Embedded SVM Runtime**

```rust
use solana_svm::transaction_processor::TransactionProcessor;

pub struct EmbeddedSvm {
    processor: TransactionProcessor,
    state_adapter: EvmToSvmStateAdapter,
}

impl EmbeddedSvm {
    pub fn execute(&mut self, instruction: SvmInstruction) -> Result<Vec<u8>> {
        // 1. Load accounts from EVM storage
        let accounts = self.state_adapter.load_accounts(&instruction.accounts)?;

        // 2. Create deterministic invoke context
        let ctx = InvokeContext::new(/* deterministic syscalls */);

        // 3. Execute via BPF VM
        let result = self.processor.process_instruction(
            &instruction.program_id,
            &accounts,
            &instruction.data,
            ctx,
        )?;

        // 4. Commit state changes back to EVM
        self.state_adapter.commit(result.modified_accounts)?;

        Ok(result.return_data)
    }
}
```

**Timeline:** 8-12 weeks
**Pros:** Synchronous execution, no external dependencies
**Cons:** Complex integration, state management challenges

### Gas Translation

```rust
const BASE_GAS: u64 = 100_000;
const CU_TO_GAS: u64 = 15;          // 1 Solana CU ≈ 15 EVM gas
const GAS_PER_ACCOUNT: u64 = 5_000;
const GAS_PER_WRITE: u64 = 20_000;

fn calculate_gas(compute_units: u64, accounts: &[AccountMeta]) -> u64 {
    let execution = compute_units * CU_TO_GAS;
    let account_overhead = accounts.len() as u64 * GAS_PER_ACCOUNT;
    let write_cost = accounts.iter()
        .filter(|a| a.is_writable)
        .count() as u64 * GAS_PER_WRITE;

    BASE_GAS + execution + account_overhead + write_cost
}
```

### What Can Actually Run?

| Tier | Programs | Can Run? |
|------|----------|----------|
| **Tier 1** | SPL Token transfers, System Program, simple math | ✅ Yes |
| **Tier 2** | Anchor programs, limited CPI (≤4 depth) | 🟡 With care |
| **Tier 3** | Heavy CPI chains, Solana-specific syscalls | 🔴 Problematic |
| **Tier 4** | Native programs (Vote, Stake), validator info | ❌ Impossible |

### Determinism Requirements

Solana syscalls that need deterministic overrides:

```rust
// Replace with EVM block context
sol_get_clock_sysvar() -> block.timestamp
sol_get_rent_sysvar() -> fixed_rent_config
sol_get_epoch_schedule() -> deterministic_epoch

// Capture for EVM events (don't print)
sol_log_*() -> event_buffer

// Forbid or provide deterministic seed
random() -> keccak256(block.hash, caller, nonce)
```

### Security Considerations

1. **Account limit enforcement** - Max 64 accounts (Solana Transaction V0 limit)
2. **CPI depth limiting** - Max 4 levels of cross-program invocation
3. **Compute budget** - Enforce limits to prevent DoS
4. **Upgradeable program risk** - Require immutable programs for consensus-critical ops
5. **PDA validation** - Verify Program Derived Addresses use expected seeds

### Phased Implementation

**Phase 1 (Weeks 1-4):** Remote execution via ExEx
- Queue instructions from precompile
- Execute on embedded SVM in ExEx service
- Post results via state commitment

**Phase 2 (Weeks 5-12):** Embedded SVM
- Integrate `solana-svm` crate
- Implement EVM↔SVM state adapter
- Deterministic syscall overrides

**Phase 3 (Future):** Full compatibility
- Program registry for dynamic loading
- CPI support across EVM/SVM boundary
- Optimized state synchronization

### Further Reading

- [Neon EVM](https://neonevm.org/) - EVM on Solana (reverse of our approach)
- [Eclipse](https://www.eclipse.xyz/) - SVM L2 on Ethereum
- [Rome Protocol](https://www.romeprotocol.xyz/) - Shared sequencing for EVM+SVM
- [Solana Program Runtime](https://docs.rs/solana-program-runtime/) - Core SVM APIs

---

## Implementation Priority

Based on complexity, value, and dependencies:

| Priority | Precompile | Status | Effort | Value |
|----------|------------|--------|--------|-------|
| 1 | Vector Similarity | ✅ Done | Commit | Enables RAG |
| 2 | Intent Parser | 🟡 Stub | 2-3 weeks | User experience |
| 3 | AI Inference | 🟡 Stub | 4-6 weeks | ML capabilities |
| 4 | SVM Router | 🟡 Stub | 3-4 weeks | Cross-chain |

### Dependency Graph

```
                    ┌─────────────────┐
                    │ Vector Similarity│
                    │     (0x1001)     │
                    └────────┬────────┘
                             │ Enables semantic search
                             ▼
┌─────────────────┐  ┌─────────────────┐
│  Intent Parser  │  │  AI Inference   │
│    (0x1002)     │  │    (0x1000)     │
└────────┬────────┘  └────────┬────────┘
         │                    │
         │ Can use for        │ Can use for
         │ entity embeddings  │ intent classification
         └────────┬───────────┘
                  ▼
         ┌─────────────────┐
         │   SVM Router    │
         │    (0x1003)     │
         └─────────────────┘
         Cross-chain execution
```

---

## Conclusion

Building AI-native precompiles requires careful navigation of blockchain's determinism requirements. The patterns that emerge:

1. **Hybrid architecture** - Complex computation off-chain, verification on-chain
2. **Precision control** - f64 intermediates, deterministic rounding, integer comparisons
3. **ExEx integration** - Remote services for heavy lifting with structured outputs
4. **Progressive enhancement** - Start simple (rules/heuristics), add ML later
5. **Gas metering** - Price computation fairly to prevent DoS

The future of blockchain is not just financial transactions—it's intelligent, context-aware, multi-chain computation. These precompiles are the building blocks.

---

*This guide is based on research into EZKL, Giza, Ritual Network, Neon EVM, Eclipse, and production implementations across the blockchain ecosystem. Last updated: January 2025.*
