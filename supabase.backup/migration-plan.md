# Migration Plan: Local PostgreSQL → Supabase Production

## Overview

This document outlines the complete migration strategy from the current local PostgreSQL database to Supabase production. The migration includes schema transfer, data migration, RLS implementation, and production cutover.

## Prerequisites

- [ ] Supabase project created (production)
- [ ] Supabase CLI installed (`npm install -g supabase`)
- [ ] Railway account configured
- [ ] Backup of current local database
- [ ] Access to production environment variables

## Phase 1: Schema Migration (Day 1)

### Step 1: Export Current Schema

```bash
# Export local PostgreSQL schema
pg_dump -h localhost -U postgres -d divorce_ledger \
  --schema-only \
  --no-owner \
  --no-privileges \
  > local_schema_backup.sql
```

### Step 2: Analyze Schema Differences

Create mapping document comparing local schema to new Supabase schema:

| Local Table       | Supabase Table    | Changes Needed           | Migration Notes      |
| ----------------- | ----------------- | ------------------------ | -------------------- |
| `users`           | `users`           | Add subscription fields  | Link to auth.users   |
| `documents`       | `documents`       | Add storage_path         | Update file handling |
| `classifications` | `classifications` | Restructure JSONB fields | Migrate nested data  |

### Step 3: Apply Supabase Schema

```bash
# Link to Supabase project
supabase link --project-ref your-project-ref

# Apply schema to Supabase
psql -h db.your-project-ref.supabase.co \
  -U postgres \
  -d postgres \
  -f supabase/schema.sql

# Apply RLS policies
psql -h db.your-project-ref.supabase.co \
  -U postgres \
  -d postgres \
  -f supabase/rls.sql

# Apply storage configuration
psql -h db.your-project-ref.supabase.co \
  -U postgres \
  -d postgres \
  -f supabase/storage.sql
```

### Step 4: Verify Schema

```bash
# Connect to Supabase database
psql -h db.your-project-ref.supabase.co -U postgres -d postgres

# List all tables
\dt public.*

# Verify RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';

# Check constraints and indexes
\d+ public.documents
```

## Phase 2: Storage Migration (Days 2-3)

### Step 1: Create Storage Buckets

Execute via Supabase Dashboard or CLI:

```bash
# Create all buckets (already defined in storage.sql)
# Verify in Dashboard → Storage
```

### Step 2: Migrate Files to Supabase Storage

```typescript
// Migration script: migrate-files-to-supabase.ts
import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function migrateFiles() {
  // 1. Get all documents from local DB
  const documents = await getLocalDocuments();

  for (const doc of documents) {
    try {
      // 2. Read file from local storage
      const localPath = path.join('/local/storage', doc.file_path);
      const fileBuffer = await fs.readFile(localPath);

      // 3. Upload to Supabase Storage
      const storagePath = `${doc.user_id}/${doc.id}/${doc.filename}`;

      const { data, error } = await supabase.storage
        .from('documents_raw')
        .upload(storagePath, fileBuffer, {
          contentType: doc.mime_type,
          upsert: false,
        });

      if (error) throw error;

      // 4. Update document record with new storage path
      doc.storage_path = storagePath;

      console.log(`✅ Migrated: ${doc.filename}`);
    } catch (error) {
      console.error(`❌ Failed to migrate ${doc.filename}:`, error);
      // Log to migration_errors table
    }
  }
}
```

Run migration:

```bash
ts-node scripts/migrate-files-to-supabase.ts
```

## Phase 3: Data Migration (Days 3-5)

### Step 1: Export Local Data

```bash
# Export each table separately for better control
pg_dump -h localhost -U postgres -d divorce_ledger \
  --table=users \
  --data-only \
  --column-inserts \
  > exports/users_data.sql

pg_dump -h localhost -U postgres -d divorce_ledger \
  --table=documents \
  --data-only \
  --column-inserts \
  > exports/documents_data.sql

# Repeat for all tables
```

### Step 2: Transform Data for Supabase

Create transformation scripts for each table:

