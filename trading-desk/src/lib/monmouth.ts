import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  parseEther,
  keccak256,
  toHex,
  type Address,
  type Hash,
  type Log,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { defineChain } from 'viem';

// Monmouth L2 chain definition
export const monmouth = defineChain({
  id: 7750,
  name: 'Monmouth L2',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['http://localhost:8545'],
      webSocket: ['ws://localhost:8546'],
    },
  },
  blockExplorers: {
    default: { name: 'Explorer', url: 'http://localhost:8545' },
  },
});

// Contract address (from deployment)
export const ESCROW_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3' as const;

// Anvil default test accounts (pre-funded with 10,000 ETH each)
export const TEST_ACCOUNTS = {
  // Account 0 - Deployer/Admin
  deployer: {
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address,
    privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  },
  // Account 1 - Trader Agent
  trader: {
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address,
    privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  },
  // Account 2 - Research Agent
  research: {
    address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as Address,
    privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  },
} as const;

// Create clients
export const publicClient = createPublicClient({
  chain: monmouth,
  transport: http(),
});

// Create wallet clients for test accounts
export function createTraderWallet() {
  const account = privateKeyToAccount(TEST_ACCOUNTS.trader.privateKey);
  return createWalletClient({
    account,
    chain: monmouth,
    transport: http(),
  });
}

export function createResearchWallet() {
  const account = privateKeyToAccount(TEST_ACCOUNTS.research.privateKey);
  return createWalletClient({
    account,
    chain: monmouth,
    transport: http(),
  });
}

