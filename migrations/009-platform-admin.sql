-- Migration: 009-platform-admin.sql
-- Description: Platform Super Admin console tables, audit log, feature flags, entitlement overrides, usage events

-- ============================================================================
-- ADD platform_role column to users (JWT claim storage)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'platform_role'
  ) THEN
    ALTER TABLE users ADD COLUMN platform_role VARCHAR(20);
    COMMENT ON COLUMN users.platform_role IS 'Platform-level role: super_admin | support_admin | NULL';
  END IF;
END $$;

UPDATE users SET platform_role = 'super_admin'
WHERE email = 'nedpearson@gmail.com' AND (platform_role IS NULL OR platform_role != 'super_admin');

-- ============================================================================
-- PLATFORM ADMIN ALLOWLIST
-- ============================================================================
CREATE TABLE IF NOT EXISTS platform_admin_allowlist (
  id          VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email       TEXT NOT NULL UNIQUE,
  role        VARCHAR(20) NOT NULL DEFAULT 'support_admin'
                CHECK (role IN ('super_admin','support_admin')),
  added_by    TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO platform_admin_allowlist (email, role, added_by)
VALUES ('nedpearson@gmail.com', 'super_admin', 'system')
ON CONFLICT (email) DO NOTHING;

-- ============================================================================
-- AUDIT LOG
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id           VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  actor_id     TEXT,
  actor_email  TEXT NOT NULL,
  action_type  VARCHAR(100) NOT NULL,
  target_type  VARCHAR(50),
  target_id    TEXT,
  details      JSONB DEFAULT '{}',
  ip_address   TEXT,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_actor   ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_action  ON audit_log(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_target  ON audit_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

-- ============================================================================
-- PLAN DEFINITIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS plan_definitions (
  id                  VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name                VARCHAR(100) NOT NULL UNIQUE,
  display_name        VARCHAR(200),
  workspace_type      VARCHAR(20) CHECK (workspace_type IN ('consumer','firm')),
  price_cents         INTEGER NOT NULL DEFAULT 0,
  stripe_price_id     TEXT,
  matters_limit       INTEGER,
  seats_limit         INTEGER,
  storage_mb          INTEGER,
  ai_credits_monthly  INTEGER NOT NULL DEFAULT 0,
  features            JSONB DEFAULT '{}',
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO plan_definitions
  (name, display_name, workspace_type, price_cents, matters_limit, seats_limit, storage_mb, ai_credits_monthly, features)
VALUES
  ('free',            'Free',            'consumer', 0,     1,    1,    500,    100,   '{"advancedAI":false,"clientPortal":false,"apiAccess":false,"prioritySupport":false}'),
  ('individual',      'Individual',      'consumer', 1200,  3,    1,    5000,   500,   '{"advancedAI":false,"clientPortal":false,"apiAccess":false,"prioritySupport":false}'),
  ('pro',             'Pro',             'consumer', 4900,  NULL, 1,    50000,  2000,  '{"advancedAI":true,"clientPortal":false,"apiAccess":true,"prioritySupport":false}'),
  ('firm_starter',    'Firm Starter',    'firm',     14900, 25,   3,    50000,  5000,  '{"advancedAI":true,"clientPortal":true,"apiAccess":true,"prioritySupport":false}'),
  ('firm_pro',        'Firm Pro',        'firm',     39900, 100,  10,   200000, 20000, '{"advancedAI":true,"clientPortal":true,"apiAccess":true,"prioritySupport":true}'),
  ('firm_enterprise', 'Firm Enterprise', 'firm',     0,     NULL, NULL, 1000000,100000,'{"advancedAI":true,"clientPortal":true,"apiAccess":true,"prioritySupport":true,"sso":true}')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- FEATURE FLAGS (global defaults)
-- ============================================================================
CREATE TABLE IF NOT EXISTS feature_flags (
  key          VARCHAR(100) PRIMARY KEY,
  enabled      BOOLEAN NOT NULL DEFAULT false,
  description  TEXT,
  updated_by   TEXT,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO feature_flags (key, enabled, description) VALUES
  ('advanced_ai',        true,  'AI pattern detection and document analysis'),
  ('client_portal',      false, 'Client self-service portal for firm workspaces'),
  ('api_access',         false, 'External API access via API keys'),
  ('priority_support',   false, 'Priority support queue'),
  ('voice_transcription',true,  'Voice-to-text transcription'),
  ('screenshot_ocr',     true,  'OCR on uploaded screenshots'),
  ('pdf_export',         true,  'PDF export of case documents'),
  ('export_csv',         true,  'CSV data export'),
  ('bulk_invite',        false, 'Bulk invitation for firm admins'),
  ('beta_case_builder',  false, 'Beta: enhanced case builder with AI suggestions')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- WORKSPACE FEATURE OVERRIDES
-- ============================================================================
CREATE TABLE IF NOT EXISTS workspace_feature_overrides (
  id             VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id   VARCHAR(100) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  feature_key    VARCHAR(100) NOT NULL REFERENCES feature_flags(key) ON DELETE CASCADE,
  enabled        BOOLEAN NOT NULL,
  overridden_by  TEXT,
  overridden_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(workspace_id, feature_key)
);
CREATE INDEX IF NOT EXISTS idx_wfo_workspace ON workspace_feature_overrides(workspace_id);

-- ============================================================================
-- USER ENTITLEMENTS (per-user overrides within a workspace)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_entitlements (
  id           VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id      TEXT NOT NULL,
  workspace_id VARCHAR(100) REFERENCES workspaces(id) ON DELETE CASCADE,
  feature_key  VARCHAR(100) NOT NULL,
  enabled      BOOLEAN,
  limit_value  INTEGER,
  details      JSONB DEFAULT '{}',
  set_by       TEXT,
  set_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, workspace_id, feature_key)
);
CREATE INDEX IF NOT EXISTS idx_ue_user      ON user_entitlements(user_id);
CREATE INDEX IF NOT EXISTS idx_ue_workspace ON user_entitlements(workspace_id);

-- ============================================================================
-- USAGE EVENTS (fine-grained credit + action tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS usage_events (
  id           VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id VARCHAR(100) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL,
  action_type  VARCHAR(100) NOT NULL,
  credits      INTEGER NOT NULL DEFAULT 0,
  units        REAL NOT NULL DEFAULT 1,
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_uev_workspace_ts ON usage_events(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_uev_action       ON usage_events(action_type);
CREATE INDEX IF NOT EXISTS idx_uev_created      ON usage_events(created_at DESC);

-- ============================================================================
-- DAILY USAGE ROLLUPS
-- ============================================================================
CREATE TABLE IF NOT EXISTS usage_rollups_daily (
  id             VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id   VARCHAR(100) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  rollup_date    DATE NOT NULL,
  action_type    VARCHAR(100) NOT NULL,
  total_credits  INTEGER NOT NULL DEFAULT 0,
  total_units    REAL NOT NULL DEFAULT 0,
  event_count    INTEGER NOT NULL DEFAULT 0,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(workspace_id, rollup_date, action_type)
);
CREATE INDEX IF NOT EXISTS idx_rollup_date      ON usage_rollups_daily(rollup_date DESC);
CREATE INDEX IF NOT EXISTS idx_rollup_workspace ON usage_rollups_daily(workspace_id);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================
CREATE OR REPLACE FUNCTION is_platform_admin(p_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = p_user_id
      AND u.platform_role IN ('super_admin','support_admin')
  );
$$;

CREATE OR REPLACE FUNCTION effective_feature(
  p_workspace_id TEXT,
  p_user_id TEXT,
  p_feature_key TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_global   BOOLEAN;
  v_ws       BOOLEAN;
  v_user     BOOLEAN;
BEGIN
  -- 1) global default
  SELECT enabled INTO v_global FROM feature_flags WHERE key = p_feature_key;
  -- 2) workspace override
  SELECT enabled INTO v_ws FROM workspace_feature_overrides
  WHERE workspace_id = p_workspace_id AND feature_key = p_feature_key;
  -- 3) user override
  SELECT enabled INTO v_user FROM user_entitlements
  WHERE user_id = p_user_id AND workspace_id = p_workspace_id AND feature_key = p_feature_key
    AND enabled IS NOT NULL;
  -- Precedence: user > workspace > global
  RETURN COALESCE(v_user, v_ws, v_global, false);
END;
$$;
