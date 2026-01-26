# Wallet SDK Architecture

**Date**: January 12, 2026
**Package**: `@monmouth/wallet-sdk` v0.1.0
**Status**: Core Complete, Integration Stubs Pending

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              WALLET SDK LAYER                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                         AgentWallet (Multi-Chain)                        │    │
│  │  • Chain-agnostic transaction interface                                  │    │
│  │  • Default policies per agent type (research/trading/coordinator/commerce)│   │
│  │  • Session management with expiry                                        │    │
│  │  • Event emission system                                                 │    │
│  └──────────────────────────────┬──────────────────────────────────────────┘    │
│                                 │                                                │
│         ┌───────────────────────┼───────────────────────┐                       │
│         │                       │                       │                       │
│         ▼                       ▼                       ▼                       │
│  ┌─────────────┐    ┌──────────────────┐    ┌──────────────────┐               │
│  │   Identity   │    │    Guardrails    │    │  Chain Adapters  │               │
│  │   Manager    │    │    (Enforcer)    │    │                  │               │
│  ├─────────────┤    ├──────────────────┤    ├──────────────────┤               │
│  │ • DID:key   │    │ • Per-tx limits  │    │ ┌──────────────┐ │               │
│  │   generation│    │ • Daily spending │    │ │  EVM Adapter │ │               │
│  │ • Capability│    │ • Address allow/ │    │ │   (viem)     │ │               │
│  │   management│    │   blocklist      │    │ └──────────────┘ │               │
│  │ • Signature │    │ • Function       │    │ ┌──────────────┐ │               │
│  │   creation  │    │   selectors      │    │ │Solana Adapter│ │               │
│  │ • Metadata  │    │ • Session expiry │    │ │(@solana/web3)│ │               │
│  └──────┬──────┘    └────────┬─────────┘    │ └──────────────┘ │               │
│         │                    │              └────────┬─────────┘               │
│         │                    │                       │                          │
│         │           ┌────────┴────────┐              │                          │
│         │           │                 │              │                          │
│         ▼           ▼                 ▼              ▼                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                          COMMERCE LAYER                                  │   │
│  ├─────────────────────────────────────────────────────────────────────────┤   │
│  │                                                                          │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │   │
│  │  │   X402 Client   │  │  Payment Router │  │  Escrow Client  │          │   │
│  │  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤          │   │
│  │  │ • HTTP 402      │  │ • Protocol      │  │ • Create/Release│          │   │
│  │  │   interception  │  │   detection     │  │ • Dispute flow  │          │   │
│  │  │ • EIP-712 sigs  │  │ • Route to x402 │  │ • Expiry mgmt   │          │   │
│  │  │ • Auto-retry    │  │   /direct/escrow│  │ • State machine │          │   │
│  │  │ • Demo endpoints│  │ • Activity log  │  │                 │          │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │   │
│  │                                                                          │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                          MEMORY LAYER                                    │   │
│  ├─────────────────────────────────────────────────────────────────────────┤   │
│  │                                                                          │   │
│  │  ┌─────────────────────────┐     ┌─────────────────────────────────┐    │   │
│  │  │     Activity Log        │     │       Memory Client              │    │   │
│  │  ├─────────────────────────┤     ├─────────────────────────────────┤    │   │
│  │  │ • In-memory + localStorage    │ • ExEx connection (STUB)        │    │   │
│  │  │ • Query/filter by agent │     │ • Sync to remote (TODO)         │    │   │
│  │  │ • Export/import JSON    │     │ • Semantic search (TODO)        │    │   │
│  │  │ • Time-range queries    │     │ • gRPC-web (TODO)               │    │   │
│  │  └─────────────────────────┘     └─────────────────────────────────┘    │   │
│  │                                                                          │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└────────────────────────────────────────────────────────────┬────────────────────┘
                                                             │
                                                             │ (Future Integration)
                                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           MONMOUTH L2 NODE                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│  Note: AI/ML happens OFF-CHAIN via LLM APIs. Blockchain is for settlement only. │
│                                                                                  │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐            │
│  │  L2 Message Passer│  │   ExEx Services   │  │  SVM Router       │            │
│  │   (0x4200)        │  │   (gRPC :50051)   │  │  (0x1003)         │            │
│  ├───────────────────┤  ├───────────────────┤  ├───────────────────┤            │
│  │ • Deposits (L1→L2)│  │ • Block streaming │  │ • Solana program  │            │
│  │ • Withdrawals     │  │ • Tx classification│  │   execution       │            │
│  │ • Cross-layer msg │  │ • Health checks   │  │ • Cross-chain     │            │
│  └───────────────────┘  └───────────────────┘  └───────────────────┘            │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagram

