-- 012-settlement-portal.sql
-- Settlement Portal: roles (owner / disputer / observer), per-line disputes with
-- owner approval, and an append-only audit trail.
-- Additive and idempotent: safe to re-run, touches no existing table.

CREATE TABLE IF NOT EXISTS portal_members (
  id                  VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id       VARCHAR NOT NULL,
  member_user_id      VARCHAR,
  email               TEXT NOT NULL,
  display_name        TEXT,
  role                TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'invited',
  invite_token        TEXT,
  invite_expires_at   TIMESTAMP,
  invited_by_user_id  VARCHAR,
  accepted_at         TIMESTAMP,
  environment         TEXT NOT NULL DEFAULT 'demo',
  created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS portal_members_owner_email_uq
  ON portal_members (owner_user_id, email);
CREATE INDEX IF NOT EXISTS portal_members_member_idx
  ON portal_members (member_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS portal_members_invite_token_uq
  ON portal_members (invite_token) WHERE invite_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS portal_disputes (
  id                  VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id       VARCHAR NOT NULL,
  raised_by_user_id   VARCHAR NOT NULL,
  raised_by_role      TEXT NOT NULL,
  target_type         TEXT NOT NULL DEFAULT 'reimbursement',
  target_id           VARCHAR NOT NULL,
  kind                TEXT NOT NULL DEFAULT 'dispute',
  contested_amount    INTEGER NOT NULL DEFAULT 0,
  reason              TEXT,
  evidence_url        TEXT,
  status              TEXT NOT NULL DEFAULT 'open',
  resolved_by_user_id VARCHAR,
  resolution_note     TEXT,
  resolved_at         TIMESTAMP,
  environment         TEXT NOT NULL DEFAULT 'demo',
  created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS portal_disputes_owner_status_idx
  ON portal_disputes (owner_user_id, status);
CREATE INDEX IF NOT EXISTS portal_disputes_target_idx
  ON portal_disputes (target_type, target_id);

CREATE TABLE IF NOT EXISTS portal_audit_log (
  id             VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id  VARCHAR NOT NULL,
  actor_user_id  VARCHAR,
  actor_role     TEXT,
  action         TEXT NOT NULL,
  target_type    TEXT,
  target_id      VARCHAR,
  summary        TEXT,
  metadata       JSONB,
  ip_address     TEXT,
  environment    TEXT NOT NULL DEFAULT 'demo',
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS portal_audit_log_owner_created_idx
  ON portal_audit_log (owner_user_id, created_at DESC);
