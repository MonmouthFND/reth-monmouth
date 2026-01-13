# Embedded Wallet Integration Guide: Privy vs Dynamic

*A comprehensive guide to adding embedded wallet functionality to the Monmouth Wallet SDK*

---

## Introduction

Embedded wallets eliminate the biggest friction point in Web3: seed phrases. Instead of asking users to manage 12-word recovery phrases, embedded wallets use MPC (Multi-Party Computation), passkeys, or smart contracts to provide self-custody without the complexity.

This guide evaluates **Privy** and **Dynamic** for integration into the Monmouth Wallet SDK, which already supports:
- EVM and Solana chain adapters
- x402 payment protocol
- Agent identity and guardrails
- Activity logging and memory

---

## Executive Summary

| Aspect | Privy | Dynamic | Recommendation |
|--------|-------|---------|----------------|
| **Architecture** | SSS (Shamir) + TEE | TSS-MPC | Both solid |
| **Chain Support** | EVM + Solana | EVM, Solana, Bitcoin, Cosmos, Starknet | Dynamic for multi-chain |
| **Smart Wallets** | Built-in AA | Via ZeroDev integration | Privy easier |
| **Pricing** | $299/mo for 2.5K MAU | Enterprise (unlisted) | Privy more predictable |
| **Key Export** | Yes | Yes | Tie |
| **Best For** | Consumer apps, rapid MVP | Multi-chain, enterprise, agents | Dynamic for our SDK |

**Recommendation**: Use **Dynamic** as the primary embedded wallet provider due to:
1. Multi-chain support matching our EVM + Solana adapters
2. Developer-managed wallets for autonomous agents
3. Headless mode for programmatic wallet creation
4. Better fit for agent-specific requirements

---

## Part 1: Privy Deep Dive

### Architecture: TEE + Shamir's Secret Sharing

Privy uses a 3-share system via Shamir's Secret Sharing:

```
┌─────────────────────────────────────────────────────────────┐
│                    Key Generation                            │
│     (Isolated iframe, CSPRNG, 128 bits entropy)             │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
       ┌──────────┐    ┌──────────┐    ┌──────────┐
       │  Device  │    │   Auth   │    │ Recovery │
       │  Share   │    │  Share   │    │  Share   │
       │          │    │          │    │          │
       │ Browser  │    │  Privy   │    │ Password │
       │ Storage  │    │  Server  │    │ or Cloud │
       └──────────┘    └──────────┘    └──────────┘
              │               │               │
              └───────────────┼───────────────┘
                              ▼
       ┌─────────────────────────────────────────────────────┐
       │              AWS Nitro Enclave (TEE)                 │
       │   2-of-3 shares reconstituted, sign, immediately    │
       │   wipe key - neither Privy nor app sees full key    │
       └─────────────────────────────────────────────────────┘
```

**Why SSS over TSS-MPC?**
- SSS is battle-tested (20+ years in production)
- Faster signing (no distributed protocol rounds)
- Key reconstitution happens in TEE, so security is equivalent

### React Integration

```typescript
import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth'

// 1. Wrap app
function App() {
  return (
    <PrivyProvider
      appId="YOUR_APP_ID"
      config={{
        loginMethods: ['email', 'google', 'passkey'],
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
        defaultChain: monmouth, // Your L2
        supportedChains: [monmouth, base, arbitrum],
      }}
    >
      <YourApp />
    </PrivyProvider>
  )
}

// 2. Use in components
function WalletComponent() {
  const { ready, authenticated, login, user } = usePrivy()
  const { wallets } = useWallets()

  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')

  // Get viem wallet client
  const provider = await embeddedWallet?.getEthereumProvider()
  const walletClient = createWalletClient({
    transport: custom(provider),
    chain: monmouth,
  })

  // Sign typed data (for X402)
  const signature = await walletClient.signTypedData({
    domain: X402_DOMAIN,
    types: X402_TYPES,
    primaryType: 'Payment',
    message: paymentData,
  })
}
```

### Smart Wallet (Account Abstraction)

```typescript
import { SmartWalletsProvider, useSmartWallets } from '@privy-io/react-auth/smart-wallets'

// Wrap with smart wallet provider
<PrivyProvider>
  <SmartWalletsProvider>
    <App />
  </SmartWalletsProvider>
</PrivyProvider>

// Use smart wallet
function GaslessTransaction() {
  const { client } = useSmartWallets()

  // Transaction gas paid by your paymaster
  const hash = await client.sendTransaction({
    to: '0x...',
    value: parseEther('0.01'),
  })
}
```

