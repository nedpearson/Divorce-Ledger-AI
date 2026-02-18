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

## Support

For issues, check:
1. `/api/health/detailed` for system status
2. Server logs for errors
3. Database connection status
4. Stripe webhook logs
