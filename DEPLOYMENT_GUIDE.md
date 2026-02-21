# Production Deployment Guide

## Pre-Launch Verification (Run in Order)

### 1. Database Integrity Check
```bash
npx tsx scripts/validate-database.ts
```
Expected: 47/47 checks passing

### 2. System Tests
```bash
npx tsx scripts/test-complete-system.ts
```
Expected: 20/20 tests passing

### 3. Health Check Verification
```bash
curl http://localhost:5000/api/health
curl http://localhost:5000/api/health/detailed
```
Expected: `"status": "healthy"` for both

### 4. Review Monitoring Queries
```bash
npx tsx scripts/monitoring-queries.ts
```
Copy queries to your dashboard tool (Metabase/Grafana/DataDog)

## Environment Variables Required

### Required
```
DATABASE_URL=postgresql://user:pass@host/database
SESSION_SECRET=your-session-secret
ADMIN_SECRET=your-admin-secret
```

### Stripe Integration (Optional)
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_MODE=production
STRIPE_WEBHOOK_SECRET=whsec_...
WORKSPACE_BILLING_ENABLED=true
AI_CREDITS_DEFAULT_MODE=safe
```

### Object Storage (Optional)
```
DEFAULT_OBJECT_STORAGE_BUCKET_ID=your-bucket-id
PUBLIC_OBJECT_SEARCH_PATHS=public
PRIVATE_OBJECT_DIR=.private
```

## Cron Schedule (Automated)

| Task | Schedule | UTC Time |
|------|----------|----------|
| Monthly Quota Reset | 1st of month | 00:05 |
| Monthly Billing | 1st of month | 00:10 |
| Tier Migrations | 1st of month | 00:15 |

Check cron status:
```bash
curl -H "x-admin-secret: YOUR_SECRET" http://localhost:5000/api/admin/cron/status
```

## API Endpoints Summary

### Health
- `GET /api/health` - Quick check
- `GET /api/health/detailed` - Comprehensive check

### Analytics (require admin secret)
- `GET /api/analytics/platform-metrics`
- `GET /api/analytics/cohorts`
- `GET /api/analytics/usage-trends`
- `GET /api/analytics/revenue`

### Admin (require admin secret)
- `POST /api/admin/billing/process-monthly`
- `POST /api/admin/quotas/reset-monthly`
- `POST /api/admin/migrations/apply-pending`
- `GET /api/admin/cron/status`
- `POST /api/admin/cron/run-all`

## Post-Deployment Checklist

- [ ] Health endpoints returning healthy
- [ ] Database connection verified
- [ ] Stripe webhook registered
- [ ] Stripe products seeded for workspace tiers
- [ ] Workspace billing enabled in environment
- [ ] Cron scheduler running
- [ ] Demo user accessible (demo@divorceledger.live / demo123)
- [ ] Analytics dashboard populated

## Rollback Plan

If critical issues found:

1. **Stop new billings**: Set environment variable to pause
2. **Revert migrations**: Run migration reversal
3. **Clear test data**: `DELETE FROM users WHERE email LIKE '%test%'`
4. **Restore database**: Use backup from before deployment
5. **Notify users**: Issue statement about temporary pause

## Workspace Billing Setup

### 1. Run workspace migration
```bash
psql $DATABASE_URL -f migrations/008-multi-tenant-billing.sql
```

### 2. Seed Stripe products and prices
```bash
STRIPE_SECRET_KEY=sk_live_... npx tsx server/scripts/setup-stripe-products.ts
```

### 3. Configure Stripe webhook endpoint
Endpoint URL:
```
https://YOUR_DOMAIN/api/webhooks/stripe
```

Events to enable:
- checkout.session.completed
- customer.subscription.created
- customer.subscription.updated
- customer.subscription.deleted
- invoice.payment_succeeded
- invoice.payment_failed

### 4. Verify workspace billing endpoints
- POST /api/billing/workspace/checkout
- POST /api/billing/workspace/portal
- POST /api/workspaces
- GET /api/workspaces/:workspaceId
- GET /api/workspaces/:workspaceId/entitlements

## Support

For issues, check:
1. `/api/health/detailed` for system status
2. Server logs for errors
3. Database connection status
4. Stripe webhook logs
