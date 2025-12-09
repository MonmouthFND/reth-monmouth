//! State provider adapter for bridging Reth's provider to our trait.
//!
//! This module provides an adapter that wraps Reth's provider and implements
//! the `StateRootProvider` trait, allowing the sequencer to access blockchain
//! state without depending on complex Reth generic types.

use alloy_consensus::BlockHeader;
use alloy_primitives::B256;
use monmouth_engine::state_provider::StateRootProvider;
use reth_provider::BlockReaderIdExt;
use std::sync::Arc;

/// Adapter that wraps a Reth provider and implements our StateRootProvider trait.
///
/// This allows the sequencer to query state roots from the blockchain using a
/// simple trait interface rather than complex Reth generic types.
pub struct RethStateAdapter<P> {
    provider: P,
}

impl<P> RethStateAdapter<P> {
    /// Create a new adapter wrapping the given provider.
    pub fn new(provider: P) -> Self {
        Self { provider }
    }
}

impl<P> StateRootProvider for RethStateAdapter<P>
where
    P: BlockReaderIdExt + Send + Sync + 'static,
{
    fn latest_state_root(&self) -> Option<B256> {
        // Try to get latest header first
        match self.provider.latest_header() {
            Ok(Some(header)) => Some(header.state_root()),
            Ok(None) => {
                // No blocks yet - try to get genesis (block 0)
                self.provider
                    .header_by_number(0)
                    .ok()
                    .flatten()
                    .map(|header| header.state_root())
            }
            Err(_) => None,
        }
    }

    fn state_root_by_number(&self, block_number: u64) -> Option<B256> {
        self.provider
            .header_by_number(block_number)
            .ok()
            .flatten()
            .map(|header| header.state_root())
    }

    fn latest_block_number(&self) -> Option<u64> {
        self.provider
            .latest_header()
            .ok()
            .flatten()
            .map(|header| header.number())
    }
}

/// Helper function to create a boxed state provider from any Reth provider.
///
/// This is the primary way to create a state provider that can be passed
/// to the sequencer.
pub fn create_state_provider<P>(provider: P) -> Arc<dyn StateRootProvider>
where
    P: BlockReaderIdExt + Send + Sync + 'static,
{
    Arc::new(RethStateAdapter::new(provider))
}
