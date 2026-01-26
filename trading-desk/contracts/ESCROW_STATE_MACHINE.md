# MonmouthEscrow State Machine

## Overview

The escrow contract facilitates trustless agent-to-agent payments on the Monmouth L2. It enables a Trader Agent to pay a Research Agent for market analysis with built-in dispute resolution.

## State Diagram

```
                                    ┌─────────────────────────────────────────┐
                                    │                                         │
                                    ▼                                         │
┌──────────┐   create()    ┌──────────────┐   claim()    ┌─────────────┐     │
│          │ ─────────────▶│              │ ───────────▶ │             │     │
│  (none)  │               │    OPEN      │              │   CLAIMED   │     │
│          │               │              │              │             │     │
└──────────┘               └──────────────┘              └─────────────┘     │
                                    │                           │            │
                                    │                           │            │
                                    │ expire()                  │ deliver()  │
                                    │ (after timeout)           │            │
                                    │                           ▼            │
                                    │                    ┌─────────────┐     │
                                    │                    │             │     │
                                    │                    │  DELIVERED  │     │
                                    │                    │             │     │
                                    │                    └─────────────┘     │
                                    │                           │            │
                                    │                           │            │
                                    │                           │ release()  │
                                    │                           │ OR         │
                                    │                           │ dispute()  │
                                    │                           ▼            │
                                    │                    ┌─────────────┐     │
                                    │                    │             │     │
                                    └───────────────────▶│  RESOLVED   │◀────┘
                                                         │             │
                                                         └─────────────┘
```

## States

| State | Description | Funds Location |
|-------|-------------|----------------|
| **OPEN** | Escrow created, waiting for provider to claim | Locked in contract |
| **CLAIMED** | Provider claimed the job, working on it | Locked in contract |
| **DELIVERED** | Provider delivered work, awaiting approval | Locked in contract |
| **RESOLVED** | Final state - funds released or refunded | Released to recipient |

## Transitions

### `create(provider, amount, jobHash, timeout)`
- **From:** (no escrow)
- **To:** OPEN
- **Caller:** Any funded address (Trader Agent)
- **Requires:**
  - `amount > 0`
  - `provider != address(0)`
  - `provider != msg.sender`
  - `msg.value == amount`
- **Effects:**
  - Creates new escrow with unique ID
  - Locks `amount` in contract
  - Sets `deadline = block.timestamp + timeout`
  - Emits `EscrowCreated(id, client, provider, amount, jobHash, deadline)`

### `claim(escrowId)`
- **From:** OPEN
- **To:** CLAIMED
- **Caller:** Provider only
- **Requires:**
  - `block.timestamp < deadline`
  - `msg.sender == escrow.provider`
- **Effects:**
  - Updates state to CLAIMED
  - Emits `EscrowClaimed(id, provider)`

### `deliver(escrowId, resultHash)`
- **From:** CLAIMED
- **To:** DELIVERED
- **Caller:** Provider only
- **Requires:**
  - `msg.sender == escrow.provider`
  - `resultHash != bytes32(0)`
- **Effects:**
  - Stores `resultHash`
  - Updates state to DELIVERED
  - Emits `EscrowDelivered(id, resultHash)`

### `release(escrowId)`
- **From:** DELIVERED
- **To:** RESOLVED
- **Caller:** Client only
- **Requires:**
  - `msg.sender == escrow.client`
- **Effects:**
  - Transfers `amount` to provider
  - Updates state to RESOLVED
  - Emits `EscrowReleased(id, provider, amount)`

### `expire(escrowId)`
- **From:** OPEN
- **To:** RESOLVED
- **Caller:** Client only
- **Requires:**
  - `msg.sender == escrow.client`
  - `block.timestamp >= deadline`
- **Effects:**
  - Refunds `amount` to client
  - Updates state to RESOLVED
  - Emits `EscrowExpired(id, client, amount)`

### `dispute(escrowId)`
- **From:** DELIVERED
- **To:** RESOLVED (with arbitration)
- **Caller:** Client only
- **Requires:**
  - `msg.sender == escrow.client`
- **Effects:**
  - Sends to arbitrator (if configured) OR
  - Auto-releases after dispute period
  - Emits `EscrowDisputed(id)`

## Invariants

1. **Funds Conservation:** Total locked funds always equals sum of all OPEN + CLAIMED + DELIVERED escrow amounts
2. **Single Owner:** Each escrow has exactly one client and one provider
3. **Forward Only:** State can only progress forward (no rollbacks)
4. **Timeout Safety:** Expired escrows can only be refunded, never released to provider
5. **Provider Can't Self-Pay:** `client != provider` enforced at creation

## Security Considerations (Trail of Bits Guidelines)

### Reentrancy Protection
- Use ReentrancyGuard on all state-changing functions
- Effects-Interactions pattern: update state before external calls
- Transfer funds as final step

### Access Control
```solidity
modifier onlyClient(uint256 escrowId) {
    require(msg.sender == escrows[escrowId].client, "Not client");
    _;
}

modifier onlyProvider(uint256 escrowId) {
    require(msg.sender == escrows[escrowId].provider, "Not provider");
    _;
}

modifier inState(uint256 escrowId, State expected) {
    require(escrows[escrowId].state == expected, "Invalid state");
    _;
}
```

### Integer Safety
- Use Solidity 0.8+ (built-in overflow checks)
- Validate `amount > 0` before creating escrow

### Events
- Emit events for all state transitions
- Include indexed parameters for efficient filtering
- Log both old and new values for debugging

### Timestamp Dependence
- Timeout uses `block.timestamp` - acceptable for escrow use case
- Buffer period for miner manipulation (30 second variance acceptable)

## Data Structures

```solidity
enum State {
    OPEN,      // 0
    CLAIMED,   // 1
    DELIVERED, // 2
    RESOLVED   // 3
}

struct Escrow {
    address client;      // Who locked the funds
    address provider;    // Who receives on success
    uint256 amount;      // Locked amount in wei
    bytes32 jobHash;     // Hash of job description
    bytes32 resultHash;  // Hash of delivered result
    uint256 deadline;    // Timestamp after which client can refund
    State state;         // Current state
}
```

## Gas Optimization

1. Pack struct fields (addresses + uint96 for amounts < 79B ETH)
2. Use `calldata` for hash parameters
3. Single storage write per transition
4. Batch operations for multiple escrows

## Integration Points

### Frontend (trading-desk)
```typescript
// Create escrow
const tx = await escrow.create(researchAgentDID, jobHash, timeout, { value: amount });
const receipt = await tx.wait();
const escrowId = receipt.events.find(e => e.event === 'EscrowCreated').args.id;

// Listen for state changes
escrow.on('EscrowDelivered', (id, resultHash) => {
  // Update ActivityFeed
});
```

### Wallet SDK (guardrails)
```typescript
// Policy check before create()
if (amount > policy.maxPerTransaction) {
  throw new PolicyViolationError('Exceeds per-transaction limit');
}
if (dailySpent + amount > policy.dailyCap) {
  throw new PolicyViolationError('Exceeds daily cap');
}
```
