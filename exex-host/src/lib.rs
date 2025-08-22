pub mod config;
pub mod host;
pub mod service;

pub use config::ExExHostConfig;
pub use host::ExExHost;
pub use service::ExExServiceImpl;

pub mod proto {
    tonic::include_proto!("exex");
}