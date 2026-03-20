/**
 * platform-admin-schema.ts
 * Drizzle ORM table definitions for Platform Super Admin system.
 * All tables defined here map to migrations/009-platform-admin.sql.
 */
import {
  pgTable,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  date,
  real,
  jsonb,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { users } from './schema';
import { workspaces } from './workspace-schema';

// ============================================================================
// PLATFORM ROLES
// ============================================================================
export const PLATFORM_ROLES = ['super_admin', 'support_admin'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const PLATFORM_ADMIN_EMAIL = 'nedpearson@gmail.com';

export function isPlatformAdmin(email: string, platformRole?: string | null): boolean {
  return (
    email.toLowerCase() === PLATFORM_ADMIN_EMAIL.toLowerCase() ||
    PLATFORM_ROLES.includes(platformRole as PlatformRole)
  );
}

// ============================================================================
// PLATFORM ADMIN ALLOWLIST
// ============================================================================
export const platformAdminAllowlist = pgTable('platform_admin_allowlist', {
  id: varchar('id', { length: 100 })
    .primaryKey()
    .default(sql`gen_random_uuid()::text`),
  email: text('email').notNull().unique(),
  role: varchar('role', { length: 20 }).notNull().default('support_admin').$type<PlatformRole>(),
  addedBy: text('added_by'),
  createdAt: timestamp('created_at').defaultNow(),
});

export type PlatformAdminAllowlistEntry = typeof platformAdminAllowlist.$inferSelect;

// ============================================================================
// AUDIT LOG
// ============================================================================
export const auditLog = pgTable('audit_log', {
  id: varchar('id', { length: 100 })
    .primaryKey()
    .default(sql`gen_random_uuid()::text`),
  actorId: text('actor_id'),
  actorEmail: text('actor_email').notNull(),
  actionType: varchar('action_type', { length: 100 }).notNull(),
  targetType: varchar('target_type', { length: 50 }),
  targetId: text('target_id'),
  details: jsonb('details').default({}).$type<Record<string, unknown>>(),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const insertAuditLogSchema = createInsertSchema(auditLog);
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type InsertAuditLogEntry = z.infer<typeof insertAuditLogSchema>;

// ============================================================================
// PLAN DEFINITIONS
// ============================================================================
export const planDefinitions = pgTable('plan_definitions', {
  id: varchar('id', { length: 100 })
    .primaryKey()
    .default(sql`gen_random_uuid()::text`),
  name: varchar('name', { length: 100 }).notNull().unique(),
  displayName: varchar('display_name', { length: 200 }),
  workspaceType: varchar('workspace_type', { length: 20 }).$type<'consumer' | 'firm'>(),
  priceCents: integer('price_cents').notNull().default(0),
  stripePriceId: text('stripe_price_id'),
  mattersLimit: integer('matters_limit'),
  seatsLimit: integer('seats_limit'),
  storageMb: integer('storage_mb'),
  aiCreditsMonthly: integer('ai_credits_monthly').notNull().default(0),
  features: jsonb('features').default({}).$type<Record<string, boolean>>(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertPlanDefinitionSchema = createInsertSchema(planDefinitions);
export const selectPlanDefinitionSchema = createSelectSchema(planDefinitions);
export type PlanDefinition = typeof planDefinitions.$inferSelect;
export type InsertPlanDefinition = z.infer<typeof insertPlanDefinitionSchema>;

// ============================================================================
// FEATURE FLAGS
// ============================================================================
export const featureFlags = pgTable('feature_flags', {
  key: varchar('key', { length: 100 }).primaryKey(),
  enabled: boolean('enabled').notNull().default(false),
  description: text('description'),
  updatedBy: text('updated_by'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export type FeatureFlag = typeof featureFlags.$inferSelect;

// ============================================================================
// WORKSPACE FEATURE OVERRIDES
// ============================================================================
export const workspaceFeatureOverrides = pgTable('workspace_feature_overrides', {
  id: varchar('id', { length: 100 })
    .primaryKey()
    .default(sql`gen_random_uuid()::text`),
  workspaceId: varchar('workspace_id', { length: 100 })
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  featureKey: varchar('feature_key', { length: 100 }).notNull(),
  enabled: boolean('enabled').notNull(),
  overriddenBy: text('overridden_by'),
  overriddenAt: timestamp('overridden_at').defaultNow(),
});

export type WorkspaceFeatureOverride = typeof workspaceFeatureOverrides.$inferSelect;

// ============================================================================
// USER ENTITLEMENTS
// ============================================================================
export const userEntitlements = pgTable('user_entitlements', {
  id: varchar('id', { length: 100 })
    .primaryKey()
    .default(sql`gen_random_uuid()::text`),
  userId: text('user_id').notNull(),
  workspaceId: varchar('workspace_id', { length: 100 }).references(() => workspaces.id, {
    onDelete: 'cascade',
  }),
  featureKey: varchar('feature_key', { length: 100 }).notNull(),
  enabled: boolean('enabled'),
  limitValue: integer('limit_value'),
  details: jsonb('details').default({}).$type<Record<string, unknown>>(),
  setBy: text('set_by'),
  setAt: timestamp('set_at').defaultNow(),
});

export const insertUserEntitlementSchema = createInsertSchema(userEntitlements);
export type UserEntitlement = typeof userEntitlements.$inferSelect;

// ============================================================================
// USAGE EVENTS
// ============================================================================
export const usageEvents = pgTable('usage_events', {
  id: varchar('id', { length: 100 })
    .primaryKey()
    .default(sql`gen_random_uuid()::text`),
  workspaceId: varchar('workspace_id', { length: 100 })
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  actionType: varchar('action_type', { length: 100 }).notNull(),
  credits: integer('credits').notNull().default(0),
  units: real('units').notNull().default(1),
  metadata: jsonb('metadata').default({}).$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const insertUsageEventSchema = createInsertSchema(usageEvents);
export type UsageEvent = typeof usageEvents.$inferSelect;
export type InsertUsageEvent = z.infer<typeof insertUsageEventSchema>;

// ============================================================================
// DAILY USAGE ROLLUPS
// ============================================================================
export const usageRollupsDaily = pgTable('usage_rollups_daily', {
  id: varchar('id', { length: 100 })
    .primaryKey()
    .default(sql`gen_random_uuid()::text`),
  workspaceId: varchar('workspace_id', { length: 100 })
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  rollupDate: date('rollup_date').notNull(),
  actionType: varchar('action_type', { length: 100 }).notNull(),
  totalCredits: integer('total_credits').notNull().default(0),
  totalUnits: real('total_units').notNull().default(0),
  eventCount: integer('event_count').notNull().default(0),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export type UsageRollupDaily = typeof usageRollupsDaily.$inferSelect;

// ============================================================================
// CREDIT PRICING MODEL (for profitability analytics)
// ============================================================================
export const CREDIT_COST_MODEL = {
  // Estimated platform cost per credit in USD cents (banded by volume)
  costPerCreditCents: {
    light: 0.05, // rare usage — ~$0.0005/credit
    typical: 0.08, // average usage
    heavy: 0.12, // always-on power users
  },
  // Plan revenue → credit → margin calculation
  scenarioMultiplier: {
    light: 0.3, // uses 30% of monthly allocation
    typical: 0.65, // uses 65%
    heavy: 1.1, // uses 110% (overages)
  },
} as const;

export type UsageScenario = keyof typeof CREDIT_COST_MODEL.scenarioMultiplier;
