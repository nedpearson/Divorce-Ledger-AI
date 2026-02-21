-- Performance Indexes for Production
-- Run these after deploying to production to improve query performance

-- Users table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_subscription_tier ON users(subscription_tier);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- Expenses table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_expenses_date ON expenses(date DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, date DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_expenses_environment ON expenses(environment);

-- Income table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_income_user_id ON income(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_income_date ON income(date DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_income_user_date ON income(user_id, date DESC);

-- Debts table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_debts_user_id ON debts(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_debts_user_env ON debts(user_id, environment);

-- Assets table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assets_user_id ON assets(user_id);

-- Timeline events indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_timeline_user_id ON timeline_events(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_timeline_date ON timeline_events(date DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_timeline_user_date ON timeline_events(user_id, date DESC);

-- Media items indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_user_id ON media_items(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_uploaded_at ON media_items(uploaded_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_linked_to ON media_items(linked_to_type, linked_to_id) WHERE linked_to_type IS NOT NULL;

-- Violations indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_violations_user_id ON violations(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_violations_date ON violations(date DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_violations_severity ON violations(severity);

-- Recommendations indexes  
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recommendations_user_id ON recommendations(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recommendations_created ON recommendations(created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recommendations_status ON recommendations(status);

-- Billing records indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_billing_user_id ON billing_records(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_billing_status ON billing_records(status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_billing_created ON billing_records(created_at DESC);

-- Sessions indexes (if using PostgreSQL session store)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_expire ON sessions(expire);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_sid ON sessions(sid);

-- Composite indexes for common queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_expenses_user_category ON expenses(user_id, category);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_timeline_user_category ON timeline_events(user_id, category);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_violations_user_status ON violations(user_id, status);

-- Analyze tables to update statistics
ANALYZE users;
ANALYZE expenses;
ANALYZE income;
ANALYZE debts;
ANALYZE assets;
ANALYZE timeline_events;
ANALYZE media_items;
ANALYZE violations;
ANALYZE recommendations;
ANALYZE billing_records;

-- Check index usage after a week
-- Run this query to see which indexes are being used:
-- SELECT 
--   schemaname,
--   tablename,
--   indexname,
--   idx_scan,
--   idx_tup_read,
--   idx_tup_fetch
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public'
-- ORDER BY idx_scan DESC;
