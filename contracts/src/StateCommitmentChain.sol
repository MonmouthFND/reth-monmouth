// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title StateCommitmentChain
/// @notice Stores L2 state root commitments from the sequencer
/// @dev State roots are used to verify withdrawal proofs from L2.
///      In trusted sequencer mode, only the sequencer can commit state roots.
contract StateCommitmentChain {
    /// @notice Address of the trusted sequencer
    address public sequencer;

    /// @notice Mapping from batch index to committed state root
    mapping(uint64 => bytes32) public stateRoots;

    /// @notice Mapping from batch index to commitment timestamp
    mapping(uint64 => uint256) public commitmentTimestamps;

    /// @notice Index of the next batch to be committed
    uint64 public latestCommittedBatch;

    /// @notice Emitted when a state root is committed
    /// @param batchIndex Index of the batch
    /// @param stateRoot The committed state root
    /// @param timestamp Block timestamp of commitment
    event StateRootCommitted(
        uint64 indexed batchIndex,
        bytes32 indexed stateRoot,
        uint256 timestamp
    );

    /// @notice Emitted when sequencer is updated
    event SequencerUpdated(address indexed oldSequencer, address indexed newSequencer);

    /// @notice Thrown when caller is not sequencer
    error OnlySequencer();

    /// @notice Thrown when committing out of order
    error MustCommitInOrder(uint64 expected, uint64 provided);

    /// @notice Thrown when batch already has a commitment
    error AlreadyCommitted(uint64 batchIndex);

    /// @notice Restricts to sequencer only
    modifier onlySequencer() {
        if (msg.sender != sequencer) revert OnlySequencer();
        _;
    }

    /// @notice Initialize with sequencer address
    /// @param _sequencer Address of the trusted sequencer
    constructor(address _sequencer) {
        sequencer = _sequencer;
        emit SequencerUpdated(address(0), _sequencer);
    }

    /// @notice Commit a state root for a batch
    /// @dev Must be called in order (batch 0, then 1, then 2, etc.)
    /// @param batchIndex Index of the batch
    /// @param stateRoot The L2 state root after this batch
    function commitStateRoot(uint64 batchIndex, bytes32 stateRoot) external onlySequencer {
        // Must commit in order
        if (batchIndex != latestCommittedBatch) {
            revert MustCommitInOrder(latestCommittedBatch, batchIndex);
        }

        // Cannot overwrite existing commitment
        if (stateRoots[batchIndex] != bytes32(0)) {
            revert AlreadyCommitted(batchIndex);
        }

        // Store commitment
        stateRoots[batchIndex] = stateRoot;
        commitmentTimestamps[batchIndex] = block.timestamp;

        emit StateRootCommitted(batchIndex, stateRoot, block.timestamp);

        // Increment for next batch
        latestCommittedBatch = batchIndex + 1;
    }

    /// @notice Get the state root for a batch
    /// @param batchIndex The batch index to query
    /// @return The committed state root (bytes32(0) if not committed)
    function getStateRoot(uint64 batchIndex) external view returns (bytes32) {
        return stateRoots[batchIndex];
    }

    /// @notice Check if a batch has been committed
    /// @param batchIndex The batch index to check
    /// @return True if the batch has a state root commitment
    function isCommitted(uint64 batchIndex) external view returns (bool) {
        return stateRoots[batchIndex] != bytes32(0);
    }

    /// @notice Get the timestamp when a state root was committed
    /// @param batchIndex The batch index to query
    /// @return The block timestamp of commitment
    function getCommitmentTimestamp(uint64 batchIndex) external view returns (uint256) {
        return commitmentTimestamps[batchIndex];
    }

    /// @notice Update the sequencer address
    /// @param newSequencer The new sequencer address
    function setSequencer(address newSequencer) external onlySequencer {
        address old = sequencer;
        sequencer = newSequencer;
        emit SequencerUpdated(old, newSequencer);
    }
}
