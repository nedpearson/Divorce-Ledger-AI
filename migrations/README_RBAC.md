# Multi-Tenant RBAC Migration Guide

## Overview

This folder contains SQL migrations to transform the Divorce Ledger AI application into a complete multi-tenant RBAC system.

## Migration Order

Execute these migrations in Supabase SQL Editor in the following order:

### 1. Migration 008: Multi-Tenant Foundation

**File**: Copy from conversation - creates all core tables

- profiles (with platform_role)
- workspaces (tenant isolation)
- workspace_members
- teams, team_members
- matters, matter_members
- invitations
- subscriptions, plan_definitions, workspace_entitlements
- usage_events
- audit_log (enhanced)
- Helper views
- Auto-triggers

**Run Time**: ~30 seconds

### 2. Migration 009: RLS Policies

**File**: Copy from conversation - creates all security policies

- Helper functions (is_platform_admin, has_workspace_role, etc.)
- RLS policies for all 14 tables
- Strict tenant isolation
- Automatic audit logging triggers

**Run Time**: ~20 seconds

### 3. Migration 010: Update Documents Table

**File**: Copy from conversation - updates existing documents table

- Adds workspace_id and matter_id columns
- Updates RLS policies for workspace-aware access
- Creates performance indexes

**Run Time**: ~10 seconds

## After Migrations

### Create First Super Admin

```sql
-- Get your user ID from Supabase Dashboard → Authentication → Users
INSERT INTO public.profiles (id, email, full_name, platform_role)
VALUES ('YOUR_USER_ID_HERE', 'your-email@domain.com', 'Your Name', 'super_admin')
ON CONFLICT (id) DO UPDATE SET platform_role = 'super_admin';
```

### Verify Installation

```sql
-- Check table count (should be 20+ tables)
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';

-- Verify RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
```

## Full SQL Files

The complete SQL for all three migrations is available in the chat conversation.
Simply copy and paste each migration into Supabase SQL Editor and execute.

## Documentation

- docs/DEPLOYMENT_RBAC.md - Full deployment guide
- docs/ENV_VARIABLES.md - Environment variables reference

## Support

If you encounter issues:

1. Check Supabase logs for errors
2. Verify prerequisites (Supabase project, auth enabled)
3. Ensure migrations run in correct order
4. Review RLS policies if access issues occur
