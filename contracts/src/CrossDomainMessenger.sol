// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CrossDomainMessenger
/// @notice Handles arbitrary message passing between L1 and L2
/// @dev Messages sent from L1 are picked up by the sequencer and executed on L2.
///      Messages from L2 are relayed through the bridge after batch finalization.
contract CrossDomainMessenger {
    /// @notice Address of the L1 bridge contract
    address public immutable bridge;

    /// @notice Nonce for message ordering
    uint256 public messageNonce;

    /// @notice Tracks messages that have been relayed
    mapping(bytes32 => bool) public relayedMessages;

    /// @notice Tracks messages that have been sent
    mapping(bytes32 => bool) public sentMessages;

    /// @notice The sender of the current cross-domain message being relayed
    address internal _xDomainMsgSender;

    /// @notice Constant for when there is no active cross-domain message
    address internal constant DEFAULT_XDOMAIN_SENDER = address(0);

    /// @notice Emitted when a message is sent to L2
    /// @param target L2 target contract address
    /// @param sender L1 sender address
    /// @param message Encoded message data
    /// @param messageNonce Sequence number of the message
    /// @param gasLimit Gas limit for L2 execution
    event SentMessage(
        address indexed target,
        address sender,
        bytes message,
        uint256 indexed messageNonce,
        uint256 gasLimit
    );

    /// @notice Emitted when a message from L2 is successfully relayed
    /// @param messageHash Hash of the relayed message
    event RelayedMessage(bytes32 indexed messageHash);

    /// @notice Emitted when a message relay fails
    /// @param messageHash Hash of the failed message
    event FailedRelayedMessage(bytes32 indexed messageHash);

    /// @notice Thrown when caller is not the bridge
    error OnlyBridge();

    /// @notice Thrown when message was already relayed
    error AlreadyRelayed(bytes32 messageHash);

    /// @notice Thrown when trying to access xDomainMsgSender outside of relay
    error NoActiveMessage();

    /// @notice Restricts to bridge only
    modifier onlyBridge() {
        if (msg.sender != bridge) revert OnlyBridge();
        _;
    }

    /// @notice Initialize the messenger
    /// @param _bridge Address of the L1StandardBridge
    constructor(address _bridge) {
        bridge = _bridge;
        _xDomainMsgSender = DEFAULT_XDOMAIN_SENDER;
    }

    /// @notice Send a message to L2
    /// @dev The sequencer monitors SentMessage events and executes them on L2
    /// @param target L2 target contract address
    /// @param message Encoded function call data
    /// @param gasLimit Gas limit for L2 execution
    function sendMessage(address target, bytes calldata message, uint32 gasLimit) external payable {
        bytes32 messageHash = keccak256(
            abi.encode(messageNonce, msg.sender, target, msg.value, gasLimit, message)
        );

        sentMessages[messageHash] = true;

        emit SentMessage(target, msg.sender, message, messageNonce, gasLimit);

        messageNonce++;
    }

    /// @notice Relay a message from L2 to L1
    /// @dev Called by the bridge after withdrawal finalization
    /// @param nonce Message sequence number from L2
    /// @param sender L2 sender address
    /// @param target L1 target contract address
    /// @param value ETH value to send
    /// @param gasLimit Gas limit for execution
    /// @param message Encoded function call data
    function relayMessage(
        uint256 nonce,
        address sender,
        address target,
        uint256 value,
        uint256 gasLimit,
        bytes calldata message
    ) external onlyBridge {
        bytes32 messageHash =
            keccak256(abi.encode(nonce, sender, target, value, gasLimit, message));

        if (relayedMessages[messageHash]) {
            revert AlreadyRelayed(messageHash);
        }

        // Set the cross-domain sender for the duration of the call
        _xDomainMsgSender = sender;

        // Mark as relayed before execution
        relayedMessages[messageHash] = true;

        // Execute the message
        (bool success,) = target.call{value: value, gas: gasLimit}(message);

        // Reset cross-domain sender
        _xDomainMsgSender = DEFAULT_XDOMAIN_SENDER;

        if (success) {
            emit RelayedMessage(messageHash);
        } else {
            // Allow retry by unmarking
            relayedMessages[messageHash] = false;
            emit FailedRelayedMessage(messageHash);
        }
    }

    /// @notice Get the sender of the current cross-domain message
    /// @dev Only valid during relayMessage execution
    /// @return The L2 sender address
    function xDomainMessageSender() external view returns (address) {
        if (_xDomainMsgSender == DEFAULT_XDOMAIN_SENDER) {
            revert NoActiveMessage();
        }
        return _xDomainMsgSender;
    }

    /// @notice Check if a message has been sent
    /// @param messageHash The message hash to check
    /// @return True if the message was sent
    function isMessageSent(bytes32 messageHash) external view returns (bool) {
        return sentMessages[messageHash];
    }

    /// @notice Check if a message has been relayed
    /// @param messageHash The message hash to check
    /// @return True if the message was relayed
    function isMessageRelayed(bytes32 messageHash) external view returns (bool) {
        return relayedMessages[messageHash];
    }

    /// @notice Compute the hash of a message
    /// @param nonce Message nonce
    /// @param sender Sender address
    /// @param target Target address
    /// @param value ETH value
    /// @param gasLimit Gas limit
    /// @param message Message data
    /// @return The keccak256 hash
    function computeMessageHash(
        uint256 nonce,
        address sender,
        address target,
        uint256 value,
        uint256 gasLimit,
        bytes calldata message
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(nonce, sender, target, value, gasLimit, message));
    }
}
