#!/bin/bash
# Divorce Ledger - Smoke Test Script
# Tests core endpoints for basic functionality

BASE_URL="${BASE_URL:-http://localhost:5000}"
PASS=0
FAIL=0

echo "=========================================="
echo "  DIVORCE LEDGER - SMOKE TEST"
echo "=========================================="
echo "Base URL: $BASE_URL"
echo ""

test_endpoint() {
  local method=$1
  local path=$2
  local description=$3
  local expected_key=$4
  
  printf "%-50s" "Testing $description..."
  
  response=$(curl -s "$BASE_URL$path")
  
  if [[ "$response" == *"$expected_key"* ]]; then
    echo "PASS"
    PASS=$((PASS + 1))
  else
    echo "FAIL"
    FAIL=$((FAIL + 1))
  fi
}

# Health endpoints
test_endpoint "GET" "/api/health" "GET /api/health" '"status":'

# Routes endpoint
test_endpoint "GET" "/api/routes" "GET /api/routes" '"routes":'

# Appwrite status
test_endpoint "GET" "/api/appwrite/status" "GET /api/appwrite/status" '"configured":'

# Selftest (dev only)
test_endpoint "GET" "/api/appwrite/dev/selftest" "GET /api/appwrite/dev/selftest" '"passed":'

echo ""
echo "=========================================="
echo "RESULTS: $PASS passed, $FAIL failed"
echo "=========================================="

if [ $FAIL -gt 0 ]; then
  exit 1
fi
exit 0
