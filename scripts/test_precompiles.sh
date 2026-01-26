#!/bin/bash

echo "Testing Monmouth precompiles..."
echo ""
echo "Note: AI precompiles (0x1000-0x1002) were removed."
echo "AI/ML happens off-chain via LLM APIs. Blockchain is for settlement only."
echo ""

# Test SVM Router precompile
echo "Testing SVM Router precompile at 0x0000000000000000000000000000000000001003"
curl -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "eth_call",
    "params": [{
      "to": "0x0000000000000000000000000000000000001003",
      "data": "0x00000000000000000000000000000000"
    }, "latest"],
    "id": 1
  }'

echo ""

# Test L2 Message Passer precompile
echo "Testing L2 Message Passer precompile at 0x0000000000000000000000000000000000004200"
# Note: This precompile expects JSON-encoded L2MessageInput
# For a simple test, we just verify it responds (will return error for invalid input)
curl -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "eth_call",
    "params": [{
      "to": "0x0000000000000000000000000000000000004200",
      "data": "0x7b7d"
    }, "latest"],
    "id": 2
  }'

echo ""
echo "Precompile tests complete."
