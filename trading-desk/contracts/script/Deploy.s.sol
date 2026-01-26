// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {MonmouthEscrow} from "../src/MonmouthEscrow.sol";

/**
 * @title Deploy Script
 * @notice Deploys MonmouthEscrow to Monmouth L2
 *
 * Usage:
 *   # Local development (anvil or monmouth dev node)
 *   forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast
 *
 *   # With private key (testnet)
 *   forge script script/Deploy.s.sol --rpc-url $MONMOUTH_RPC --private-key $DEPLOYER_KEY --broadcast
 */
contract DeployScript is Script {
    function run() public returns (MonmouthEscrow) {
        uint256 deployerPrivateKey = vm.envOr("DEPLOYER_KEY", uint256(0));

        // Use default anvil key if not set
        if (deployerPrivateKey == 0) {
            // Anvil default account #0
            deployerPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        }

        vm.startBroadcast(deployerPrivateKey);

        MonmouthEscrow escrow = new MonmouthEscrow();

        console2.log("MonmouthEscrow deployed at:", address(escrow));

        vm.stopBroadcast();

        return escrow;
    }
}
