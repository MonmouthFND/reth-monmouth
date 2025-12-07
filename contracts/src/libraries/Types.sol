// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Types
/// @notice Shared data structures for Monmouth L2 contracts
library Types {
    /// @notice Header for a sequencer batch submission
    /// @param batchIndex Sequential index of the batch
    /// @param parentBatchHash Hash of the previous batch (chain integrity)
    /// @param epochNum L1 block number at batch creation
    /// @param epochHash L1 block hash at batch creation
    /// @param timestamp Batch timestamp
    /// @param stateRoot L2 state root after batch execution
    /// @param withdrawalsRoot Merkle root of withdrawals in this batch
    /// @param transactionsRoot Merkle root of transactions in this batch
    struct BatchHeader {
        uint64 batchIndex;
        bytes32 parentBatchHash;
        uint64 epochNum;
        bytes32 epochHash;
        uint64 timestamp;
        bytes32 stateRoot;
        bytes32 withdrawalsRoot;
        bytes32 transactionsRoot;
    }

    /// @notice Proof for finalizing a withdrawal on L1
    /// @param nonce Withdrawal sequence number
    /// @param sender L2 address that initiated withdrawal
    /// @param target L1 address to receive funds
    /// @param value Amount of ETH to withdraw
    /// @param gasLimit Gas limit for L1 execution
    /// @param data Calldata for target contract (if any)
    /// @param l2BlockNumber L2 block containing the withdrawal
    /// @param messageHash Keccak256 hash of the withdrawal message
    struct WithdrawalProof {
        uint64 nonce;
        address sender;
        address target;
        uint256 value;
        uint64 gasLimit;
        bytes data;
        uint64 l2BlockNumber;
        bytes32 messageHash;
    }

    /// @notice Parameters for initiating a deposit
    /// @param to L2 recipient address
    /// @param value Amount of ETH
    /// @param gasLimit Gas limit for L2 execution
    /// @param isCreation Whether this creates a contract on L2
    /// @param data Calldata for L2 execution
    struct DepositParams {
        address to;
        uint256 value;
        uint64 gasLimit;
        bool isCreation;
        bytes data;
    }
}
