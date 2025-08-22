use alloy_chains::Chain;
use alloy_genesis::{Genesis, GenesisAccount};
use alloy_primitives::{address, b256, Address, B256, U256};
use monmouth_primitives::{
    MONMOUTH_CHAIN_ID, DEFAULT_L2_GAS_LIMIT, MIN_BASE_FEE_PER_GAS,
    SEQUENCER_FEE_VAULT, L1_FEE_VAULT,
};
use once_cell::sync::Lazy;
use reth_chainspec::{BaseFeeParams, ChainSpec, ChainSpecBuilder, ForkCondition};
use reth_primitives::Header;
use std::collections::HashMap;
use std::sync::Arc;

pub static MONMOUTH_GENESIS_HASH: B256 = b256!("0000000000000000000000000000000000000000000000000000000000000000");

pub static MONMOUTH_CHAIN_SPEC: Lazy<Arc<ChainSpec>> = Lazy::new(|| {
    Arc::new(build_monmouth_chain_spec())
});

pub fn build_monmouth_chain_spec() -> ChainSpec {
    let genesis = build_genesis();
    
    ChainSpecBuilder::default()
        .chain(Chain::from_id(MONMOUTH_CHAIN_ID))
        .genesis(genesis)
        .prague_activated()
        .build()
}

fn build_genesis() -> Genesis {
    let mut accounts = HashMap::new();
    
    add_funded_accounts(&mut accounts);
    
    add_system_accounts(&mut accounts);
    
    Genesis {
        config: Default::default(),
        alloc: accounts,
        timestamp: 0,
        extra_data: b"Monmouth L2 Genesis".to_vec().into(),
        gas_limit: DEFAULT_L2_GAS_LIMIT,
        difficulty: U256::ZERO,
        nonce: 0,
        base_fee_per_gas: Some(MIN_BASE_FEE_PER_GAS.to()),
        excess_blob_gas: Some(0),
        blob_gas_used: Some(0),
        number: Some(0),
        ..Default::default()
    }
}

fn add_funded_accounts(accounts: &mut HashMap<Address, GenesisAccount>) {
    const INITIAL_BALANCE: U256 = U256::from_limbs([0, 0, 0x021e19e0c9bab240, 0]); // 10_000 ETH
    
    let funded_addresses = [
        address!("f39Fd6e51aad88F6F4ce6aB8827279cffFb92266"),
        address!("70997970C51812dc3A010C7d01b50e0d17dc79C8"),
        address!("3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"),
        address!("90F79bf6EB2c4f870365E785982E1f101E93b906"),
        address!("15d34AAf54267DB7D7c367839AAf71A00a2C6A65"),
        address!("9965507D1a55bcC2695C58ba16FB37d819B0A4dc"),
        address!("976EA74026E726554dB657fA54763abd0C3a0aa9"),
        address!("14dC79964da2C08b23698B3D3cc7Ca32193d9955"),
        address!("23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f"),
        address!("a0Ee7A142d267C1f36714E4a8F75612F20a79720"),
    ];
    
    for addr in funded_addresses {
        accounts.insert(
            addr,
            GenesisAccount {
                balance: INITIAL_BALANCE,
                nonce: Some(0),
                code: None,
                storage: None,
            },
        );
    }
}

fn add_system_accounts(accounts: &mut HashMap<Address, GenesisAccount>) {
    accounts.insert(
        SEQUENCER_FEE_VAULT,
        GenesisAccount {
            balance: U256::ZERO,
            nonce: Some(1),
            code: None,
            storage: None,
        },
    );
    
    accounts.insert(
        L1_FEE_VAULT,
        GenesisAccount {
            balance: U256::ZERO,
            nonce: Some(1),
            code: None,
            storage: None,
        },
    );
}

pub fn is_monmouth_chain(chain_id: u64) -> bool {
    chain_id == MONMOUTH_CHAIN_ID
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_chain_spec_creation() {
        let spec = build_monmouth_chain_spec();
        assert_eq!(spec.chain.id(), MONMOUTH_CHAIN_ID);
    }
    
    #[test]
    fn test_genesis_accounts() {
        let genesis = build_genesis();
        assert!(genesis.alloc.len() > 10);
        
        let test_addr = address!("f39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
        assert!(genesis.alloc.contains_key(&test_addr));
        
        let account = genesis.alloc.get(&test_addr).unwrap();
        assert!(account.balance > U256::ZERO);
    }
}