// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/L2StandardBridge.sol";

/// @title TestWithdrawal
/// @notice Initiates a test withdrawal on L2
/// @dev Run with:
///   L2_BRIDGE_ADDRESS=0x... forge script script/TestWithdrawal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
contract TestWithdrawal is Script {
    function run() external {
        // Get the deployer key (must have ETH on L2)
        uint256 senderKey = vm.envUint("SEQUENCER_PRIVATE_KEY");
        address sender = vm.addr(senderKey);

        // Get L2 bridge address
        address payable bridge = payable(vm.envAddress("L2_BRIDGE_ADDRESS"));

        console.log("=== Test Withdrawal Script ===");
        console.log("");
        console.log("L2StandardBridge:", bridge);
        console.log("Sender:", sender);
        console.log("Sender balance:", sender.balance / 1 ether, "ETH");
        console.log("Withdrawal amount: 0.001 ETH");
        console.log("Gas limit: 100000");
        console.log("");

        // Get current nonce before withdrawal
        uint256 nonceBefore = L2StandardBridge(bridge).getWithdrawalNonce();
        console.log("Current withdrawal nonce:", nonceBefore);

        vm.startBroadcast(senderKey);

        // Initiate withdrawal of 0.001 ETH to sender's address on L1
        L2StandardBridge(bridge).withdraw{value: 0.001 ether}(100000);

        vm.stopBroadcast();

        // Get nonce after withdrawal
        uint256 nonceAfter = L2StandardBridge(bridge).getWithdrawalNonce();
        console.log("New withdrawal nonce:", nonceAfter);

        console.log("");
        console.log("=== Withdrawal Initiated! ===");
        console.log("The sequencer will include this in the next batch.");
        console.log("After batch is committed on L1, finalize with FinalizeWithdrawal.s.sol");
    }
}
