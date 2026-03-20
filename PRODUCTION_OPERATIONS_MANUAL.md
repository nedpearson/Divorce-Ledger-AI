# PRODUCTION OPERATIONS MANUAL

# System Status: FULLY OPERATIONAL

# Started: 2026-01-05 02:45:17 UTC

# Port: 5000

---

## System Architecture Overview

### Running Services

| Service         | Port | Status    | Description                 |
| --------------- | ---- | --------- | --------------------------- |
| Express API     | 5000 | Running   | Backend REST API            |
| Vite Dev Server | 5000 | Running   | Frontend serving            |
| PostgreSQL      | 5432 | Connected | Primary database            |
| Cron Scheduler  | -    | Active    | Monthly billing/quota tasks |

### Service Dependencies

```
Frontend (React + Vite)
    ↓
Express API Server
    ↓
PostgreSQL Database
    ↓
Stripe Payment Gateway
```

---

## Health Check Endpoints

| Endpoint               | Method | Auth Required | Purpose              |
| ---------------------- | ------ | ------------- | -------------------- |
| `/api/health`          | GET    | No            | Quick health check   |
| `/api/health/detailed` | GET    | No            | Comprehensive status |

### Health Response Format

```json
{
  "status": "healthy",
  "timestamp": "2026-01-05T02:45:17.000Z",
  "checks": {
    "database": "connected",
    "tables": "all_present",
    "billing": "operational",
    "audit": "tracking",
    "violations": "monitoring",
    "scheduler": "active"
  },
  "uptime": "0d 0h 0m",
  "version": "1.0.0"
}
```

---

## API Endpoints Summary

### Public Endpoints

- `GET /api/health` - Health check
- `GET /api/pricing` - Pricing tiers
- `GET /api/stripe/config` - Stripe publishable key

### Authenticated Endpoints

- `POST /api/auth/login` - User authentication
- `GET /api/dashboard/stats` - Dashboard statistics
- `GET /api/subscription` - User subscription info
- `GET/POST/DELETE /api/incomes` - Income CRUD
- `GET/POST/DELETE /api/expenses` - Expense CRUD
- `GET/POST/DELETE /api/assets` - Asset CRUD
- `GET/POST/DELETE /api/debts` - Debt CRUD
- `GET/POST/PATCH/DELETE /api/violations` - Violations CRUD
- `GET /api/filings/export` - PDF export

### Admin Endpoints (require x-admin-secret header)

- `POST /api/admin/reset-demo` - Reset demo data
- `POST /api/admin/billing/process-monthly` - Process billing
- `POST /api/admin/quotas/reset-monthly` - Reset quotas
- `POST /api/admin/migrations/apply-pending` - Apply migrations
- `GET /api/admin/cron/status` - Scheduler status
- `POST /api/admin/cron/run-all` - Trigger all tasks

### Analytics Endpoints (require x-admin-secret header)

- `GET /api/analytics/platform-metrics` - Platform metrics
- `GET /api/analytics/cohorts` - Cohort analysis
- `GET /api/analytics/usage-trends` - Usage trends
- `GET /api/analytics/revenue` - Revenue breakdown

---

## Cron Schedule

| Task            | Schedule               | Description                  |
| --------------- | ---------------------- | ---------------------------- |
| Demo Reset      | Daily 00:00 UTC        | Clears demo environment data |
| Monthly Billing | 1st of month 00:00 UTC | Processes tier billing       |
| Quota Reset     | 1st of month 00:01 UTC | Resets monthly quotas        |
| Tier Migrations | 1st of month 00:02 UTC | Applies scheduled migrations |

---

## Scheduled Tasks Overview

### Active Cron Jobs

#### 1. Monthly Billing Calculation

**Schedule:** 1st of each month at 00:00 UTC
**Endpoint:** `POST /api/admin/billing/process-monthly`
**Authentication:** Requires `x-admin-secret` header

**Process:**

1. Query all active users with paid subscriptions
2. Calculate billing amount based on tier
3. Create billing record in `billing_records` table
4. Process Stripe charge for each user
5. Update billing status (charged/failed)
6. Log audit trail

**Billing Amounts:**
| Tier | Amount |
|------|--------|
| Free | $0.00 |
| Individual | $12.00 |
| Pro | $49.00 |
| Team | $149.00 |
| Enterprise | $399.00 |

**Manual Trigger:**

```bash
curl -X POST https://your-domain.com/api/admin/billing/process-monthly \
  -H "x-admin-secret: YOUR_ADMIN_SECRET"
```

**Monitoring Points:**

