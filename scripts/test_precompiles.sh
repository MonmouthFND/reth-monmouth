#!/bin/bash

echo "Testing Monmouth precompiles..."

# Test AI Inference precompile
echo "Testing AI Inference precompile at 0x0000000000000000000000000000000000001000"
curl -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "eth_call",
    "params": [{
      "to": "0x0000000000000000000000000000000000001000",
      "data": "0x1234567890abcdef"
    }, "latest"],
    "id": 1
  }'

echo ""

# Test Vector Similarity precompile
echo "Testing Vector Similarity precompile at 0x0000000000000000000000000000000000001001"
curl -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "eth_call",
    "params": [{
      "to": "0x0000000000000000000000000000000000001001",
      "data": "0xabcdef1234567890"
    }, "latest"],
    "id": 2
  }'

echo ""

# Test Intent Parser precompile
echo "Testing Intent Parser precompile at 0x0000000000000000000000000000000000001002"
curl -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "eth_call",
    "params": [{
      "to": "0x0000000000000000000000000000000000001002",
      "data": "0x48656c6c6f20576f726c64"
    }, "latest"],
    "id": 3
  }'

echo ""