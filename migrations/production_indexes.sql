-- Performance Indexes for Production
-- Run these after deploying to production to improve query performance

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_subscription_tier ON users(subscription_tier);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- Expenses table indexes
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(start_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_environment ON expenses(environment);

-- Income table indexes
CREATE INDEX IF NOT EXISTS idx_income_user_id ON incomes(user_id);
CREATE INDEX IF NOT EXISTS idx_income_date ON incomes(start_date DESC);
CREATE INDEX IF NOT EXISTS idx_income_user_date ON incomes(user_id, start_date DESC);

-- Debts table indexes
CREATE INDEX IF NOT EXISTS idx_debts_user_id ON debts(user_id);
CREATE INDEX IF NOT EXISTS idx_debts_user_env ON debts(user_id, environment);

-- Assets table indexes
CREATE INDEX IF NOT EXISTS idx_assets_user_id ON assets(user_id);

-- Violations indexes
CREATE INDEX IF NOT EXISTS idx_violations_user_id ON violations(user_id);
CREATE INDEX IF NOT EXISTS idx_violations_severity ON violations(severity_score);


-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_expenses_user_category ON expenses(user_id, category);
CREATE INDEX IF NOT EXISTS idx_violations_user_status ON violations(user_id, status);

-- Analyze tables to update statistics
ANALYZE users;
ANALYZE expenses;
ANALYZE incomes;
ANALYZE debts;
ANALYZE assets;
ANALYZE violations;

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
