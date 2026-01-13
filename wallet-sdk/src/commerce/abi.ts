/**
 * Contract ABIs for Monmouth Escrow
 *
 * These ABIs match the contracts in /contracts/MonmouthEscrow.sol
 */

/**
 * MonmouthEscrow contract ABI
 */
export const MONMOUTH_ESCROW_ABI = [
  // Creation
  {
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'duration', type: 'uint256' },
      { name: 'serviceId', type: 'bytes32' },
      { name: 'arbiter', type: 'address' },
    ],
    name: 'createEscrowETH',
    outputs: [{ name: 'escrowId', type: 'bytes32' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'duration', type: 'uint256' },
      { name: 'serviceId', type: 'bytes32' },
      { name: 'arbiter', type: 'address' },
    ],
    name: 'createEscrowERC20',
    outputs: [{ name: 'escrowId', type: 'bytes32' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'depositor', type: 'address' },
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'token', type: 'address' },
      { name: 'duration', type: 'uint256' },
      { name: 'serviceId', type: 'string' },
      { name: 'signature', type: 'bytes' },
    ],
    name: 'createEscrowWithSignature',
    outputs: [{ name: 'escrowId', type: 'bytes32' }],
    stateMutability: 'payable',
    type: 'function',
  },

  // Actions
  {
    inputs: [{ name: 'escrowId', type: 'bytes32' }],
    name: 'release',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'escrowId', type: 'bytes32' },
      { name: 'signature', type: 'bytes' },
    ],
    name: 'releaseWithSignature',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'escrowId', type: 'bytes32' }],
    name: 'refund',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'escrowId', type: 'bytes32' },
      { name: 'reason', type: 'string' },
    ],
    name: 'dispute',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'escrowId', type: 'bytes32' },
      { name: 'depositorBps', type: 'uint256' },
    ],
    name: 'resolveDispute',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },

  // View functions
  {
    inputs: [{ name: 'escrowId', type: 'bytes32' }],
    name: 'getEscrow',
    outputs: [
      { name: 'depositor', type: 'address' },
      { name: 'recipient', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'createdAt', type: 'uint256' },
      { name: 'expiresAt', type: 'uint256' },
      { name: 'serviceId', type: 'bytes32' },
      { name: 'state', type: 'uint8' },
      { name: 'arbiter', type: 'address' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'escrowId', type: 'bytes32' }],
    name: 'isActive',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'escrowId', type: 'bytes32' }],
    name: 'isExpired',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'getNonce',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'DOMAIN_SEPARATOR',
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'protocolFeeBps',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },

  // Events
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'escrowId', type: 'bytes32' },
      { indexed: true, name: 'depositor', type: 'address' },
      { indexed: true, name: 'recipient', type: 'address' },
      { indexed: false, name: 'token', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
      { indexed: false, name: 'expiresAt', type: 'uint256' },
      { indexed: false, name: 'serviceId', type: 'bytes32' },
    ],
    name: 'EscrowCreated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'escrowId', type: 'bytes32' },
      { indexed: true, name: 'recipient', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
      { indexed: false, name: 'fee', type: 'uint256' },
    ],
    name: 'EscrowReleased',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'escrowId', type: 'bytes32' },
      { indexed: true, name: 'depositor', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
    ],
    name: 'EscrowRefunded',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'escrowId', type: 'bytes32' },
      { indexed: true, name: 'disputer', type: 'address' },
      { indexed: false, name: 'reason', type: 'string' },
    ],
    name: 'EscrowDisputed',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'escrowId', type: 'bytes32' },
      { indexed: true, name: 'winner', type: 'address' },
      { indexed: false, name: 'depositorAmount', type: 'uint256' },
      { indexed: false, name: 'recipientAmount', type: 'uint256' },
    ],
    name: 'DisputeResolved',
    type: 'event',
  },
] as const

/**
 * MonmouthVerifier contract ABI
 */
export const MONMOUTH_VERIFIER_ABI = [
  {
    inputs: [
      { name: 'id', type: 'string' },
      { name: 'controller', type: 'address' },
      { name: 'agentType', type: 'string' },
      { name: 'capabilities', type: 'string' },
      { name: 'nonce', type: 'uint256' },
      { name: 'expiry', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ],
    name: 'verifyIdentity',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'token', type: 'address' },
      { name: 'nonce', type: 'string' },
      { name: 'expiry', type: 'uint256' },
      { name: 'description', type: 'string' },
      { name: 'signature', type: 'bytes' },
    ],
    name: 'verifyPayment',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getIdentityDomainSeparator',
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getPaymentDomainSeparator',
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

/**
 * EscrowState enum mapping
 */
export const ESCROW_STATE = {
  Created: 0,
  Released: 1,
  Refunded: 2,
  Disputed: 3,
} as const

export type EscrowStateValue = (typeof ESCROW_STATE)[keyof typeof ESCROW_STATE]
