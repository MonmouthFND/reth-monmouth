//! State provider trait for querying blockchain state roots.
//!
//! This module provides a minimal trait abstraction that allows the sequencer
//! to query state roots from the blockchain without depending on full Reth
//! provider types.

use alloy_primitives::B256;

/// Trait for querying state roots from the blockchain.
///
/// This provides a minimal interface for the sequencer to query
/// the latest state root without depending on full Reth provider types.
pub trait StateRootProvider: Send + Sync + 'static {
    /// Get the state root of the latest executed block.
    ///
    /// Returns `None` if no blocks have been produced yet.
    fn latest_state_root(&self) -> Option<B256>;

    /// Get the state root for a specific block number.
    ///
    /// Returns `None` if the block doesn't exist.
    fn state_root_by_number(&self, block_number: u64) -> Option<B256>;

    /// Get the latest block number.
    ///
    /// Returns `None` if no blocks have been produced.
    fn latest_block_number(&self) -> Option<u64>;
}
