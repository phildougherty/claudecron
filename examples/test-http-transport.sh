#!/bin/bash

# Test script for ClaudeCron HTTP Transport
# This script tests the basic HTTP endpoints

set -e

HOST="localhost"
PORT="3000"
BASE_URL="http://${HOST}:${PORT}"
TOKEN="replace-with-your-secret-token"

echo "Testing ClaudeCron HTTP Transport"
echo "================================="
echo ""

# Test 1: Health check
echo "Test 1: Health Check"
echo "--------------------"
HEALTH_RESPONSE=$(curl -s "${BASE_URL}/health")
echo "Response: ${HEALTH_RESPONSE}"
echo ""

# Test 2: Initialize session (with authentication)
echo "Test 2: Initialize MCP Session"
echo "------------------------------"
INIT_RESPONSE=$(curl -s -v -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    },
    "id": 1
  }' 2>&1)

echo "Response: ${INIT_RESPONSE}"
echo ""

# Extract session ID from headers
SESSION_ID=$(echo "$INIT_RESPONSE" | grep -i "mcp-session-id:" | sed 's/.*: //' | tr -d '\r')

if [ -z "$SESSION_ID" ]; then
  echo "ERROR: No session ID received"
  exit 1
fi

echo "Session ID: ${SESSION_ID}"
echo ""

# Test 3: List tools
echo "Test 3: List Tools"
echo "------------------"
TOOLS_RESPONSE=$(curl -s -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Mcp-Session-Id: ${SESSION_ID}" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "params": {},
    "id": 2
  }')

echo "Response: ${TOOLS_RESPONSE}"
echo ""

# Test 4: Send initialized notification
echo "Test 4: Send Initialized Notification"
echo "-------------------------------------"
curl -s -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Mcp-Session-Id: ${SESSION_ID}" \
  -d '{
    "jsonrpc": "2.0",
    "method": "notifications/initialized",
    "params": {}
  }' > /dev/null

echo "Initialized notification sent"
echo ""

# Test 5: Delete session
echo "Test 5: Delete Session"
echo "----------------------"
DELETE_RESPONSE=$(curl -s -X DELETE "${BASE_URL}/mcp" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Mcp-Session-Id: ${SESSION_ID}")

echo "Response: ${DELETE_RESPONSE}"
echo ""

echo "================================="
echo "All tests completed successfully!"
