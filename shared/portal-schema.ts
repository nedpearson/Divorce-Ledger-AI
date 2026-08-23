import { sql } from 'drizzle-orm';
import { pgTable, text, varchar, integer, timestamp, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

/**
 * Settlement Portal — three-role sharing for a reimbursement claim.
 *
 *   owner    (Ned)     approves/rejects every dispute; nothing changes the net without him
 *   disputer (Lindsey) files disputes + "I paid this" claims against individual charges
 *   observer (lawyer)  read-only: every charge, every dispute, every decision, full audit trail
 *
 * Net-due gate: a line with an OPEN or APPROVED dispute has its contested amount removed
 * from the net. Rejecting a dispute restores it. Every action is audit-logged.
 */

export const PORTAL_ROLES = ['owner', 'disputer', 'observer'] as const;
export type PortalRole = (typeof PORTAL_ROLES)[number];

export const PORTAL_MEMBER_STATUSES = ['invited', 'active', 'revoked'] as const;
export type PortalMemberStatus = (typeof PORTAL_MEMBER_STATUSES)[number];

export const PORTAL_DISPUTE_KINDS = ['dispute', 'paid_claim'] as const;
export type PortalDisputeKind = (typeof PORTAL_DISPUTE_KINDS)[number];

export const PORTAL_DISPUTE_STATUSES = ['open', 'approved', 'rejected'] as const;
export type PortalDisputeStatus = (typeof PORTAL_DISPUTE_STATUSES)[number];

export const PORTAL_TARGET_TYPES = ['reimbursement', 'obligation_instance'] as const;
export type PortalTargetType = (typeof PORTAL_TARGET_TYPES)[number];

// ==========================================
// portal_members — who can see the portal, and as what
// ==========================================
export const portalMembers = pgTable(
  'portal_members',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    // The claim owner whose portal this is (always a users.id).
    ownerUserId: varchar('owner_user_id').notNull(),
    // Resolved account for this member. Null until the invite is accepted.
    memberUserId: varchar('member_user_id'),
    email: text('email').notNull(),
    displayName: text('display_name'),
    role: text('role').notNull(), // 'owner' | 'disputer' | 'observer'
    status: text('status').notNull().default('invited'), // 'invited' | 'active' | 'revoked'
    inviteToken: text('invite_token'),
    inviteExpiresAt: timestamp('invite_expires_at'),
    invitedByUserId: varchar('invited_by_user_id'),
    acceptedAt: timestamp('accepted_at'),
    environment: text('environment').notNull().default('demo'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    ownerEmailUnique: uniqueIndex('portal_members_owner_email_uq').on(t.ownerUserId, t.email),
  })
);

export const insertPortalMemberSchema = createInsertSchema(portalMembers).omit({
  id: true,
  createdAt: true,
  acceptedAt: true,
});
export type InsertPortalMember = z.infer<typeof insertPortalMemberSchema>;
export type PortalMember = typeof portalMembers.$inferSelect;

// ==========================================
// portal_disputes — a contest against one charge
// ==========================================
export const portalDisputes = pgTable('portal_disputes', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  ownerUserId: varchar('owner_user_id').notNull(),
  raisedByUserId: varchar('raised_by_user_id').notNull(),
  raisedByRole: text('raised_by_role').notNull(), // snapshot of role at filing time
  targetType: text('target_type').notNull().default('reimbursement'),
  targetId: varchar('target_id').notNull(),
  kind: text('kind').notNull().default('dispute'), // 'dispute' | 'paid_claim'
  // Cents, mirroring reimbursements.amount. Never exceeds the line's own amount.
  contestedAmount: integer('contested_amount').notNull().default(0),
  reason: text('reason'),
  evidenceUrl: text('evidence_url'),
  status: text('status').notNull().default('open'), // 'open' | 'approved' | 'rejected'
  resolvedByUserId: varchar('resolved_by_user_id'),
  resolutionNote: text('resolution_note'),
  resolvedAt: timestamp('resolved_at'),
  environment: text('environment').notNull().default('demo'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertPortalDisputeSchema = createInsertSchema(portalDisputes).omit({
  id: true,
  createdAt: true,
  resolvedAt: true,
  resolvedByUserId: true,
  resolutionNote: true,
});
export type InsertPortalDispute = z.infer<typeof insertPortalDisputeSchema>;
export type PortalDispute = typeof portalDisputes.$inferSelect;

// ==========================================
// portal_audit_log — append-only settlement record
// ==========================================
export const portalAuditLog = pgTable('portal_audit_log', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  ownerUserId: varchar('owner_user_id').notNull(),
  actorUserId: varchar('actor_user_id'),
  actorRole: text('actor_role'),
  action: text('action').notNull(), // e.g. 'dispute.create', 'dispute.approve', 'member.invite'
  targetType: text('target_type'),
  targetId: varchar('target_id'),
  summary: text('summary'),
  metadata: jsonb('metadata'),
  ipAddress: text('ip_address'),
  environment: text('environment').notNull().default('demo'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type PortalAuditEntry = typeof portalAuditLog.$inferSelect;

// Request-body validators used by the routes.
export const createDisputeBodySchema = z.object({
  targetId: z.string().min(1),
  targetType: z.enum(PORTAL_TARGET_TYPES).default('reimbursement'),
  kind: z.enum(PORTAL_DISPUTE_KINDS).default('dispute'),
  contestedAmount: z.number().int().nonnegative().optional(),
  reason: z.string().max(5000).optional(),
  evidenceUrl: z.string().url().max(2000).optional(),
});

export const resolveDisputeBodySchema = z.object({
  action: z.enum(['approve', 'reject']),
  note: z.string().max(5000).optional(),
});

export const inviteMemberBodySchema = z.object({
  email: z.string().email(),
  role: z.enum(['disputer', 'observer']),
  displayName: z.string().max(200).optional(),
});
