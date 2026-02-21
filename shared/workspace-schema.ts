import { pgTable, text, varchar, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./schema";

// ============================================================================
// WORKSPACE TYPES & CONFIGURATION
// ============================================================================

export const WORKSPACE_TYPES = ['consumer', 'firm'] as const;
export type WorkspaceType = typeof WORKSPACE_TYPES[number];

export const WORKSPACE_ROLES = ['owner', 'admin', 'staff', 'client'] as const;
export type WorkspaceRole = typeof WORKSPACE_ROLES[number];

export const MATTER_ROLES = ['attorney', 'paralegal', 'client'] as const;
export type MatterRole = typeof MATTER_ROLES[number];

export const MATTER_STATUSES = ['active', 'closed', 'archived'] as const;
export type MatterStatus = typeof MATTER_STATUSES[number];

export const INVITATION_STATUSES = ['pending', 'accepted', 'expired', 'revoked'] as const;
export type InvitationStatus = typeof INVITATION_STATUSES[number];

// AI Credit Costs Configuration
export const AI_CREDIT_COSTS = {
  // Document processing
  documentClassification: 10,
  documentParsing: 25,
  receiptItemExtraction: 15,
  
  // Voice/Image analysis
  voiceTranscription: 5,        // per minute
  imageAnalysis: 20,
  
  // Advanced features
  sentimentAnalysis: 30,
  caseBuilderAssistant: 50,
  courtFilingReview: 75,
  
  // Queries
  chatbotQuery: 2,
  searchQuery: 1,
} as const;

// Subscription tier entitlements for workspace billing
export const WORKSPACE_TIER_ENTITLEMENTS = {
  // Consumer tiers
  free: {
    type: 'consumer' as const,
    price: 0,
    mattersLimit: 1,
    seatsLimit: 1,
    storageMB: 500,
    exportLimit: 5,
    aiCreditsMonthly: 100,
    features: {
      advancedAI: false,
      clientPortal: false,
      apiAccess: false,
      prioritySupport: false,
    }
  },
  individual: {
    type: 'consumer' as const,
    price: 1200, // $12 in cents
    mattersLimit: 3,
    seatsLimit: 1,
    storageMB: 5000, // 5GB
    exportLimit: 50,
    aiCreditsMonthly: 500,
    features: {
      advancedAI: false,
      clientPortal: false,
      apiAccess: false,
      prioritySupport: false,
    }
  },
  pro: {
    type: 'consumer' as const,
    price: 4900, // $49
    mattersLimit: null, // unlimited
    seatsLimit: 1,
    storageMB: 50000, // 50GB
    exportLimit: null,
    aiCreditsMonthly: 2000,
    features: {
      advancedAI: true,
      clientPortal: false,
      apiAccess: true,
      prioritySupport: false,
    }
  },
  
  // Firm tiers
  firm_starter: {
    type: 'firm' as const,
    price: 14900, // $149
    mattersLimit: 25,
    seatsLimit: 3,
    storageMB: 50000,
    clientsPerMatter: 5,
    exportLimit: null,
    aiCreditsMonthly: 5000,
    features: {
      advancedAI: true,
      clientPortal: true,
      apiAccess: true,
      prioritySupport: false,
    }
  },
  firm_pro: {
    type: 'firm' as const,
    price: 39900, // $399
    mattersLimit: 100,
    seatsLimit: 10,
    storageMB: 200000, // 200GB
    clientsPerMatter: 20,
    exportLimit: null,
    aiCreditsMonthly: 20000,
    features: {
      advancedAI: true,
      clientPortal: true,
      apiAccess: true,
      prioritySupport: true,
    }
  },
  firm_enterprise: {
    type: 'firm' as const,
    price: null, // Custom pricing
    mattersLimit: null,
    seatsLimit: null,
    storageMB: 1000000, // 1TB
    clientsPerMatter: null,
    exportLimit: null,
    aiCreditsMonthly: 100000,
    features: {
      advancedAI: true,
      clientPortal: true,
      apiAccess: true,
      prioritySupport: true,
      customIntegrations: true,
      dedicatedSupport: true,
      sso: true,
    }
  },
} as const;

export type WorkspaceTier = keyof typeof WORKSPACE_TIER_ENTITLEMENTS;

// ============================================================================
// WORKSPACES TABLE
// ============================================================================

export const workspaces = pgTable("workspaces", {
  id: varchar("id", { length: 100 }).primaryKey().default(sql`gen_random_uuid()::text`),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 20 }).notNull().$type<WorkspaceType>(),
  ownerId: varchar("owner_id", { length: 100 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  stripeCustomerId: varchar("stripe_customer_id", { length: 100 }).unique(),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 100 }).unique(),
  subscriptionTier: varchar("subscription_tier", { length: 50 }).notNull().default('free').$type<WorkspaceTier>(),
  subscriptionStatus: varchar("subscription_status", { length: 20 }),
  billingCycleStart: timestamp("billing_cycle_start"),
  aiCreditsBalance: integer("ai_credits_balance").notNull().default(0),
  aiCreditsLimit: integer("ai_credits_limit").notNull().default(100),
  settings: jsonb("settings").default({}).notNull().$type<{
    aiCreditsOverageMode?: 'safe' | 'metered';
    branding?: Record<string, any>;
    notifications?: Record<string, any>;
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertWorkspaceSchema = createInsertSchema(workspaces);
export const selectWorkspaceSchema = createSelectSchema(workspaces);
export type Workspace = z.infer<typeof selectWorkspaceSchema>;
export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;

// ============================================================================
// WORKSPACE MEMBERS TABLE
// ============================================================================

export const workspaceMembers = pgTable("workspace_members", {
  id: varchar("id", { length: 100 }).primaryKey().default(sql`gen_random_uuid()::text`),
  workspaceId: varchar("workspace_id", { length: 100 }).notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar("role", { length: 20 }).notNull().$type<WorkspaceRole>(),
  invitedBy: varchar("invited_by", { length: 100 }).references(() => users.id),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertWorkspaceMemberSchema = createInsertSchema(workspaceMembers);
export const selectWorkspaceMemberSchema = createSelectSchema(workspaceMembers);
export type WorkspaceMember = z.infer<typeof selectWorkspaceMemberSchema>;
export type InsertWorkspaceMember = z.infer<typeof insertWorkspaceMemberSchema>;

// ============================================================================
// MATTERS TABLE
// ============================================================================

export const matters = pgTable("matters", {
  id: varchar("id", { length: 100 }).primaryKey().default(sql`gen_random_uuid()::text`),
  workspaceId: varchar("workspace_id", { length: 100 }).notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  matterNumber: varchar("matter_number", { length: 50 }).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: varchar("status", { length: 20 }).notNull().default('active').$type<MatterStatus>(),
  leadAttorneyId: varchar("lead_attorney_id", { length: 100 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  closedAt: timestamp("closed_at"),
});

export const insertMatterSchema = createInsertSchema(matters);
export const selectMatterSchema = createSelectSchema(matters);
export type Matter = z.infer<typeof selectMatterSchema>;
export type InsertMatter = z.infer<typeof insertMatterSchema>;

// ============================================================================
// MATTER MEMBERS TABLE
// ============================================================================

export const matterMembers = pgTable("matter_members", {
  id: varchar("id", { length: 100 }).primaryKey().default(sql`gen_random_uuid()::text`),
  matterId: varchar("matter_id", { length: 100 }).notNull().references(() => matters.id, { onDelete: 'cascade' }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar("role", { length: 20 }).notNull().$type<MatterRole>(),
  permissions: jsonb("permissions").default({ can_view: true, can_upload: false, can_comment: true }).notNull().$type<{
    can_view: boolean;
    can_upload: boolean;
    can_comment: boolean;
    can_edit?: boolean;
  }>(),
  addedAt: timestamp("added_at").defaultNow().notNull(),
});

export const insertMatterMemberSchema = createInsertSchema(matterMembers);
export const selectMatterMemberSchema = createSelectSchema(matterMembers);
export type MatterMember = z.infer<typeof selectMatterMemberSchema>;
export type InsertMatterMember = z.infer<typeof insertMatterMemberSchema>;

// ============================================================================
// INVITATIONS TABLE
// ============================================================================

export const invitations = pgTable("invitations", {
  id: varchar("id", { length: 100 }).primaryKey().default(sql`gen_random_uuid()::text`),
  workspaceId: varchar("workspace_id", { length: 100 }).notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  matterId: varchar("matter_id", { length: 100 }).references(() => matters.id, { onDelete: 'cascade' }),
  email: varchar("email", { length: 255 }).notNull(),
  role: varchar("role", { length: 20 }).notNull(),
  invitedBy: integer("invited_by").notNull().references(() => users.id),
  token: varchar("token", { length: 100 }).notNull().unique(),
  status: varchar("status", { length: 20 }).notNull().default('pending').$type<InvitationStatus>(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  acceptedAt: timestamp("accepted_at"),
});

export const insertInvitationSchema = createInsertSchema(invitations);
export const selectInvitationSchema = createSelectSchema(invitations);
export type Invitation = z.infer<typeof selectInvitationSchema>;
export type InsertInvitation = z.infer<typeof insertInvitationSchema>;

// ============================================================================
// AI CREDIT TRANSACTIONS TABLE
// ============================================================================

export const aiCreditTransactions = pgTable("ai_credit_transactions", {
  id: varchar("id", { length: 100 }).primaryKey().default(sql`gen_random_uuid()::text`),
  workspaceId: varchar("workspace_id", { length: 100 }).notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: integer("user_id").notNull().references(() => users.id),
  amount: integer("amount").notNull(), // Negative for consumption, positive for grants
  balanceAfter: integer("balance_after").notNull(),
  reason: varchar("reason", { length: 100 }).notNull(),
  metadata: jsonb("metadata").default({}).notNull().$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAICreditTransactionSchema = createInsertSchema(aiCreditTransactions);
export const selectAICreditTransactionSchema = createSelectSchema(aiCreditTransactions);
export type AICreditTransaction = z.infer<typeof selectAICreditTransactionSchema>;
export type InsertAICreditTransaction = z.infer<typeof insertAICreditTransactionSchema>;

// ============================================================================
// SUBSCRIPTION ENTITLEMENTS TABLE
// ============================================================================

export const subscriptionEntitlements = pgTable("subscription_entitlements", {
  id: varchar("id", { length: 100 }).primaryKey().default(sql`gen_random_uuid()::text`),
  workspaceId: varchar("workspace_id", { length: 100 }).notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  entitlementType: varchar("entitlement_type", { length: 50 }).notNull(), // 'matters_limit', 'seats_limit', etc.
  limitValue: integer("limit_value"),
  currentUsage: integer("current_usage").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSubscriptionEntitlementSchema = createInsertSchema(subscriptionEntitlements);
export const selectSubscriptionEntitlementSchema = createSelectSchema(subscriptionEntitlements);
export type SubscriptionEntitlement = z.infer<typeof selectSubscriptionEntitlementSchema>;
export type InsertSubscriptionEntitlement = z.infer<typeof insertSubscriptionEntitlementSchema>;

// ============================================================================
// STRIPE EVENTS TABLE (Idempotency)
// ============================================================================

export const stripeEvents = pgTable("stripe_events", {
  id: varchar("id", { length: 100 }).primaryKey(),
  eventId: varchar("event_id", { length: 100 }).notNull().unique(),
  type: varchar("type", { length: 100 }).notNull(),
  processedAt: timestamp("processed_at").defaultNow().notNull(),
  metadata: jsonb("metadata").default({}).notNull().$type<Record<string, any>>(),
});

export const insertStripeEventSchema = createInsertSchema(stripeEvents);
export const selectStripeEventSchema = createSelectSchema(stripeEvents);
export type StripeEvent = z.infer<typeof selectStripeEventSchema>;
export type InsertStripeEvent = z.infer<typeof insertStripeEventSchema>;

// ============================================================================
// HELPER TYPES
// ============================================================================

export interface WorkspaceEntitlements {
  matters: { limit: number | null; current: number };
  seats: { limit: number | null; current: number };
  storage: { limit: number; current: number }; // MB
  aiCredits: { limit: number; current: number };
  features: {
    advancedAI: boolean;
    clientPortal: boolean;
    apiAccess: boolean;
    prioritySupport?: boolean;
    customIntegrations?: boolean;
    dedicatedSupport?: boolean;
    sso?: boolean;
  };
}

export interface WorkspaceContext {
  id: string;
  role: WorkspaceRole;
  type: WorkspaceType;
  subscriptionTier: WorkspaceTier;
}

export interface MatterContext {
  id: string;
  workspaceId: string;
  role: MatterRole;
  permissions: {
    can_view: boolean;
    can_upload: boolean;
    can_comment: boolean;
    can_edit?: boolean;
  };
}