// ABI for MonmouthEscrow (imported from compiled contract)
export const escrowABI = [
  // Events
  {
    type: 'event',
    name: 'EscrowCreated',
    inputs: [
      { indexed: true, name: 'escrowId', type: 'uint256' },
      { indexed: true, name: 'client', type: 'address' },
      { indexed: true, name: 'provider', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint96' },
      { indexed: false, name: 'jobHash', type: 'bytes32' },
      { indexed: false, name: 'deadline', type: 'uint32' },
    ],
  },
  {
    type: 'event',
    name: 'EscrowClaimed',
    inputs: [
      { indexed: true, name: 'escrowId', type: 'uint256' },
      { indexed: true, name: 'provider', type: 'address' },
    ],
  },
  {
    type: 'event',
    name: 'EscrowDelivered',
    inputs: [
      { indexed: true, name: 'escrowId', type: 'uint256' },
      { indexed: false, name: 'resultHash', type: 'bytes32' },
    ],
  },
  {
    type: 'event',
    name: 'EscrowReleased',
    inputs: [
      { indexed: true, name: 'escrowId', type: 'uint256' },
      { indexed: true, name: 'provider', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint96' },
    ],
  },
  {
    type: 'event',
    name: 'EscrowExpired',
    inputs: [
      { indexed: true, name: 'escrowId', type: 'uint256' },
      { indexed: true, name: 'client', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint96' },
    ],
  },
  // Functions
  {
    type: 'function',
    name: 'create',
    stateMutability: 'payable',
    inputs: [
      { name: 'provider', type: 'address' },
      { name: 'jobHash', type: 'bytes32' },
      { name: 'timeout', type: 'uint32' },
    ],
    outputs: [{ name: 'escrowId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'escrowId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'deliver',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'escrowId', type: 'uint256' },
      { name: 'resultHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'release',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'escrowId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'expire',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'escrowId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getEscrow',
    stateMutability: 'view',
    inputs: [{ name: 'escrowId', type: 'uint256' }],
    outputs: [
      { name: 'client', type: 'address' },
      { name: 'provider', type: 'address' },
      { name: 'amount', type: 'uint96' },
      { name: 'deadline', type: 'uint32' },
      { name: 'state', type: 'uint8' },
      { name: 'jobHash', type: 'bytes32' },
      { name: 'resultHash', type: 'bytes32' },
    ],
  },
  {
    type: 'function',
    name: 'escrowCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalLocked',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const;

// Escrow state enum
export enum EscrowState {
  OPEN = 0,
  CLAIMED = 1,
  DELIVERED = 2,
  RESOLVED = 3,
}

// Types
export interface Escrow {
  id: bigint;
  client: Address;
  provider: Address;
  amount: bigint;
  deadline: number;
  state: EscrowState;
  jobHash: Hash;
  resultHash: Hash;
}

export interface EscrowEvent {
  type: 'created' | 'claimed' | 'delivered' | 'released' | 'expired';
  escrowId: bigint;
  txHash: Hash;
  blockNumber: bigint;
  timestamp?: number;
  data?: Record<string, unknown>;
}

// Helper functions
export async function getBalance(address: Address): Promise<string> {
  const balance = await publicClient.getBalance({ address });
  return formatEther(balance);
}

export async function getEscrow(escrowId: bigint): Promise<Escrow | null> {
  try {
    const result = await publicClient.readContract({
      address: ESCROW_ADDRESS,
      abi: escrowABI,
      functionName: 'getEscrow',
      args: [escrowId],
    });

    const [client, provider, amount, deadline, state, jobHash, resultHash] = result as [
      Address,
      Address,
      bigint,
      number,
      number,
      Hash,
      Hash
    ];

    return {
      id: escrowId,
      client,
      provider,
      amount,
      deadline,
      state: state as EscrowState,
      jobHash,
      resultHash,
    };
  } catch {
    return null;
  }
}

export async function getEscrowCount(): Promise<bigint> {
  const count = await publicClient.readContract({
    address: ESCROW_ADDRESS,
    abi: escrowABI,
    functionName: 'escrowCount',
  });
  return count as bigint;
}

export async function getTotalLocked(): Promise<string> {
  const locked = await publicClient.readContract({
    address: ESCROW_ADDRESS,
    abi: escrowABI,
    functionName: 'totalLocked',
  });
  return formatEther(locked as bigint);
}

// Watch for escrow events
export function watchEscrowEvents(
  onEvent: (event: EscrowEvent) => void
): () => void {
  const unwatch = publicClient.watchContractEvent({
    address: ESCROW_ADDRESS,
    abi: escrowABI,
    onLogs: (logs) => {
      for (const log of logs) {
        const event = parseEscrowLog(log);
        if (event) {
          onEvent(event);
        }
      }
    },
  });

  return unwatch;
}

function parseEscrowLog(log: Log): EscrowEvent | null {
  const eventName = (log as unknown as { eventName?: string }).eventName;
  const args = (log as unknown as { args?: Record<string, unknown> }).args;

  if (!eventName || !args) return null;

  const base = {
    txHash: log.transactionHash as Hash,
    blockNumber: log.blockNumber as bigint,
    escrowId: args.escrowId as bigint,
  };

  switch (eventName) {
    case 'EscrowCreated':
      return { ...base, type: 'created', data: args };
    case 'EscrowClaimed':
      return { ...base, type: 'claimed', data: args };
    case 'EscrowDelivered':
      return { ...base, type: 'delivered', data: args };
    case 'EscrowReleased':
      return { ...base, type: 'released', data: args };
    case 'EscrowExpired':
      return { ...base, type: 'expired', data: args };
    default:
      return null;
  }
}

// Transaction helpers
export async function createEscrow(
  provider: Address,
  jobDescription: string,
  amountEth: string,
  timeoutSeconds: number
): Promise<Hash> {
  const wallet = createTraderWallet();
  // Hash the job description using keccak256
  const jobHash = keccak256(toHex(jobDescription));

  const hash = await wallet.writeContract({
    address: ESCROW_ADDRESS,
    abi: escrowABI,
    functionName: 'create',
    args: [provider, jobHash, timeoutSeconds],
    value: parseEther(amountEth),
  });

  return hash;
}

export async function claimEscrow(escrowId: bigint): Promise<Hash> {
  const wallet = createResearchWallet();

  const hash = await wallet.writeContract({
    address: ESCROW_ADDRESS,
    abi: escrowABI,
    functionName: 'claim',
    args: [escrowId],
  });

  return hash;
}

export async function deliverEscrow(
  escrowId: bigint,
  result: string
): Promise<Hash> {
  const wallet = createResearchWallet();
  // Hash the result using keccak256
  const resultHash = keccak256(toHex(result));

  const hash = await wallet.writeContract({
    address: ESCROW_ADDRESS,
    abi: escrowABI,
    functionName: 'deliver',
    args: [escrowId, resultHash],
  });

  return hash;
}

export async function releaseEscrow(escrowId: bigint): Promise<Hash> {
  const wallet = createTraderWallet();

  const hash = await wallet.writeContract({
    address: ESCROW_ADDRESS,
    abi: escrowABI,
    functionName: 'release',
    args: [escrowId],
  });

  return hash;
}
