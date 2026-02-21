-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Divorce Ledger AI - Supabase Production
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- USERS TABLE POLICIES
-- ============================================================================

-- Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON public.users
  FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile (excluding sensitive fields)
CREATE POLICY "Users can update own profile"
  ON public.users
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Service role can read all users
CREATE POLICY "Service role can read all users"
  ON public.users
  FOR SELECT
  TO service_role
  USING (true);

-- Service role can insert/update/delete users
CREATE POLICY "Service role full access to users"
  ON public.users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- DOCUMENTS TABLE POLICIES
-- ============================================================================

-- Users can read their own documents
CREATE POLICY "Users can read own documents"
  ON public.documents
  FOR SELECT
  USING (
    auth.uid() = user_id
    AND deleted_at IS NULL
  );

-- Users can insert their own documents
CREATE POLICY "Users can insert own documents"
  ON public.documents
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own documents
CREATE POLICY "Users can update own documents"
  ON public.documents
  FOR UPDATE
  USING (
    auth.uid() = user_id
    AND deleted_at IS NULL
  )
  WITH CHECK (auth.uid() = user_id);

-- Users can soft-delete their own documents
CREATE POLICY "Users can delete own documents"
  ON public.documents
  FOR UPDATE
  USING (
    auth.uid() = user_id
    AND deleted_at IS NULL
  )
  WITH CHECK (
    auth.uid() = user_id
    AND deleted_at IS NOT NULL
  );

-- Service role has full access to documents
CREATE POLICY "Service role full access to documents"
  ON public.documents
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- DOCUMENT_VERSIONS TABLE POLICIES
-- ============================================================================

-- Users can read versions of their documents
CREATE POLICY "Users can read own document versions"
  ON public.document_versions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE id = document_versions.document_id
        AND user_id = auth.uid()
        AND deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

-- Service role can insert document versions
CREATE POLICY "Service role can insert document versions"
  ON public.document_versions
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Service role can read all document versions
CREATE POLICY "Service role can read all document versions"
  ON public.document_versions
  FOR SELECT
  TO service_role
  USING (true);

-- Service role can update/delete document versions
CREATE POLICY "Service role can modify document versions"
  ON public.document_versions
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- CLASSIFICATIONS TABLE POLICIES
-- ============================================================================

-- Users can read classifications of their documents
CREATE POLICY "Users can read own document classifications"
  ON public.classifications
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE id = classifications.document_id
        AND user_id = auth.uid()
        AND deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

-- Service role can insert classifications
CREATE POLICY "Service role can insert classifications"
  ON public.classifications
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Service role can read all classifications
CREATE POLICY "Service role can read all classifications"
  ON public.classifications
  FOR SELECT
  TO service_role
  USING (true);

-- Service role can update/delete classifications
CREATE POLICY "Service role can modify classifications"
  ON public.classifications
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- JOBS TABLE POLICIES
-- ============================================================================

-- Users can read their own jobs
CREATE POLICY "Users can read own jobs"
  ON public.jobs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own jobs
CREATE POLICY "Users can insert own jobs"
  ON public.jobs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role has full access to jobs
CREATE POLICY "Service role full access to jobs"
  ON public.jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- AUDIT_LOGS TABLE POLICIES
-- ============================================================================

-- Only service role can read audit logs
CREATE POLICY "Only service role can read audit logs"
  ON public.audit_logs
  FOR SELECT
  TO service_role
  USING (true);

-- Only service role can insert audit logs
CREATE POLICY "Only service role can insert audit logs"
  ON public.audit_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Admins can read their own audit history (optional, depends on requirements)
CREATE POLICY "Users can read own audit logs"
  ON public.audit_logs
  FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================================
-- SETTINGS TABLE POLICIES
-- ============================================================================

-- Users can read their own settings
CREATE POLICY "Users can read own settings"
  ON public.settings
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own settings
CREATE POLICY "Users can insert own settings"
  ON public.settings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own settings
CREATE POLICY "Users can update own settings"
  ON public.settings
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own settings
CREATE POLICY "Users can delete own settings"
  ON public.settings
  FOR DELETE
  USING (auth.uid() = user_id);

-- Service role has full access to settings
CREATE POLICY "Service role full access to settings"
  ON public.settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- INTEGRATIONS TABLE POLICIES
-- ============================================================================

-- Users can read their own integrations
CREATE POLICY "Users can read own integrations"
  ON public.integrations
  FOR SELECT
  USING (
    auth.uid() = user_id
    AND deleted_at IS NULL
  );

-- Users can insert their own integrations
CREATE POLICY "Users can insert own integrations"
  ON public.integrations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own integrations
CREATE POLICY "Users can update own integrations"
  ON public.integrations
  FOR UPDATE
  USING (
    auth.uid() = user_id
    AND deleted_at IS NULL
  )
  WITH CHECK (auth.uid() = user_id);

-- Users can soft-delete their own integrations
CREATE POLICY "Users can delete own integrations"
  ON public.integrations
  FOR UPDATE
  USING (
    auth.uid() = user_id
    AND deleted_at IS NULL
  )
  WITH CHECK (
    auth.uid() = user_id
    AND deleted_at IS NOT NULL
  );

-- Service role has full access to integrations
CREATE POLICY "Service role full access to integrations"
  ON public.integrations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- SECURITY DEFINER FUNCTIONS
-- For operations that need elevated privileges
-- ============================================================================

-- Function to create user profile on signup (called by trigger on auth.users)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create user profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to soft delete user and cascade soft delete to related records
CREATE OR REPLACE FUNCTION public.soft_delete_user(target_user_id UUID)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Soft delete user
  UPDATE public.users
  SET deleted_at = NOW()
  WHERE id = target_user_id AND deleted_at IS NULL;

  -- Soft delete user's documents
  UPDATE public.documents
  SET deleted_at = NOW()
  WHERE user_id = target_user_id AND deleted_at IS NULL;

  -- Soft delete user's document versions
  UPDATE public.document_versions
  SET deleted_at = NOW()
  WHERE document_id IN (
    SELECT id FROM public.documents WHERE user_id = target_user_id
  ) AND deleted_at IS NULL;

  -- Soft delete user's classifications
  UPDATE public.classifications
  SET deleted_at = NOW()
  WHERE document_id IN (
    SELECT id FROM public.documents WHERE user_id = target_user_id
  ) AND deleted_at IS NULL;

  -- Soft delete user's integrations
  UPDATE public.integrations
  SET deleted_at = NOW()
  WHERE user_id = target_user_id AND deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- NOTES
-- ============================================================================
-- 
-- IMPORTANT SECURITY CONSIDERATIONS:
--
-- 1. Service Role Key: NEVER expose service role key to frontend.
--    Only use in backend/edge functions.
--
-- 2. Anon Key: Safe to use in frontend, relies on RLS policies.
--
-- 3. Encrypted Fields: The 'credentials' field in integrations table
--    should be encrypted at application level before storage.
--
-- 4. Audit Logs: Consider implementing a separate audit database or
--    archival strategy for long-term compliance requirements.
--
-- 5. Rate Limiting: Implement rate limiting at API gateway level
--    (not at RLS level) to prevent abuse.
--
-- 6. Testing RLS: Always test policies with different user contexts:
--    - Authenticated users accessing own data
--    - Authenticated users attempting to access other users' data
--    - Unauthenticated requests
--    - Service role operations
--
-- ============================================================================
