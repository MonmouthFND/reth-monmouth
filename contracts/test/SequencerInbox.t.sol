// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/SequencerInbox.sol";
import "../src/libraries/Types.sol";

contract SequencerInboxTest is Test {
    SequencerInbox public inbox;
    address public sequencer = address(0x1);
    address public notSequencer = address(0x2);

    function setUp() public {
        inbox = new SequencerInbox(sequencer);
    }

    function test_Constructor() public view {
        assertEq(inbox.sequencer(), sequencer);
        assertEq(inbox.latestBatchIndex(), 0);
    }

    function test_SubmitBatch() public {
        Types.BatchHeader memory header = Types.BatchHeader({
            batchIndex: 0,
            parentBatchHash: bytes32(0),
            epochNum: 1,
            epochHash: bytes32(uint256(1)),
            timestamp: uint64(block.timestamp),
            stateRoot: bytes32(uint256(2)),
            withdrawalsRoot: bytes32(0),
            transactionsRoot: bytes32(uint256(3))
        });

        bytes memory transactions = hex"1234";

        vm.prank(sequencer);
        bytes32 batchHash = inbox.submitBatch(header, transactions);

        assertEq(inbox.latestBatchIndex(), 1);
        assertEq(inbox.batchHashes(0), batchHash);
        assertTrue(inbox.batchExists(0));
    }

    function test_SubmitMultipleBatches() public {
        // Submit batch 0
        Types.BatchHeader memory header0 = Types.BatchHeader({
            batchIndex: 0,
            parentBatchHash: bytes32(0),
            epochNum: 1,
            epochHash: bytes32(uint256(1)),
            timestamp: uint64(block.timestamp),
            stateRoot: bytes32(uint256(100)),
            withdrawalsRoot: bytes32(0),
            transactionsRoot: bytes32(uint256(101))
        });

        vm.prank(sequencer);
        bytes32 hash0 = inbox.submitBatch(header0, hex"aa");

        // Submit batch 1
        Types.BatchHeader memory header1 = Types.BatchHeader({
            batchIndex: 1,
            parentBatchHash: hash0,
            epochNum: 2,
            epochHash: bytes32(uint256(2)),
            timestamp: uint64(block.timestamp + 1),
            stateRoot: bytes32(uint256(200)),
            withdrawalsRoot: bytes32(0),
            transactionsRoot: bytes32(uint256(201))
        });

        vm.prank(sequencer);
        inbox.submitBatch(header1, hex"bb");

        assertEq(inbox.latestBatchIndex(), 2);
    }

    function test_RevertOnlySequencer() public {
        Types.BatchHeader memory header = Types.BatchHeader({
            batchIndex: 0,
            parentBatchHash: bytes32(0),
            epochNum: 1,
            epochHash: bytes32(uint256(1)),
            timestamp: uint64(block.timestamp),
            stateRoot: bytes32(uint256(2)),
            withdrawalsRoot: bytes32(0),
            transactionsRoot: bytes32(uint256(3))
        });

        vm.prank(notSequencer);
        vm.expectRevert(SequencerInbox.OnlySequencer.selector);
        inbox.submitBatch(header, hex"");
    }

    function test_RevertInvalidBatchIndex() public {
        Types.BatchHeader memory header = Types.BatchHeader({
            batchIndex: 5, // Should be 0
            parentBatchHash: bytes32(0),
            epochNum: 1,
            epochHash: bytes32(uint256(1)),
            timestamp: uint64(block.timestamp),
            stateRoot: bytes32(uint256(2)),
            withdrawalsRoot: bytes32(0),
            transactionsRoot: bytes32(uint256(3))
        });

        vm.prank(sequencer);
        vm.expectRevert(abi.encodeWithSelector(SequencerInbox.InvalidBatchIndex.selector, 0, 5));
        inbox.submitBatch(header, hex"");
    }

    function test_RevertInvalidParentHash() public {
        // First submit batch 0
        Types.BatchHeader memory header0 = Types.BatchHeader({
            batchIndex: 0,
            parentBatchHash: bytes32(0),
            epochNum: 1,
            epochHash: bytes32(uint256(1)),
            timestamp: uint64(block.timestamp),
            stateRoot: bytes32(uint256(2)),
            withdrawalsRoot: bytes32(0),
            transactionsRoot: bytes32(uint256(3))
        });

        vm.prank(sequencer);
        bytes32 correctParent = inbox.submitBatch(header0, hex"aa");

        // Try batch 1 with wrong parent
        Types.BatchHeader memory header1 = Types.BatchHeader({
            batchIndex: 1,
            parentBatchHash: bytes32(uint256(999)), // Wrong!
            epochNum: 2,
            epochHash: bytes32(uint256(2)),
            timestamp: uint64(block.timestamp),
            stateRoot: bytes32(uint256(4)),
            withdrawalsRoot: bytes32(0),
            transactionsRoot: bytes32(uint256(5))
        });

        vm.prank(sequencer);
        vm.expectRevert(
            abi.encodeWithSelector(
                SequencerInbox.InvalidParentHash.selector, correctParent, bytes32(uint256(999))
            )
        );
        inbox.submitBatch(header1, hex"bb");
    }

    function test_SetSequencer() public {
        address newSequencer = address(0x999);

        vm.prank(sequencer);
        inbox.setSequencer(newSequencer);

        assertEq(inbox.sequencer(), newSequencer);
    }

    function test_GetBatchHeader() public {
        Types.BatchHeader memory header = Types.BatchHeader({
            batchIndex: 0,
            parentBatchHash: bytes32(0),
            epochNum: 42,
            epochHash: bytes32(uint256(42)),
            timestamp: uint64(12345),
            stateRoot: bytes32(uint256(100)),
            withdrawalsRoot: bytes32(uint256(200)),
            transactionsRoot: bytes32(uint256(300))
        });

        vm.prank(sequencer);
        inbox.submitBatch(header, hex"");

        Types.BatchHeader memory retrieved = inbox.getBatchHeader(0);
        assertEq(retrieved.epochNum, 42);
        assertEq(retrieved.timestamp, 12345);
        assertEq(retrieved.stateRoot, bytes32(uint256(100)));
    }
}