```bash
curl https://your-domain.com/api/admin/analytics/billing-stats \
  -H "x-admin-secret: YOUR_ADMIN_SECRET"
```

**Expected Response:**

```json
{
  "last_run": "2026-01-01T02:00:00Z",
  "records_processed": 2847,
  "records_successful": 2841,
  "success_rate": 99.8,
  "failures": [
    { "user_id": "345", "error": "payment processing failed" },
    { "user_id": "567", "error": "payment processing failed" }
  ],
  "total_revenue": 48750.5
}
```

#### 2. Monthly Quota Reset

**Schedule:** 1st of each month at 00:01 UTC (03:00 UTC in production)
**Task ID:** quotas-monthly-reset
**Endpoint:** `POST /api/admin/quotas/reset-monthly`
**Authentication:** Requires `x-admin-secret` header

**Process:**

1. Reset `violations_count_this_month` to 0 for all users
2. Reset `voice_minutes_this_month` to 0 for all users
3. Reset `media_uploads_this_month` to 0 for all users
4. Log quota reset in audit trail

**Manual Trigger:**

```bash
curl -X POST https://your-domain.com/api/admin/quotas/reset-monthly \
  -H "x-admin-secret: YOUR_ADMIN_SECRET"
```

**Monitoring Points:**

```bash
curl https://your-domain.com/api/admin/analytics/quota-resets \
  -H "x-admin-secret: YOUR_ADMIN_SECRET"
```

**Expected Response:**

```json
{
  "last_reset_date": "2025-12-01T03:00:00Z",
  "users_reset": 2847,
  "users_skipped": 0,
  "reset_coverage": 100.0,
  "avg_violations_before_reset": 12.3,
  "reset_history": [
    {
      "period": "2025-12-01",
      "users_affected": 2847,
      "status": "completed"
    }
  ]
}
```

#### 3. Tier Migrations

**Schedule:** Daily at 00:15 UTC
**Task ID:** migrations-apply-pending
**Endpoint:** `POST /api/admin/migrations/apply-pending`
**Authentication:** Requires `x-admin-secret` header

**Process:**

1. Query users with scheduled tier changes
2. Apply pending upgrades/downgrades
3. Update user subscription tier
4. Adjust Stripe subscription if applicable
5. Send notification email to user
6. Log migration in audit trail

**Manual Trigger:**

```bash
curl -X POST https://your-domain.com/api/admin/migrations/apply-pending \
  -H "x-admin-secret: YOUR_ADMIN_SECRET"
```

**Monitoring Points:**

```bash
curl https://your-domain.com/api/admin/migrations/pending-status \
  -H "x-admin-secret: YOUR_ADMIN_SECRET"
```

**Expected Response:**

```json
{
  "pending_migrations": 12,
  "pending_details": [
    {
      "migration_id": "mig_123",
      "user_id": "456",
      "from_tier": "individual",
      "to_tier": "pro",
      "grace_period_expires": "2026-01-08T00:00:00Z",
      "days_remaining": 3
    }
  ],
  "last_applied": "2026-01-05T00:15:00Z",
  "total_applied_this_month": 34
}
```

#### 4. Demo Data Reset

**Schedule:** Daily at 00:00 UTC
**Endpoint:** `POST /api/admin/reset-demo`
**Authentication:** Requires `x-admin-secret` header

**Process:**

1. Delete all records with `environment = 'demo'`
2. Re-seed demo user account
3. Create sample violations, transactions, assets, debts
4. Reset demo user quotas

**Manual Trigger:**

```bash
curl -X POST https://your-domain.com/api/admin/reset-demo \
  -H "x-admin-secret: YOUR_ADMIN_SECRET"
```

### Scheduler Status Check

**Endpoint:** `GET /api/admin/cron/status`

**Response:**

```json
{
  "scheduler": "active",
  "jobs": [
    {
      "name": "monthly-billing",
      "lastRun": "2026-01-01T00:00:00.000Z",
      "nextRun": "2026-02-01T00:00:00.000Z",
      "status": "success"
    },
    {
      "name": "quota-reset",
      "lastRun": "2026-01-01T00:01:00.000Z",
      "nextRun": "2026-02-01T00:01:00.000Z",
      "status": "success"
    }
  ]
}
```

### Run All Tasks Manually

**Endpoint:** `POST /api/admin/cron/run-all`

Triggers all monthly tasks immediately (useful for testing or recovery):

```bash
curl -X POST https://your-domain.com/api/admin/cron/run-all \
  -H "x-admin-secret: YOUR_ADMIN_SECRET"
```

---

## Subscription Tiers