### Recovery Options

| Method | UX | Security | Best For |
|--------|-----|----------|----------|
| **Automatic** | Seamless | Trusts Privy | Low-value wallets, MVPs |
| **Password** | User sets password | User-controlled | Privacy-focused users |
| **Cloud Backup** | Auto via iCloud/Google | Platform trust | Consumer apps |

### Pricing

- **Free**: 50K signatures/month
- **Pay-as-you-go**: $0.005/signature after free tier
- **Enterprise**: Custom

---

## Part 2: Dynamic Deep Dive

### Architecture: TSS-MPC

Dynamic uses Threshold Signature Scheme MPC:

```
┌─────────────────────────────────────────────────────────────┐
│                    Key Share Generation                      │
│              (Distributed Key Generation Protocol)           │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
       ┌──────────────┐              ┌──────────────┐
       │  User Share  │              │ Server Share │
       │              │              │              │
       │   Browser    │◀────MPC────▶│   Dynamic    │
       │   Storage    │   Relay     │   TEE        │
       └──────────────┘              └──────────────┘
                              │
                              ▼
       ┌─────────────────────────────────────────────────────┐
       │           Distributed Signing Protocol               │
       │   Shares never combined - signature computed via     │
       │   secure multi-party computation                     │
       └─────────────────────────────────────────────────────┘
```

**Key Difference from Privy**:
- TSS-MPC: Key shares are **never combined** - signature computed distributively
- SSS (Privy): Shares combined in TEE, then key wiped
- Both achieve similar security, TSS is newer tech

### Multi-Chain Support

Dynamic supports more chains than any competitor:

```typescript
import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core'
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum'
import { SolanaWalletConnectors } from '@dynamic-labs/solana'
import { BitcoinWalletConnectors } from '@dynamic-labs/bitcoin'
import { CosmosWalletConnectors } from '@dynamic-labs/cosmos'

<DynamicContextProvider
  settings={{
    environmentId: 'YOUR_ENV_ID',
    walletConnectors: [
      EthereumWalletConnectors,  // All EVM chains
      SolanaWalletConnectors,    // Solana
      BitcoinWalletConnectors,   // Bitcoin
      CosmosWalletConnectors,    // Cosmos ecosystem
    ],
  }}
>
  <App />
</DynamicContextProvider>
```

### Type-Safe Chain Detection

```typescript
import { isEthereumWallet, isSolanaWallet } from '@dynamic-labs/ethereum-core'

function MultiChainComponent() {
  const { primaryWallet } = useDynamicContext()

  if (isEthereumWallet(primaryWallet)) {
    // TypeScript knows this is EVM
    const provider = await primaryWallet.getWalletClient()
    return <EVMInterface provider={provider} />
  }

  if (isSolanaWallet(primaryWallet)) {
    // TypeScript knows this is Solana
    const connection = await primaryWallet.getConnection()
    return <SolanaInterface connection={connection} />
  }
}
```

### Wagmi + Viem Integration

```typescript
import { DynamicWagmiConnector } from '@dynamic-labs/wagmi-connector'
import { useSignTypedData } from 'wagmi'

<DynamicContextProvider settings={{...}}>
  <DynamicWagmiConnector>
    <App />
  </DynamicWagmiConnector>
</DynamicContextProvider>

// Now wagmi hooks work with Dynamic wallets
function SignPayment() {
  const { signTypedDataAsync } = useSignTypedData()

  const signature = await signTypedDataAsync({
    domain: X402_DOMAIN,
    types: X402_TYPES,
    primaryType: 'Payment',
    message: paymentData,
  })
}
```

### Developer-Managed vs User-Owned Wallets

Dynamic offers two custody models:

| Model | Key Control | Best For |
|-------|-------------|----------|
| **User-Owned** | User controls MPC share | Human users |
| **Developer-Managed** | App controls via API | Autonomous agents |

For agents, developer-managed wallets are ideal:

```typescript
// Server-side agent wallet creation
import { createEmbeddedWallet } from '@dynamic-labs/sdk-api'

async function createAgentWallet(agentId: string) {
  const wallet = await createEmbeddedWallet({
    userId: agentId,
    chainId: 7750, // Monmouth
    walletType: 'embedded',
    custodyModel: 'developer-managed',
  })

  return wallet
}
```

