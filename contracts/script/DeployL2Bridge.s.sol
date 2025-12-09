// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/L2StandardBridge.sol";

/// @title DeployL2Bridge
/// @notice Deploys L2StandardBridge to the L2 network
/// @dev Run with:
///   forge script script/DeployL2Bridge.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
contract DeployL2Bridge is Script {
    function run() external {
        // Get deployer key (using SEQUENCER_PRIVATE_KEY or a funded account)
        uint256 deployerKey = vm.envUint("SEQUENCER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("=== Deploy L2StandardBridge ===");
        console.log("");
        console.log("Deployer:", deployer);
        console.log("Balance:", deployer.balance / 1 ether, "ETH");
        console.log("");

        vm.startBroadcast(deployerKey);

        // Deploy L2StandardBridge
        L2StandardBridge bridge = new L2StandardBridge();

        console.log("L2StandardBridge deployed at:", address(bridge));

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("Add to .env:");
        console.log("L2_BRIDGE_ADDRESS=", address(bridge));
    }
}