```
                              USER / dApp
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────┐
│                    1. INITIALIZE AGENT                        │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  const wallet = new AgentWallet({                       │ │
│  │    adapter: new EvmAdapter({ client, walletClient }),   │ │
│  │    agentType: 'commerce',  // Uses preset policy        │ │
│  │    identity: await AgentIdentity.create('agent-1')      │ │
│  │  });                                                    │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────┐
│                    2. TRANSACTION REQUEST                     │
│                                                               │
│  wallet.sendTransaction({ to: '0x...', value: 1000000n })    │
│                                                               │
└──────────────────────────────────────────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
         ┌─────────────────┐           ┌─────────────────┐
         │ 3a. GUARDRAILS  │           │ 3b. IDENTITY    │
         │    CHECK        │           │    VERIFY       │
         ├─────────────────┤           ├─────────────────┤
         │ Per-tx limit?   │           │ Valid DID?      │
         │ Daily limit?    │           │ Has capability? │
         │ Address allowed?│           │ Session active? │
         │ Selector ok?    │           │                 │
         └────────┬────────┘           └────────┬────────┘
                  │                             │
                  └──────────────┬──────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │        ALLOWED?          │
                    └────────────┬────────────┘
                          │            │
                    ┌─────┘            └─────┐
                    ▼                        ▼
         ┌─────────────────┐      ┌─────────────────┐
         │   ✓ PROCEED     │      │   ✗ REJECTED    │
         └────────┬────────┘      └────────┬────────┘
                  │                        │
                  ▼                        ▼
         ┌─────────────────┐      ┌─────────────────┐
         │ 4. CHAIN ADAPTER│      │ PolicyViolation │
         │    EXECUTE      │      │ Event Emitted   │
         ├─────────────────┤      └─────────────────┘
         │ EVM: viem tx    │
         │ SVM: web3.js tx │
         └────────┬────────┘
                  │
                  ▼
         ┌─────────────────┐
         │ 5. ACTIVITY LOG │
         ├─────────────────┤
         │ Record action   │
         │ Update spending │
         │ Store receipt   │
         └────────┬────────┘
                  │
                  ▼
         ┌─────────────────┐
         │ 6. SYNC TO EXEX │
         │    (FUTURE)     │
         ├─────────────────┤
         │ gRPC-web call   │
         │ Memory service  │
         │ Semantic index  │
         └─────────────────┘
```

---

## x402 Payment Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        x402 PAYMENT PROTOCOL FLOW                        │
└─────────────────────────────────────────────────────────────────────────┘

  Client (SDK)                    API Server                   Blockchain
       │                              │                             │
       │  1. fetch('/api/data')       │                             │
       │─────────────────────────────▶│                             │
       │                              │                             │
       │  2. HTTP 402 Payment Required│                             │
       │     WWW-Authenticate:        │                             │
       │     x402 price="0.001"       │                             │
       │     recipient="0xABC..."     │                             │
       │     network="monmouth"       │                             │
       │◀─────────────────────────────│                             │
       │                              │                             │
       │  3. Check Guardrails         │                             │
       │     ├─ Per-tx limit ok?      │                             │
       │     ├─ Daily limit ok?       │                             │
       │     └─ Address allowed?      │                             │
       │                              │                             │
       │  4. Create EIP-712 Signature │                             │
       │     { amount, recipient,     │                             │
       │       nonce, expiry }        │                             │
       │                              │                             │
       │  5. Retry with X-Payment     │                             │
       │     header containing sig    │                             │
       │─────────────────────────────▶│                             │
       │                              │  6. Verify signature        │
       │                              │     Submit payment tx       │
       │                              │────────────────────────────▶│
       │                              │                             │
       │                              │  7. Tx confirmation         │
       │                              │◀────────────────────────────│
       │                              │                             │
       │  8. HTTP 200 + Data          │                             │
       │◀─────────────────────────────│                             │
       │                              │                             │
       │  9. Log to ActivityLog       │                             │
       │     { type: 'x402_payment',  │                             │
       │       amount, recipient }    │                             │
       │                              │                             │
```

---

## Escrow State Machine

```
                    ┌─────────────────┐
                    │     START       │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ createEscrow()  │
                    │                 │
                    │ • Validate amt  │
                    │ • Check guards  │
                    │ • Generate ID   │
                    │ • Set expiry    │
                    └────────┬────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │         LOCKED               │
              │  ─────────────────────────   │
              │  Funds held in escrow        │
              │  Awaiting release/dispute    │
              └──────────────┬───────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  release()      │ │  refund()       │ │  dispute()      │
