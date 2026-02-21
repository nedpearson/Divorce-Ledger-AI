-- ============================================================================
-- SUPABASE PRODUCTION SCHEMA
-- Divorce Ledger AI - Document Management System
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- USERS TABLE
-- Profile data linked to auth.users
-- ============================================================================
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  subscription_tier TEXT NOT NULL DEFAULT 'free' CHECK (subscription_tier IN ('free', 'basic', 'premium', 'enterprise')),
  subscription_status TEXT NOT NULL DEFAULT 'active' CHECK (subscription_status IN ('active', 'cancelled', 'suspended', 'trial')),
  trial_ends_at TIMESTAMPTZ,
  subscription_ends_at TIMESTAMPTZ,
  storage_quota_bytes BIGINT NOT NULL DEFAULT 1073741824, -- 1GB default
  storage_used_bytes BIGINT NOT NULL DEFAULT 0,
  api_quota_daily INT NOT NULL DEFAULT 100,
  api_usage_today INT NOT NULL DEFAULT 0,
  api_usage_reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON public.users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_subscription ON public.users(subscription_tier, subscription_status) WHERE deleted_at IS NULL;

-- ============================================================================
-- DOCUMENTS TABLE
-- Primary document records
-- ============================================================================
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  document_type TEXT NOT NULL CHECK (document_type IN ('court_filing', 'financial', 'custody', 'property', 'communication', 'evidence', 'legal_brief', 'other')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'classified', 'failed', 'archived')),
  file_size_bytes BIGINT,
  mime_type TEXT,
  storage_path TEXT,
  thumbnail_path TEXT,
  original_filename TEXT,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_documents_user_id ON public.documents(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_status ON public.documents(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_type ON public.documents(document_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_created_at ON public.documents(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_tags ON public.documents USING GIN(tags) WHERE deleted_at IS NULL;

-- ============================================================================
-- DOCUMENT_VERSIONS TABLE
-- Version history for documents
-- ============================================================================
CREATE TABLE public.document_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  checksum TEXT NOT NULL,
  changes_description TEXT,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(document_id, version_number)
);

CREATE INDEX idx_document_versions_document_id ON public.document_versions(document_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_document_versions_created_at ON public.document_versions(created_at DESC) WHERE deleted_at IS NULL;

-- ============================================================================
-- CLASSIFICATIONS TABLE
-- AI classification results
-- ============================================================================
CREATE TABLE public.classifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  classification_type TEXT NOT NULL,
  confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  primary_category TEXT,
  secondary_categories TEXT[] DEFAULT '{}',
  extracted_entities JSONB DEFAULT '{}',
  sentiment_analysis JSONB DEFAULT '{}',
  key_dates JSONB DEFAULT '[]',
  parties_involved JSONB DEFAULT '[]',
  financial_data JSONB DEFAULT '{}',
  legal_citations JSONB DEFAULT '[]',
  summary TEXT,
  model_used TEXT NOT NULL,
  model_version TEXT,
  processing_time_ms INT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_classifications_document_id ON public.classifications(document_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_classifications_type ON public.classifications(classification_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_classifications_category ON public.classifications(primary_category) WHERE deleted_at IS NULL;

-- ============================================================================
-- JOBS TABLE
-- Background job tracking
-- ============================================================================
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('upload', 'classification', 'thumbnail', 'export', 'integration_sync', 'bulk_operation')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  priority INT NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  progress_percent INT DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  input_data JSONB DEFAULT '{}',
  output_data JSONB DEFAULT '{}',
  error_message TEXT,
  error_stack TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_jobs_user_id ON public.jobs(user_id);
CREATE INDEX idx_jobs_document_id ON public.jobs(document_id);
CREATE INDEX idx_jobs_status ON public.jobs(status);
CREATE INDEX idx_jobs_type_status ON public.jobs(job_type, status);
CREATE INDEX idx_jobs_created_at ON public.jobs(created_at DESC);

-- ============================================================================
-- AUDIT_LOGS TABLE
-- Comprehensive audit trail
-- ============================================================================
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  ip_address INET,
  user_agent TEXT,
  request_id TEXT,
  session_id TEXT,
  changes JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON public.audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_severity ON public.audit_logs(severity);

-- ============================================================================
-- SETTINGS TABLE
-- User-specific settings and preferences
-- ============================================================================
CREATE TABLE public.settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  encrypted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, category, key)
);

CREATE INDEX idx_settings_user_id ON public.settings(user_id);
CREATE INDEX idx_settings_category ON public.settings(category);

-- ============================================================================
-- INTEGRATIONS TABLE
-- External service integrations
-- ============================================================================
CREATE TABLE public.integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  integration_type TEXT NOT NULL CHECK (integration_type IN ('google_drive', 'dropbox', 'onedrive', 'court_system', 'financial_institution', 'legal_service', 'calendar', 'email')),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error', 'expired')),
  credentials JSONB DEFAULT '{}', -- Encrypted credentials
  config JSONB DEFAULT '{}',
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_error TEXT,
  sync_frequency_minutes INT DEFAULT 60,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_integrations_user_id ON public.integrations(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_integrations_type ON public.integrations(integration_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_integrations_status ON public.integrations(status) WHERE deleted_at IS NULL;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View: Documents with latest version information
CREATE OR REPLACE VIEW v_documents_with_latest_version AS
SELECT 
  d.*,
  dv.version_number as latest_version,
  dv.storage_path as latest_version_path,
  dv.file_size_bytes as latest_version_size,
  dv.created_at as latest_version_created_at
FROM public.documents d
LEFT JOIN LATERAL (
  SELECT *
  FROM public.document_versions
  WHERE document_id = d.id
    AND deleted_at IS NULL
  ORDER BY version_number DESC
  LIMIT 1
) dv ON true
WHERE d.deleted_at IS NULL;

-- View: Classification summary by document
CREATE OR REPLACE VIEW v_classification_summary AS
SELECT 
  d.id as document_id,
  d.title,
  d.document_type,
  d.user_id,
  COUNT(c.id) as classification_count,
  MAX(c.created_at) as last_classified_at,
  ARRAY_AGG(DISTINCT c.primary_category) FILTER (WHERE c.primary_category IS NOT NULL) as categories,
  AVG(c.confidence_score) as avg_confidence,
  MAX(c.confidence_score) as max_confidence
FROM public.documents d
LEFT JOIN public.classifications c ON d.id = c.document_id AND c.deleted_at IS NULL
WHERE d.deleted_at IS NULL
GROUP BY d.id, d.title, d.document_type, d.user_id;

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_classifications_updated_at BEFORE UPDATE ON public.classifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_integrations_updated_at BEFORE UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function: Update storage usage
CREATE OR REPLACE FUNCTION update_user_storage_usage()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.users
    SET storage_used_bytes = storage_used_bytes + COALESCE(NEW.file_size_bytes, 0)
    WHERE id = NEW.user_id;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.users
    SET storage_used_bytes = storage_used_bytes - COALESCE(OLD.file_size_bytes, 0) + COALESCE(NEW.file_size_bytes, 0)
    WHERE id = NEW.user_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.users
    SET storage_used_bytes = storage_used_bytes - COALESCE(OLD.file_size_bytes, 0)
    WHERE id = OLD.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for storage usage tracking
CREATE TRIGGER track_document_storage AFTER INSERT OR UPDATE OR DELETE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION update_user_storage_usage();

-- Function: Reset API usage daily
CREATE OR REPLACE FUNCTION reset_api_usage()
RETURNS void AS $$
BEGIN
  UPDATE public.users
  SET 
    api_usage_today = 0,
    api_usage_reset_at = NOW() + INTERVAL '1 day'
  WHERE api_usage_reset_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE public.users IS 'User profiles linked to auth.users with subscription and quota information';
COMMENT ON TABLE public.documents IS 'Primary document storage with metadata and status tracking';
COMMENT ON TABLE public.document_versions IS 'Version history for documents with complete audit trail';
COMMENT ON TABLE public.classifications IS 'AI-powered document classification results and extracted data';
COMMENT ON TABLE public.jobs IS 'Background job queue for async operations';
COMMENT ON TABLE public.audit_logs IS 'Comprehensive audit trail for all user actions';
COMMENT ON TABLE public.settings IS 'User-specific settings and preferences';
COMMENT ON TABLE public.integrations IS 'External service integrations configuration';
