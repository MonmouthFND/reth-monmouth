// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/L1StandardBridge.sol";

/// @title TestDeposit
/// @notice Sends a test deposit to the L1StandardBridge on Sepolia
contract TestDeposit is Script {
    function run() external {
        // Get the sequencer private key
        uint256 deployerKey = vm.envUint("SEQUENCER_PRIVATE_KEY");
        address payable bridge = payable(vm.envAddress("L1_BRIDGE_ADDRESS"));

        console.log("=== Test Deposit Script ===");
        console.log("");
        console.log("Depositing to L1StandardBridge:", bridge);
        console.log("Sender:", vm.addr(deployerKey));
        console.log("Amount: 0.001 ETH");
        console.log("Gas limit: 100000");
        console.log("");

        vm.startBroadcast(deployerKey);

        // Send 0.001 ETH deposit with 100000 gas limit
        L1StandardBridge(bridge).depositETH{value: 0.001 ether}(100000, "");

        vm.stopBroadcast();

        console.log("=== Deposit Sent! ===");
        console.log("Check the node logs for ETHDepositInitiated event");
    }
}
