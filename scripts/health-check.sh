#!/bin/bash
# Production Health Check Script
# Run this periodically to verify your Railway deployment is healthy

BASE_URL="${1:-https://your-app.up.railway.app}"
ADMIN_SECRET="${ADMIN_SECRET:-}"

echo "🏥 Health Check for: $BASE_URL"
echo "=================================="

# Basic health check
echo -n "✓ Health endpoint... "
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/health")
if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ OK ($HTTP_CODE)"
else
  echo "❌ FAILED ($HTTP_CODE)"
  exit 1
fi

# Detailed health check
echo -n "✓ Detailed health... "
DETAILED=$(curl -s "$BASE_URL/api/health/detailed")
if echo "$DETAILED" | grep -q '"database":"healthy"'; then
  echo "✅ OK"
else
  echo "⚠️  Warning - check details"
  echo "$DETAILED"
fi

# Database connection
echo -n "✓ Database... "
if echo "$DETAILED" | grep -q '"database":"healthy"'; then
  echo "✅ Connected"
else
  echo "❌ FAILED"
  exit 1
fi

# Check if admin endpoints require auth
echo -n "✓ Admin auth... "
ADMIN_CHECK=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/admin/billing/process-monthly")
if [ "$ADMIN_CHECK" = "401" ] || [ "$ADMIN_CHECK" = "403" ]; then
  echo "✅ Protected ($ADMIN_CHECK)"
else
  echo "⚠️  Unexpected ($ADMIN_CHECK)"
fi

# Check response time
echo -n "✓ Response time... "
START=$(date +%s%N)
curl -s "$BASE_URL/api/health" > /dev/null
END=$(date +%s%N)
DIFF=$((($END - $START) / 1000000))
if [ $DIFF -lt 1000 ]; then
  echo "✅ ${DIFF}ms"
elif [ $DIFF -lt 3000 ]; then
  echo "⚠️  ${DIFF}ms (slow)"
else
  echo "❌ ${DIFF}ms (very slow)"
fi

# Check SSL certificate (if HTTPS)
if [[ $BASE_URL == https://* ]]; then
  echo -n "✓ SSL certificate... "
  if curl -s --head "$BASE_URL" | grep -q "HTTP/2 "; then
    echo "✅ Valid"
  else
    echo "⚠️  Check manually"
  fi
fi

echo "=================================="
echo "✅ Health check complete"

# Optional: Send results to monitoring service
# curl -X POST https://your-monitoring-service.com/api/health \
#   -d "{\"status\": \"healthy\", \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
