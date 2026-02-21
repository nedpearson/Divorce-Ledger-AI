# Production Deployment Checklist

## 🔒 Security

### Immediate Actions

- [ ] **CRITICAL**: Rotate your Supabase database password (exposed in git history)
  - Go to Supabase → Project Settings → Database
  - Reset password
  - Update `DATABASE_URL` in Railway Variables
  
- [ ] Review all console.log statements for sensitive data exposure
  - Search for: `console.log.*password|token|key`
  
- [ ] Enable rate limiting on authentication endpoints
  - Already configured but verify limits are appropriate
  
- [ ] Set up CORS properly for production
  ```bash
  # Railway Variable
  ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
  ```

### Recommended

- [ ] Implement request ID tracking for debugging
- [ ] Add IP-based rate limiting for public endpoints
- [ ] Enable audit logging for admin actions
- [ ] Set up security headers (already using helmet)

## 📊 Monitoring & Observability

### Logging

- [ ] Replace `console.log` with structured logger
  - Already have `server/lib/logger.ts`
  - Migrate 100+ console.log statements
  
- [ ] Set up log aggregation
  - Railway provides basic logs
  - Consider: Datadog, LogDNA, or Railway's built-in logs
  
- [ ] Add performance tracking
  - Log slow database queries
  - Track API endpoint response times

### Alerting

- [ ] Set up error tracking (Sentry recommended)
  ```bash
  npm install @sentry/node
  ```
  
- [ ] Configure Railway alerts
  - Memory usage > 80%
  - CPU usage > 80%
  - Restart count > 5/hour
  
- [ ] Database monitoring
  - Supabase dashboard → Database → Performance
  - Set alerts for connection pool exhaustion

## 🚀 Performance

### Database

- [ ] Add database indexes for common queries
  ```sql
  -- Check missing indexes
  SELECT schemaname, tablename, attname, n_distinct
  FROM pg_stats
  WHERE schemaname = 'public'
  ORDER BY n_distinct DESC;
  ```
  
- [ ] Enable connection pooling (already configured)
- [ ] Set up read replicas for analytics queries (Supabase Pro)

### Caching

- [ ] Implement Redis for session storage
  - Current: PostgreSQL session store (works but slower)
  
- [ ] Add API response caching
  - Cache analytics queries (TTL: 5 minutes)
  - Cache user profile data (TTL: 1 minute)

### Code

- [ ] Reduce bundle size (currently 2.4MB)
  - Consider code splitting for large dependencies
  - Tree-shake unused exports
  
- [ ] Optimize database queries
  - Use `SELECT` specific columns instead of `SELECT *`
  - Add EXPLAIN ANALYZE to slow queries

## 🧪 Testing

- [ ] Add integration tests for critical paths
  - User registration/login
  - Stripe webhooks
  - Document analysis
  
- [ ] Set up CI/CD testing
  ```yaml
  # .github/workflows/test.yml
  - run: npm test
  - run: npm run check
  ```
  
- [ ] Load testing before going live
  ```bash
  # Using k6 or Apache Bench
  k6 run load-test.js
  ```

## 🔄 Deployment

### Pre-Deploy

- [ ] Run database migrations in staging first
- [ ] Test with production-like data volume
- [ ] Verify all environment variables are set
- [ ] Check Railway build logs for warnings

### Post-Deploy

- [ ] Smoke test all critical endpoints (use RAILWAY_SMOKE_TEST.md)
- [ ] Verify Stripe webhook is receiving events
- [ ] Check document analysis is processing queue
- [ ] Monitor error rates for 1 hour

### Rollback Plan

- [ ] Document rollback procedure
  ```bash
  # Railway Dashboard → Deployments → Click previous deployment → Redeploy
  ```
  
- [ ] Keep database migrations reversible
- [ ] Have old environment variables backed up

## 💰 Cost Optimization

- [ ] Set up billing alerts
  - Supabase: Database size alerts
  - Railway: Usage alerts
  - OpenAI/Anthropic: API spend alerts
  
- [ ] Review AI model costs
  - Currently: All 3 providers bundled (increases bundle size)
  - Consider: Only bundle providers you'll use
  
- [ ] Monitor database storage growth
  ```sql
  SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
  ```

## 📝 Documentation

- [ ] Update API documentation
- [ ] Document environment variables (already have .env.railway.example ✅)
- [ ] Create runbook for common issues
- [ ] Document backup/restore procedures

## 🔐 Compliance (if handling PII)

- [ ] GDPR compliance
  - User data export
  - Right to deletion
  - Cookie consent
  
- [ ] Data encryption at rest (already enabled in Supabase ✅)
- [ ] Audit logging for data access
- [ ] Privacy policy and terms of service

## 📱 User Experience

- [ ] Test on mobile devices
- [ ] Verify email delivery (SendGrid)
- [ ] Test file upload limits
- [ ] Verify error messages are user-friendly

## Priority Ranking

**Critical (Do Before Launch):**
1. Rotate database password
2. Set up error tracking (Sentry)
3. Configure Railway alerts
4. Smoke test all endpoints

**High (Do Within 1 Week):**
1. Replace console.log with structured logging
2. Add database indexes
3. Set up monitoring dashboard
4. Document rollback procedures

**Medium (Do Within 1 Month):**
1. Implement Redis caching
2. Add integration tests
3. Optimize bundle size
4. Set up CI/CD

**Low (Nice to Have):**
1. Load testing
2. Read replicas
3. Advanced analytics
4. Mobile app optimization
