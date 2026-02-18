-- Migration: 007-billing-and-quota-tables.sql
-- Description: Billing records, tier migrations, and quota reset tables
-- Note: These tables are managed by Drizzle ORM - use `npm run db:push` instead of running this SQL directly

-- Billing Records Table
CREATE TABLE IF NOT EXISTS billing_records (
  id VARCHAR(100) PRIMARY KEY,
  user_id VARCHAR(100) NOT NULL,
  tier VARCHAR(50) NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  violations_recorded INT DEFAULT 0,
  storage_used_mb REAL DEFAULT 0,
  amount_cents INT NOT NULL DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending',
  stripe_invoice_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_billing_user_period ON billing_records(user_id, period_start);
CREATE INDEX IF NOT EXISTS idx_billing_status ON billing_records(status);

-- Tier Migrations Table
CREATE TABLE IF NOT EXISTS tier_migrations (
  id VARCHAR(100) PRIMARY KEY,
  user_id VARCHAR(100) NOT NULL,
  from_tier VARCHAR(50) NOT NULL,
  to_tier VARCHAR(50) NOT NULL,
  reason TEXT,
  grace_period_days INT DEFAULT 0,
  migrated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  effective_at TIMESTAMP NOT NULL,
  status VARCHAR(20) DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_migration_user_status ON tier_migrations(user_id, status);
CREATE INDEX IF NOT EXISTS idx_migration_effective_at ON tier_migrations(effective_at);

-- Quota Reset Log Table
CREATE TABLE IF NOT EXISTS quota_reset_log (
  id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(100) NOT NULL,
  reset_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reset_month VARCHAR(7),
  violations_count_before INT DEFAULT 0,
  voice_transcriptions_before INT DEFAULT 0,
  media_uploads_before INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_quota_user_month ON quota_reset_log(user_id, reset_month);
CREATE INDEX IF NOT EXISTS idx_quota_reset_at ON quota_reset_log(reset_at);

-- Usage Audit Table (already exists but included for reference)
CREATE TABLE IF NOT EXISTS usage_audit (
  id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(100) NOT NULL,
  tier VARCHAR(50) NOT NULL,
  violations_count INT DEFAULT 0,
  storage_used_mb REAL DEFAULT 0,
  media_count INT DEFAULT 0,
  active_cases INT DEFAULT 0,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  environment TEXT DEFAULT 'demo'
);

CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_recorded ON usage_audit(recorded_at);
