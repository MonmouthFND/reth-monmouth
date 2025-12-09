// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/L1StandardBridge.sol";
import {Types} from "../src/libraries/Types.sol";

/// @title FinalizeWithdrawal
/// @notice Finalizes a withdrawal on L1
/// @dev Run with:
///   WITHDRAWAL_NONCE=0 WITHDRAWAL_SENDER=0x... WITHDRAWAL_VALUE=1000000000000000 \
///   WITHDRAWAL_L2_BLOCK=123 BATCH_INDEX=0 \
///   forge script script/FinalizeWithdrawal.s.sol --rpc-url $L1_RPC_URL --broadcast
contract FinalizeWithdrawal is Script {
    function run() external {
        // Get the caller's key (needs ETH for gas on L1)
        uint256 callerKey = vm.envUint("SEQUENCER_PRIVATE_KEY");
        address caller = vm.addr(callerKey);

        // Get L1 bridge address
        address payable bridge = payable(vm.envAddress("L1_BRIDGE_ADDRESS"));

        // Get withdrawal parameters
        uint64 nonce = uint64(vm.envUint("WITHDRAWAL_NONCE"));
        address sender = vm.envAddress("WITHDRAWAL_SENDER");
        address target = vm.envOr("WITHDRAWAL_TARGET", sender); // Default: same as sender
        uint256 value = vm.envUint("WITHDRAWAL_VALUE");
        uint64 gasLimit = uint64(vm.envOr("WITHDRAWAL_GAS_LIMIT", uint256(100000)));
        bytes memory data = vm.envOr("WITHDRAWAL_DATA", bytes(""));
        uint64 l2BlockNumber = uint64(vm.envUint("WITHDRAWAL_L2_BLOCK"));
        uint64 batchIndex = uint64(vm.envUint("BATCH_INDEX"));

        console.log("=== Finalize Withdrawal Script ===");
        console.log("");
        console.log("L1StandardBridge:", bridge);
        console.log("Caller:", caller);
        console.log("");
        console.log("Withdrawal details:");
        console.log("  Nonce:", nonce);
        console.log("  Sender:", sender);
        console.log("  Target:", target);
        console.log("  Value:", value, "wei");
        console.log("  Gas limit:", gasLimit);
        console.log("  L2 block:", l2BlockNumber);
        console.log("  Batch index:", batchIndex);
        console.log("");

        // Compute message hash (must match L2StandardBridge computation)
        bytes32 messageHash = keccak256(
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
        console.log("Message hash:");
        console.logBytes32(messageHash);

        // Check if already finalized
        bool alreadyFinalized = L1StandardBridge(bridge).isWithdrawalFinalized(messageHash);
        if (alreadyFinalized) {
            console.log("");
            console.log("ERROR: Withdrawal already finalized!");
            return;
        }

        // Create withdrawal proof
        Types.WithdrawalProof memory proof = Types.WithdrawalProof({
            nonce: nonce,
            sender: sender,
            target: target,
            value: value,
            gasLimit: gasLimit,
            data: data,
            l2BlockNumber: l2BlockNumber,
            messageHash: messageHash
        });

        console.log("");
        console.log("Finalizing withdrawal...");

        vm.startBroadcast(callerKey);

        L1StandardBridge(bridge).finalizeWithdrawal(proof, batchIndex);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Withdrawal Finalized! ===");
        console.log("Check target address for received ETH");
    }
}