```typescript
// transform-users.ts
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

async function transformUsers() {
  const localUsers = parse(await fs.readFile('exports/users.csv'));

  const transformedUsers = localUsers.map((user) => ({
    id: user.id,
    email: user.email,
    full_name: user.name,
    subscription_tier: user.plan || 'free',
    subscription_status: 'active',
    storage_quota_bytes: getQuotaForTier(user.plan),
    storage_used_bytes: 0, // Will be calculated
    created_at: user.created_at,
    updated_at: user.updated_at,
  }));

  await fs.writeFile('transformed/users.csv', stringify(transformedUsers, { header: true }));
}
```

### Step 3: Import to Supabase

```bash
# Create staging schema for validation
psql -h db.your-project-ref.supabase.co -U postgres -d postgres \
  -c "CREATE SCHEMA IF NOT EXISTS staging;"

# Import to staging first
psql -h db.your-project-ref.supabase.co -U postgres -d postgres \
  -c "\\COPY staging.users FROM 'transformed/users.csv' WITH CSV HEADER"

# Validate data in staging
psql -h db.your-project-ref.supabase.co -U postgres -d postgres \
  -c "SELECT COUNT(*), MIN(created_at), MAX(created_at) FROM staging.users;"

# Move to production tables
psql -h db.your-project-ref.supabase.co -U postgres -d postgres <<EOF
BEGIN;

-- Disable RLS temporarily for data import
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- Insert from staging
INSERT INTO public.users
SELECT * FROM staging.users
ON CONFLICT (id) DO NOTHING;

-- Re-enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

COMMIT;
EOF
```

### Step 4: Validate Data Integrity

```sql
-- Check row counts match
SELECT
  'users' as table_name,
  COUNT(*) as row_count
FROM public.users
UNION ALL
SELECT
  'documents',
  COUNT(*)
FROM public.documents
UNION ALL
SELECT
  'document_versions',
  COUNT(*)
FROM public.document_versions;

-- Verify foreign key relationships
SELECT
  d.id,
  d.user_id,
  u.email
FROM public.documents d
LEFT JOIN public.users u ON d.user_id = u.id
WHERE u.id IS NULL;
-- Should return 0 rows

-- Check storage calculations
SELECT
  u.id,
  u.storage_used_bytes as calculated,
  SUM(d.file_size_bytes) as actual
FROM public.users u
LEFT JOIN public.documents d ON u.id = d.user_id
GROUP BY u.id, u.storage_used_bytes
HAVING u.storage_used_bytes != COALESCE(SUM(d.file_size_bytes), 0);
-- Should return 0 rows
```

## Phase 4: Edge Functions Deployment (Day 5)

### Step 1: Deploy All Edge Functions

```bash
# Deploy process-upload function
supabase functions deploy process-upload \
  --project-ref your-project-ref \
  --no-verify-jwt

# Deploy classify-document function
supabase functions deploy classify-document \
  --project-ref your-project-ref

# Deploy generate-thumbnail function
supabase functions deploy generate-thumbnail \
  --project-ref your-project-ref

# Repeat for all functions
```

### Step 2: Test Edge Functions

```bash
# Test process-upload
curl -X POST \
  https://your-project-ref.supabase.co/functions/v1/process-upload \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"document_id": "test-123", "user_id": "user-456"}'
```

## Phase 5: Backend Cutover (Days 6-7)

### Step 1: Update Backend Environment Variables

In Railway dashboard, update backend service variables:

```bash
# Remove old DATABASE_URL
railway variables --unset DATABASE_URL

# Add Supabase variables
railway variables --set SUPABASE_URL=https://your-project-ref.supabase.co
railway variables --set SUPABASE_ANON_KEY=your-anon-key
railway variables --set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
railway variables --set SUPABASE_JWT_SECRET=your-jwt-secret
```

### Step 2: Deploy Updated Backend

```bash
# Push updated backend code
git add backend/
git commit -m "chore: migrate to Supabase"
git push origin main

# Railway auto-deploys from main branch
# Monitor deployment in Railway dashboard
```

### Step 3: Run Post-Deployment Tests

```bash
# Health check
curl https://your-backend.railway.app/health

# Test document creation
curl -X POST https://your-backend.railway.app/api/documents \
  -H "Authorization: Bearer ${USER_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Document", "document_type": "court_filing"}'

# Test document upload
# ... (add comprehensive test suite)
```

## Phase 6: Frontend Cutover (Day 7)

