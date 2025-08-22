pub mod agent;
pub mod l2;
pub mod precompiles;

pub use agent::*;
pub use l2::*;
pub use precompiles::*;

use alloy_primitives::{Address, U256};

pub const MONMOUTH_CHAIN_ID: u64 = 42069;

pub const SEQUENCER_FEE_VAULT: Address = Address::new([0x42; 20]);

pub const L1_FEE_VAULT: Address = Address::new([0x43; 20]);

pub const DEFAULT_L2_GAS_LIMIT: u64 = 30_000_000;

pub const MIN_BASE_FEE_PER_GAS: U256 = U256::from_limbs([1_000_000_000, 0, 0, 0]); // 1 gwei