-- Migration: 008-multi-tenant-billing.sql
-- Description: Multi-tenant workspace billing, AI Credits, and law firm case management
-- Note: These tables are managed by Drizzle ORM - use `npm run db:push` instead of running this SQL directly

-- ============================================================================
-- WORKSPACES TABLE (Tenant Isolation)
-- ============================================================================

CREATE TABLE IF NOT EXISTS workspaces (
  id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('consumer', 'firm')),
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id VARCHAR(100) UNIQUE,
  stripe_subscription_id VARCHAR(100) UNIQUE,
  subscription_tier VARCHAR(50) NOT NULL DEFAULT 'free',
  subscription_status VARCHAR(20),
  billing_cycle_start TIMESTAMP,
  ai_credits_balance INTEGER NOT NULL DEFAULT 0,
  ai_credits_limit INTEGER NOT NULL DEFAULT 100,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON workspaces(owner_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_type ON workspaces(type);
CREATE INDEX IF NOT EXISTS idx_workspaces_stripe_customer ON workspaces(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workspaces_subscription_tier ON workspaces(subscription_tier);

-- ============================================================================
-- WORKSPACE MEMBERS (Staff + Role Assignment)
-- ============================================================================

CREATE TABLE IF NOT EXISTS workspace_members (
  id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id VARCHAR(100) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'admin', 'staff', 'client')),
  invited_by INTEGER REFERENCES users(id),
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_role ON workspace_members(role);

-- ============================================================================
-- MATTERS (Cases within Firm Workspaces)
-- ============================================================================

CREATE TABLE IF NOT EXISTS matters (
  id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id VARCHAR(100) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  matter_number VARCHAR(50) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'archived')),
  lead_attorney_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP,
  UNIQUE(workspace_id, matter_number)
);

CREATE INDEX IF NOT EXISTS idx_matters_workspace ON matters(workspace_id);
CREATE INDEX IF NOT EXISTS idx_matters_status ON matters(status);
CREATE INDEX IF NOT EXISTS idx_matters_lead_attorney ON matters(lead_attorney_id);

-- ============================================================================
-- MATTER MEMBERS (Attorney + Client Assignments)
-- ============================================================================

