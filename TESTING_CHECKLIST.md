# Testing & Validation Checklist

## Pre-Deployment Validation

### Database
- [ ] Run: `npx tsx scripts/validate-database.ts`
  - [ ] All 8 tables exist
  - [ ] All key columns present
  - [ ] Foreign keys configured
  - [ ] Indexes created for performance
  - [ ] No orphaned records

### System Tests
- [ ] Run: `npx tsx scripts/test-complete-system.ts`
  - [ ] Tier Enforcement (violations limit)
  - [ ] Storage Limit Checking
  - [ ] Usage Audit Logging
  - [ ] Billing Calculation
  - [ ] Billing Record Persistence
  - [ ] Tier Migration (with grace period)
  - [ ] Quota Reset Logic
  - [ ] Analytics Queries
  - [ ] Data Consistency Checks
  - [ ] Performance Benchmarks (<500ms)
  - [ ] End-to-End Workflow

### Health Checks
- [ ] Test: `curl http://localhost:5000/api/health`
  - [ ] Returns 200 (healthy)
  - [ ] All checks pass
  - [ ] Response time < 100ms

- [ ] Test: `curl http://localhost:5000/api/health/detailed`
  - [ ] Database connected
  - [ ] Tables accessible
  - [ ] User count > 0
  - [ ] Recent usage data available

### API Endpoints
- [ ] GET /api/analytics/platform-metrics
- [ ] GET /api/analytics/cohorts
- [ ] GET /api/analytics/usage-trends
- [ ] GET /api/analytics/revenue
- [ ] POST /api/admin/billing/process-monthly
- [ ] POST /api/admin/quotas/reset-monthly
- [ ] POST /api/admin/migrations/apply-pending

## Staging Validation

### Load Testing
- [ ] 100 concurrent users simulated
  - [ ] Tier checks < 200ms p99
  - [ ] Billing calculation < 300ms p99
  - [ ] No database errors

### Data Validation
- [ ] Create 1000 test violations
  - [ ] All recorded in usage_audit
  - [ ] Tier enforcement works
  - [ ] Billing calculates correctly

### Edge Cases
- [ ] User at exact tier limit (e.g., 50 violations for Pro)
- [ ] User exceeding tier limit (e.g., 51 violations)
- [ ] Free tier user (no overage charges)
- [ ] Enterprise tier user (unlimited)
- [ ] Grace period migration (7 days pending)
- [ ] Completed grace period (apply tier change)

## Production Deployment

### Pre-Launch
- [ ] Database backups automated
- [ ] Monitoring alerts configured
  - [ ] High violation count alert
  - [ ] Storage quota alert
  - [ ] Tier migration failures
  - [ ] Billing calculation failures
  
- [ ] Cron jobs scheduled:
  - [ ] Monthly billing (1st at 2 AM UTC)
  - [ ] Quota reset (1st at 3 AM UTC)
  - [ ] Migration application (daily at 4 AM UTC)

- [ ] Logging configured:
  - [ ] All tier enforcements logged
  - [ ] All billing transactions logged
  - [ ] All migrations logged
  - [ ] Error logs centralized

### Launch Day
- [ ] Health checks passing
- [ ] Database connection verified
- [ ] Test user created (non-production)
- [ ] Payment processor integration tested
- [ ] Customer support briefed on:
  - [ ] New tier system
  - [ ] Billing process
  - [ ] Grace periods

### Post-Launch (24 hours)
- [ ] Check analytics dashboard
  - [ ] User distribution by tier
  - [ ] No null values in billing
  - [ ] Usage patterns normal

- [ ] Verify no errors in logs
- [ ] Confirm first billing cycle ran

## Monitoring Dashboard

### Key Metrics to Track
- Active users by tier
- Monthly recurring revenue (MRR)
- Violations per user (average)
- Storage utilization
- Churn rate
- Upgrade/downgrade rate

## Rollback Plan

If critical issues found:

1. **Stop new billings**: Set environment variable to pause billing
2. **Revert migrations**: Run migration reversal script
3. **Clear test data**: `DELETE FROM users WHERE email LIKE '%test%'`
4. **Restore database**: Use backup from before deployment
5. **Notify users**: Issue statement about temporary billing pause

## Sign-Off

- [ ] Database validation passed: _____________ Date: _____
- [ ] System tests passed: _____________ Date: _____
- [ ] Load testing passed: _____________ Date: _____
- [ ] Staging sign-off: _____________ Date: _____
- [ ] Production deployment approved: _____________ Date: _____