| Tier       | Price   | Cases     | Violations/mo | Max File | Storage   |
| ---------- | ------- | --------- | ------------- | -------- | --------- |
| Free       | $0      | 1         | 10            | 10MB     | 100MB     |
| Individual | $12/mo  | 1         | 20            | 50MB     | 500MB     |
| Pro        | $49/mo  | Unlimited | 50            | 100MB    | 2GB       |
| Team       | $149/mo | Unlimited | Unlimited     | 250MB    | 10GB      |
| Enterprise | $399/mo | Unlimited | Unlimited     | 500MB    | Unlimited |

---

## Database Tables

| Table          | Purpose                              |
| -------------- | ------------------------------------ |
| users          | User accounts with subscription data |
| transactions   | Financial transactions               |
| assets         | Asset records                        |
| debts          | Debt records                         |
| incomes        | Income sources                       |
| expenses       | Expense items                        |
| alerts         | User alerts                          |
| violations     | Court order violations               |
| evidenceFiles  | Evidence attachments                 |
| chainOfCustody | Evidence custody log                 |
| messages       | Client-lawyer communication          |
| cases          | Case management                      |
| teams          | Team management                      |

---

## Monitoring Queries

### Active Users by Tier

```sql
SELECT subscription_tier, COUNT(*) as count
FROM users
GROUP BY subscription_tier
ORDER BY count DESC;
```

### Violations Per Day

```sql
SELECT DATE(created_at) as date, COUNT(*) as count
FROM violations
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date;
```

### Revenue by Tier

```sql
SELECT subscription_tier, SUM(amount_cents) / 100.0 as revenue
FROM billing_records
WHERE status = 'charged'
AND created_at >= DATE_TRUNC('month', NOW())
GROUP BY subscription_tier;
```

### Users at Tier Limits

```sql
SELECT COUNT(*) as at_limit
FROM users
WHERE violations_count_this_month >= CASE
  WHEN subscription_tier = 'free' THEN 10
  WHEN subscription_tier = 'individual' THEN 20
  WHEN subscription_tier = 'pro' THEN 50
  ELSE 999999
END;
```

---

## Alert Thresholds

| Alert           | Condition      | Response Time | Channels      |
| --------------- | -------------- | ------------- | ------------- |
| Health Fail     | 503+ status    | Immediate     | Email + Slack |
| Tier Errors     | >1% error rate | 5 min         | Email + Slack |
| Billing Fail    | <95% success   | Immediate     | Email + Phone |
| DB Connection   | Check fails    | Immediate     | Email + Phone |
| Storage Full    | User at 100%   | 1 hour        | Email         |
| Revenue Anomaly | >2 std devs    | 1 hour        | Email         |

---

## Troubleshooting

### Billing Issues

```bash
# Check health
curl /api/health/detailed

# Check recent billing
SELECT * FROM billing_records
WHERE DATE(created_at) = CURRENT_DATE
ORDER BY created_at DESC LIMIT 10;

# If database issue: Restore from backup
# If calculation error: Pause scheduler, fix, reprocess
```

### Tier Enforcement

```bash
# Check logs
tail -f logs/tier-enforcement.log | grep ERROR

# Test manually
curl -X POST /api/admin/test/tier-check \
  -H "x-admin-secret: $ADMIN_SECRET" \
  -d '{"user_id": 123, "tier": "pro"}'

# If cache issue: Clear cache, restart services
```

### Database Performance

```sql
-- Check slow queries
SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;

-- Check index usage
SELECT * FROM pg_stat_user_indexes ORDER BY idx_scan DESC;

-- If needed: Add indexes, archive old records, optimize queries
```

---

## Success Metrics

| Category          | Target     |
| ----------------- | ---------- |
| Uptime            | 99.9%+     |
| Response Time     | <200ms avg |
| Critical Errors   | 0          |
| Data Integrity    | 100%       |
| Revenue Match     | ±$0        |
| Churn Rate        | <5%        |
| Billing Disputes  | <1%        |
| Support Tickets   | <5/day     |
| Incident Response | <15 min    |
| MTTR              | <1 hour    |

---

## Validation Scripts

```bash
# Database validation (47 checks)
npx tsx scripts/validate-database.ts

# System tests (22 tests)
npx tsx scripts/test-complete-system.ts

# Full validation before deployment
npm run test:all
```

---

## Emergency Contacts

| Role             | Contact     |
| ---------------- | ----------- |
| On-Call Engineer | [Configure] |
| Database Admin   | [Configure] |
| Billing Support  | [Configure] |
| Security Team    | [Configure] |

---

**Last Updated:** 2026-01-05
**Document Version:** 1.0.0
