// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title L2StandardBridge
/// @notice L2 contract for initiating withdrawals to L1
/// @dev Users call withdraw() with ETH, and the sequencer picks up the event
///      to include in the next batch submission to L1
contract L2StandardBridge {
    /// @notice Withdrawal nonce for ordering
    uint256 public withdrawalNonce;

    /// @notice Emitted when a withdrawal is initiated
    /// @param nonce Withdrawal sequence number
    /// @param sender L2 address initiating withdrawal
    /// @param target L1 address to receive funds
    /// @param value Amount of ETH to withdraw
    /// @param gasLimit Gas limit for L1 execution
    /// @param data Optional calldata for L1 target
    /// @param messageHash Keccak256 hash of the withdrawal message
    event WithdrawalInitiated(
        uint256 indexed nonce,
        address indexed sender,
        address indexed target,
        uint256 value,
        uint64 gasLimit,
        bytes data,
        bytes32 messageHash
    );

    /// @notice Thrown when withdrawal value is zero
    error ZeroWithdrawal();

    /// @notice Thrown when target address is zero
    error ZeroAddress();

    /// @notice Initiate a withdrawal to your own L1 address
    /// @param gasLimit Gas limit for L1 execution (typically 100000)
    function withdraw(uint64 gasLimit) external payable {
        _initiateWithdrawal(msg.sender, msg.sender, msg.value, gasLimit, "");
    }

    /// @notice Initiate a withdrawal to a specific L1 address
    /// @param target L1 address to receive the ETH
    /// @param gasLimit Gas limit for L1 execution
    function withdrawTo(address target, uint64 gasLimit) external payable {
        _initiateWithdrawal(msg.sender, target, msg.value, gasLimit, "");
    }

    /// @notice Initiate a withdrawal with calldata for contract interaction
    /// @param target L1 address to receive the ETH
    /// @param gasLimit Gas limit for L1 execution
    /// @param data Calldata to execute on target
    function withdrawTo(address target, uint64 gasLimit, bytes calldata data) external payable {
        _initiateWithdrawal(msg.sender, target, msg.value, gasLimit, data);
    }

    /// @notice Internal withdrawal logic
    function _initiateWithdrawal(
        address sender,
        address target,
        uint256 value,
        uint64 gasLimit,
        bytes memory data
    ) internal {
        if (value == 0) revert ZeroWithdrawal();
        if (target == address(0)) revert ZeroAddress();

        uint256 nonce = withdrawalNonce++;

        // Compute message hash (matches L1StandardBridge verification)
        bytes32 messageHash = keccak256(
            abi.encode(
                nonce,
                sender,
                target,
                value,
                gasLimit,
                data,
                block.number
            )
        );

        emit WithdrawalInitiated(
            nonce,
            sender,
            target,
            value,
            gasLimit,
            data,
            messageHash
        );
    }

    /// @notice Get the current withdrawal nonce
    /// @return The next withdrawal nonce to be used
    function getWithdrawalNonce() external view returns (uint256) {
        return withdrawalNonce;
    }

    /// @notice Compute a message hash for a withdrawal
    /// @dev Useful for verifying withdrawal proofs off-chain
    function computeMessageHash(
        uint256 nonce,
        address sender,
        address target,
        uint256 value,
        uint64 gasLimit,
        bytes calldata data,
        uint256 l2BlockNumber
    ) external pure returns (bytes32) {
        return keccak256(
            abi.encode(
                nonce,
                sender,
                target,
                value,
                gasLimit,
                data,
                l2BlockNumber
            )
        );
    }

    /// @notice Allow contract to receive ETH (for deposits from L1)
    receive() external payable {}
}
