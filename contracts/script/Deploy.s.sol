// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/SequencerInbox.sol";
import "../src/StateCommitmentChain.sol";
import "../src/L1StandardBridge.sol";
import "../src/CrossDomainMessenger.sol";

/// @title DeployL1Contracts
/// @notice Deploys all Monmouth L1 contracts to Sepolia
/// @dev Run with: forge script script/Deploy.s.sol --rpc-url $L1_RPC_URL --broadcast
contract DeployL1Contracts is Script {
    function run() external {
        // Get sequencer private key and derive address
        uint256 deployerPrivateKey = vm.envUint("SEQUENCER_PRIVATE_KEY");
        address sequencer = vm.addr(deployerPrivateKey);

        console.log("Deploying Monmouth L1 contracts...");
        console.log("Sequencer address:", sequencer);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy StateCommitmentChain first (no dependencies)
        StateCommitmentChain stateCommitment = new StateCommitmentChain(sequencer);
        console.log("1. StateCommitmentChain deployed at:", address(stateCommitment));

        // 2. Deploy SequencerInbox
        SequencerInbox inbox = new SequencerInbox(sequencer);
        console.log("2. SequencerInbox deployed at:", address(inbox));

        // 3. Deploy L1StandardBridge (needs StateCommitmentChain)
        L1StandardBridge bridge = new L1StandardBridge(address(stateCommitment));
        console.log("3. L1StandardBridge deployed at:", address(bridge));

        // 4. Deploy CrossDomainMessenger (needs Bridge)
        CrossDomainMessenger messenger = new CrossDomainMessenger(address(bridge));
        console.log("4. CrossDomainMessenger deployed at:", address(messenger));

        vm.stopBroadcast();

        // Output environment variables for .env file
        console.log("");
        console.log("========================================");
        console.log("Add these to your .env file:");
        console.log("========================================");
        console.log("");
        console.log("L1_STATE_COMMITMENT_CHAIN=", address(stateCommitment));
        console.log("L1_SEQUENCER_INBOX=", address(inbox));
        console.log("L1_BRIDGE_ADDRESS=", address(bridge));
        console.log("L1_CROSS_DOMAIN_MESSENGER=", address(messenger));
        console.log("");
        console.log("========================================");
        console.log("Deployment complete!");
        console.log("========================================");
    }
}
