# Multi-Tenant RBAC Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying the multi-tenant RBAC system to production using Railway and Supabase.

## Prerequisites

- Railway account (for backend deployment)
- Supabase project (for database and authentication)
- GitHub repository connected to Railway
- Domain name (optional, for custom domain)

## Architecture Summary

```
┌──────────────────────────────────────────────────────────────┐
│                     Production Stack                          │
├──────────────────────────────────────────────────────────────┤
│  Frontend (Next.js 14)  →  Vercel/Railway                    │
│  Backend (Fastify)      →  Railway                           │
│  Database (PostgreSQL)  →  Supabase                          │
│  Auth (Supabase Auth)   →  Supabase                          │
│  Storage (Files)        →  Supabase Storage                  │
└──────────────────────────────────────────────────────────────┘
```

## Phase 1: Database Setup (Supabase)

### Step 1.1: Create Supabase Project

1. Go to https://supabase.com/dashboard
2. Create a new project or use existing project
3. Note down the following credentials:
   - Project URL (e.g., `https://xxxxx.supabase.co`)
   - Anon/Public Key
   - Service Role Key (KEEP SECRET!)

### Step 1.2: Run Database Migrations

Execute the following SQL files in order via Supabase SQL Editor:

#### Migration 1: Multi-Tenant Foundation

```bash
# Navigate to Supabase Dashboard → SQL Editor → New Query
# Copy and paste the contents of: migrations/001_multi_tenant_foundation.sql
# Execute the query
```

**File: `migrations/001_multi_tenant_foundation.sql`** (created in previous deliverable)

This migration creates:

- `profiles` table (user profiles with platform roles)
- `workspaces` table (tenant isolation)
- `workspace_members` table (user-workspace relationships)
- `teams` and `team_members` tables (firm organization)
- `matters` and `matter_members` tables (case management)
- `invitations` table (user invitations)
- `subscriptions`, `plan_definitions`, `workspace_entitlements` tables (billing)
- `usage_events` table (usage tracking)
- `audit_log` table (enhanced security logging)
- Helper views and triggers

#### Migration 2: RLS Policies

```bash
# In Supabase SQL Editor → New Query
# Copy and paste the contents of: migrations/002_rls_policies.sql
# Execute the query
```

**File: `migrations/002_rls_policies.sql`** (created in previous deliverable)

This migration creates:

- RLS helper functions (`is_platform_admin`, `has_workspace_role`, etc.)
- Row-level security policies for all tables
- Tenant isolation rules
- Audit logging triggers

#### Migration 3: Update Existing Documents Table

```sql
-- Add workspace and matter columns to existing documents table
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS matter_id UUID REFERENCES public.matters(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_documents_workspace_id ON public.documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_documents_matter_id ON public.documents(matter_id);

-- Update RLS policies for documents
DROP POLICY IF EXISTS "Users can view own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can insert own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can update own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can delete own documents" ON public.documents;

-- New workspace-aware policies
CREATE POLICY "Users can view workspace documents"
  ON public.documents FOR SELECT
  USING (
    public.is_platform_admin() OR
    workspace_id IN (SELECT public.get_user_workspaces())
  );

CREATE POLICY "Users can insert workspace documents"
  ON public.documents FOR INSERT
  WITH CHECK (
    workspace_id IN (SELECT public.get_user_workspaces())
  );

CREATE POLICY "Users can update workspace documents"
  ON public.documents FOR UPDATE
  USING (
    public.is_platform_admin() OR
    workspace_id IN (SELECT public.get_user_workspaces())
  );

CREATE POLICY "Users can delete workspace documents"
  ON public.documents FOR DELETE
  USING (
    public.is_platform_admin() OR
    (workspace_id IN (SELECT public.get_user_workspaces()) AND
     public.has_workspace_role(workspace_id, ARRAY['firm_owner', 'firm_admin', 'consumer']))
  );
```

### Step 1.3: Create First Super Admin

After migrations, create your first super admin user:

```sql
-- Replace with your email
INSERT INTO public.profiles (id, email, full_name, platform_role)
VALUES (
  'YOUR_USER_ID_FROM_AUTH', -- Get this from auth.users table
  'admin@yourdomain.com',
  'Super Admin',
  'super_admin'
)
ON CONFLICT (id) DO UPDATE SET platform_role = 'super_admin';
```

To get your user ID:

