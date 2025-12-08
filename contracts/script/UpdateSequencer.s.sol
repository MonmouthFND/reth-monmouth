// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/SequencerInbox.sol";
import "../src/StateCommitmentChain.sol";

/// @title UpdateSequencer
/// @notice Updates the sequencer address in L1 contracts
/// @dev Run with:
///   ORIGINAL_SEQUENCER_KEY=<old_key> NEW_SEQUENCER=<new_address> \
///     forge script script/UpdateSequencer.s.sol --rpc-url $L1_RPC_URL --broadcast
contract UpdateSequencer is Script {
    function run() external {
        // Get the original sequencer private key (must be 0x62484d855780ff0d78dfd21aaa35c7b6b02f6a58)
        uint256 originalKey = vm.envUint("ORIGINAL_SEQUENCER_KEY");
        address originalSequencer = vm.addr(originalKey);

        // Get the new sequencer address to set
        address newSequencer = vm.envAddress("NEW_SEQUENCER");

        // Contract addresses (from .env)
        address sequencerInboxAddr = vm.envAddress("L1_SEQUENCER_INBOX");
        address stateCommitmentAddr = vm.envAddress("L1_STATE_COMMITMENT_CHAIN");

        console.log("=== Sequencer Update Script ===");
        console.log("");
        console.log("Original sequencer:", originalSequencer);
        console.log("New sequencer:     ", newSequencer);
        console.log("");
        console.log("SequencerInbox:    ", sequencerInboxAddr);
        console.log("StateCommitment:   ", stateCommitmentAddr);
        console.log("");

        // Verify the original key is correct
        require(
            originalSequencer == 0x62484d855780FF0D78dFd21AaA35c7b6B02f6a58,
            "Wrong original key! Must be for 0x62484..."
        );

        vm.startBroadcast(originalKey);

        // Update SequencerInbox
        SequencerInbox inbox = SequencerInbox(sequencerInboxAddr);
        console.log("Current sequencer in inbox:", inbox.sequencer());
        inbox.setSequencer(newSequencer);
        console.log("Updated SequencerInbox sequencer to:", inbox.sequencer());

        // Update StateCommitmentChain
        StateCommitmentChain stateChain = StateCommitmentChain(stateCommitmentAddr);
        console.log("Current sequencer in state chain:", stateChain.sequencer());
        stateChain.setSequencer(newSequencer);
        console.log("Updated StateCommitmentChain sequencer to:", stateChain.sequencer());

        vm.stopBroadcast();

        console.log("");
        console.log("=== Update Complete! ===");
        console.log("Both contracts now use:", newSequencer);
    }
}
