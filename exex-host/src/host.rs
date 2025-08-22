use crate::config::ExExHostConfig;
use crate::proto::ex_ex_service_server::ExExServiceServer;
use crate::service::ExExServiceImpl;
use parking_lot::RwLock;
use reth_primitives::{Block, Header, Receipt};
use std::sync::Arc;
use tokio::sync::broadcast;
use tonic::transport::Server;
use tracing::{error, info};

pub struct ExExHost {
    config: ExExHostConfig,
    header_tx: broadcast::Sender<Header>,
    block_tx: broadcast::Sender<Block>,
    receipt_tx: broadcast::Sender<Vec<Receipt>>,
    running: Arc<RwLock<bool>>,
}

impl ExExHost {
    pub fn new(config: ExExHostConfig) -> Self {
        let (header_tx, _) = broadcast::channel(config.stream_buffer_size);
        let (block_tx, _) = broadcast::channel(config.stream_buffer_size);
        let (receipt_tx, _) = broadcast::channel(config.stream_buffer_size);

        Self {
            config,
            header_tx,
            block_tx,
            receipt_tx,
            running: Arc::new(RwLock::new(false)),
        }
    }

    pub async fn start(&self) -> Result<(), Box<dyn std::error::Error>> {
        if *self.running.read() {
            return Err("ExEx host already running".into());
        }

        *self.running.write() = true;

        let service = ExExServiceImpl::new(
            self.header_tx.clone(),
            self.block_tx.clone(),
            self.receipt_tx.clone(),
        );

        let addr = self.config.server_addr;

        info!("Starting ExEx host on {}", addr);

        let server = Server::builder()
            .add_service(ExExServiceServer::new(service))
            .serve(addr);

        tokio::spawn(async move {
            if let Err(e) = server.await {
                error!("ExEx host server error: {}", e);
            }
        });

        Ok(())
    }

    pub fn broadcast_header(&self, header: Header) {
        let _ = self.header_tx.send(header);
    }

    pub fn broadcast_block(&self, block: Block) {
        let _ = self.block_tx.send(block);
    }

    pub fn broadcast_receipts(&self, receipts: Vec<Receipt>) {
        let _ = self.receipt_tx.send(receipts);
    }

    pub fn is_running(&self) -> bool {
        *self.running.read()
    }

    pub async fn stop(&self) {
        *self.running.write() = false;
        info!("ExEx host stopped");
    }
}