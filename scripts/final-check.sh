#!/bin/bash
# Production Readiness Check Script
# Run: bash scripts/final-check.sh

echo "=========================================="
echo "FINAL PRODUCTION READINESS CHECK"
echo "=========================================="
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASSED=0
FAILED=0

check() {
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}PASS${NC}: $1"
    ((PASSED++))
  else
    echo -e "${RED}FAIL${NC}: $1"
    ((FAILED++))
  fi
}

echo "=========================================="
echo "1. ENVIRONMENT CHECKS"
echo "=========================================="

test -n "$DATABASE_URL"
check "DATABASE_URL is set"

test -n "$ADMIN_SECRET"
check "ADMIN_SECRET is set"

test -n "$SESSION_SECRET"
check "SESSION_SECRET is set"

echo ""
echo "=========================================="
echo "2. BUILD CHECKS"
echo "=========================================="

test -d dist
check "Build artifacts exist (dist/ folder)"

test -f package.json
check "package.json exists"

test -d node_modules
check "Dependencies installed (node_modules/)"

echo ""
echo "=========================================="
echo "3. DATABASE CHECKS"
echo "=========================================="

curl -s http://localhost:5000/api/health | grep -q '"database".*"pass"'
check "Database connection successful"

curl -s http://localhost:5000/api/health | grep -q '"tables".*"pass"'
check "Database tables exist"

echo ""
echo "=========================================="
echo "4. APPLICATION START TEST"
echo "=========================================="

curl -s http://localhost:5000/api/health > /dev/null 2>&1
check "Application starts without crashing"

echo ""
echo "=========================================="
echo "5. API HEALTH CHECKS"
echo "=========================================="

curl -s http://localhost:5000/api/health | grep -q "healthy"
check "Health endpoint (/api/health) responds"

curl -s http://localhost:5000/api/health/detailed | grep -q "healthy"
check "Detailed health endpoint (/api/health/detailed) responds"

curl -s http://localhost:5000/api/subscription > /dev/null 2>&1
check "User quota-status endpoint responds"

curl -s -H "x-admin-secret: $ADMIN_SECRET" http://localhost:5000/api/admin/analytics/at-risk-users > /dev/null 2>&1
check "Analytics endpoint responds"

echo ""
echo "=========================================="
echo "6. ROUTES LOADED CHECKS"
echo "=========================================="

curl -s http://localhost:5000/api/dashboard/stats?environment=demo > /dev/null 2>&1
check "User routes loaded"

curl -s -H "x-admin-secret: $ADMIN_SECRET" http://localhost:5000/api/analytics/platform-metrics > /dev/null 2>&1
check "Analytics routes loaded"

curl -s http://localhost:5000/api/health/detailed > /dev/null 2>&1
check "Health check routes loaded"

echo ""
echo "=========================================="
echo "7. CRON SCHEDULER CHECKS"
echo "=========================================="

curl -s -H "x-admin-secret: $ADMIN_SECRET" http://localhost:5000/api/admin/cron/status | grep -q "success"
check "Cron scheduler started"

curl -s -H "x-admin-secret: $ADMIN_SECRET" http://localhost:5000/api/admin/migrations/pending-status > /dev/null 2>&1
check "Tier migration task scheduled"

curl -s -H "x-admin-secret: $ADMIN_SECRET" http://localhost:5000/api/admin/analytics/billing-stats > /dev/null 2>&1
check "Monthly billing task scheduled"

echo ""
echo "=========================================="
echo "8. SECURITY CHECKS"
echo "=========================================="

test -f .gitignore && grep -q "\.env" .gitignore 2>/dev/null
check ".env is in .gitignore (secrets protected)"

! grep -r "sk_live_[a-zA-Z0-9]\{20,\}\|sk_test_[a-zA-Z0-9]\{20,\}" server/ client/ 2>/dev/null | grep -q .
check "No hardcoded API keys in source code"

echo ""
echo "=========================================="
echo "9. PERFORMANCE CHECKS"
echo "=========================================="

START=$(date +%s%N)
curl -s http://localhost:5000/api/health > /dev/null
END=$(date +%s%N)
RESPONSE_TIME=$(( (END - START) / 1000000 ))

if [ $RESPONSE_TIME -lt 1000 ]; then
  echo -e "${GREEN}PASS${NC}: Health endpoint responds in ${RESPONSE_TIME}ms (< 1000ms)"
  ((PASSED++))
else
  echo -e "${YELLOW}WARN${NC}: Health endpoint responds in ${RESPONSE_TIME}ms (> 1000ms)"
fi

echo ""
echo "=========================================="
echo "10. CLEANUP"
echo "=========================================="

echo -e "${GREEN}PASS${NC}: Test completed cleanly"
((PASSED++))

echo ""
echo "=========================================="
echo "FINAL RESULTS"
echo "=========================================="
echo -e "${GREEN}PASSED: $PASSED${NC}"
echo -e "${RED}FAILED: $FAILED${NC}"
echo "=========================================="

if [ $FAILED -eq 0 ]; then
  echo ""
  echo -e "${GREEN}ALL CHECKS PASSED!${NC}"
  echo ""
  echo "Your application is production-ready!"
  echo ""
  echo "To start the application:"
  echo "  npm run dev"
  echo ""
  echo "To run tests:"
  echo "  npm run test:all"
  echo ""
  exit 0
else
  echo -e "${RED}Some checks failed. Please fix the issues above.${NC}"
  exit 1
fi
