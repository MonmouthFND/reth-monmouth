/**
 * Signature Verification Utilities
 *
 * Helpers for verifying EIP-712 signatures both off-chain and on-chain.
 */

import type { Address, Hex, PublicClient } from 'viem'
import { recoverTypedDataAddress, keccak256, encodePacked, toHex } from 'viem'
import {
  type EIP712Domain,
  type IdentityMessage,
  type PaymentMessage,
  type SignedData,
  IDENTITY_TYPES,
  PAYMENT_TYPES,
  SigningError,
} from './types'

/**
 * Solidity ABI for on-chain verification
 */
export const VERIFIER_ABI = [
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
] as const

/**
 * Verify an identity signature off-chain
 */
export async function verifyIdentitySignature(
  signed: SignedData<IdentityMessage>
): Promise<{ valid: boolean; signer: Address }> {
  try {
    // Check expiry
    if (signed.expiresAt && Date.now() > signed.expiresAt) {
      return { valid: false, signer: '0x0000000000000000000000000000000000000000' }
    }

    const signer = await recoverTypedDataAddress({
      domain: signed.domain,
      types: IDENTITY_TYPES,
      primaryType: 'Identity',
      message: signed.message,
      signature: signed.signature,
    })

    const valid =
      signer.toLowerCase() === signed.signer.toLowerCase() &&
      signer.toLowerCase() === signed.message.controller.toLowerCase()

    return { valid, signer }
  } catch {
    return { valid: false, signer: '0x0000000000000000000000000000000000000000' }
  }
}

/**
 * Verify a payment signature off-chain
 */
export async function verifyPaymentSignature(
  signed: SignedData<PaymentMessage>,
  expectedPayer?: Address
): Promise<{ valid: boolean; signer: Address }> {
  try {
    // Check expiry
    const expiryMs = Number(signed.message.expiry) * 1000
    if (Date.now() > expiryMs) {
      return { valid: false, signer: '0x0000000000000000000000000000000000000000' }
    }

    const signer = await recoverTypedDataAddress({
      domain: signed.domain,
      types: PAYMENT_TYPES,
      primaryType: 'Payment',
      message: signed.message,
      signature: signed.signature,
    })

    let valid = signer.toLowerCase() === signed.signer.toLowerCase()
    if (expectedPayer) {
      valid = valid && signer.toLowerCase() === expectedPayer.toLowerCase()
    }

    return { valid, signer }
  } catch {
    return { valid: false, signer: '0x0000000000000000000000000000000000000000' }
  }
}

/**
 * Verify identity signature on-chain
 */
export async function verifyIdentityOnChain(
  client: PublicClient,
  verifierAddress: Address,
  signed: SignedData<IdentityMessage>
): Promise<boolean> {
  try {
    const result = await client.readContract({
      address: verifierAddress,
      abi: VERIFIER_ABI,
      functionName: 'verifyIdentity',
      args: [
        signed.message.id,
        signed.message.controller,
        signed.message.agentType,
        signed.message.capabilities,
        signed.message.nonce,
        signed.message.expiry,
        signed.signature,
      ],
    })
    return result as boolean
  } catch (error) {
    throw new SigningError('VERIFICATION_FAILED', 'On-chain verification failed', { error })
  }
}

/**
 * Verify payment signature on-chain
 */
export async function verifyPaymentOnChain(
  client: PublicClient,
  verifierAddress: Address,
  signed: SignedData<PaymentMessage>
): Promise<boolean> {
  try {
    const result = await client.readContract({
      address: verifierAddress,
      abi: VERIFIER_ABI,
      functionName: 'verifyPayment',
      args: [
        signed.message.recipient,
        signed.message.amount,
        signed.message.token,
        signed.message.nonce,
        signed.message.expiry,
        signed.message.description,
        signed.signature,
      ],
    })
    return result as boolean
  } catch (error) {
    throw new SigningError('VERIFICATION_FAILED', 'On-chain verification failed', { error })
  }
}

/**
 * Compute EIP-712 domain separator
 */
export function computeDomainSeparator(domain: EIP712Domain): Hex {
  const typeHash = keccak256(
    toHex('EIP712Domain(string name,string version,uint256 chainId)')
  )

  return keccak256(
    encodePacked(
      ['bytes32', 'bytes32', 'bytes32', 'uint256'],
      [
        typeHash,
        keccak256(toHex(domain.name)),
        keccak256(toHex(domain.version)),
        BigInt(domain.chainId),
      ]
    )
  )
}

/**
 * Compute struct hash for identity message
 */
export function computeIdentityStructHash(message: IdentityMessage): Hex {
  const typeHash = keccak256(
    toHex(
      'Identity(string id,address controller,string agentType,string capabilities,uint256 nonce,uint256 expiry)'
    )
  )

  return keccak256(
    encodePacked(
      ['bytes32', 'bytes32', 'address', 'bytes32', 'bytes32', 'uint256', 'uint256'],
      [
        typeHash,
        keccak256(toHex(message.id)),
        message.controller,
        keccak256(toHex(message.agentType)),
        keccak256(toHex(message.capabilities)),
        message.nonce,
        message.expiry,
      ]
    )
  )
}

/**
 * Compute struct hash for payment message
 */
export function computePaymentStructHash(message: PaymentMessage): Hex {
  const typeHash = keccak256(
    toHex(
      'Payment(address recipient,uint256 amount,address token,string nonce,uint256 expiry,string description)'
    )
  )

  return keccak256(
    encodePacked(
      ['bytes32', 'address', 'uint256', 'address', 'bytes32', 'uint256', 'bytes32'],
      [
        typeHash,
        message.recipient,
        message.amount,
        message.token,
        keccak256(toHex(message.nonce)),
        message.expiry,
        keccak256(toHex(message.description)),
      ]
    )
  )
}

/**
 * Compute full EIP-712 digest for signing
 */
export function computeDigest(domainSeparator: Hex, structHash: Hex): Hex {
  return keccak256(
    encodePacked(['bytes1', 'bytes1', 'bytes32', 'bytes32'], ['0x19', '0x01', domainSeparator, structHash])
  )
}