1. Sign up through the app first
2. Check Supabase Dashboard → Authentication → Users
3. Copy your User UID
4. Run the above INSERT query with your UID

### Step 1.4: Verify Database Setup

```sql
-- Check table count (should be 20+ tables)
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'public';

-- Verify RLS is enabled on all tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- All tables should show rowsecurity = true
```

## Phase 2: Backend Deployment (Railway)

### Step 2.1: Configure Environment Variables

In Railway Dashboard → Your Backend Service → Variables, add:

```bash
# Node Environment
NODE_ENV=production
PORT=5000

# Supabase Configuration
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here  # KEEP SECRET!

# Session/Security
SESSION_SECRET=generate_random_64_char_string_here

# CORS (adjust for your frontend domain)
CORS_ORIGIN=https://your-frontend-domain.com,https://your-frontend-domain.vercel.app

# Logging
LOG_LEVEL=info
```

**Generate SESSION_SECRET:**

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Step 2.2: Deploy Backend

1. Connect GitHub repository to Railway
2. Railway will auto-detect Node.js project
3. Set root directory to `/backend` if needed
4. Deploy will trigger automatically on push to `main` branch

### Step 2.3: Verify Backend Deployment

```bash
# Test health endpoint
curl https://your-backend.railway.app/api/health

# Expected response:
{
  "status": "ok",
  "timestamp": "2026-02-20T...",
  "environment": "production"
}
```

## Phase 3: Frontend Deployment

### Step 3.1: Configure Environment Variables

Create `.env.production` in frontend directory:

```bash
# Supabase (Public - safe to expose)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here

# Backend API
NEXT_PUBLIC_API_URL=https://your-backend.railway.app

# App Configuration
NEXT_PUBLIC_APP_NAME="Divorce Ledger AI"
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

### Step 3.2: Deploy Frontend (Vercel/Railway)

#### Option A: Vercel (Recommended for Next.js)

1. Install Vercel CLI: `npm i -g vercel`
2. Run: `cd frontend && vercel --prod`
3. Follow prompts to link project
4. Set environment variables in Vercel Dashboard

#### Option B: Railway

1. Create new service in Railway
2. Connect GitHub repository
3. Set root directory to `/frontend`
4. Add environment variables
5. Deploy

### Step 3.3: Verify Frontend Deployment

1. Visit your deployed URL
2. Test authentication flow
3. Verify workspace creation
4. Check that RLS policies are enforcing access

## Phase 4: Post-Deployment Configuration

### Step 4.1: Configure Supabase Auth

In Supabase Dashboard → Authentication → URL Configuration:

```
Site URL: https://your-frontend-domain.com
Redirect URLs:
  - https://your-frontend-domain.com/**
  - https://your-frontend-domain.com/auth/callback
  - http://localhost:3000/auth/callback  (for local dev)
```

### Step 4.2: Enable OAuth Providers (Optional)

In Supabase Dashboard → Authentication → Providers:

1. **Google OAuth:**
   - Enable Google provider
   - Add Client ID and Secret from Google Cloud Console
   - Authorized redirect URI: `https://xxxxx.supabase.co/auth/v1/callback`

2. **GitHub OAuth:**
   - Enable GitHub provider
   - Add Client ID and Secret from GitHub OAuth Apps
   - Authorization callback URL: `https://xxxxx.supabase.co/auth/v1/callback`

### Step 4.3: Configure Storage Buckets

```sql
-- Create storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('documents', 'documents', false, 52428800, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']);

-- Set up storage policies
CREATE POLICY "Users can upload to their workspace documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents' AND
    (storage.foldername(name))[1] IN (SELECT public.get_user_workspaces()::text)
  );

CREATE POLICY "Users can view their workspace documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents' AND
    (storage.foldername(name))[1] IN (SELECT public.get_user_workspaces()::text)
  );
```

### Step 4.4: Set Up Monitoring

1. **Railway Monitoring:**
   - Check deployment logs regularly
   - Set up log drains (optional)
   - Monitor resource usage

2. **Supabase Monitoring:**
   - Check Database Health
   - Monitor API Usage
   - Review Auth Logs

3. **Application Monitoring (Add Sentry - Optional):**
   ```bash
   npm install @sentry/nextjs @sentry/node
   ```

## Phase 5: Security Hardening

### Step 5.1: Verify RLS Policies

