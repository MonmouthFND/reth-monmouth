use crate::proto::{
    ex_ex_service_server::ExExService, BlockFilter, BlockNotification, ClassificationResponse,
    ContextResponse, Empty, ExecutionPlanRequest, ExecutionPlanResponse, HeaderFilter,
    HeaderNotification, HealthResponse, LogFilter, LogNotification, ReceiptFilter,
    ReceiptNotification, TransactionRequest,
};
use alloy_primitives::hex;
use futures::Stream;
use reth_primitives::{Block, Header, Receipt};
use std::pin::Pin;
use std::time::SystemTime;
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use tonic::{Request, Response, Status};
use tracing::debug;

pub struct ExExServiceImpl {
    header_tx: broadcast::Sender<Header>,
    block_tx: broadcast::Sender<Block>,
    receipt_tx: broadcast::Sender<Vec<Receipt>>,
    start_time: SystemTime,
}

impl ExExServiceImpl {
    pub fn new(
        header_tx: broadcast::Sender<Header>,
        block_tx: broadcast::Sender<Block>,
        receipt_tx: broadcast::Sender<Vec<Receipt>>,
    ) -> Self {
        Self {
            header_tx,
            block_tx,
            receipt_tx,
            start_time: SystemTime::now(),
        }
    }
}

#[tonic::async_trait]
impl ExExService for ExExServiceImpl {
    type StreamHeadersStream =
        Pin<Box<dyn Stream<Item = Result<HeaderNotification, Status>> + Send>>;

    async fn stream_headers(
        &self,
        request: Request<HeaderFilter>,
    ) -> Result<Response<Self::StreamHeadersStream>, Status> {
        debug!("Stream headers requested");

        let _filter = request.into_inner();
        let rx = self.header_tx.subscribe();
        let stream = BroadcastStream::new(rx);

        let filtered = stream.filter_map(move |result| match result {
            Ok(header) => {
                let notification = HeaderNotification {
                    hash: header.hash_slow().as_slice().to_vec(),
                    number: header.number,
                    timestamp: header.timestamp,
                    beneficiary: hex::encode(header.beneficiary),
                    gas_limit: header.gas_limit,
                    gas_used: header.gas_used,
                };
                Some(Ok(notification))
            }
            Err(_) => None,
        });

        Ok(Response::new(Box::pin(filtered)))
    }

    type StreamBlocksStream = Pin<Box<dyn Stream<Item = Result<BlockNotification, Status>> + Send>>;

    async fn stream_blocks(
        &self,
        request: Request<BlockFilter>,
    ) -> Result<Response<Self::StreamBlocksStream>, Status> {
        debug!("Stream blocks requested");

        let _filter = request.into_inner();
        let rx = self.block_tx.subscribe();
        let stream = BroadcastStream::new(rx);

        let filtered = stream.filter_map(move |result| match result {
            Ok(block) => {
                let notification = BlockNotification {
                    hash: block.header.hash_slow().as_slice().to_vec(),
                    number: block.header.number,
                    transactions: vec![],
                    timestamp: block.header.timestamp,
                };
                Some(Ok(notification))
            }
            Err(_) => None,
        });

        Ok(Response::new(Box::pin(filtered)))
    }

    type StreamReceiptsStream =
        Pin<Box<dyn Stream<Item = Result<ReceiptNotification, Status>> + Send>>;

    async fn stream_receipts(
        &self,
        _request: Request<ReceiptFilter>,
    ) -> Result<Response<Self::StreamReceiptsStream>, Status> {
        debug!("Stream receipts requested");

        let rx = self.receipt_tx.subscribe();
        let stream = BroadcastStream::new(rx);

        let filtered = stream.filter_map(move |result| match result {
            Ok(receipts) => {
                if let Some(receipt) = receipts.first() {
                    let notification = ReceiptNotification {
                        transaction_hash: vec![0; 32],
                        success: receipt.success,
                        gas_used: receipt.cumulative_gas_used,
                        logs: vec![],
                    };
                    Some(Ok(notification))
                } else {
                    None
                }
            }
            Err(_) => None,
        });

        Ok(Response::new(Box::pin(filtered)))
    }

    type StreamLogsStream = Pin<Box<dyn Stream<Item = Result<LogNotification, Status>> + Send>>;

    async fn stream_logs(
        &self,
        _request: Request<LogFilter>,
    ) -> Result<Response<Self::StreamLogsStream>, Status> {
        debug!("Stream logs requested");

        let rx = self.receipt_tx.subscribe();
        let stream = BroadcastStream::new(rx);

        let filtered = stream.filter_map(move |_| None);

        Ok(Response::new(Box::pin(filtered)))
    }

    async fn classify_transaction(
        &self,
        _request: Request<TransactionRequest>,
    ) -> Result<Response<ClassificationResponse>, Status> {
        debug!("Classify transaction requested");

        let response = ClassificationResponse {
            tx_type: "StandardEvm".to_string(),
            execution_path: "EvmOnly".to_string(),
            confidence: 0.95,
            intent: Some("Unknown".to_string()),
            requires_context: false,
            estimated_compute_units: None,
        };

        Ok(Response::new(response))
    }

    async fn fetch_context(
        &self,
        _request: Request<TransactionRequest>,
    ) -> Result<Response<ContextResponse>, Status> {
        debug!("Fetch context requested");

        let response = ContextResponse { contexts: vec![] };

        Ok(Response::new(response))
    }

    async fn create_execution_plan(
        &self,
        _request: Request<ExecutionPlanRequest>,
    ) -> Result<Response<ExecutionPlanResponse>, Status> {
        debug!("Create execution plan requested");

        let response = ExecutionPlanResponse {
            steps: vec![],
            total_gas_estimate: vec![0; 32],
            requires_witness: false,
            parallel_execution: false,
        };

        Ok(Response::new(response))
    }

    async fn health_check(
        &self,
        _request: Request<Empty>,
    ) -> Result<Response<HealthResponse>, Status> {
        let uptime = self.start_time.elapsed().unwrap_or_default().as_secs();

        let response = HealthResponse {
            healthy: true,
            version: "0.1.0".to_string(),
            uptime_seconds: uptime,
        };

        Ok(Response::new(response))
    }
}
