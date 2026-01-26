# Monmouth State Machines

This document describes all state machines in the Monmouth L2 system, including the wallet SDK, node engine, and transaction processing pipeline.

---

## Table of Contents

1. [Escrow Lifecycle](#1-escrow-lifecycle)
2. [Memory Client Connection](#2-memory-client-connection)
3. [Activity Sync Status](#3-activity-sync-status)
4. [Transaction Classification Pipeline](#4-transaction-classification-pipeline)
5. [L2 Message Queue](#5-l2-message-queue)
6. [Sequencer Block Production](#6-sequencer-block-production)
7. [Batch Submission Pipeline](#7-batch-submission-pipeline)
8. [Deposit Processing](#8-deposit-processing)

---

## 1. Escrow Lifecycle

**Location:** `wallet-sdk/src/commerce/types.ts`, `wallet-sdk/contracts/MonmouthEscrow.sol`

The escrow system manages secure value transfer between parties with optional arbitration.

### State Diagram

```
                              ┌─────────────┐
                              │   CREATED   │
                              │  (pending)  │
                              └──────┬──────┘
                                     │ funds deposited
                                     ▼
                              ┌─────────────┐
              ┌───────────────│   LOCKED    │───────────────┐
              │               └──────┬──────┘               │
              │                      │                      │
    recipient │            depositor │           either     │ time expires
    confirms  │            requests  │           party      │
              │                      │           disputes   │
              ▼                      ▼                      ▼
       ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
       │  RELEASED   │       │  REFUNDED   │       │  DISPUTED   │
       │   (final)   │       │   (final)   │       └──────┬──────┘
       └─────────────┘       └─────────────┘              │
                                                          │ arbiter
                                                          │ resolves
                                                          ▼
                              ┌─────────────┐       ┌─────────────┐
                              │   EXPIRED   │       │  RESOLVED   │
                              │   (final)   │       │   (final)   │
                              └─────────────┘       └─────────────┘
```

### States

| State | Description | Terminal? |
|-------|-------------|-----------|
| `pending` | Created but not yet funded | No |
| `locked` | Funds deposited and locked | No |
| `released` | Funds sent to recipient | Yes |
| `refunded` | Funds returned to depositor | Yes |
| `disputed` | Dispute raised, awaiting arbiter | No |
| `resolved` | Arbiter resolved the dispute | Yes |
| `expired` | Time limit exceeded, auto-refundable | Yes |

### Transitions

| From | To | Trigger | Actor |
|------|-----|---------|-------|
| pending | locked | `createEscrow()` | Depositor |
| locked | released | `release()` | Depositor or Signature |
| locked | refunded | `refund()` after expiry | Depositor |
| locked | disputed | `dispute()` | Either party |
| locked | expired | Time >= expiresAt | System |
| disputed | resolved | `resolveDispute()` | Arbiter |

### Code References

```typescript
// wallet-sdk/src/commerce/types.ts
export type EscrowState =
  | 'pending' | 'locked' | 'released'
  | 'refunded' | 'disputed' | 'resolved' | 'expired';
```

---

## 2. Memory Client Connection

**Location:** `wallet-sdk/src/memory/MemoryClient.ts`

Manages WebSocket/gRPC connection to the ExEx memory service.

### State Diagram

```
                         ┌──────────────────┐
                         │   DISCONNECTED   │◄─────────────┐
                         └────────┬─────────┘              │
                                  │ connect()              │
                                  ▼                        │
                         ┌──────────────────┐              │
              ┌──────────│   CONNECTING     │──────────┐   │
              │          └──────────────────┘          │   │
              │                                        │   │
    health    │                              health    │   │
    check     │                              check     │   │
    passes    │                              fails     │   │
              ▼                                        ▼   │
     ┌──────────────────┐                    ┌─────────────┴──┐
     │    CONNECTED     │                    │     ERROR      │
     └────────┬─────────┘                    └────────┬───────┘
              │                                       │
              │ disconnect() or                       │ retry
              │ connection lost                       │ (with backoff)
              │                                       │
              └───────────────►───────────────────────┘
```

### States

| State | Description | Can Sync? |
|-------|-------------|-----------|
| `disconnected` | No active connection | No |
| `connecting` | Handshake in progress | No |
| `connected` | Active connection to ExEx | Yes |
| `error` | Connection failed | No (falls back to local) |

### Reconnection Logic

```typescript
// Exponential backoff: 1s, 2s, 4s, 8s... max 30s
const backoff = Math.min(30000, 1000 * Math.pow(2, retryCount));
```

---

## 3. Activity Sync Status

**Location:** `wallet-sdk/src/memory/types.ts`

Tracks synchronization state of individual activity log entries.

### State Diagram

```
     ┌──────────────┐
     │   PENDING    │ ◄──── New activity created
     └──────┬───────┘
            │
            │ sync to ExEx
            │
     ┌──────┴───────┐
     │              │
     ▼              ▼
┌─────────┐   ┌──────────┐
│ SYNCED  │   │ CONFLICT │
└─────────┘   └────┬─────┘
                   │
                   │ resolve (keep local/remote/merge)
                   ▼
              ┌─────────┐
              │ SYNCED  │
              └─────────┘
```

### States

| State | Description |
|-------|-------------|
| `pending` | Created locally, not yet synced |
| `synced` | Successfully synced with ExEx |
| `conflict` | Local and remote versions differ |

### Conflict Resolution

```typescript
type ConflictResolution = 'keep_local' | 'keep_remote' | 'merge';
```

---

## 4. Transaction Classification Pipeline

**Location:** `txpool/src/classifier.rs`, `primitives/src/agent.rs`

Classifies incoming transactions to determine execution path.

### Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TRANSACTION RECEIVED                              │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              ▼
                 ┌────────────────────────┐
                 │  Extract Function      │
                 │  Selector (4 bytes)    │
                 └───────────┬────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │ ERC20    │   │ DEX      │   │ Lending  │   ... more selectors
        │ Transfer │   │ Swap     │   │ Protocol │
        └────┬─────┘   └────┬─────┘   └────┬─────┘
             │              │              │
             └──────────────┼──────────────┘
                            │
                            ▼
                 ┌────────────────────────┐
                 │   Determine Intent     │
                 │   (with confidence)    │
                 └───────────┬────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
   ┌───────────┐      ┌───────────┐      ┌───────────┐
   │  EvmOnly  │      │  SvmOnly  │      │  Hybrid   │
   │           │      │           │      │  EvmSvm   │
   └───────────┘      └───────────┘      └───────────┘
```

### Intent Classifications

| Intent | Selectors | Confidence |
|--------|-----------|------------|
| `Transfer` | `0xa9059cbb`, `0x095ea7b3`, `0x23b872dd` | 0.9 |
| `Swap` | `0x38ed1739`, `0x7ff36ab5`, `0x18cbafe5` | 0.85 |
| `Lending` | `0xe8e33700`, `0xf305d719` | 0.8 |
| `Staking` | `0xa694fc3a`, `0x2e1a7d4d`, `0x379607f5` | 0.8 |
| `NftOperation` | `0x42842e0e`, `0xb88d4fde` | 0.85 |
| `Unknown` | (none matched) | 0.5 |

### Execution Path Determination

```rust
// txpool/src/classifier.rs
fn determine_execution_path(intent: &IntentClassification, data_len: usize) -> ExecutionPath {
    match intent {
        IntentClassification::Swap if data_len > 500 => ExecutionPath::HybridEvmSvm,
        _ if data_len > 10_000 => ExecutionPath::DeferredExecution,
        _ => ExecutionPath::EvmOnly,
    }
}
```

---

## 5. L2 Message Queue

**Location:** `primitives/src/message_queue.rs`, `primitives/src/precompiles.rs`

Manages cross-layer messages between L1 and L2.

### Message Types

```
┌─────────────────────────────────────────────────────────────────────┐
│                        L2 MESSAGE TYPES                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐          │
│   │   DEPOSIT   │     │ WITHDRAWAL  │     │ STATE_ROOT  │          │
│   │   (L1→L2)   │     │   (L2→L1)   │     │   (L2→L1)   │          │
│   └─────────────┘     └─────────────┘     └─────────────┘          │
│                                                                      │
│                       ┌─────────────────┐                           │
│                       │ CROSS_LAYER_CALL│                           │
│                       │   (bidirectional)│                           │
│                       └─────────────────┘                           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Queue State Machine

```
                    ┌─────────────────┐
                    │  MESSAGE CREATED │
                    │  (via precompile)│
                    └────────┬────────┘
                             │
                             │ enqueue()
                             ▼
                    ┌─────────────────┐
                    │    PENDING      │
                    │  (in queue)     │
                    └────────┬────────┘
                             │
                             │ dequeue() by sequencer
                             ▼
                    ┌─────────────────┐
                    │   PROCESSING    │
                    └────────┬────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
           ▼                 ▼                 ▼
    ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
    │  SUBMITTED  │   │   FAILED    │   │  DUPLICATE  │
    │   (to L1)   │   │  (retry)    │   │  (rejected) │
    └─────────────┘   └─────────────┘   └─────────────┘
```

### Duplicate Detection

```rust
// primitives/src/message_queue.rs
pub fn enqueue(&self, message: L2Message) -> Result<B256, String> {
    let hash = message.hash();
    if self.processed_hashes.read().contains(&hash) {
        return Err("Message already processed".to_string());
    }
    // ... enqueue logic
}
```

---

## 6. Sequencer Block Production

**Location:** `engine/src/sequencer.rs`

Manages the periodic production of L2 blocks.

### State Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    BLOCK PRODUCTION CYCLE                            │
│                    (every 2 seconds)                                 │
└─────────────────────────────────────────────────────────────────────┘

     ┌─────────────┐
     │    IDLE     │ ◄───────────────────────────────────────┐
     └──────┬──────┘                                         │
            │ timer fires (block_time elapsed)               │
            ▼                                                │
     ┌─────────────────────┐                                 │
     │  CHECK PENDING TXS  │                                 │
     └──────┬──────────────┘                                 │
            │                                                │
            │ pending_txs.is_empty()?                        │
            │                                                │
     ┌──────┴──────┐                                         │
     │ Yes         │ No                                      │
     │             ▼                                         │
     │      ┌─────────────────────┐                          │
     │      │  COLLECT TXS        │                          │
     │      │  (up to max_size)   │                          │
     │      └──────┬──────────────┘                          │
     │             │                                         │
     │             ▼                                         │
     │      ┌─────────────────────┐                          │
     │      │  BUILD BLOCK        │                          │
     │      │  (respect gas limit)│                          │
     │      └──────┬──────────────┘                          │
     │             │                                         │
     │             ▼                                         │
     │      ┌─────────────────────┐                          │
     │      │  EXECUTE VIA        │                          │
     │      │  ENGINE API         │                          │
     │      └──────┬──────────────┘                          │
     │             │                                         │
     │             ▼                                         │
     │      ┌─────────────────────┐                          │
     │      │  ADD TO BATCH       │                          │
     │      │  BUILDER            │                          │
     │      └──────┬──────────────┘                          │
     │             │                                         │
     └─────────────┴─────────────────────────────────────────┘
```

### Configuration

```rust
// engine/src/config.rs
pub struct SequencerConfig {
    pub block_time: Duration,        // default: 2s
    pub max_block_size: usize,       // default: 1000 txs
    pub max_block_gas: u64,          // default: 30M
    pub batch_submission_freq: Duration, // default: 60s
}
```

---

## 7. Batch Submission Pipeline

**Location:** `engine/src/sequencer.rs`, `engine/src/batch_builder.rs`

Manages aggregation and submission of L2 blocks to L1.

### State Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    BATCH SUBMISSION CYCLE                            │
│                    (every 60 seconds)                                │
└─────────────────────────────────────────────────────────────────────┘

     ┌─────────────┐
     │    IDLE     │ ◄───────────────────────────────────────┐
     └──────┬──────┘                                         │
            │ timer fires                                    │
            ▼                                                │
     ┌─────────────────────┐                                 │
     │  CHECK BATCH SIZE   │                                 │
     │  (pending_blocks)   │                                 │
     └──────┬──────────────┘                                 │
            │                                                │
            │ blocks >= threshold?                           │
            │                                                │
     ┌──────┴──────┐                                         │
     │ No          │ Yes                                     │
     │             ▼                                         │
     │      ┌─────────────────────┐                          │
     │      │  BUILD BATCH        │                          │
     │      │  - Compute tx root  │                          │
     │      │  - Get state root   │                          │
     │      │  - Collect withdraws│                          │
     │      └──────┬──────────────┘                          │
     │             │                                         │
     │             ▼                                         │
     │      ┌─────────────────────┐                          │
     │      │  SUBMIT TO L1       │                          │
     │      │  SequencerInbox     │                          │
     │      └──────┬──────────────┘                          │
     │             │                                         │
     │             ▼                                         │
     │      ┌─────────────────────┐                          │
     │      │  COMMIT STATE ROOT  │                          │
     │      │  StateCommitment    │                          │
     │      │  Chain              │                          │
     │      └──────┬──────────────┘                          │
     │             │                                         │
     │             ▼                                         │
     │      ┌─────────────────────┐                          │
     │      │  FINALIZE           │                          │
     │      │  WITHDRAWALS        │                          │
     │      │  (on L1 bridge)     │                          │
     │      └──────┬──────────────┘                          │
     │             │                                         │
     └─────────────┴─────────────────────────────────────────┘
```

### Batch Structure

```rust
// engine/src/batch_builder.rs
pub struct SequencerBatch {
    pub batch_index: u64,
    pub blocks: Vec<Block>,
    pub transaction_root: B256,
    pub state_root: B256,
    pub parent_batch_hash: B256,
    pub withdrawals: Vec<L2Message>,
}
```

---

## 8. Deposit Processing

**Location:** `engine/src/sequencer.rs`

Handles L1→L2 deposit flow from bridge contract events.

### State Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DEPOSIT PROCESSING FLOW                           │
└─────────────────────────────────────────────────────────────────────┘

L1 (Ethereum)                           L2 (Monmouth)
─────────────                           ─────────────

┌─────────────────┐
│ User calls      │
│ bridge.deposit()│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ ETHDeposit      │
│ Initiated event │
└────────┬────────┘
         │
         │  ════════════════════════════►  ┌─────────────────┐
         │  (sequencer polls every 12s)    │  POLL L1 EVENTS │
         │                                 └────────┬────────┘
         │                                          │
         │                                          ▼
         │                                 ┌─────────────────┐
         │                                 │  ENQUEUE AS     │
         │                                 │  L2Message      │
         │                                 │  (Deposit type) │
         │                                 └────────┬────────┘
         │                                          │
         │                                          ▼
         │                                 ┌─────────────────┐
         │                                 │  PROCESS        │
         │                                 │  (every 2s)     │
         │                                 └────────┬────────┘
         │                                          │
         │                                          ▼
         │                                 ┌─────────────────┐
         │                                 │  CREDIT USER    │
         │                                 │  ON L2          │
         │                                 └─────────────────┘
```

### Polling Configuration

```rust
// engine/src/sequencer.rs
const MAX_BLOCK_RANGE: u64 = 10;  // Max blocks per poll (Alchemy limit)
pub deposit_poll_interval: Duration,  // default: 12s (L1 block time)
```

---

## Summary

| State Machine | States | Key Transitions | Typical Cycle Time |
|---------------|--------|-----------------|-------------------|
| Escrow | 7 | 5+ | Minutes to days |
| Connection | 4 | Bidirectional | Seconds |
| Sync Status | 3 | Linear + conflict | Per activity |
| Classification | Pipeline | Sequential | Milliseconds |
| L2 Message Queue | 4 | Queue-based | Seconds |
| Block Production | Cyclic | Timer-based | 2 seconds |
| Batch Submission | Cyclic | Timer-based | 60 seconds |
| Deposit Processing | Pipeline | Event-driven | 12+ seconds |

---

## Appendix: State Machine Best Practices

### Adding New States

1. Update the type definition (enum)
2. Update all `match` statements exhaustively
3. Add transition validation
4. Update documentation
5. Add tests for new transitions

### State Transition Testing

```rust
#[test]
fn test_escrow_cannot_release_after_refund() {
    let mut escrow = create_test_escrow();
    escrow.refund();
    assert!(escrow.release().is_err());
}
```

### Invariants to Maintain

- Terminal states cannot transition to other states
- State transitions must be atomic
- Invalid transitions must return errors, not panic
- State history should be auditable (activity log)
