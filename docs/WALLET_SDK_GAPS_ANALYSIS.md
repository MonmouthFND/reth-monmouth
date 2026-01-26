# Wallet SDK Implementation Gaps: How, Why & Tradeoffs

**Date**: January 12, 2026
**Status**: Research Complete

This document provides detailed analysis of each missing component in the Wallet SDK, explaining:
- **What** - Current state and what needs to be built
- **Why** - Business/technical rationale
- **How** - Implementation approach
- **Tradeoffs** - Alternatives considered and decisions

---

## Table of Contents

1. [MemoryClient gRPC Integration](#1-memoryclient-grpc-integration)
2. [Escrow Smart Contract](#2-escrow-smart-contract)
3. [EIP-712 Signing Implementation](#3-eip-712-signing-implementation)
4. [Solana x402 Support](#4-solana-x402-support)
5. [Token Registry](#5-token-registry)
6. [IndexedDB Migration](#6-indexeddb-migration)
7. [E2E Testnet Testing](#7-e2e-testnet-testing)

---

## 1. MemoryClient gRPC Integration

### Current State

```typescript
// wallet-sdk/src/memory/MemoryClient.ts - 3 TODO stubs:

// Line 120: Connection
async connect(): Promise<void> {
  // TODO: Implement actual gRPC-web connection
  this.connectionState = 'connected';  // Fake
}

// Line 201: Sync
async syncActivities(): Promise<SyncResponse> {
  // TODO: Replace with actual gRPC-web call
  return stubSyncActivities(request);  // Fake
}

// Line 245: Search
async semanticSearch(query: string): Promise<SearchResult[]> {
  // TODO: Replace with actual gRPC-web call to ExEx RAG service
  return [];  // Empty
}
```

### Why We Need This

| Reason | Impact |
|--------|--------|
| **Agent Memory Persistence** | Agents lose context on page refresh without server sync |
| **Cross-Device Continuity** | Same agent can't resume work on different device |
| **Semantic Search** | Can't search agent history by meaning, only text match |
| **Audit Trail** | No verifiable record of agent decisions for compliance |
| **ExEx Integration** | The whole memory layer in Monmouth L2 is useless without this |

### How to Implement

**Recommended Library: Connect-Web**

```typescript
import { createPromiseClient } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";
import { MemoryService } from "./gen/exex_connect";

const transport = createGrpcWebTransport({
  baseUrl: "http://localhost:50051",
  // Optional: Add interceptors for auth
  interceptors: [authInterceptor],
});

const client = createPromiseClient(MemoryService, transport);

// Replace stub with real call
async syncActivities(request: SyncRequest): Promise<SyncResponse> {
  return await client.syncActivities({
    activities: request.activities.map(a => ({
      id: a.id,
      agentId: a.agentId,
      actionType: a.actionType,
      data: JSON.stringify(a.data),
      timestamp: BigInt(a.timestamp),
    })),
    lastSyncToken: request.lastSyncToken,
  });
}
```

**Proxy Setup (Envoy or tonic-web)**

Our ExEx is built with Rust/tonic. Options:

1. **Envoy Proxy** (recommended for production)
   ```yaml
   # envoy.yaml
   static_resources:
     listeners:
     - address: { socket_address: { address: 0.0.0.0, port_value: 8080 }}
       filter_chains:
       - filters:
         - name: envoy.filters.network.http_connection_manager
           typed_config:
             "@type": type.googleapis.com/...HttpConnectionManager
             codec_type: AUTO
             route_config:
               virtual_hosts:
               - name: grpc
                 domains: ["*"]
                 routes:
                 - match: { prefix: "/" }
                   route: { cluster: grpc_service }
             http_filters:
             - name: envoy.filters.http.grpc_web
             - name: envoy.filters.http.cors
             - name: envoy.filters.http.router
   ```

2. **tonic-web** (simpler, in-process)
   ```rust
   // exex-host/src/main.rs
   use tonic_web::GrpcWebLayer;

   Server::builder()
       .accept_http1(true)
       .layer(GrpcWebLayer::new())
       .add_service(memory_service)
       .serve(addr)
       .await?;
   ```

### Tradeoffs

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Connect-Web** | Modern, small bundle (15KB), great DX, supports streaming | Newer, less mature | **Recommended** |
| **grpc-web** | Official Google library, battle-tested | 200KB+ bundle, verbose API | Heavy for SDK |
| **REST wrapper** | Simple, no proxy needed | Loses streaming, no type safety | Defeats purpose |
| **WebSocket** | Real-time, bidirectional | Custom protocol, no standard | Overengineered |

**Decision**: Use Connect-Web with tonic-web layer. Small bundle, type-safe, and keeps our Rust stack simple.

### Offline-First Pattern

```typescript
class MemoryClient {
  private syncQueue: ActivityLogEntry[] = [];

  async log(entry: ActivityLogEntry) {
    // Always save locally first
    this.activityLog.log(entry);
    this.syncQueue.push(entry);

    // Try to sync if online
    if (navigator.onLine && this.isConnected()) {
      await this.flushQueue();
    }
  }

  private async flushQueue() {
    if (this.syncQueue.length === 0) return;

    const batch = this.syncQueue.splice(0, 100);
    try {
      await this.client.syncActivities({ activities: batch });
    } catch (e) {
      // Put back in queue for retry
      this.syncQueue.unshift(...batch);
      this.scheduleRetry();
    }
  }
}
```

### Effort Estimate

| Task | Time |
|------|------|
| Add Connect-Web dependency | 1 hour |
| Generate TypeScript from proto | 2 hours |
| Implement 3 TODO methods | 4 hours |
| Add tonic-web to ExEx | 2 hours |
| Integration testing | 4 hours |
| **Total** | **~2 days** |

---

## 2. Escrow Smart Contract

### Current State

```typescript
// wallet-sdk/src/commerce/EscrowClient.ts
// Uses localStorage - funds are NOT actually locked!

async createEscrow(params: CreateEscrowParams): Promise<EscrowResult> {
  // Just stores in memory, no real money movement
  const escrow: EscrowRecord = {
    state: 'locked',  // Lie - nothing is locked
    // ...
  };
  this.escrows.set(escrowId, escrow);
  this.persistEscrows();  // localStorage only
}
```

### Why We Need This

| Reason | Impact |
|--------|--------|
| **Trustless Commerce** | Agents can't safely pay each other without on-chain escrow |
| **Dispute Resolution** | No mechanism for resolving failed services |
| **Composability** | Other contracts can't interact with our escrow |
| **MEV Protection** | Off-chain state can be manipulated |
| **Audit Trail** | On-chain events provide verifiable history |

### How to Implement

**Recommended: Simple Immutable Contract**

```solidity
// contracts/MonmouthEscrow.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract MonmouthEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum State { Locked, Released, Refunded, Disputed, Resolved }

    struct Escrow {
        address payer;
        address recipient;
        address arbiter;
        address token;        // address(0) for ETH
        uint256 amount;
        uint256 expiry;
        State state;
        string serviceId;
    }

    mapping(bytes32 => Escrow) public escrows;

    event EscrowCreated(bytes32 indexed id, address payer, address recipient, uint256 amount);
    event EscrowReleased(bytes32 indexed id);
    event EscrowRefunded(bytes32 indexed id);
    event EscrowDisputed(bytes32 indexed id, address disputedBy);
    event EscrowResolved(bytes32 indexed id, address winner);

    /// @notice Create new escrow (ETH)
    function createEscrow(
        address recipient,
        address arbiter,
        uint256 duration,
        string calldata serviceId
    ) external payable nonReentrant returns (bytes32 id) {
        require(msg.value > 0, "No value");
        require(recipient != address(0), "Invalid recipient");

        id = keccak256(abi.encodePacked(
            msg.sender, recipient, block.timestamp, serviceId
        ));

        escrows[id] = Escrow({
            payer: msg.sender,
            recipient: recipient,
            arbiter: arbiter,
            token: address(0),
            amount: msg.value,
            expiry: block.timestamp + duration,
            state: State.Locked,
            serviceId: serviceId
        });

        emit EscrowCreated(id, msg.sender, recipient, msg.value);
    }

    /// @notice Create escrow with ERC20 token
    function createEscrowToken(
        address token,
        uint256 amount,
        address recipient,
        address arbiter,
        uint256 duration,
        string calldata serviceId
    ) external nonReentrant returns (bytes32 id) {
        require(amount > 0, "No amount");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        id = keccak256(abi.encodePacked(
            msg.sender, recipient, block.timestamp, serviceId
        ));

        escrows[id] = Escrow({
            payer: msg.sender,
            recipient: recipient,
            arbiter: arbiter,
            token: token,
            amount: amount,
            expiry: block.timestamp + duration,
            state: State.Locked,
            serviceId: serviceId
        });

        emit EscrowCreated(id, msg.sender, recipient, amount);
    }

    /// @notice Release funds to recipient (payer only)
    function release(bytes32 id) external nonReentrant {
        Escrow storage e = escrows[id];
        require(msg.sender == e.payer, "Not payer");
        require(e.state == State.Locked, "Invalid state");

        e.state = State.Released;
        _transfer(e.recipient, e.token, e.amount);

        emit EscrowReleased(id);
    }

    /// @notice Refund to payer (after expiry or by recipient)
    function refund(bytes32 id) external nonReentrant {
        Escrow storage e = escrows[id];
        require(e.state == State.Locked, "Invalid state");
        require(
            msg.sender == e.recipient ||
            (msg.sender == e.payer && block.timestamp > e.expiry),
            "Not authorized"
        );

        e.state = State.Refunded;
        _transfer(e.payer, e.token, e.amount);

        emit EscrowRefunded(id);
    }

    /// @notice Initiate dispute (either party)
    function dispute(bytes32 id) external {
        Escrow storage e = escrows[id];
        require(e.state == State.Locked, "Invalid state");
        require(
            msg.sender == e.payer || msg.sender == e.recipient,
            "Not party"
        );

        e.state = State.Disputed;
        emit EscrowDisputed(id, msg.sender);
    }

    /// @notice Resolve dispute (arbiter only)
    function resolveDispute(bytes32 id, bool favorPayer) external nonReentrant {
        Escrow storage e = escrows[id];
        require(msg.sender == e.arbiter, "Not arbiter");
        require(e.state == State.Disputed, "Not disputed");

        e.state = State.Resolved;
        address winner = favorPayer ? e.payer : e.recipient;
        _transfer(winner, e.token, e.amount);

        emit EscrowResolved(id, winner);
    }

    function _transfer(address to, address token, uint256 amount) internal {
        if (token == address(0)) {
            (bool success, ) = to.call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}
```

### SDK Integration

```typescript
// wallet-sdk/src/commerce/EscrowClient.ts - Updated

import { getContract, parseEther } from 'viem';
import { ESCROW_ABI, ESCROW_ADDRESS } from './constants';

export class EscrowClient {
  private contract: ReturnType<typeof getContract>;

  constructor(walletClient: WalletClient, publicClient: PublicClient) {
    this.contract = getContract({
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      client: { public: publicClient, wallet: walletClient },
    });
  }

  async createEscrow(params: CreateEscrowParams): Promise<EscrowResult> {
    // Validate against guardrails first
    const validation = this.wallet.validateTransaction({
      to: ESCROW_ADDRESS,
      value: params.amount,
    });
    if (!validation.allowed) {
      return { success: false, error: validation.reason };
    }

    // Call real contract
    const hash = await this.contract.write.createEscrow(
      [params.recipient, params.arbiter, params.durationSeconds, params.serviceId],
      { value: params.amount }
    );

    // Wait for confirmation
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

    // Parse escrow ID from event
    const escrowId = parseEscrowCreatedEvent(receipt.logs);

    return { success: true, escrowId, txHash: hash };
  }
}
```

### Tradeoffs

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Immutable Contract** | Simple, auditable, no upgrade risk | Can't fix bugs | **Recommended for MVP** |
| **UUPS Proxy** | Upgradeable, can add features | More complex, trust in admin | Future option |
| **Diamond Pattern** | Modular, very flexible | Complex, high gas | Overengineered |
| **Gnosis Safe Module** | Multi-sig, battle-tested | External dependency | Different use case |

**Dispute Resolution Tradeoffs**:

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Single Arbiter** | Simple, fast | Centralized trust | **MVP** |
| **Multi-sig Arbiters** | More trust-minimized | Coordination overhead | Phase 2 |
| **Kleros/Aragon Court** | Fully decentralized | External dependency, slow | Future |
| **Optimistic (challenge)** | Trust-minimized | 7-day delay | Future |

**Decision**: Start with single arbiter (can be DAO multi-sig). Upgrade to decentralized arbitration later.

### Gas Optimization

| Operation | Estimated Gas | Notes |
|-----------|---------------|-------|
| createEscrow (ETH) | ~80,000 | Single storage slot |
| createEscrow (ERC20) | ~120,000 | + token transfer |
| release | ~40,000 | State change + transfer |
| refund | ~40,000 | State change + transfer |
| dispute | ~25,000 | State change only |
| resolveDispute | ~45,000 | State change + transfer |

### Effort Estimate

| Task | Time |
|------|------|
| Write Solidity contract | 4 hours |
| Write tests (Foundry) | 4 hours |
| Security review | 8 hours |
| Deploy to testnet | 2 hours |
| Update SDK client | 4 hours |
| Integration tests | 4 hours |
| **Total** | **~1 week** |

---

## 3. EIP-712 Signing Implementation

### Current State

```typescript
// wallet-sdk/src/identity/AgentIdentity.ts

// Uses simplified hash - NOT EIP-712!
private hashMessage(message: string): string {
  let hash = 0;
  for (let i = 0; i < message.length; i++) {
    const char = message.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;  // Simple hash, not cryptographic
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}

// Stub signature
private async stubSign(data: string): Promise<Hex> {
  const hash = this.hashMessage(data);
  return `0x${hash}${'0'.repeat(64 - hash.length)}${'1b'}` as Hex;
}
```

### Why We Need This

| Reason | Impact |
|--------|--------|
| **On-chain Verification** | Can't verify signatures in smart contracts |
| **Security** | Current "signatures" are trivially forgeable |
| **Interoperability** | Standard wallets expect EIP-712 format |
| **UX** | Users see human-readable signing requests |
| **Gasless Transactions** | ERC-2612 permits require EIP-712 |

### How to Implement

**EIP-712 Domain Separator**

```typescript
// types.ts
export const AGENT_IDENTITY_DOMAIN = {
  name: 'MonmouthAgentIdentity',
  version: '1',
  chainId: 7750,  // Monmouth L2
  verifyingContract: '0x...',  // Identity registry (optional)
} as const;

export const IDENTITY_TYPES = {
  Identity: [
    { name: 'id', type: 'string' },
    { name: 'controller', type: 'address' },
    { name: 'agentType', type: 'string' },
    { name: 'capabilities', type: 'string' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expiry', type: 'uint256' },
  ],
} as const;

export const PAYMENT_TYPES = {
  Payment: [
    { name: 'recipient', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'token', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expiry', type: 'uint256' },
  ],
} as const;
```

**viem Integration**

```typescript
// AgentIdentity.ts - Updated
import { signTypedData } from 'viem/actions';

export class AgentIdentityManager {
  private walletClient: WalletClient;

  async signIdentity(): Promise<SignedIdentity> {
    if (!this.identity) throw new IdentityError('NOT_INITIALIZED');

    const message = {
      id: this.identity.id,
      controller: this.identity.controller,
      agentType: this.identity.agentType,
      capabilities: this.identity.capabilities.join(','),
      nonce: BigInt(this.identity.nonce || 0),
      expiry: BigInt(Date.now() + 24 * 60 * 60 * 1000), // 24h
    };

    const signature = await signTypedData(this.walletClient, {
      account: this.identity.controller,
      domain: AGENT_IDENTITY_DOMAIN,
      types: IDENTITY_TYPES,
      primaryType: 'Identity',
      message,
    });

    return {
      document: this.identity,
      signature,
      signedAt: Date.now(),
    };
  }
}
```

**On-chain Verification**

```solidity
// contracts/AgentIdentityVerifier.sol
contract AgentIdentityVerifier {
    bytes32 public constant IDENTITY_TYPEHASH = keccak256(
        "Identity(string id,address controller,string agentType,string capabilities,uint256 nonce,uint256 expiry)"
    );

    function verifyIdentity(
        string calldata id,
        address controller,
        string calldata agentType,
        string calldata capabilities,
        uint256 nonce,
        uint256 expiry,
        bytes calldata signature
    ) external view returns (bool) {
        require(block.timestamp < expiry, "Signature expired");

        bytes32 structHash = keccak256(abi.encode(
            IDENTITY_TYPEHASH,
            keccak256(bytes(id)),
            controller,
            keccak256(bytes(agentType)),
            keccak256(bytes(capabilities)),
            nonce,
            expiry
        ));

        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, signature);

        return signer == controller;
    }
}
```

### Tradeoffs

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **EIP-712** | Standard, human-readable, on-chain verifiable | More complex than personal_sign | **Required** |
| **personal_sign** | Simple | Not structured, poor UX | Insufficient |
| **EIP-1271** | Works with smart wallets | Requires on-chain call | Complementary |

**Multi-chain Considerations**:

| Strategy | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Chain-specific domain** | Standard, clear | Need different sigs per chain | **Recommended** |
| **Omit chainId** | Cross-chain | Replay attacks possible | Dangerous |
| **Include all chains** | Explicit | Complex | Overengineered |

**Decision**: Use chain-specific domains. For cross-chain identity, sign on home chain and verify the signature is for that chain.

### Replay Protection

```typescript
// Track used nonces
const usedNonces = new Map<string, Set<bigint>>();

function validateNonce(controller: string, nonce: bigint): boolean {
  const used = usedNonces.get(controller) || new Set();
  if (used.has(nonce)) return false;
  used.add(nonce);
  usedNonces.set(controller, used);
  return true;
}
```

### Effort Estimate

| Task | Time |
|------|------|
| Update type definitions | 2 hours |
| Integrate viem signTypedData | 4 hours |
| Add nonce/expiry management | 2 hours |
| Write verification contract | 4 hours |
| Update tests | 4 hours |
| **Total** | **~2-3 days** |

---

## 4. Solana x402 Support

### Current State

```typescript
// wallet-sdk/src/payments/X402Client.ts
// Only supports EVM with EIP-712 signatures

private async createPaymentSignature(payment: X402Payment): Promise<Hex> {
  // EIP-712 only - doesn't work for Solana
  return await signTypedData(this.walletClient, {
    domain: X402_DOMAIN,
    types: X402_PAYMENT_TYPES,
    primaryType: 'Payment',
    message: { ... },
  });
}
```

### Why We Need This

| Reason | Impact |
|--------|--------|
| **Multi-chain SDK** | Our SDK claims to support Solana but x402 is EVM-only |
| **Solana DeFi** | Large Solana ecosystem can't use our payment protocol |
| **Agent Interop** | Cross-chain agents need unified payment interface |

### How to Implement

**Unified Payment Interface**

```typescript
// payments/types.ts
export interface UniversalPaymentRequest {
  amount: bigint;
  token: UniversalAddress;  // EVM hex OR Solana base58
  recipient: UniversalAddress;
  nonce: string;
  expiry: number;
}

export interface UniversalPaymentSignature {
  chainType: 'evm' | 'svm';
  signature: string;  // hex for EVM, base64 for Solana
  publicKey?: string; // Solana only
}
```

**Solana Ed25519 Signing**

```typescript
// payments/SolanaX402.ts
import { sign } from '@noble/ed25519';
import bs58 from 'bs58';

export class SolanaX402Signer {
  private keypair: Keypair;

  async signPayment(payment: UniversalPaymentRequest): Promise<UniversalPaymentSignature> {
    // Create deterministic message format
    const message = this.encodePaymentMessage(payment);

    // Ed25519 signature
    const signature = await sign(
      message,
      this.keypair.secretKey.slice(0, 32) // Private key portion
    );

    return {
      chainType: 'svm',
      signature: bs58.encode(signature),
      publicKey: this.keypair.publicKey.toBase58(),
    };
  }

  private encodePaymentMessage(payment: UniversalPaymentRequest): Uint8Array {
    // Deterministic encoding matching Solana program
    const encoder = new TextEncoder();
    return encoder.encode(JSON.stringify({
      recipient: payment.recipient,
      amount: payment.amount.toString(),
      token: payment.token,
      nonce: payment.nonce,
      expiry: payment.expiry,
    }));
  }
}
```

**SPL Token Support**

```typescript
// payments/SolanaPaymentExecutor.ts
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';

export class SolanaPaymentExecutor {
  async executePayment(
    payment: UniversalPaymentRequest,
    signature: UniversalPaymentSignature
  ): Promise<string> {
    // Verify signature first
    const isValid = await this.verifySignature(payment, signature);
    if (!isValid) throw new Error('Invalid signature');

    const connection = new Connection(this.rpcUrl);
    const tx = new Transaction();

    if (payment.token === 'SOL' || payment.token === NATIVE_MINT.toBase58()) {
      // Native SOL transfer
      tx.add(SystemProgram.transfer({
        fromPubkey: this.payer,
        toPubkey: new PublicKey(payment.recipient),
        lamports: Number(payment.amount),
      }));
    } else {
      // SPL token transfer
      const mint = new PublicKey(payment.token);
      const recipientAta = await getAssociatedTokenAddress(
        mint,
        new PublicKey(payment.recipient)
      );

      // Create ATA if needed
      const ataInfo = await connection.getAccountInfo(recipientAta);
      if (!ataInfo) {
        tx.add(createAssociatedTokenAccountInstruction(
          this.payer,
          recipientAta,
          new PublicKey(payment.recipient),
          mint
        ));
      }

      tx.add(createTransferInstruction(
        await getAssociatedTokenAddress(mint, this.payer),
        recipientAta,
        this.payer,
        Number(payment.amount)
      ));
    }

    const signature = await sendAndConfirmTransaction(connection, tx, [this.signer]);
    return signature;
  }
}
```

**Unified X402Client**

```typescript
// payments/X402Client.ts - Updated
export class X402Client {
  private evmSigner?: EvmX402Signer;
  private solanaSigner?: SolanaX402Signer;

  async makePayment(url: string): Promise<Response> {
    const response = await fetch(url);

    if (response.status !== 402) {
      return response;
    }

    const paymentRequest = this.parseWwwAuthenticate(response.headers);

    // Detect chain from recipient address format
    const chainType = this.detectChainType(paymentRequest.recipient);

    let signature: UniversalPaymentSignature;
    if (chainType === 'evm') {
      signature = await this.evmSigner!.signPayment(paymentRequest);
    } else {
      signature = await this.solanaSigner!.signPayment(paymentRequest);
    }

    // Retry with payment header
    return fetch(url, {
      headers: {
        'X-Payment': JSON.stringify({
          ...paymentRequest,
          signature: signature.signature,
          chainType: signature.chainType,
          publicKey: signature.publicKey,
        }),
      },
    });
  }

  private detectChainType(address: string): 'evm' | 'svm' {
    if (address.startsWith('0x') && address.length === 42) {
      return 'evm';
    }
    // Base58 check for Solana
    try {
      const decoded = bs58.decode(address);
      if (decoded.length === 32) return 'svm';
    } catch {}
    throw new Error(`Unknown address format: ${address}`);
  }
}
```

### Tradeoffs

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Unified interface** | Single API for both chains | Abstraction complexity | **Recommended** |
| **Separate clients** | Simpler per-chain | Duplicated logic, poor DX | Avoid |
| **Solana Pay standard** | Existing standard | Different protocol | Complementary |

**Signature Scheme**:

| Scheme | Chain | Use Case |
|--------|-------|----------|
| **secp256k1 (EIP-712)** | EVM | Smart contract verification |
| **Ed25519** | Solana | Native Solana verification |

**Key Management**:

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Separate keypairs** | Chain-native, secure | UX burden, two wallets | Current state |
| **Derive from seed** | Single backup | Complex derivation | Future |
| **Multi-chain wallet** | Best UX | Depends on wallet support | Ideal |

### Effort Estimate

| Task | Time |
|------|------|
| Design unified interface | 2 hours |
| Implement SolanaX402Signer | 4 hours |
| Implement SPL token support | 4 hours |
| Update X402Client | 4 hours |
| Server-side verification | 4 hours |
| Integration tests | 4 hours |
| **Total** | **~1 week** |

---

## 5. Token Registry

### Current State

```typescript
// Hardcoded in wallet-sdk - NO dynamic registry
const SUPPORTED_TOKENS = {
  ETH: { symbol: 'ETH', decimals: 18 },
  USDC: { symbol: 'USDC', decimals: 6, address: '0xA0b8...' },
  USDT: { symbol: 'USDT', decimals: 6, address: '0xdAC1...' },
  DAI: { symbol: 'DAI', decimals: 18, address: '0x6B17...' },
};
```

### Why We Need This

| Reason | Impact |
|--------|--------|
| **Token Diversity** | Users want to use tokens we haven't hardcoded |
| **New Token Support** | Can't add tokens without SDK update |
| **Multi-chain** | Same token has different addresses per chain |
| **Scam Protection** | Need to verify tokens aren't malicious |

### How to Implement

**Token Registry Architecture**

```typescript
// tokens/TokenRegistry.ts
export interface TokenInfo {
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  addresses: Record<ChainId, string>;  // chainId -> address
  verified: boolean;
  tags?: string[];  // ['stablecoin', 'defi', etc.]
}

export class TokenRegistry {
  private cache: Map<string, TokenInfo> = new Map();
  private lists: TokenList[] = [];

  constructor(config: TokenRegistryConfig) {
    // Load default lists
    this.loadList(UNISWAP_DEFAULT_LIST);
    this.loadList(COINGECKO_LIST);

    // Load from localStorage
    this.restoreCache();
  }

  async getToken(addressOrSymbol: string, chainId: number): Promise<TokenInfo | null> {
    // Check cache first
    const cached = this.cache.get(this.cacheKey(addressOrSymbol, chainId));
    if (cached) return cached;

    // Try on-chain metadata
    if (addressOrSymbol.startsWith('0x')) {
      return this.fetchOnChainMetadata(addressOrSymbol, chainId);
    }

    // Search token lists
    return this.searchLists(addressOrSymbol, chainId);
  }

  private async fetchOnChainMetadata(address: string, chainId: number): Promise<TokenInfo> {
    const client = this.getClient(chainId);

    const [name, symbol, decimals] = await Promise.all([
      client.readContract({ address, abi: erc20Abi, functionName: 'name' }),
      client.readContract({ address, abi: erc20Abi, functionName: 'symbol' }),
      client.readContract({ address, abi: erc20Abi, functionName: 'decimals' }),
    ]);

    const token: TokenInfo = {
      name,
      symbol,
      decimals,
      addresses: { [chainId]: address },
      verified: false,  // On-chain fetch = unverified
    };

    this.cache.set(this.cacheKey(address, chainId), token);
    this.persistCache();

    return token;
  }

  // Add custom token (user-provided)
  addCustomToken(token: TokenInfo): void {
    token.verified = false;  // User-added = unverified
    token.tags = [...(token.tags || []), 'custom'];

    for (const [chainId, address] of Object.entries(token.addresses)) {
      this.cache.set(this.cacheKey(address, Number(chainId)), token);
    }

    this.persistCache();
  }

  // Check if token is potentially a scam
  async checkTokenSafety(address: string, chainId: number): Promise<TokenSafetyResult> {
    const warnings: string[] = [];

    // Check against known scam lists
    if (await this.isKnownScam(address)) {
      return { safe: false, warnings: ['Known scam token'] };
    }

    // Check contract verification
    const verified = await this.isContractVerified(address, chainId);
    if (!verified) {
      warnings.push('Unverified contract');
    }

    // Check liquidity
    const liquidity = await this.checkLiquidity(address, chainId);
    if (liquidity < 10000) {
      warnings.push('Low liquidity');
    }

    return {
      safe: warnings.length === 0,
      warnings
    };
  }
}
```

**Solana Token Metadata (Metaplex)**

```typescript
// tokens/SolanaTokenRegistry.ts
import { Metaplex } from '@metaplex-foundation/js';

export class SolanaTokenRegistry {
  private metaplex: Metaplex;

  async getToken(mintAddress: string): Promise<TokenInfo | null> {
    const mint = new PublicKey(mintAddress);

    try {
      const nft = await this.metaplex.nfts().findByMint({ mintAddress: mint });

      return {
        symbol: nft.symbol,
        name: nft.name,
        decimals: 0,  // NFTs have 0 decimals
        logoURI: nft.json?.image,
        addresses: { solana: mintAddress },
        verified: nft.collection?.verified || false,
      };
    } catch {
      // Try as fungible token
      return this.getFungibleToken(mint);
    }
  }

  private async getFungibleToken(mint: PublicKey): Promise<TokenInfo | null> {
    const mintInfo = await getMint(this.connection, mint);

    // Try to get metadata from Metaplex
    const metadata = await this.metaplex.nfts().findByMint({ mintAddress: mint })
      .catch(() => null);

    return {
      symbol: metadata?.symbol || 'UNKNOWN',
      name: metadata?.name || 'Unknown Token',
      decimals: mintInfo.decimals,
      logoURI: metadata?.json?.image,
      addresses: { solana: mint.toBase58() },
      verified: false,
    };
  }
}
```

### Tradeoffs

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Token Lists (Uniswap)** | Curated, trusted | Not all tokens | Primary source |
| **On-chain fetch** | Complete | Unverified, slow | Fallback |
| **CoinGecko API** | Comprehensive | Rate limits, external dep | Supplementary |
| **Bundle tokens** | Fast, offline | Outdated quickly | Minimal set only |

**Caching Strategy**:

| Strategy | Pros | Cons | Verdict |
|----------|------|------|---------|
| **localStorage** | Simple, persistent | 5MB limit | For metadata |
| **IndexedDB** | Large storage | More complex | For logos |
| **In-memory only** | Fast | Lost on refresh | Not sufficient |

**Decision**: Use token lists as primary, on-chain as fallback, cache in localStorage with IndexedDB for images.

### Effort Estimate

| Task | Time |
|------|------|
| Design TokenInfo interface | 1 hour |
| Implement EVM registry | 4 hours |
| Implement Solana registry | 4 hours |
| Add caching layer | 2 hours |
| Scam detection | 4 hours |
| Tests | 4 hours |
| **Total** | **~2-3 days** |

---

## 6. IndexedDB Migration

### Current State

```typescript
// wallet-sdk/src/memory/ActivityLog.ts
// Uses localStorage - 5MB limit!

private persistEntries(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(
      Array.from(this.entries.entries())
    ));
  } catch (error) {
    // QuotaExceededError when > 5MB
    console.error('[ActivityLog] Failed to persist:', error);
  }
}
```

### Why We Need This

| Reason | Impact |
|--------|--------|
| **Storage Limit** | localStorage is 5MB; agents can generate MBs of activity |
| **Performance** | JSON.parse/stringify of large objects is slow |
| **Indexing** | Can't query efficiently without full scan |
| **Concurrency** | Multiple tabs corrupt localStorage |

### How to Implement

**Recommended Library: Dexie.js**

```typescript
// memory/ActivityDatabase.ts
import Dexie, { Table } from 'dexie';

export interface ActivityEntry {
  id?: number;  // Auto-increment
  agentId: string;
  actionType: string;
  data: unknown;
  timestamp: number;
  txHash?: string;
  synced: boolean;
}

export class ActivityDatabase extends Dexie {
  activities!: Table<ActivityEntry>;

  constructor() {
    super('MonmouthActivityLog');

    this.version(1).stores({
      activities: '++id, agentId, actionType, timestamp, synced, txHash',
    });
  }

  // Efficient queries with indexes
  async getByAgent(agentId: string, limit = 100): Promise<ActivityEntry[]> {
    return this.activities
      .where('agentId')
      .equals(agentId)
      .reverse()
      .limit(limit)
      .toArray();
  }

  async getByTimeRange(start: number, end: number): Promise<ActivityEntry[]> {
    return this.activities
      .where('timestamp')
      .between(start, end)
      .toArray();
  }

  async getPendingSync(): Promise<ActivityEntry[]> {
    return this.activities
      .where('synced')
      .equals(false)
      .toArray();
  }

  async markSynced(ids: number[]): Promise<void> {
    await this.activities
      .where('id')
      .anyOf(ids)
      .modify({ synced: true });
  }

  // Bulk operations for performance
  async bulkLog(entries: Omit<ActivityEntry, 'id'>[]): Promise<void> {
    await this.activities.bulkAdd(entries);
  }

  // Export for backup
  async exportJSON(): Promise<string> {
    const all = await this.activities.toArray();
    return JSON.stringify(all);
  }

  // Import from backup
  async importJSON(json: string): Promise<void> {
    const entries = JSON.parse(json);
    await this.activities.bulkPut(entries);
  }
}
```

**Migration from localStorage**

```typescript
// memory/migration.ts
export async function migrateToIndexedDB(): Promise<void> {
  const db = new ActivityDatabase();

  // Check if migration needed
  const migrated = localStorage.getItem('monmouth_activity_migrated');
  if (migrated === 'true') return;

  // Read old data
  const oldData = localStorage.getItem('monmouth_activity_log');
  if (!oldData) {
    localStorage.setItem('monmouth_activity_migrated', 'true');
    return;
  }

  try {
    const entries: [string, ActivityEntry][] = JSON.parse(oldData);

    // Convert to new format
    const newEntries = entries.map(([, entry]) => ({
      ...entry,
      synced: entry.synced ?? false,
    }));

    // Bulk insert
    await db.bulkLog(newEntries);

    // Mark migration complete
    localStorage.setItem('monmouth_activity_migrated', 'true');

    // Keep old data for 30 days as backup
    localStorage.setItem('monmouth_activity_log_backup', oldData);
    localStorage.removeItem('monmouth_activity_log');

    console.log(`[Migration] Migrated ${newEntries.length} entries to IndexedDB`);
  } catch (error) {
    console.error('[Migration] Failed:', error);
    // Don't mark as migrated, will retry next time
  }
}
```

**Encryption at Rest (Optional)**

```typescript
// memory/EncryptedDatabase.ts
import { ActivityDatabase } from './ActivityDatabase';

export class EncryptedActivityDatabase extends ActivityDatabase {
  private key: CryptoKey | null = null;

  async unlock(password: string): Promise<void> {
    const salt = await this.getOrCreateSalt();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    this.key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  private async encrypt(data: unknown): Promise<ArrayBuffer> {
    if (!this.key) throw new Error('Database locked');

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.key,
      new TextEncoder().encode(JSON.stringify(data))
    );

    // Prepend IV to ciphertext
    const result = new Uint8Array(iv.length + encrypted.byteLength);
    result.set(iv);
    result.set(new Uint8Array(encrypted), iv.length);

    return result.buffer;
  }
}
```

### Tradeoffs

| Library | Size | Features | DX | Verdict |
|---------|------|----------|---|---------|
| **Dexie.js** | 35KB | Full query, hooks, migration | Excellent | **Recommended** |
| **idb** | 5KB | Promise wrapper only | Good | If size critical |
| **Raw IndexedDB** | 0KB | None | Poor | Not worth it |
| **localForage** | 10KB | Simple API | Good | Less powerful |

**Schema Versioning**:

```typescript
// Dexie handles this automatically
this.version(1).stores({
  activities: '++id, agentId, timestamp',
});

this.version(2).stores({
  activities: '++id, agentId, timestamp, synced',  // Added index
}).upgrade(tx => {
  // Migration logic
  return tx.table('activities').toCollection().modify(entry => {
    entry.synced = false;
  });
});
```

### Effort Estimate

| Task | Time |
|------|------|
| Add Dexie dependency | 30 min |
| Create ActivityDatabase | 2 hours |
| Implement migration | 2 hours |
| Update ActivityLog to use DB | 4 hours |
| Add encryption (optional) | 4 hours |
| Tests | 4 hours |
| **Total** | **~1-2 days** |

---

## 7. E2E Testnet Testing

### Current State

```
wallet-sdk/
├── src/__tests__/           # 308 unit tests (all passing)
│   ├── core.test.ts
│   ├── PolicyEnforcer.test.ts
│   ├── AgentIdentity.test.ts
│   └── ...
└── (NO E2E tests)
```

### Why We Need This

| Reason | Impact |
|--------|--------|
| **Real Chain Behavior** | Unit tests don't catch gas estimation, revert reasons |
| **Integration Verification** | Wallet connection, signing, broadcast |
| **Regression Prevention** | Catch breaking changes before release |
| **Confidence** | Know the SDK works on actual networks |

### How to Implement

**Testing Stack**

```
┌─────────────────────────────────────────────────────────────┐
│                      E2E Test Suite                          │
├─────────────────────────────────────────────────────────────┤
│  Playwright/Vitest     ←  Test runner                        │
│  Synpress              ←  Wallet automation                  │
│  Anvil (local)         ←  Fast local testing                 │
│  Monmouth Testnet      ←  Realistic testing                  │
│  Solana Devnet         ←  Solana chain testing               │
└─────────────────────────────────────────────────────────────┘
```

**Local Chain Testing (Anvil)**

```typescript
// e2e/setup/anvil.ts
import { spawn } from 'child_process';
import { createTestClient, http } from 'viem';
import { foundry } from 'viem/chains';

let anvilProcess: ChildProcess;

export async function startAnvil(): Promise<void> {
  anvilProcess = spawn('anvil', [
    '--fork-url', process.env.MONMOUTH_RPC_URL || 'http://localhost:8545',
    '--port', '8546',
    '--accounts', '10',
    '--balance', '10000',
  ]);

  // Wait for ready
  await new Promise((resolve) => {
    anvilProcess.stdout?.on('data', (data) => {
      if (data.toString().includes('Listening on')) {
        resolve(true);
      }
    });
  });
}

export async function stopAnvil(): Promise<void> {
  anvilProcess?.kill();
}

// Test client with funded account
export function getTestClient() {
  return createTestClient({
    chain: foundry,
    mode: 'anvil',
    transport: http('http://localhost:8546'),
  });
}
```

**Wallet Automation (Synpress)**

```typescript
// e2e/specs/wallet-connection.spec.ts
import { test, expect } from '@playwright/test';
import { MetaMask } from '@synpress/playwright';

test.describe('Wallet Connection', () => {
  let metamask: MetaMask;

  test.beforeAll(async ({ context }) => {
    metamask = new MetaMask(context);
    await metamask.importWallet(process.env.TEST_SEED_PHRASE!);
  });

  test('should connect wallet and show address', async ({ page }) => {
    await page.goto('http://localhost:5173');

    // Click connect button
    await page.click('[data-testid="connect-wallet"]');

    // Approve in MetaMask
    await metamask.approve();

    // Verify connected
    await expect(page.locator('[data-testid="wallet-address"]'))
      .toContainText('0x');
  });

  test('should initialize agent with policy', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.click('[data-testid="connect-wallet"]');
    await metamask.approve();

    // Initialize agent
    await page.fill('[data-testid="agent-name"]', 'TestAgent');
    await page.selectOption('[data-testid="agent-type"]', 'commerce');
    await page.click('[data-testid="initialize-agent"]');

    // Verify policy applied
    await expect(page.locator('[data-testid="daily-limit"]'))
      .toContainText('10 ETH');
  });

  test('should block transaction exceeding limit', async ({ page }) => {
    // ... setup ...

    // Try to send 100 ETH (exceeds 10 ETH limit)
    await page.fill('[data-testid="send-amount"]', '100');
    await page.click('[data-testid="send-button"]');

    // Should show error
    await expect(page.locator('[data-testid="error-message"]'))
      .toContainText('Exceeds daily limit');
  });
});
```

**CI/CD Integration (GitHub Actions)**

```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  e2e-local:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Foundry
        uses: foundry-rs/foundry-toolchain@v1

      - name: Install dependencies
        run: cd wallet-sdk && npm ci

      - name: Start Anvil
        run: anvil --port 8545 &

      - name: Run E2E tests
        run: cd wallet-sdk && npm run test:e2e
        env:
          ANVIL_RPC_URL: http://localhost:8545

  e2e-testnet:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'  # Only on main
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: cd wallet-sdk && npm ci

      - name: Run testnet E2E
        run: cd wallet-sdk && npm run test:e2e:testnet
        env:
          MONMOUTH_TESTNET_RPC: ${{ secrets.MONMOUTH_TESTNET_RPC }}
          TEST_PRIVATE_KEY: ${{ secrets.TEST_PRIVATE_KEY }}
```

**Test Wallet Management**

```typescript
// e2e/setup/wallets.ts
import { mnemonicToAccount, generateMnemonic } from 'viem/accounts';

// Deterministic test wallets (NEVER use on mainnet!)
const TEST_MNEMONIC = 'test test test test test test test test test test test junk';

export function getTestAccount(index: number) {
  return mnemonicToAccount(TEST_MNEMONIC, { addressIndex: index });
}

// Fund test account from faucet
export async function fundTestAccount(
  address: string,
  amount: bigint = parseEther('10')
): Promise<void> {
  const client = getTestClient();

  // Anvil can set balance directly
  await client.setBalance({ address, value: amount });
}
```

### Tradeoffs

| Approach | Speed | Realism | Cost | Verdict |
|----------|-------|---------|------|---------|
| **Anvil fork** | Fast | High | Free | **Primary** |
| **Hardhat** | Fast | High | Free | Alternative |
| **Testnet** | Slow | Highest | Free (faucet) | Weekly |
| **Mainnet fork** | Medium | Highest | RPC costs | For critical paths |

**Wallet Automation**:

| Tool | Pros | Cons | Verdict |
|------|------|------|---------|
| **Synpress** | MetaMask support, Playwright | Complex setup | **Recommended** |
| **Dappeteer** | Simple | Puppeteer only, less maintained | Avoid |
| **Mock wallet** | Fast, no extension | Not realistic | Unit tests only |

**Test Parallelization**:

```typescript
// playwright.config.ts
export default defineConfig({
  workers: process.env.CI ? 1 : 4,  // Serial in CI (wallet state)
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  use: {
    trace: 'on-first-retry',
  },
});
```

### Effort Estimate

| Task | Time |
|------|------|
| Set up Playwright + Synpress | 4 hours |
| Create Anvil helpers | 2 hours |
| Write 5 core E2E tests | 8 hours |
| CI/CD integration | 4 hours |
| Testnet test scripts | 4 hours |
| Documentation | 2 hours |
| **Total** | **~1 week** |

---

## Summary: Implementation Priority

| Component | Priority | Effort | Dependencies |
|-----------|----------|--------|--------------|
| **MemoryClient gRPC** | High | 2 days | ExEx proto finalization |
| **Escrow Contract** | High | 1 week | None |
| **EIP-712 Signing** | High | 2-3 days | None |
| **Solana x402** | Medium | 1 week | None |
| **Token Registry** | Medium | 2-3 days | None |
| **IndexedDB Migration** | Low | 1-2 days | None |
| **E2E Testing** | Medium | 1 week | Test app |

### Recommended Order

1. **EIP-712 Signing** - Foundation for everything else
2. **Escrow Contract** - Enables real commerce
3. **MemoryClient gRPC** - Completes ExEx integration
4. **E2E Testing** - Prevents regressions
5. **Solana x402** - Expands chain support
6. **Token Registry** - Improves UX
7. **IndexedDB** - Handles scale

---

*Generated January 12, 2026 - Research agents contributed to this analysis*
