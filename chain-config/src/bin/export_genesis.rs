use monmouth_chain_config::export_genesis_json;

fn main() {
    match export_genesis_json() {
        Ok(json) => {
            println!("{}", json);
        }
        Err(e) => {
            eprintln!("Error exporting genesis: {}", e);
            std::process::exit(1);
        }
    }
}