---

## Part 3: Integration with Monmouth SDK

### Architecture Decision

Our SDK already has chain adapters (`EvmAdapter`, `SolanaAdapter`). We'll add embedded wallet providers as **signer sources** that plug into existing adapters:

```
┌─────────────────────────────────────────────────────────────┐
│                    MonmouthWallet                            │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                    ChainAdapter                          │ │
│  │  ┌─────────────┐              ┌─────────────────────┐   │ │
│  │  │ EvmAdapter  │              │   SolanaAdapter     │   │ │
│  │  └──────┬──────┘              └──────────┬──────────┘   │ │
│  └─────────┼────────────────────────────────┼──────────────┘ │
│            │                                │                │
│  ┌─────────┴────────────────────────────────┴──────────────┐ │
│  │                    SignerProvider                        │ │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌───────────┐   │ │
│  │  │  Privy  │  │ Dynamic │  │ Private │  │ Hardware  │   │ │
│  │  │ Signer  │  │ Signer  │  │   Key   │  │  Wallet   │   │ │
│  │  └─────────┘  └─────────┘  └─────────┘  └───────────┘   │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Implementation: Privy Adapter

```typescript
// src/providers/privy/PrivySignerAdapter.ts

import { usePrivy, useWallets } from '@privy-io/react-auth'
import { createWalletClient, custom } from 'viem'
import type { ChainAdapter, UniversalAddress, TxResult } from '../core/types'

export class PrivyEvmAdapter implements ChainAdapter {
  readonly chainType = 'evm' as const
  private walletClient: WalletClient | null = null

  constructor(private privyWallet: PrivyEmbeddedWallet) {}

  async connect(): Promise<void> {
    const provider = await this.privyWallet.getEthereumProvider()
    this.walletClient = createWalletClient({
      transport: custom(provider),
      chain: monmouth,
    })
  }

  async getAddress(): Promise<UniversalAddress> {
    const [address] = await this.walletClient!.getAddresses()
    return {
      raw: hexToBytes(address),
      display: address,
      chainType: 'evm',
    }
  }

  async signTypedData(params: EIP712Params): Promise<Hex> {
    return this.walletClient!.signTypedData({
      account: this.privyWallet.address as `0x${string}`,
      ...params,
    })
  }

  async sendTransaction(tx: UniversalTransaction): Promise<TxResult> {
    const hash = await this.walletClient!.sendTransaction({
      to: tx.to.display as `0x${string}`,
      value: tx.value,
      data: tx.data ? bytesToHex(tx.data) : undefined,
    })
    return {
      hash: { bytes: hexToBytes(hash), display: hash, chainType: 'evm' },
      status: 'pending',
    }
  }
}
```

### Implementation: Dynamic Adapter

```typescript
// src/providers/dynamic/DynamicSignerAdapter.ts

import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { isEthereumWallet, isSolanaWallet } from '@dynamic-labs/ethereum-core'
import type { ChainAdapter } from '../core/types'

export class DynamicEvmAdapter implements ChainAdapter {
  readonly chainType = 'evm' as const

  constructor(private dynamicWallet: DynamicWallet) {
    if (!isEthereumWallet(dynamicWallet)) {
      throw new Error('Expected Ethereum wallet')
    }
  }

  async connect(): Promise<void> {
    // Dynamic handles connection internally
  }

  async getAddress(): Promise<UniversalAddress> {
    return {
      raw: hexToBytes(this.dynamicWallet.address),
      display: this.dynamicWallet.address,
      chainType: 'evm',
    }
  }

  async signTypedData(params: EIP712Params): Promise<Hex> {
    const walletClient = await this.dynamicWallet.getWalletClient()
    return walletClient.signTypedData(params)
  }

  async sendTransaction(tx: UniversalTransaction): Promise<TxResult> {
    const walletClient = await this.dynamicWallet.getWalletClient()
    const hash = await walletClient.sendTransaction({
      to: tx.to.display as `0x${string}`,
      value: tx.value,
      data: tx.data ? bytesToHex(tx.data) : undefined,
    })
    return {
      hash: { bytes: hexToBytes(hash), display: hash, chainType: 'evm' },
      status: 'pending',
    }
  }
}

export class DynamicSolanaAdapter implements ChainAdapter {
  readonly chainType = 'solana' as const

