// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Types} from "./libraries/Types.sol";

/// @title IStateCommitmentChain
/// @notice Interface for querying state root commitments
interface IStateCommitmentChain {
    function getStateRoot(uint64 batchIndex) external view returns (bytes32);
    function isCommitted(uint64 batchIndex) external view returns (bool);
}

/// @title L1StandardBridge
/// @notice Handles ETH deposits (L1 -> L2) and withdrawals (L2 -> L1)
/// @dev In trusted sequencer mode, withdrawals are finalized by verifying the message
///      hash matches and the batch has a committed state root.
contract L1StandardBridge {
    /// @notice Address of the StateCommitmentChain contract
    address public immutable stateCommitmentChain;

    /// @notice Nonce for deposit ordering
    uint256 public depositNonce;

    /// @notice Tracks finalized withdrawals to prevent replay
    mapping(bytes32 => bool) public finalizedWithdrawals;

    /// @notice Emitted when ETH is deposited for transfer to L2
    /// @param from L1 sender address
    /// @param to L2 recipient address
    /// @param value Amount of ETH deposited
    /// @param nonce Deposit sequence number
    /// @param gasLimit Gas limit for L2 execution
    /// @param data Optional calldata for L2
    event ETHDepositInitiated(
        address indexed from,
        address indexed to,
        uint256 value,
        uint256 indexed nonce,
        uint64 gasLimit,
        bytes data
    );

    /// @notice Emitted when a withdrawal is finalized on L1
    /// @param messageHash Hash of the withdrawal message
    /// @param sender L2 address that initiated withdrawal
    /// @param target L1 recipient address
    /// @param value Amount of ETH withdrawn
    event WithdrawalFinalized(
        bytes32 indexed messageHash,
        address indexed sender,
        address indexed target,
        uint256 value
    );

    /// @notice Emitted when a withdrawal finalization fails
    /// @param messageHash Hash of the failed withdrawal
    /// @param reason Failure reason
    event WithdrawalFailed(bytes32 indexed messageHash, string reason);

    /// @notice Thrown when withdrawal was already finalized
    error AlreadyFinalized(bytes32 messageHash);

    /// @notice Thrown when the batch hasn't been committed yet
    error BatchNotCommitted(uint64 batchIndex);

    /// @notice Thrown when message hash verification fails
    error InvalidMessageHash(bytes32 expected, bytes32 provided);

    /// @notice Thrown when withdrawal execution fails
    error WithdrawalExecutionFailed();

    /// @notice Thrown when deposit value is zero
    error ZeroDeposit();

    /// @notice Initialize the bridge
    /// @param _stateCommitmentChain Address of StateCommitmentChain contract
    constructor(address _stateCommitmentChain) {
        stateCommitmentChain = _stateCommitmentChain;
    }

    /// @notice Deposit ETH to your own address on L2
    /// @param gasLimit Gas limit for L2 execution
    /// @param data Optional calldata
    function depositETH(uint64 gasLimit, bytes calldata data) external payable {
        _initiateDeposit(msg.sender, msg.sender, msg.value, gasLimit, false, data);
    }

    /// @notice Deposit ETH to a specific address on L2
    /// @param to L2 recipient address
    /// @param gasLimit Gas limit for L2 execution
    /// @param data Optional calldata
    function depositETHTo(address to, uint64 gasLimit, bytes calldata data) external payable {
        _initiateDeposit(msg.sender, to, msg.value, gasLimit, false, data);
    }

    /// @notice Internal deposit logic
    function _initiateDeposit(
        address from,
        address to,
        uint256 value,
        uint64 gasLimit,
        bool isCreation,
        bytes calldata data
    ) internal {
        if (value == 0) revert ZeroDeposit();

        uint256 nonce = depositNonce++;

        emit ETHDepositInitiated(from, to, value, nonce, gasLimit, data);
    }

    /// @notice Finalize a withdrawal from L2
    /// @dev Verifies the batch is committed and the message hash is valid
    /// @param proof The withdrawal proof containing all message details
    /// @param batchIndex The batch index containing this withdrawal
    function finalizeWithdrawal(
        Types.WithdrawalProof calldata proof,
        uint64 batchIndex
    ) external {
        // Check not already finalized
        if (finalizedWithdrawals[proof.messageHash]) {
            revert AlreadyFinalized(proof.messageHash);
        }

        // Verify batch has committed state root (trusted sequencer check)
        if (!IStateCommitmentChain(stateCommitmentChain).isCommitted(batchIndex)) {
            revert BatchNotCommitted(batchIndex);
        }

        // Verify message hash matches the provided data
        // This ensures the withdrawal details weren't tampered with
        bytes32 computedHash = keccak256(
            abi.encode(
                proof.nonce,
                proof.sender,
                proof.target,
                proof.value,
                proof.gasLimit,
                proof.data,
                proof.l2BlockNumber
            )
        );

        if (proof.messageHash != computedHash) {
            revert InvalidMessageHash(computedHash, proof.messageHash);
        }

        // Mark as finalized before execution (reentrancy protection)
        finalizedWithdrawals[proof.messageHash] = true;

        // Execute the withdrawal
        (bool success,) = proof.target.call{value: proof.value, gas: proof.gasLimit}(proof.data);

        if (!success) {
            // Revert finalization so user can retry
            finalizedWithdrawals[proof.messageHash] = false;
            revert WithdrawalExecutionFailed();
        }

        emit WithdrawalFinalized(proof.messageHash, proof.sender, proof.target, proof.value);
    }

    /// @notice Check if a withdrawal has been finalized
    /// @param messageHash The withdrawal message hash
    /// @return True if finalized
    function isWithdrawalFinalized(bytes32 messageHash) external view returns (bool) {
        return finalizedWithdrawals[messageHash];
    }

    /// @notice Get the current deposit nonce
    /// @return The next deposit nonce to be used
    function getDepositNonce() external view returns (uint256) {
        return depositNonce;
    }

    /// @notice Allow contract to receive ETH (for funding withdrawals)
    receive() external payable {}
}