### Step 1: Update Frontend Environment Variables

In Railway dashboard, update frontend service variables:

```bash
railway variables --set NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
railway variables --set NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
railway variables --set NEXT_PUBLIC_API_URL=https://your-backend.railway.app
```

### Step 2: Deploy Updated Frontend

```bash
git add frontend/
git commit -m "chore: migrate to Supabase auth"
git push origin main

# Monitor deployment in Railway dashboard
```

### Step 3: Test User Flows

Manual QA checklist:

- [ ] User signup (email/password)
- [ ] User login (email/password)
- [ ] Google OAuth login
- [ ] GitHub OAuth login
- [ ] Upload document
- [ ] View document list
- [ ] Download document
- [ ] Delete document
- [ ] Password reset flow
- [ ] Profile update

## Phase 7: Monitoring & Validation (Days 8-14)

### Step 1: Set Up Monitoring

```typescript
// Create monitoring dashboard queries
const queries = [
  {
    name: 'Active Users (24h)',
    sql: `
      SELECT COUNT(DISTINCT user_id)
      FROM audit_logs
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `,
  },
  {
    name: 'Failed Uploads (24h)',
    sql: `
      SELECT COUNT(*)
      FROM jobs
      WHERE job_type = 'upload'
        AND status = 'failed'
        AND created_at > NOW() - INTERVAL '24 hours'
    `,
  },
  {
    name: 'Storage Usage Growth',
    sql: `
      SELECT 
        DATE(created_at) as date,
        SUM(file_size_bytes) as total_bytes
      FROM documents
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `,
  },
];
```

### Step 2: Monitor Error Rates

```bash
# Check Railway logs for errors
railway logs --service backend | grep ERROR

# Check Supabase logs
# Navigate to Dashboard → Logs → Database/Auth/Storage
```

### Step 3: Performance Validation

```sql
-- Check slow queries
SELECT
  query,
  calls,
  total_time,
  mean_time,
  max_time
FROM pg_stat_statements
WHERE mean_time > 1000 -- Queries taking > 1 second
ORDER BY mean_time DESC
LIMIT 20;
```

## Rollback Plan

### If Critical Issues Arise

1. **Revert Backend to Local DB**:

   ```bash
   railway variables --set DATABASE_URL=postgresql://localhost:5432/divorce_ledger
   railway up
   ```

2. **Revert Frontend**:

   ```bash
   git revert HEAD
   git push origin main
   ```

3. **Keep Supabase as Secondary** (gradual rollout):
   - Run both databases in parallel
   - Write to both, read from local
   - Gradually shift read traffic to Supabase
   - Once stable, make Supabase primary

## Post-Migration Checklist

- [ ] All tables migrated with correct row counts
- [ ] All files migrated to Supabase Storage
- [ ] Storage paths updated in database
- [ ] RLS policies tested and verified
- [ ] Edge functions deployed and operational
- [ ] Backend connected to Supabase
- [ ] Frontend using Supabase auth
- [ ] All user flows tested end-to-end
- [ ] Monitoring dashboards configured
- [ ] Error rates within acceptable range
- [ ] Performance metrics validated
- [ ] Backup strategy implemented
- [ ] Documentation updated
- [ ] Team trained on new architecture
- [ ] Local database archived
- [ ] Migration scripts archived

## Timeline Summary

| Phase             | Duration    | Dependencies           | Risk   |
| ----------------- | ----------- | ---------------------- | ------ |
| Schema Migration  | 1 day       | Supabase project ready | Low    |
| Storage Migration | 2 days      | Schema deployed        | Medium |
| Data Migration    | 3 days      | Storage migrated       | High   |
| Edge Functions    | 1 day       | Schema & storage ready | Low    |
| Backend Cutover   | 2 days      | All above complete     | High   |
| Frontend Cutover  | 1 day       | Backend stable         | Medium |
| Validation        | 7 days      | Everything deployed    | Low    |
| **Total**         | **17 days** |                        |        |

## Success Criteria

✅ Migration is successful when:

1. All data migrated with 100% integrity
2. Zero data loss
3. All user flows functional
4. Error rates < 1%
5. Performance equal or better than local DB
6. RLS policies protecting all data
7. No security vulnerabilities introduced
8. Team comfortable with new stack