  constructor(private dynamicWallet: DynamicWallet) {
    if (!isSolanaWallet(dynamicWallet)) {
      throw new Error('Expected Solana wallet')
    }
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    const signature = await this.dynamicWallet.signMessage(message)
    return signature
  }

  // ... implement other methods
}
```

### Hook: useEmbeddedAgentWallet

```typescript
// src/hooks/useEmbeddedAgentWallet.ts

import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { useSignTypedData } from 'wagmi'
import { AgentWallet } from '../wallet/AgentWallet'
import { createX402Client } from '../payments/X402Client'

export function useEmbeddedAgentWallet(config: AgentWalletConfig) {
  const { primaryWallet, user, sdkHasLoaded } = useDynamicContext()
  const { signTypedDataAsync } = useSignTypedData()

  const [agentWallet, setAgentWallet] = useState<AgentWallet | null>(null)
  const [x402Client, setX402Client] = useState<X402Client | null>(null)

  useEffect(() => {
    if (!sdkHasLoaded || !user || !primaryWallet) {
      setAgentWallet(null)
      return
    }

    const init = async () => {
      // Create adapter based on chain type
      const adapter = isEthereumWallet(primaryWallet)
        ? new DynamicEvmAdapter(primaryWallet)
        : new DynamicSolanaAdapter(primaryWallet)

      // Create agent wallet with guardrails
      const wallet = new AgentWallet({
        adapter,
        identity: {
          agentId: user.userId,
          agentType: config.agentType,
          name: config.name,
        },
        policy: config.policy ?? DEFAULT_POLICY,
      })

      // Create X402 client with embedded wallet signing
      const x402 = createX402Client(wallet, config.x402Config, {
        signTypedData: async (params) => {
          // Use wagmi for EVM signing
          if (isEthereumWallet(primaryWallet)) {
            return signTypedDataAsync(params)
          }
          // Use Solana signing for Solana
          return wallet.signMessage(encodeX402Message(params))
        },
      })

      setAgentWallet(wallet)
      setX402Client(x402)
    }

    init()
  }, [sdkHasLoaded, user, primaryWallet])

  return {
    agentWallet,
    x402Client,
    isReady: sdkHasLoaded && !!agentWallet,
    user,
    primaryWallet,
  }
}
```

### Headless Agent Creation (Server-Side)

For autonomous agents without UI:

```typescript
// src/providers/dynamic/headless.ts

import { DynamicAPIClient } from '@dynamic-labs/sdk-api'
import { AgentWallet } from '../wallet/AgentWallet'

const dynamicApi = new DynamicAPIClient({
  environmentId: process.env.DYNAMIC_ENV_ID!,
  apiKey: process.env.DYNAMIC_API_KEY!,
})

export async function createHeadlessAgentWallet(
  agentId: string,
  options?: {
    chainType?: 'evm' | 'solana'
    guardrailTemplate?: 'conservative' | 'moderate' | 'autonomous'
  }
): Promise<AgentWallet> {
  // Create embedded wallet via API
  const wallet = await dynamicApi.wallets.create({
    userId: agentId,
    type: 'embedded',
    chain: options?.chainType === 'solana' ? 'solana' : 'evm',
  })

  // Get signing capability
  const signer = await dynamicApi.wallets.getSigner(wallet.id)

  // Select guardrails
  const policy = GUARDRAIL_TEMPLATES[options?.guardrailTemplate ?? 'moderate']

  return new AgentWallet({
    adapter: new ServerSideSignerAdapter(signer),
    identity: {
      agentId,
      agentType: 'autonomous',
      name: `Agent ${agentId.slice(0, 8)}`,
    },
    policy,
  })
}
```

---

## Part 4: X402 Payment Integration

Both Privy and Dynamic integrate seamlessly with our X402 payment protocol:

```typescript
// Example: Paying for API access with embedded wallet

import { useEmbeddedAgentWallet } from '@monmouth/wallet-sdk'

