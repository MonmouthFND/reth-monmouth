use serde::{Deserialize, Serialize};
use std::net::SocketAddr;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExExHostConfig {
    pub server_addr: SocketAddr,
    pub max_concurrent_streams: usize,
    pub stream_buffer_size: usize,
    pub enable_metrics: bool,
}

impl Default for ExExHostConfig {
    fn default() -> Self {
        Self {
            server_addr: "127.0.0.1:50051".parse().unwrap(),
            max_concurrent_streams: 100,
            stream_buffer_size: 1000,
            enable_metrics: true,
        }
    }
}
