# Monmouth L2 Research Documentation

**Date**: January 12, 2026
**Branch**: `feature/wallet-sdk-chain-abstraction`
**Status**: Research Complete, Implementation Roadmap Defined

---

## Executive Summary

This document synthesizes research from 7 parallel investigations into key technical areas for the Monmouth L2 blockchain.

### Architecture Decision: Off-Chain AI

**AI/ML operations happen off-chain via LLM API calls**, not on-chain. On-chain ML is not feasible—even local MLX setups are slow, putting ML algorithms into blockchain consensus is impractical. The blockchain handles settlement and verification only.

### Key Findings Summary

| Area | Status | Critical Finding |
|------|--------|------------------|
| **Precompiles** | Simplified | Only SVM Router (0x1003) and L2 Message Passer (0x4200) remain |
| **AI/ML Integration** | **OFF-CHAIN** | LLM APIs + tool calls, not on-chain inference |
| **ExEx Services** | Streaming only | Block/header streaming, heuristic tx classification |
| **SVM Cross-Chain** | Stub exists | Recommend deferred execution model |
| **Wallet SDK** | ✅ Implemented | Guardrails, identity, payments - AI agents use this |

---

## Table of Contents

1. [Precompile Architecture](#1-precompile-architecture)
2. [AI/ML Integration Strategy](#2-aiml-integration-strategy)
3. [ExEx Classification System](#3-exex-classification-system)
4. [Memory Services Architecture](#4-memory-services-architecture)
5. [Cross-Chain SVM Execution](#5-cross-chain-svm-execution)
6. [E2E Testing Strategy](#6-e2e-testing-strategy)
7. [Implementation Roadmap](#7-implementation-roadmap)
8. [Appendix: Sources](#appendix-sources)

---

## 1. Precompile Architecture

### Current State

Our custom precompiles are registered at the following addresses:

| Address | Name | Status | Purpose |
|---------|------|--------|---------|
| `0x1003` | SVM Router | Stub | Solana VM program execution |
| `0x4200` | L2 Message Passer | ✅ Working | L1 ↔ L2 cross-layer messaging |

**Note**: AI precompiles (0x1000-0x1002) were removed. AI/ML happens off-chain via LLM APIs.

### Determinism Fix (Completed)

**Problem**: The Vector Similarity precompile used `f32` arithmetic which produces different results on different CPUs (Intel vs AMD vs ARM) due to:
- Fused Multiply-Add (FMA) instruction differences
- SIMD implementation variations (AVX2 vs AVX512 vs NEON)
- Floating-point non-associativity

**Solution Implemented**:
```rust
// Use f64 intermediates and round to 6 decimal places
fn round_to_precision(value: f64) -> f32 {
    ((value * 1_000_000.0).round() / 1_000_000.0) as f32
}

// Deterministic sorting with tie-breaking by index
results.sort_by(|a, b| {
    let a_int = (a.score * 1_000_000.0) as i64;
    let b_int = (b.score * 1_000_000.0) as i64;
    b_int.cmp(&a_int).then(a.index.cmp(&b.index))
});
```

**Tests Added**:
- `test_vector_similarity_determinism` - Verifies identical results across runs
- `test_vector_similarity_deterministic_sorting` - Verifies tie-breaking consistency

### Gas Model

Current gas costs are estimates and should be benchmarked on production hardware:

```
Vector Similarity:
  BASE_GAS = 1,000
  + (dimensions × vectors × 2)
  + metric_overhead (Cosine: 50/vec, Euclidean: 25/vec)

AI Inference:
  BASE_GAS = 50,000
  + (input_bytes × 100)

L2 Message Passer:
  BASE_GAS = 25,000
  + (data_bytes × 16)
  + STORAGE_GAS = 20,000
```

---

## 2. AI/ML Integration Strategy

### Architecture Decision: Off-Chain AI

**On-chain ML is not feasible.** Even local MLX setups are slow—putting ML algorithms into blockchain consensus is impractical. The correct architecture is:

```
┌─────────────────────────────────────────────────────────────┐
│                    OFF-CHAIN (AI Layer)                     │
├─────────────────────────────────────────────────────────────┤
│  AI Agent ──► Wallet SDK ──► LLM API (Claude, GPT, etc.)   │
│                   │              │                          │
│                   │              ▼                          │
│                   │         Tool Calls (actions to take)    │
│                   │              │                          │
│                   ▼              ▼                          │
│             Guardrails      Transaction Construction        │
│             (enforce limits, policies, permissions)         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    ON-CHAIN (Settlement Layer)              │
├─────────────────────────────────────────────────────────────┤
│  Monmouth L2 Node                                           │
│  ├─ SVM Router (0x1003) - Cross-chain Solana execution     │
│  ├─ L2 Message Passer (0x4200) - L1↔L2 bridging            │
│  └─ Standard EVM execution                                  │
└─────────────────────────────────────────────────────────────┘
```

### Why Off-Chain AI?

| Factor | On-Chain ML | Off-Chain LLM APIs |
|--------|-------------|---------------------|
| **Latency** | 100ms+ per inference | 100ms-2s (acceptable) |
| **Cost** | Gas per computation | API cost per call |
| **Model size** | <10MB (consensus limits) | Unlimited |
| **Determinism** | Required (hard) | Not required |
| **Updates** | Requires upgrade | Just update API call |

### The "Agent-Aware" Part

The blockchain isn't "AI-aware"—it's just a fast settlement layer. The intelligence is in:

1. **Wallet SDK Guardrails** - Spending limits, allowlists, policies
2. **Agent Identity** - DIDs, capabilities, sessions
3. **Activity Logging** - Audit trail for agent actions
4. **Payment Routing** - x402, escrow, direct payments

This allows AI agents to transact safely without putting ML into consensus.

---

## 3. ExEx Classification System

### Current State

The ExEx system is architecturally complete but the ML service returns hardcoded responses:

```rust
// exex-host/src/service.rs:149-165 - CURRENT STUB
ClassificationResponse {
    tx_type: "StandardEvm".to_string(),     // Always returns this
    execution_path: "EvmOnly".to_string(),   // Always returns this
    confidence: 0.95,                        // Fake confidence
}
```

### Architecture (Working)

```
Transaction → Agent Pool → ExEx Client (gRPC) → Classification Service
                ↓                                         ↓
           Timeout (100ms)                          [STUB - Returns mock]
                ↓
        Fallback to Heuristic Classifier ← Works correctly
```

The fallback heuristic classifier uses function selectors:
- `0xa9059cbb` → Transfer
- `0x38ed1739` → Swap (Uniswap)
- `0xe8e33700` → Lending
- etc.

### Configuration

```rust
pub struct AgentPoolConfig {
    pub exex_endpoint: String,           // "http://127.0.0.1:50051"
    pub max_classification_time: Duration, // 100ms
    pub confidence_threshold: f64,        // 0.7
}
```

### Implementation Required

1. Train classification model on labeled transaction data
2. Export to ONNX format
3. Load in ExEx service using `ort` crate
4. Replace stub with actual inference

---

## 4. Memory Services Architecture

### Recommended Stack

```
┌─────────────────────────────────────────────────────────────┐
│  Memory Service Layer (gRPC)                                │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ Episodic Memory │  │ Semantic Memory │                  │
│  │  (raw events)   │  │   (patterns)    │                  │
│  └────────┬────────┘  └────────┬────────┘                  │
│           │                    │                            │
│           └─────────┬──────────┘                           │
│                     ▼                                       │
│  ┌─────────────────────────────────────────────────────────┤
│  │              Qdrant Vector Database                     │
│  │  - Rust-native client (matches our stack)               │
│  │  - gRPC support                                         │
│  │  - Self-hosted (blockchain sovereignty)                 │
│  └─────────────────────────────────────────────────────────┘
```

### Why Qdrant?

| Factor | Qdrant | Pinecone | pgvector |
|--------|--------|----------|----------|
| Rust client | ✅ Native | ❌ REST | ✅ sqlx |
| Self-hosted | ✅ Yes | ❌ Managed only | ✅ Yes |
| Performance | ✅ Excellent | ✅ Excellent | ⚠️ <10M vectors |
| gRPC | ✅ Yes | ❌ No | ❌ No |

### Dual-Memory System

**Episodic Memory**: "What happened"
- Raw transaction events with embeddings
- Agent activity logs
- Time-series data

**Semantic Memory**: "What patterns exist"
- Extracted from episodic via nightly clustering
- Generalized rules and behaviors
- Higher-level abstractions

**Research shows 40% improvement in agent decision quality when combining both**.

### Sync Protocol

```rust
// Checkpoint every 1000 blocks
pub struct MemoryCheckpoint {
    pub block_number: u64,
    pub memory_root: H256,      // Merkle root of all entries
    pub episodic_count: u64,
    pub semantic_count: u64,
}
```

Enables:
- Light client verification
- Fast bootstrap from snapshots
- Trustless off-chain data

---

## 5. Cross-Chain SVM Execution

### Recommended Architecture: Deferred Execution

```
┌─────────────────────────────────────────────────────────────┐
│  Phase 1: Intent Recording (Synchronous)                   │
│  ────────────────────────────────────────                   │
│  1. User calls SVM Router precompile                        │
│  2. Precompile validates instruction format                 │
│  3. Emits SvmInstructionQueued event                        │
│  4. Returns execution_id immediately                        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Phase 2: Asynchronous Execution                            │
│  ────────────────────────────────────                       │
│  1. Off-chain executor monitors events                      │
│  2. Waits for L2 finality                                   │
│  3. Submits instruction to Solana                           │
│  4. Waits for Solana confirmations                          │
│  5. Posts result back to L2                                 │
└─────────────────────────────────────────────────────────────┘
```

### Why NOT Synchronous?

| Approach | Problem |
|----------|---------|
| Direct Solana call | 400ms+ latency, L2 blocks waiting |
| Embedded SVM | Massive complexity, different architecture |
| Synchronous bridge | DoS risk if Solana slow/unavailable |

### Address Mapping

```rust
// EVM address → Solana PDA (deterministic)
pub fn derive_solana_pda(evm_address: &[u8; 20]) -> Pubkey {
    Pubkey::find_program_address(
        &[b"evm_caller", evm_address],
        &SVM_ROUTER_PROGRAM_ID,
    ).0
}
```

### Security Progression

| Phase | Model | Implementation |
|-------|-------|----------------|
| 1. MVP | Trusted relayer | Single executor with known address |
| 2. Testnet | Multi-sig | M-of-N executor committee |
| 3. Mainnet | Optimistic | Fraud proofs, 1-hour challenge window |
| 4. Future | ZK proofs | Trustless, instant finality |

---

## 6. E2E Testing Strategy

### Test App Status

The wallet-sdk test app (`wallet-sdk/test-app/`) is a React demo with:
- ✅ Wallet connection (Porto)
- ✅ Agent initialization
- ✅ Policy configuration
- ✅ x402 payment demo
- ✅ Activity log viewer
- ⚠️ No E2E tests
- ⚠️ No escrow UI

### Recommended Test Phases

| Phase | Focus | Tests |
|-------|-------|-------|
| 1. Core Flows | Agent init, guardrails, x402, escrow | 4 test suites |
| 2. Multi-Chain | EVM ↔ Solana switching | 3 test suites |
| 3. DID Verification | Generate, sign, verify | 3 test suites |
| 4. Error Scenarios | Timeouts, expiry, invalid sigs | 3 test suites |
| 5. Demo Narratives | "Purchase Digital Service" E2E | 1 comprehensive flow |
| 6. Performance | Concurrent ops, state recovery | 2 test suites |

### Demo Narrative: "Purchase Digital Service"

```
1. Connect wallet → verify connected
2. Create commerce agent → verify DID
3. Attempt 5 ETH purchase → ALLOWED (within limit)
4. Attempt 6 ETH purchase → BLOCKED (exceeds remaining)
5. Make x402 payment → verify auto-retry
6. Create escrow → verify locked state
7. Dispute escrow → verify state transition
8. Export activity → verify JSON completeness
```

---

## 7. Implementation Roadmap

### Completed

- [x] **Wallet SDK Chain Abstraction** - EVM + Solana adapters
- [x] **Vector Similarity Determinism** - f64 intermediates + rounding
- [x] **Deterministic Sorting** - Tie-breaking by index
- [x] **Determinism Tests** - Verification coverage

### Priority 1: Critical (Weeks 1-2)

| Task | Status | Effort |
|------|--------|--------|
| ~~Fix Vector Similarity determinism~~ | ✅ Done | 2-4 hours |
| ~~Add determinism tests~~ | ✅ Done | 1-2 hours |
| Implement ML classification in ExEx | 🔜 Next | 1-2 weeks |

### Priority 2: High (Weeks 3-6)

| Task | Status | Effort |
|------|--------|--------|
| Add Qdrant-based memory service | Pending | 2-3 weeks |
| Implement AI Inference precompile (tract) | Pending | 1-2 weeks |
| Add escrow UI to test app | Pending | 1 week |

### Priority 3: Medium (Weeks 7-12)

| Task | Status | Effort |
|------|--------|--------|
| SVM Router deferred execution | Pending | 3-4 weeks |
| E2E test suite | Pending | 2-3 weeks |
| Gas benchmarking | Pending | 1 week |

### Priority 4: Future (2026+)

| Task | Status | Effort |
|------|--------|--------|
| zkML integration (EZKL) | Research | 1-2 months |
| ZK cross-chain proofs | Research | 2-3 months |
| Decentralized executor network | Design | 3-4 months |

---

## Appendix: Sources

### Verifiable ML

1. [opML: Optimistic Machine Learning on Blockchain](https://arxiv.org/html/2401.17555v1)
2. [EZKL Benchmarks](https://blog.ezkl.xyz/post/benchmarks/)
3. [Proof of Quality](https://arxiv.org/html/2405.17934v2)

### Determinism

4. [Floating-Point Non-Associativity in ML](https://arxiv.org/html/2408.05148v3)
5. [SGLang Deterministic Inference](https://lmsys.org/blog/2025-09-22-sglang-deterministic/)

### ML Frameworks

6. [tract (Pure Rust ML)](https://github.com/sonos/tract)
7. [ort (ONNX Runtime Rust)](https://ort.pyke.io)

### Vector Databases

8. [Qdrant Documentation](https://qdrant.tech/documentation/)
9. [Vector DB Comparison 2025](https://www.firecrawl.dev/blog/best-vector-databases-2025)

### Cross-Chain

10. [Neon EVM Composability](https://www.neonevm.org/blog/unveiling-composability-whitepaper)
11. [Eclipse SVM L2](https://mirror.xyz/eclipselabs.eth/me7bXLWJDS177V6nl8j1uzF1mxpX6nbGOLNeyBAwXgs)
12. [LayerZero vs Wormhole vs Axelar](https://yellow.com/research/cross-chain-messaging-comparing-ibc-wormhole-layerzero-ccip-and-more)

### Precompiles & Gas

13. [EIP-1108: Reduce alt_bn128 Gas Costs](https://eips.ethereum.org/EIPS/eip-1108)
14. [EIP-8011: Multidimensional Gas](https://eips.ethereum.org/EIPS/eip-8011)
15. [Security Considerations for Precompiles](https://www.kalos.xyz/blog/security-considerations-for-precompiled-contracts)

### Memory & RAG

16. [Agentic RAG Survey](https://arxiv.org/abs/2501.09136)
17. [Memory Systems in AI Agents](https://ctoi.substack.com/p/memory-systems-in-ai-agents-episodic)
18. [CRDTs for Distributed Systems](https://ably.com/blog/crdts-distributed-data-consistency-challenges)

---

*Generated by research agents on January 12, 2026*