function MarketDataAgent() {
  const { x402Client, isReady } = useEmbeddedAgentWallet({
    agentType: 'research',
    name: 'Market Data Agent',
    policy: {
      maxPerTransaction: parseEther('0.1'),
      maxPerDay: parseEther('1'),
    },
  })

  const fetchMarketData = async (symbol: string) => {
    if (!x402Client) return

    // X402 client handles 402 responses automatically
    // Signs payment with embedded wallet
    const response = await x402Client.fetch(
      `https://api.example.com/v1/market/${symbol}`,
      { method: 'GET' }
    )

    return response.json()
  }

  return (
    <button onClick={() => fetchMarketData('ETH')}>
      Fetch ETH Data (0.001 ETH per request)
    </button>
  )
}
```

---

## Part 5: Security Considerations

### Key Management Comparison

| Aspect | Privy (SSS) | Dynamic (TSS-MPC) |
|--------|-------------|-------------------|
| Key Reconstitution | In TEE, then wiped | Never happens |
| Single Point of Failure | TEE compromise | Requires both shares |
| Signing Speed | Faster (local compute) | Slower (distributed) |
| Audit Status | SOC 2 Type II | SOC 2 Type II |

### Guardrails Integration

**Critical**: Validate transactions with guardrails BEFORE signing:

```typescript
async function sendWithGuardrails(tx: Transaction) {
  // 1. Validate with PolicyEnforcer
  const validation = enforcer.validateTransaction({
    to: tx.to,
    value: tx.value,
    data: tx.data,
  })

  if (!validation.allowed) {
    throw new GuardrailViolation(validation.reason)
  }

  // 2. Log the decision
  await activityLog.log({
    actionType: 'decision',
    data: { tx, validation, decision: 'approved' },
  })

  // 3. Now sign with embedded wallet
  return await embeddedWallet.sendTransaction(tx)
}
```

### Recovery Best Practices

| Wallet Value | Recommended Recovery |
|--------------|---------------------|
| < $100 | Automatic (Privy/Dynamic managed) |
| $100 - $10K | Cloud backup (iCloud/Google) |
| > $10K | Password + cloud backup |
| Institutional | Hardware wallet + MPC |

---

## Part 6: Production Deployment

### Checklist

- [ ] **Environment Separation**: Different app IDs for dev/staging/prod
- [ ] **Recovery Configuration**: Enable user-managed recovery for high-value wallets
- [ ] **Rate Limiting**: Implement server-side limits on signing requests
- [ ] **Monitoring**: Track auth success rate, signing failures, guardrail blocks
- [ ] **Key Export**: Document and test wallet export flow
- [ ] **Session Management**: Configure appropriate timeouts per agent type

### Cost Estimation

**For 1000 agents, 100 transactions/day each:**

| Provider | Monthly Cost |
|----------|-------------|
| **Privy Free Tier** | $0 (50K signatures free) |
| **Privy Paid** | ~$400 (100K × $0.005 - 50K free) |
| **Dynamic** | Contact sales (enterprise) |
| **Gas Sponsorship** | ~$3,000 (100K × $0.03/tx on L2) |

---

## Conclusion

For the Monmouth Wallet SDK, we recommend **Dynamic** as the primary embedded wallet provider:

1. **Multi-chain native** - Matches our EVM + Solana architecture
2. **Developer-managed wallets** - Perfect for autonomous agents
3. **Headless mode** - Programmatic wallet creation without UI
4. **Fireblocks backing** - Enterprise security guarantees
5. **Export capability** - No vendor lock-in

Privy remains an excellent choice for:
- Pure consumer apps
- Rapid prototyping
- Built-in smart wallet features

Both providers integrate cleanly with our existing guardrails, X402 payments, and activity logging - they simply provide the signing layer.

---

## Further Reading

### Privy
- [Privy Documentation](https://docs.privy.io/)
- [Security Architecture](https://docs.privy.io/security/wallet-infrastructure/architecture)
- [Smart Wallets Guide](https://docs.privy.io/wallets/using-wallets/evm-smart-wallets/overview)

### Dynamic
- [Dynamic Documentation](https://docs.dynamic.xyz/)
- [MPC Overview](https://www.dynamic.xyz/docs/wallets/embedded-wallets/mpc/overview)
- [Multi-Chain Support](https://docs.dynamic.xyz/chains/enabling-chains)

### General
- [ERC-4337 Account Abstraction](https://eips.ethereum.org/EIPS/eip-4337)
- [WebAuthn Specification](https://www.w3.org/TR/webauthn-2/)
- [MPC Wallet Security Guide](https://www.cobo.com/post/what-is-an-mpc-wallet-the-complete-security-guide)

---

*This guide is based on research into Privy, Dynamic, and embedded wallet best practices. Last updated: January 2025.*