Run security audit queries:

```sql
-- Check that RLS is enabled on all tables
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND rowsecurity = false;

-- Should return 0 rows

-- List all policies
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

### Step 5.2: Test Tenant Isolation

1. Create two test firm workspaces
2. Create test user in each workspace
3. Verify users cannot see each other's data
4. Check that super admin can see all data

### Step 5.3: Enable Rate Limiting (Backend)

Add rate limiting middleware:

```typescript
// backend/src/index.ts
import rateLimit from '@fastify/rate-limit';

await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  errorResponseBuilder: (req, context) => ({
    statusCode: 429,
    error: 'Too Many Requests',
    message: `Rate limit exceeded, retry in ${context.after}`,
  }),
});
```

### Step 5.4: Security Headers

Ensure proper security headers are set:

```typescript
// backend/src/index.ts
import helmet from '@fastify/helmet';

await fastify.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
});
```

## Phase 6: Testing in Production

### Step 6.1: Test Authentication

- [ ] Sign up new user
- [ ] Email verification works
- [ ] Password reset works
- [ ] OAuth login works (if enabled)
- [ ] Session persistence works

### Step 6.2: Test Multi-Tenancy

- [ ] Create consumer workspace
- [ ] Create firm workspace
- [ ] Firm workspace requires approval (status = pending)
- [ ] Super admin can approve/reject firms
- [ ] Workspace switcher works
- [ ] Data isolation verified

### Step 6.3: Test Role-Based Access

- [ ] Super admin can access /superadmin
- [ ] Firm owner can access /firm
- [ ] Consumer can access /app
- [ ] Client can access /client portal
- [ ] Unauthorized users are redirected
- [ ] Suspended workspaces are blocked

### Step 6.4: Test Audit Logging

- [ ] Audit logs capture platform admin actions
- [ ] Workspace actions are logged
- [ ] Impersonation is logged
- [ ] Audit log viewer works

## Rollback Procedures

### If Migration Fails

```sql
-- Rollback strategy (create rollback scripts)
BEGIN;
  -- Drop new tables in reverse order
  DROP TABLE IF EXISTS public.usage_events CASCADE;
  DROP TABLE IF EXISTS public.workspace_entitlements CASCADE;
  -- ... (drop all new tables)
ROLLBACK;  -- Use COMMIT if you want to proceed
```

### If Deployment Fails

1. **Railway:**
   - Go to Deployments tab
   - Click on previous working deployment
   - Select "Redeploy"

2. **Revert Code:**
   ```bash
   git revert HEAD
   git push origin main
   ```

## Maintenance

### Database Backups

Supabase automatically backs up daily. To manual backup:

```bash
# Download backup
pg_dump -h db.xxxxx.supabase.co -U postgres -d postgres > backup.sql

# Restore from backup
psql -h db.xxxxx.supabase.co -U postgres -d postgres < backup.sql
```

### Monitoring Checklist (Weekly)

- [ ] Check error logs in Railway
- [ ] Review Supabase database metrics
- [ ] Check audit logs for suspicious activity
- [ ] Verify backup status
- [ ] Review API usage (rate limits, quotas)

## Troubleshooting

### Issue: "Row-level security prevents this operation"

**Cause:** RLS policy is blocking the operation
**Solution:**

1. Check if user has proper workspace membership
2. Verify workspace status is 'active'
3. Check platform_role in profiles table
4. Review specific table's RLS policies

### Issue: "Workspace pending approval"

**Cause:** Firm workspace not yet approved
**Solution:**

1. Log in as super admin
2. Go to /superadmin
3. Approve the workspace

### Issue: Backend cannot connect to Supabase

**Cause:** Invalid credentials or network issue
**Solution:**

1. Verify SUPABASE_URL and keys in Railway env vars
2. Check Supabase project status
3. Verify service role key has not been rotated

## Support & Resources

- **Supabase Docs:** https://supabase.com/docs
- **Railway Docs:** https://docs.railway.app
- **Next.js Docs:** https://nextjs.org/docs
- **Fastify Docs:** https://www.fastify.io/docs

## Conclusion

Your multi-tenant RBAC system is now deployed! Monitor the application closely in the first few days and use the audit logs to track any issues.

**Next Steps:**

1. Create your first super admin account
2. Test all user flows
3. Invite team members
4. Configure billing/subscription features
5. Set up monitoring alerts
