-- ============================================================
-- Migration 011: Multi-Document Batch Ingestion System
-- Date: 2026-04-10
-- Backward-compatible: all new columns are nullable or have defaults
-- ============================================================

-- ── 1. upload_batches ──────────────────────────────────────────────────────────
-- Groups documents uploaded together in a single session
CREATE TABLE IF NOT EXISTS upload_batches (
  id              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         VARCHAR NOT NULL,
  case_id         VARCHAR,                              -- optional case pre-assignment
  batch_name      TEXT,
  source_type     TEXT NOT NULL DEFAULT 'web_upload',  -- web_upload | mobile | api
  environment     TEXT NOT NULL DEFAULT 'live',
  total_files     INTEGER NOT NULL DEFAULT 0,
  total_completed INTEGER NOT NULL DEFAULT 0,
  total_failed    INTEGER NOT NULL DEFAULT 0,
  total_processing INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'created',     -- created | uploading | processing | completed | partial_failure | failed
  started_at      TIMESTAMP,
  completed_at    TIMESTAMP,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_upload_batches_user_id ON upload_batches(user_id);
CREATE INDEX IF NOT EXISTS idx_upload_batches_status ON upload_batches(status);
CREATE INDEX IF NOT EXISTS idx_upload_batches_created_at ON upload_batches(created_at);

-- ── 2. Extend existing documents table ────────────────────────────────────────
-- All new columns are nullable or have safe defaults — fully backward-compatible
ALTER TABLE documents ADD COLUMN IF NOT EXISTS batch_id             VARCHAR REFERENCES upload_batches(id) ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS original_filename    TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS sanitized_filename   TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_hash            TEXT;             -- SHA-256 hex
ALTER TABLE documents ADD COLUMN IF NOT EXISTS processing_status    TEXT DEFAULT 'queued';  -- queued | uploading | uploaded | processing | ocr_in_progress | extracting | classifying | completed | failed | needs_review | duplicate_skipped
ALTER TABLE documents ADD COLUMN IF NOT EXISTS review_status        TEXT DEFAULT 'unreviewed'; -- unreviewed | ai_processed | needs_review | user_corrected | approved | rejected
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_duplicate         BOOLEAN DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS duplicate_of_document_id VARCHAR;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS case_id              VARCHAR;          -- case this document is linked to
ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_key          TEXT;             -- local filesystem path / cloud key
ALTER TABLE documents ADD COLUMN IF NOT EXISTS page_count           INTEGER;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS mime_type            TEXT;             -- normalized from fileType
ALTER TABLE documents ADD COLUMN IF NOT EXISTS processed_at         TIMESTAMP;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS error_code           TEXT;

-- New indexes for batch queries
CREATE INDEX IF NOT EXISTS idx_documents_batch_id ON documents(batch_id);
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_processing_status ON documents(processing_status);
CREATE INDEX IF NOT EXISTS idx_documents_review_status ON documents(review_status);
CREATE INDEX IF NOT EXISTS idx_documents_is_duplicate ON documents(is_duplicate);
CREATE INDEX IF NOT EXISTS idx_documents_file_hash ON documents(file_hash);

-- ── 3. document_processing_jobs ────────────────────────────────────────────────
-- One row per processing attempt per document. Enables retry, concurrency, and audit.
CREATE TABLE IF NOT EXISTS document_processing_jobs (
  id              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     VARCHAR NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  batch_id        VARCHAR REFERENCES upload_batches(id) ON DELETE SET NULL,
  job_type        TEXT NOT NULL DEFAULT 'full_pipeline', -- full_pipeline | ocr_only | classify_only | extract_only | retry
  status          TEXT NOT NULL DEFAULT 'queued',        -- queued | running | completed | failed | skipped
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 3,
  worker_id       TEXT,
  started_at      TIMESTAMP,
  completed_at    TIMESTAMP,
  error_code      TEXT,
  error_message   TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_processing_jobs_document_id ON document_processing_jobs(document_id);
CREATE INDEX IF NOT EXISTS idx_document_processing_jobs_status ON document_processing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_document_processing_jobs_batch_id ON document_processing_jobs(batch_id);

-- ── 4. document_audit_log ─────────────────────────────────────────────────────
-- Immutable, append-only. Tracks every meaningful state transition or user action.
CREATE TABLE IF NOT EXISTS document_audit_log (
  id              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     VARCHAR NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  batch_id        VARCHAR REFERENCES upload_batches(id) ON DELETE SET NULL,
  actor_type      TEXT NOT NULL DEFAULT 'system',   -- system | user | ai
  actor_id        TEXT,                             -- user_id when actor_type = user
  event_type      TEXT NOT NULL,                    -- uploaded | processing_started | processing_completed | processing_failed | review_submitted | approved | rejected | retry_queued | duplicate_flagged | case_assigned | deleted | reclassified
  old_value       JSONB,
  new_value       JSONB,
  notes           TEXT,
  ip_address      TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_audit_log_document_id ON document_audit_log(document_id);
CREATE INDEX IF NOT EXISTS idx_document_audit_log_batch_id ON document_audit_log(batch_id);
CREATE INDEX IF NOT EXISTS idx_document_audit_log_event_type ON document_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_document_audit_log_created_at ON document_audit_log(created_at);

-- ── 5. Backfill existing documents with safe defaults ─────────────────────────
UPDATE documents 
SET 
  processing_status = CASE 
    WHEN ai_analysis_status = 'finalized' THEN 'completed'
    WHEN ai_analysis_status = 'error'     THEN 'failed'
    WHEN ai_analysis_status = 'analyzing' THEN 'processing'
    ELSE 'completed'
  END,
  review_status = CASE
    WHEN ai_analysis_status = 'finalized' THEN 'approved'
    WHEN ai_analysis_status IN ('suggested', 'awaiting_user') THEN 'ai_processed'
    ELSE 'unreviewed'
  END,
  original_filename = COALESCE(file_name, title, 'unknown'),
  sanitized_filename = COALESCE(file_name, title, 'unknown'),
  mime_type = COALESCE(file_type, 'application/octet-stream'),
  is_duplicate = FALSE
WHERE processing_status IS NULL;
