// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Types} from "./libraries/Types.sol";

/// @title SequencerInbox
/// @notice Receives batch data from the trusted Monmouth L2 sequencer
/// @dev This contract stores batch headers and transaction data commitments.
///      In trusted sequencer mode, only the designated sequencer can submit batches.
contract SequencerInbox {
    /// @notice Address of the trusted sequencer
    address public sequencer;

    /// @notice Index of the next batch to be submitted
    uint64 public latestBatchIndex;

    /// @notice Mapping from batch index to batch hash
    mapping(uint64 => bytes32) public batchHashes;

    /// @notice Mapping from batch index to batch header
    mapping(uint64 => Types.BatchHeader) public batchHeaders;

    /// @notice Emitted when a batch is successfully submitted
    /// @param batchIndex Index of the submitted batch
    /// @param batchHash Hash of the batch (header + transactions)
    /// @param stateRoot L2 state root after batch execution
    /// @param timestamp Timestamp of the batch
    event BatchSubmitted(
        uint64 indexed batchIndex,
        bytes32 indexed batchHash,
        bytes32 stateRoot,
        uint256 timestamp
    );

    /// @notice Emitted when the sequencer address is updated
    /// @param oldSequencer Previous sequencer address
    /// @param newSequencer New sequencer address
    event SequencerUpdated(address indexed oldSequencer, address indexed newSequencer);

    /// @notice Thrown when caller is not the sequencer
    error OnlySequencer();

    /// @notice Thrown when batch index doesn't match expected
    error InvalidBatchIndex(uint64 expected, uint64 provided);

    /// @notice Thrown when parent batch hash doesn't match
    error InvalidParentHash(bytes32 expected, bytes32 provided);

    /// @notice Restricts function to sequencer only
    modifier onlySequencer() {
        if (msg.sender != sequencer) revert OnlySequencer();
        _;
    }

    /// @notice Initializes the contract with a sequencer address
    /// @param _sequencer Address of the trusted sequencer
    constructor(address _sequencer) {
        sequencer = _sequencer;
        emit SequencerUpdated(address(0), _sequencer);
    }

    /// @notice Submit a new batch of L2 transactions
    /// @param header The batch header containing metadata
    /// @param transactions RLP-encoded transactions in the batch
    /// @return batchHash The computed hash of the submitted batch
    function submitBatch(
        Types.BatchHeader calldata header,
        bytes calldata transactions
    ) external onlySequencer returns (bytes32 batchHash) {
        // Verify batch index is sequential
        if (header.batchIndex != latestBatchIndex) {
            revert InvalidBatchIndex(latestBatchIndex, header.batchIndex);
        }

        // Verify parent hash (skip for first batch)
        if (latestBatchIndex > 0) {
            bytes32 expectedParent = batchHashes[latestBatchIndex - 1];
            if (header.parentBatchHash != expectedParent) {
                revert InvalidParentHash(expectedParent, header.parentBatchHash);
            }
        }

        // Compute batch hash from header and transactions
        batchHash = keccak256(abi.encode(header, keccak256(transactions)));

        // Store batch data
        batchHashes[latestBatchIndex] = batchHash;
        batchHeaders[latestBatchIndex] = header;

        emit BatchSubmitted(latestBatchIndex, batchHash, header.stateRoot, header.timestamp);

        // Increment for next batch
        latestBatchIndex++;
    }

    /// @notice Get the batch header for a given index
    /// @param batchIndex The index of the batch to retrieve
    /// @return header The batch header
    function getBatchHeader(uint64 batchIndex) external view returns (Types.BatchHeader memory) {
        return batchHeaders[batchIndex];
    }

    /// @notice Check if a batch has been submitted
    /// @param batchIndex The index to check
    /// @return True if the batch exists
    function batchExists(uint64 batchIndex) external view returns (bool) {
        return batchHashes[batchIndex] != bytes32(0) || batchIndex == 0;
    }

    /// @notice Update the sequencer address (only current sequencer can call)
    /// @param newSequencer The new sequencer address
    function setSequencer(address newSequencer) external onlySequencer {
        address old = sequencer;
        sequencer = newSequencer;
        emit SequencerUpdated(old, newSequencer);
    }
}
