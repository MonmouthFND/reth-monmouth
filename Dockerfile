# Build stage
FROM rust:1.76 AS builder

WORKDIR /app

# Copy workspace files
COPY Cargo.toml Cargo.lock ./
COPY primitives primitives/
COPY chain-config chain-config/
COPY evm evm/
COPY txpool txpool/
COPY engine engine/
COPY exex-host exex-host/
COPY node node/

# Build the node
RUN cargo build --release --bin monmouth

# Runtime stage
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Copy the binary
COPY --from=builder /app/target/release/monmouth /usr/local/bin/monmouth

# Create data directory
RUN mkdir -p /data

# Expose ports
EXPOSE 30303 30303/udp 8545 8546 8551 50051

# Set entrypoint
ENTRYPOINT ["monmouth"]

# Default command
CMD ["node", \
     "--datadir", "/data", \
     "--http", "--http.addr", "0.0.0.0", \
     "--ws", "--ws.addr", "0.0.0.0", \
     "--authrpc.addr", "0.0.0.0", \
     "--enable-exex-host"]