CREATE TABLE IF NOT EXISTS matter_members (
  id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  matter_id VARCHAR(100) NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('attorney', 'paralegal', 'client')),
  permissions JSONB DEFAULT '{"can_view": true, "can_upload": false, "can_comment": true}',
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(matter_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_matter_members_matter ON matter_members(matter_id);
CREATE INDEX IF NOT EXISTS idx_matter_members_user ON matter_members(user_id);
CREATE INDEX IF NOT EXISTS idx_matter_members_role ON matter_members(role);

-- ============================================================================
-- INVITATIONS (Client + Staff Invites)
-- ============================================================================

CREATE TABLE IF NOT EXISTS invitations (
  id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id VARCHAR(100) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  matter_id VARCHAR(100) REFERENCES matters(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL,
  invited_by INTEGER NOT NULL REFERENCES users(id),
  token VARCHAR(100) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invitations_workspace ON invitations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status);
CREATE INDEX IF NOT EXISTS idx_invitations_expires ON invitations(expires_at);

-- ============================================================================
-- AI CREDIT TRANSACTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_credit_transactions (
  id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id VARCHAR(100) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL, -- Negative for consumption, positive for grants
  balance_after INTEGER NOT NULL,
  reason VARCHAR(100) NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_credits_workspace ON ai_credit_transactions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ai_credits_user ON ai_credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_credits_created ON ai_credit_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_credits_reason ON ai_credit_transactions(reason);

-- ============================================================================
-- SUBSCRIPTION ENTITLEMENTS (Stripe Sync)
-- ============================================================================

CREATE TABLE IF NOT EXISTS subscription_entitlements (
  id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id VARCHAR(100) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entitlement_type VARCHAR(50) NOT NULL, -- 'matters_limit', 'seats_limit', 'storage_limit', etc.
  limit_value INTEGER,
  current_usage INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(workspace_id, entitlement_type)
);

CREATE INDEX IF NOT EXISTS idx_entitlements_workspace ON subscription_entitlements(workspace_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_type ON subscription_entitlements(entitlement_type);

-- ============================================================================
-- STRIPE EVENTS (Idempotency)
-- ============================================================================

CREATE TABLE IF NOT EXISTS stripe_events (
  id VARCHAR(100) PRIMARY KEY,
  event_id VARCHAR(100) NOT NULL UNIQUE,
  type VARCHAR(100) NOT NULL,
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_type ON stripe_events(type);
CREATE INDEX IF NOT EXISTS idx_stripe_events_processed ON stripe_events(processed_at DESC);

-- ============================================================================
-- ADD WORKSPACE FOREIGN KEY TO EXISTING TABLES
-- ============================================================================

-- Add workspace_id to documents table (if not already present)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'documents' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE documents ADD COLUMN workspace_id VARCHAR(100) REFERENCES workspaces(id) ON DELETE CASCADE;
    CREATE INDEX idx_documents_workspace ON documents(workspace_id);
  END IF;
END $$;

-- Add matter_id to documents table (if not already present)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'documents' AND column_name = 'matter_id'
  ) THEN
    ALTER TABLE documents ADD COLUMN matter_id VARCHAR(100) REFERENCES matters(id) ON DELETE SET NULL;
    CREATE INDEX idx_documents_matter ON documents(matter_id);
  END IF;
END $$;

-- Add workspace_id to cases table (if not already present)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'cases' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE cases ADD COLUMN workspace_id VARCHAR(100) REFERENCES workspaces(id) ON DELETE CASCADE;
    CREATE INDEX idx_cases_workspace ON cases(workspace_id);
  END IF;
END $$;

-- Add workspace_id to violations table (if not already present)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'violations' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE violations ADD COLUMN workspace_id VARCHAR(100) REFERENCES workspaces(id) ON DELETE CASCADE;
    CREATE INDEX idx_violations_workspace ON violations(workspace_id);
  END IF;
END $$;

-- Add workspace_id to transactions table (if not already present)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE transactions ADD COLUMN workspace_id VARCHAR(100) REFERENCES workspaces(id) ON DELETE CASCADE;
    CREATE INDEX idx_transactions_workspace ON transactions(workspace_id);
  END IF;
END $$;

-- ============================================================================
-- HELPER VIEWS
-- ============================================================================

-- Active workspace memberships with full workspace details
CREATE OR REPLACE VIEW workspace_memberships_view AS
SELECT 
  wm.id,
  wm.workspace_id,
  wm.user_id,
  wm.role,
  wm.joined_at,
  w.name AS workspace_name,
  w.type AS workspace_type,
  w.subscription_tier,
  w.subscription_status,
  w.ai_credits_balance,
  w.ai_credits_limit,
  u.username,
  u.email
FROM workspace_members wm
JOIN workspaces w ON w.id = wm.workspace_id
JOIN users u ON u.id = wm.user_id;

-- Matter access with permissions
CREATE OR REPLACE VIEW matter_access_view AS
SELECT
  mm.user_id,
  mm.matter_id,
  mm.role AS matter_role,
  mm.permissions,
  m.workspace_id,
  m.matter_number,
  m.title AS matter_title,
  m.status AS matter_status,
  m.lead_attorney_id,
  w.name AS workspace_name,
  w.type AS workspace_type
FROM matter_members mm
JOIN matters m ON m.id = mm.matter_id
JOIN workspaces w ON w.id = m.workspace_id
WHERE m.status != 'archived';

-- Workspace entitlements summary
CREATE OR REPLACE VIEW workspace_entitlements_view AS
SELECT
  w.id AS workspace_id,
  w.name AS workspace_name,
  w.type AS workspace_type,
  w.subscription_tier,
  w.subscription_status,
  w.ai_credits_balance,
  w.ai_credits_limit,
  COUNT(DISTINCT wm.id) AS current_seats,
  COUNT(DISTINCT m.id) AS current_matters,
  COALESCE(SUM(d.file_size), 0) / 1048576.0 AS storage_used_mb
FROM workspaces w
LEFT JOIN workspace_members wm ON wm.workspace_id = w.id
LEFT JOIN matters m ON m.workspace_id = w.id AND m.status != 'archived'
LEFT JOIN documents d ON d.workspace_id = w.id
GROUP BY w.id, w.name, w.type, w.subscription_tier, w.subscription_status, w.ai_credits_balance, w.ai_credits_limit;

COMMENT ON TABLE workspaces IS 'Multi-tenant workspace isolation - consumer vs firm workspaces';
COMMENT ON TABLE workspace_members IS 'User membership and roles within workspaces';
COMMENT ON TABLE matters IS 'Law firm cases/matters with workspace isolation';
COMMENT ON TABLE matter_members IS 'Attorney and client assignments to specific matters';
COMMENT ON TABLE invitations IS 'Pending invitations for workspace/matter access';
COMMENT ON TABLE ai_credit_transactions IS 'AI credit consumption and grant audit trail';
COMMENT ON TABLE subscription_entitlements IS 'Subscription limits synced from Stripe';
COMMENT ON TABLE stripe_events IS 'Webhook event idempotency tracking';