│                 │ │                 │ │                 │
│ • Seller calls  │ │ • Buyer calls   │ │ • Either party  │
│ • Before expiry │ │ • After expiry  │ │ • Within window │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│    RELEASED     │ │    REFUNDED     │ │    DISPUTED     │
│  ─────────────  │ │  ─────────────  │ │  ─────────────  │
│ Funds → Seller  │ │ Funds → Buyer   │ │ Funds frozen    │
└─────────────────┘ └─────────────────┘ └────────┬────────┘
                                                 │
                                     ┌───────────┴───────────┐
                                     ▼                       ▼
                           ┌─────────────────┐     ┌─────────────────┐
                           │ resolveDispute  │     │ resolveDispute  │
                           │ (favor: buyer)  │     │ (favor: seller) │
                           └────────┬────────┘     └────────┬────────┘
                                    │                       │
                                    ▼                       ▼
                           ┌─────────────────┐     ┌─────────────────┐
                           │    REFUNDED     │     │    RELEASED     │
                           └─────────────────┘     └─────────────────┘
```

---

## Implementation Status

### Fully Implemented (✓)

| Component | Files | Tests | Notes |
|-----------|-------|-------|-------|
| **Guardrails** | `PolicyEnforcer.ts`, `Templates.ts` | 38 | Production-ready |
| **Identity** | `AgentIdentity.ts` | 27 | Simplified signatures |
| **Activity Log** | `ActivityLog.ts` | 29 | localStorage-based |
| **Escrow Client** | `EscrowClient.ts` | 25 | Local stub (no contract) |
| **x402 Client** | `X402Client.ts` | 26 | Demo endpoints only |
| **Payment Router** | `PaymentRouter.ts` | 24 | Complete |
| **EVM Adapter** | `EvmAdapter.ts` | 21 | Full viem integration |
| **Solana Adapter** | `SolanaAdapter.ts` | 27 | Full web3.js integration |
| **Core Types** | `core/*.ts` | 20 | Chain-agnostic abstractions |
| **AgentWallet** | `AgentWallet.ts` | 30 | Multi-chain support |

**Total: 308 tests passing**

---

### Missing / Incomplete (✗)

| Component | Gap | Priority | Effort |
|-----------|-----|----------|--------|
| **MemoryClient** | 3 TODO stubs for gRPC-web | High | 1-2 days |
| **Escrow Contract** | No on-chain contract | High | 1 week |
| **Real Signing** | Simplified signatures | Medium | 2-3 days |
| **Solana x402** | EVM-only currently | Medium | 1 week |
| **Token Registry** | Hardcoded token list | Low | 2-3 days |
| **IndexedDB** | localStorage limits | Low | 1-2 days |
| **E2E Tests** | No testnet integration | Medium | 1 week |

---

## Missing Implementation Details

### 1. MemoryClient (3 TODOs)

**Location**: `wallet-sdk/src/memory/MemoryClient.ts`

```typescript
// Line 120 - Connection stub
async connect(): Promise<void> {
  // TODO: Implement actual gRPC-web connection
  // Should connect to ExEx memory service at configured endpoint
  this.connectionState = 'connected';
}

// Line 201 - Sync stub
async syncActivities(): Promise<void> {
  // TODO: Replace with actual gRPC-web call
  // Should POST activities to ExEx service
  // Handle conflict resolution
  // Update sync token
}

// Line 245 - Search stub
async semanticSearch(query: string): Promise<SearchResult[]> {
  // TODO: Replace with actual gRPC-web call to ExEx RAG service
  // Should query vector database for similar activities
  return [];
}
```

**Blocked by**: ExEx protobuf definitions finalization

---

### 2. Escrow Smart Contract

**Current**: localStorage-based stub (test only)

**Needed**:
```solidity
contract MonmouthEscrow {
    struct Escrow {
        address buyer;
        address seller;
        uint256 amount;
        uint256 expiry;
        EscrowState state;
    }

    function create(address seller, uint256 duration) external payable;
    function release(bytes32 escrowId) external;
    function refund(bytes32 escrowId) external;
    function dispute(bytes32 escrowId) external;
    function resolveDispute(bytes32 escrowId, bool favorBuyer) external;
}
```

**Integration needed in**: `EscrowClient.ts` to call contract instead of localStorage

---

### 3. Solana x402 Extension

**Current**: x402 creates EIP-712 signatures (EVM only)

**Needed**:
- Ed25519 signature scheme for Solana
- SPL token payment support
- Solana-specific payment header format

---

### 4. Production Signing

**Current**: `AgentIdentity.signMessage()` uses simplified hash

**Needed**:
```typescript
// Integrate with wagmi/viem for real signing
async signMessage(message: string): Promise<string> {
  const signature = await this.walletClient.signMessage({
    account: this.address,
    message
  });
  return signature;
}
```

---

## Recommended Next Steps

1. **Immediate** (Before cofounder review)
   - [x] Document architecture (this file)
   - [ ] Add architecture diagram to README

2. **Short-term** (After approval)
   - [ ] Implement MemoryClient gRPC-web calls
   - [ ] Deploy escrow contract to Monmouth testnet
   - [ ] Add real EIP-712 signing

3. **Medium-term**
   - [ ] Extend x402 to Solana
   - [ ] Add E2E tests on testnet
   - [ ] Migrate to IndexedDB

---

*Generated January 12, 2026*
