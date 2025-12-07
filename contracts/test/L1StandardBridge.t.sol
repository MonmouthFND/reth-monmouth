// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/L1StandardBridge.sol";
import "../src/StateCommitmentChain.sol";
import "../src/libraries/Types.sol";

contract L1StandardBridgeTest is Test {
    L1StandardBridge public bridge;
    StateCommitmentChain public stateCommitment;
    address public sequencer = address(0x1);
    address public user = address(0x2);
    address public recipient = address(0x3);

    function setUp() public {
        stateCommitment = new StateCommitmentChain(sequencer);
        bridge = new L1StandardBridge(address(stateCommitment));

        // Fund the bridge for withdrawals
        vm.deal(address(bridge), 100 ether);
        // Fund the user for deposits
        vm.deal(user, 10 ether);
    }

    function test_DepositETH() public {
        uint64 gasLimit = 100000;
        bytes memory data = "";

        vm.prank(user);
        vm.expectEmit(true, true, true, true);
        emit L1StandardBridge.ETHDepositInitiated(user, user, 1 ether, 0, gasLimit, data);

        bridge.depositETH{value: 1 ether}(gasLimit, data);

        assertEq(bridge.depositNonce(), 1);
    }

    function test_DepositETHTo() public {
        uint64 gasLimit = 100000;
        bytes memory data = hex"1234";

        vm.prank(user);
        vm.expectEmit(true, true, true, true);
        emit L1StandardBridge.ETHDepositInitiated(user, recipient, 2 ether, 0, gasLimit, data);

        bridge.depositETHTo{value: 2 ether}(recipient, gasLimit, data);

        assertEq(bridge.depositNonce(), 1);
    }

    function test_MultipleDeposits() public {
        vm.startPrank(user);

        bridge.depositETH{value: 1 ether}(100000, "");
        bridge.depositETH{value: 1 ether}(100000, "");
        bridge.depositETH{value: 1 ether}(100000, "");

        vm.stopPrank();

        assertEq(bridge.depositNonce(), 3);
    }

    function test_RevertZeroDeposit() public {
        vm.prank(user);
        vm.expectRevert(L1StandardBridge.ZeroDeposit.selector);
        bridge.depositETH{value: 0}(100000, "");
    }

    function test_FinalizeWithdrawal() public {
        // First commit a state root
        vm.prank(sequencer);
        stateCommitment.commitStateRoot(0, bytes32(uint256(123)));

        // Create withdrawal proof
        Types.WithdrawalProof memory proof = Types.WithdrawalProof({
            nonce: 1,
            sender: user,
            target: recipient,
            value: 1 ether,
            gasLimit: 100000,
            data: "",
            l2BlockNumber: 10,
            messageHash: bytes32(0) // Will compute below
        });

        // Compute the correct message hash
        proof.messageHash = keccak256(
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

        uint256 recipientBalanceBefore = recipient.balance;

        bridge.finalizeWithdrawal(proof, 0);

        assertEq(recipient.balance, recipientBalanceBefore + 1 ether);
        assertTrue(bridge.isWithdrawalFinalized(proof.messageHash));
    }

    function test_RevertAlreadyFinalized() public {
        // Commit state root
        vm.prank(sequencer);
        stateCommitment.commitStateRoot(0, bytes32(uint256(123)));

        Types.WithdrawalProof memory proof = Types.WithdrawalProof({
            nonce: 1,
            sender: user,
            target: recipient,
            value: 1 ether,
            gasLimit: 100000,
            data: "",
            l2BlockNumber: 10,
            messageHash: bytes32(0)
        });

        proof.messageHash = keccak256(
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

        // Finalize once
        bridge.finalizeWithdrawal(proof, 0);

        // Try again
        vm.expectRevert(
            abi.encodeWithSelector(L1StandardBridge.AlreadyFinalized.selector, proof.messageHash)
        );
        bridge.finalizeWithdrawal(proof, 0);
    }

    function test_RevertBatchNotCommitted() public {
        Types.WithdrawalProof memory proof = Types.WithdrawalProof({
            nonce: 1,
            sender: user,
            target: recipient,
            value: 1 ether,
            gasLimit: 100000,
            data: "",
            l2BlockNumber: 10,
            messageHash: bytes32(uint256(1))
        });

        vm.expectRevert(abi.encodeWithSelector(L1StandardBridge.BatchNotCommitted.selector, 0));
        bridge.finalizeWithdrawal(proof, 0);
    }

    function test_RevertInvalidMessageHash() public {
        // Commit state root
        vm.prank(sequencer);
        stateCommitment.commitStateRoot(0, bytes32(uint256(123)));

        Types.WithdrawalProof memory proof = Types.WithdrawalProof({
            nonce: 1,
            sender: user,
            target: recipient,
            value: 1 ether,
            gasLimit: 100000,
            data: "",
            l2BlockNumber: 10,
            messageHash: bytes32(uint256(999)) // Wrong hash!
        });

        bytes32 expectedHash = keccak256(
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

        vm.expectRevert(
            abi.encodeWithSelector(
                L1StandardBridge.InvalidMessageHash.selector, expectedHash, bytes32(uint256(999))
            )
        );
        bridge.finalizeWithdrawal(proof, 0);
    }

    function test_ReceiveETH() public {
        uint256 balanceBefore = address(bridge).balance;

        (bool success,) = address(bridge).call{value: 1 ether}("");
        assertTrue(success);

        assertEq(address(bridge).balance, balanceBefore + 1 ether);
    }
}
