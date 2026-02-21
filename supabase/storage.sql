-- ============================================================================
-- SUPABASE STORAGE BUCKETS & POLICIES
-- Divorce Ledger AI - Production Storage Configuration
-- ============================================================================

-- ============================================================================
-- CREATE STORAGE BUCKETS
-- Execute these via Supabase Dashboard or supabase CLI
-- ============================================================================

-- Bucket: documents_raw
-- For original uploaded documents before processing
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents_raw',
  'documents_raw',
  false,
  52428800, -- 50MB limit
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/tiff',
    'text/plain'
  ]
);

-- Bucket: documents_processed
-- For processed/converted documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents_processed',
  'documents_processed',
  false,
  104857600, -- 100MB limit
  ARRAY[
    'application/pdf',
    'application/json',
    'text/plain'
  ]
);

-- Bucket: thumbnails
-- For document preview thumbnails
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'thumbnails',
  'thumbnails',
  false,
  5242880, -- 5MB limit
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
);

-- Bucket: voice_notes
-- For audio recordings and voice notes
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'voice_notes',
  'voice_notes',
  false,
  20971520, -- 20MB limit
  ARRAY[
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/webm'
  ]
);

-- Bucket: exports
-- For generated exports (CSV, PDF reports, etc.)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'exports',
  'exports',
  false,
  104857600, -- 100MB limit
  ARRAY[
    'application/pdf',
    'application/zip',
    'text/csv',
    'application/json'
  ]
);

-- ============================================================================
-- STORAGE POLICIES: documents_raw
-- ============================================================================

-- Users can upload to their own folder
CREATE POLICY "Users can upload own documents_raw"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documents_raw'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can read their own documents
CREATE POLICY "Users can read own documents_raw"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents_raw'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can update their own documents
CREATE POLICY "Users can update own documents_raw"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'documents_raw'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'documents_raw'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete their own documents
CREATE POLICY "Users can delete own documents_raw"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'documents_raw'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Service role has full access
CREATE POLICY "Service role full access documents_raw"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'documents_raw')
  WITH CHECK (bucket_id = 'documents_raw');

-- ============================================================================
-- STORAGE POLICIES: documents_processed
-- ============================================================================

-- Users can read their own processed documents
CREATE POLICY "Users can read own documents_processed"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents_processed'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Service role can insert processed documents
CREATE POLICY "Service role can insert documents_processed"
  ON storage.objects
  FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'documents_processed');

-- Service role has full access
CREATE POLICY "Service role full access documents_processed"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'documents_processed')
  WITH CHECK (bucket_id = 'documents_processed');

-- ============================================================================
-- STORAGE POLICIES: thumbnails
-- ============================================================================

-- Users can read their own thumbnails (public for faster loading)
CREATE POLICY "Users can read own thumbnails"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'thumbnails'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Service role can insert thumbnails
CREATE POLICY "Service role can insert thumbnails"
  ON storage.objects
  FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'thumbnails');

-- Service role has full access
CREATE POLICY "Service role full access thumbnails"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'thumbnails')
  WITH CHECK (bucket_id = 'thumbnails');

-- ============================================================================
-- STORAGE POLICIES: voice_notes
-- ============================================================================

-- Users can upload their own voice notes
CREATE POLICY "Users can upload own voice_notes"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'voice_notes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can read their own voice notes
CREATE POLICY "Users can read own voice_notes"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'voice_notes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete their own voice notes
CREATE POLICY "Users can delete own voice_notes"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'voice_notes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Service role has full access
CREATE POLICY "Service role full access voice_notes"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'voice_notes')
  WITH CHECK (bucket_id = 'voice_notes');

-- ============================================================================
-- STORAGE POLICIES: exports
-- ============================================================================

-- Users can read their own exports
CREATE POLICY "Users can read own exports"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'exports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete their own exports
CREATE POLICY "Users can delete own exports"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'exports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Service role can insert exports
CREATE POLICY "Service role can insert exports"
  ON storage.objects
  FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'exports');

-- Service role has full access
CREATE POLICY "Service role full access exports"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'exports')
  WITH CHECK (bucket_id = 'exports');

-- ============================================================================
-- HELPER FUNCTIONS FOR STORAGE MANAGEMENT
-- ============================================================================

-- Function to get user's storage usage by bucket
CREATE OR REPLACE FUNCTION public.get_user_storage_usage(target_user_id UUID)
RETURNS TABLE(bucket_name TEXT, file_count BIGINT, total_bytes BIGINT)
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.bucket_id as bucket_name,
    COUNT(*)::BIGINT as file_count,
    SUM(o.metadata->>'size')::BIGINT as total_bytes
  FROM storage.objects o
  WHERE (storage.foldername(o.name))[1] = target_user_id::text
  GROUP BY o.bucket_id;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old exports (older than 30 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_exports()
RETURNS INTEGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM storage.objects
    WHERE bucket_id = 'exports'
      AND created_at < NOW() - INTERVAL '30 days'
    RETURNING *
  )
  SELECT COUNT(*)::INTEGER INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- NOTES ON STORAGE STRUCTURE
-- ============================================================================
-- 
-- All files MUST follow this folder structure:
-- {bucket_id}/{user_id}/{document_id}/{filename}
--
-- Example:
-- documents_raw/550e8400-e29b-41d4-a716-446655440000/abc123-def456/contract.pdf
--
-- This structure ensures:
-- 1. Clear ownership (user_id in path)
-- 2. Document grouping (document_id folder)
-- 3. RLS policy enforcement
-- 4. Easy cleanup and migration
--
-- File naming convention:
-- - Use UUIDs for document_ids
-- - Preserve original filename for user experience
-- - Add timestamp suffix if needed: contract_20260220-143052.pdf
--
-- ============================================================================
