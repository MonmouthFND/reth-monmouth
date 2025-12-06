#!/bin/bash
# Auto-seal script for Monmouth L2
# Drives block production via Engine API

set -e

ENGINE_URL="${ENGINE_URL:-http://127.0.0.1:8551}"
JWT_SECRET="${JWT_SECRET:-./data/jwt.hex}"
BLOCK_TIME="${BLOCK_TIME:-2}"

# Read JWT secret
if [ ! -f "$JWT_SECRET" ]; then
    echo "Error: JWT secret file not found at $JWT_SECRET"
    exit 1
fi

JWT=$(cat "$JWT_SECRET")

# Generate JWT token for authentication
generate_jwt_token() {
    local secret=$1
    local timestamp=$(date +%s)

    # Header
    header='{"alg":"HS256","typ":"JWT"}'
    header_b64=$(echo -n "$header" | openssl base64 -A | tr '+/' '-_' | tr -d '=')

    # Payload (iat = issued at)
    payload="{\"iat\":$timestamp}"
    payload_b64=$(echo -n "$payload" | openssl base64 -A | tr '+/' '-_' | tr -d '=')

    # Signature
    signature=$(echo -n "${header_b64}.${payload_b64}" | openssl dgst -sha256 -hmac "$(echo "$secret" | xxd -r -p)" -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')

    echo "${header_b64}.${payload_b64}.${signature}"
}

# Make authenticated Engine API call
engine_call() {
    local method=$1
    local params=$2
    local token=$(generate_jwt_token "$JWT")

    curl -s -X POST "$ENGINE_URL" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $token" \
        -d "{\"jsonrpc\":\"2.0\",\"method\":\"$method\",\"params\":$params,\"id\":1}"
}

echo "Starting auto-seal for Monmouth L2"
echo "Engine URL: $ENGINE_URL"
echo "Block time: ${BLOCK_TIME}s"

# Initialize state
PARENT_HASH="0x0000000000000000000000000000000000000000000000000000000000000000"
TIMESTAMP=$(date +%s)
BLOCK_NUMBER=0

# Get current head
echo "Getting current head..."
RESPONSE=$(engine_call "engine_forkchoiceUpdatedV3" "[{\"headBlockHash\":\"$PARENT_HASH\",\"safeBlockHash\":\"$PARENT_HASH\",\"finalizedBlockHash\":\"$PARENT_HASH\"},{\"timestamp\":\"0x$(printf '%x' $TIMESTAMP)\",\"prevRandao\":\"0x0000000000000000000000000000000000000000000000000000000000000000\",\"suggestedFeeRecipient\":\"0x0000000000000000000000000000000000000000\",\"withdrawals\":[],\"parentBeaconBlockRoot\":\"0x0000000000000000000000000000000000000000000000000000000000000000\"}]")

echo "Response: $RESPONSE"

# Main loop
while true; do
    TIMESTAMP=$(date +%s)
    echo ""
    echo "=== Producing block at timestamp $TIMESTAMP ==="

    # Step 1: Fork choice update with payload attributes to start building
    echo "Step 1: Triggering block build..."
    RESPONSE=$(engine_call "engine_forkchoiceUpdatedV3" "[{\"headBlockHash\":\"$PARENT_HASH\",\"safeBlockHash\":\"$PARENT_HASH\",\"finalizedBlockHash\":\"$PARENT_HASH\"},{\"timestamp\":\"0x$(printf '%x' $TIMESTAMP)\",\"prevRandao\":\"0x0000000000000000000000000000000000000000000000000000000000000000\",\"suggestedFeeRecipient\":\"0x0000000000000000000000000000000000000000\",\"withdrawals\":[],\"parentBeaconBlockRoot\":\"0x0000000000000000000000000000000000000000000000000000000000000000\"}]")

    PAYLOAD_ID=$(echo "$RESPONSE" | jq -r '.result.payloadId // empty')
    echo "Payload ID: $PAYLOAD_ID"

    if [ -z "$PAYLOAD_ID" ] || [ "$PAYLOAD_ID" = "null" ]; then
        echo "Failed to get payload ID: $RESPONSE"
        sleep $BLOCK_TIME
        continue
    fi

    # Step 2: Wait a bit then get the payload
    sleep 1
    echo "Step 2: Getting payload..."
    RESPONSE=$(engine_call "engine_getPayloadV3" "[\"$PAYLOAD_ID\"]")

    EXECUTION_PAYLOAD=$(echo "$RESPONSE" | jq '.result.executionPayload // empty')
    if [ -z "$EXECUTION_PAYLOAD" ] || [ "$EXECUTION_PAYLOAD" = "null" ]; then
        echo "Failed to get payload: $RESPONSE"
        sleep $BLOCK_TIME
        continue
    fi

    BLOCK_HASH=$(echo "$EXECUTION_PAYLOAD" | jq -r '.blockHash')
    echo "Block hash: $BLOCK_HASH"

    # Step 3: Submit the new payload
    echo "Step 3: Submitting new payload..."
    BLOBS_BUNDLE=$(echo "$RESPONSE" | jq -c '.result.blobsBundle // {"commitments":[],"proofs":[],"blobs":[]}')
    VERSIONED_HASHES=$(echo "$RESPONSE" | jq -c '[.result.blobsBundle.commitments // [] | .[]]')
    PARENT_BEACON_ROOT="0x0000000000000000000000000000000000000000000000000000000000000000"

    RESPONSE=$(engine_call "engine_newPayloadV3" "[$EXECUTION_PAYLOAD,$VERSIONED_HASHES,\"$PARENT_BEACON_ROOT\"]")

    STATUS=$(echo "$RESPONSE" | jq -r '.result.status // empty')
    echo "New payload status: $STATUS"

    if [ "$STATUS" != "VALID" ]; then
        echo "Payload invalid: $RESPONSE"
        sleep $BLOCK_TIME
        continue
    fi

    # Step 4: Update fork choice to finalize
    echo "Step 4: Finalizing block..."
    RESPONSE=$(engine_call "engine_forkchoiceUpdatedV3" "[{\"headBlockHash\":\"$BLOCK_HASH\",\"safeBlockHash\":\"$BLOCK_HASH\",\"finalizedBlockHash\":\"$BLOCK_HASH\"},null]")

    STATUS=$(echo "$RESPONSE" | jq -r '.result.payloadStatus.status // empty')
    echo "Fork choice status: $STATUS"

    if [ "$STATUS" = "VALID" ]; then
        PARENT_HASH=$BLOCK_HASH
        BLOCK_NUMBER=$((BLOCK_NUMBER + 1))
        echo "Block $BLOCK_NUMBER finalized: $BLOCK_HASH"
    else
        echo "Fork choice failed: $RESPONSE"
    fi

    sleep $BLOCK_TIME
done
