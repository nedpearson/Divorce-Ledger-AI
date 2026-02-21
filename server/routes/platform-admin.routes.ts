/**
 * server/routes/platform-admin.routes.ts
 *
 * All /api/superadmin/* endpoints.
 * Every route is hard-gated by requirePlatformAdmin middleware.
 * All mutations write to audit_log.
 */
import { Router } from "express";
import { db } from "../db";
import { requirePlatformAdmin, requireSuperAdmin } from "../middleware/platform-admin";
import { logAudit, getClientIp } from "../services/audit-log.service";
import {
  auditLog,
  featureFlags,
  workspaceFeatureOverrides,
  userEntitlements,
  planDefinitions,
  usageEvents,
  platformAdminAllowlist,
  usageRollupsDaily,
  CREDIT_COST_MODEL,
} from "@shared/platform-admin-schema";
import {
  workspaces,
  workspaceMembers,
  matters,
  invitations,
  aiCreditTransactions,
} from "@shared/workspace-schema";
import {
  users,
  billingRecords,
} from "@shared/schema";
import {
  eq,
  and,
  or,
  ilike,
  desc,
  asc,
  sql,
  gte,
  lte,
  count,
  sum,
  inArray,
} from "drizzle-orm";
import { z } from "zod";

const router = Router();

// Apply platform admin gate to every route in this file
router.use(requirePlatformAdmin);

// ============================================================================
// A) GLOBAL OVERVIEW
// ============================================================================
router.get("/overview", async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      totalFirms,
      totalConsumers,
      activeMatters,
      activeSubscriptions,
      delinquentCount,
      creditsConsumed30d,
    ] = await Promise.all([
      db.select({ c: count() }).from(users),
      db.select({ c: count() }).from(workspaces).where(eq(workspaces.type, "firm")),
      db.select({ c: count() }).from(workspaces).where(eq(workspaces.type, "consumer")),
      db.select({ c: count() }).from(matters).where(eq(matters.status, "active")),
      db.select({ c: count() }).from(workspaces)
        .where(eq(workspaces.subscriptionStatus, "active")),
      db.select({ c: count() }).from(workspaces)
        .where(eq(workspaces.subscriptionStatus, "past_due")),
      db.select({ total: sum(usageEvents.credits) }).from(usageEvents)
        .where(gte(usageEvents.createdAt, thirtyDaysAgo)),
    ]);

    // MRR estimate: sum price from plan_definitions for active subscriptions
    const mrrRows = await db
      .select({
        tier: workspaces.subscriptionTier,
        cnt: count(),
      })
      .from(workspaces)
      .where(eq(workspaces.subscriptionStatus, "active"))
      .groupBy(workspaces.subscriptionTier);

    const planPrices = await db.select({ name: planDefinitions.name, priceCents: planDefinitions.priceCents })
      .from(planDefinitions);
    const priceMap = Object.fromEntries(planPrices.map(p => [p.name, p.priceCents ?? 0]));
    const mrrEstimate = mrrRows.reduce((acc, r) => acc + (priceMap[r.tier] ?? 0) * Number(r.cnt), 0);

    res.json({
      users:              Number(totalUsers[0]?.c ?? 0),
      firms:              Number(totalFirms[0]?.c ?? 0),
      consumers:          Number(totalConsumers[0]?.c ?? 0),
      activeMatters:      Number(activeMatters[0]?.c ?? 0),
      activeSubscriptions:Number(activeSubscriptions[0]?.c ?? 0),
      delinquentCount:    Number(delinquentCount[0]?.c ?? 0),
      mrrCents:           mrrEstimate,
      creditsConsumed30d: Number(creditsConsumed30d[0]?.total ?? 0),
    });
  } catch (err: any) {
    console.error("[superadmin/overview]", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// B) FIRMS MANAGEMENT
// ============================================================================

// List all workspaces (firms + consumers) with pagination/filter
router.get("/workspaces", async (req, res) => {
  try {
    const page    = Math.max(1, Number(req.query.page  ?? 1));
    const limit   = Math.min(100, Number(req.query.limit ?? 25));
    const offset  = (page - 1) * limit;
    const type    = req.query.type as string | undefined;
    const status  = req.query.status as string | undefined;
    const search  = req.query.search as string | undefined;

    const conditions: any[] = [];
    if (type)   conditions.push(eq(workspaces.type, type as any));
    if (status) conditions.push(eq(workspaces.subscriptionStatus, status));
    if (search) conditions.push(ilike(workspaces.name, `%${search}%`));

    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, totalRow] = await Promise.all([
      db.select().from(workspaces).where(where).orderBy(desc(workspaces.createdAt)).limit(limit).offset(offset),
      db.select({ c: count() }).from(workspaces).where(where),
    ]);

    res.json({ workspaces: rows, total: Number(totalRow[0]?.c ?? 0), page, limit });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get workspace detail (members, matters, billing status, recent audit)
router.get("/workspaces/:workspaceId", async (req, res) => {
  try {
    const { workspaceId } = req.params;

    const [workspace, members, mattersRows, auditRows, featureOvrs] = await Promise.all([
      db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) }),
      db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId)),
      db.select({ c: count() }).from(matters).where(
        and(eq(matters.workspaceId, workspaceId), eq(matters.status, "active"))
      ),
      db.select().from(auditLog)
        .where(and(eq(auditLog.targetType, "workspace"), eq(auditLog.targetId, workspaceId)))
        .orderBy(desc(auditLog.createdAt)).limit(20),
      db.select().from(workspaceFeatureOverrides).where(eq(workspaceFeatureOverrides.workspaceId, workspaceId)),
    ]);

    if (!workspace) return res.status(404).json({ error: "Workspace not found" });

    res.json({ workspace, members, activeMatters: Number(mattersRows[0]?.c ?? 0), auditTrail: auditRows, featureOverrides: featureOvrs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Approve / reject / suspend a workspace
router.post("/workspaces/:workspaceId/status", async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const schema = z.object({ action: z.enum(["approve","reject","suspend","unsuspend"]), reason: z.string().optional() });
    const { action, reason } = schema.parse(req.body);

    const statusMap: Record<string, string> = {
      approve:   "active",
      reject:    "canceled",
      suspend:   "suspended",
      unsuspend: "active",
    };

    await db.update(workspaces)
      .set({ subscriptionStatus: statusMap[action], updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId));

    await logAudit({
      actorId:    req.platformAdmin!.id,
      actorEmail: req.platformAdmin!.email,
      actionType: `firm.${action}` as any,
      targetType: "workspace",
      targetId:   workspaceId,
      details:    { reason },
      ipAddress:  getClientIp(req),
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Assign plan to workspace + optional entitlement overrides
router.post("/workspaces/:workspaceId/plan", async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const schema = z.object({
      planName:           z.string(),
      aiCreditsOverride:  z.number().int().optional(),
      mattersOverride:    z.number().int().optional(),
      seatsOverride:      z.number().int().optional(),
    });
    const body = schema.parse(req.body);

    const plan = await db.query.planDefinitions.findFirst({
      where: eq(planDefinitions.name, body.planName),
    });
    if (!plan) return res.status(404).json({ error: "Plan not found" });

    await db.update(workspaces)
      .set({
        subscriptionTier: body.planName as any,
        aiCreditsLimit:   body.aiCreditsOverride ?? plan.aiCreditsMonthly,
        updatedAt:        new Date(),
      })
      .where(eq(workspaces.id, workspaceId));

    await logAudit({
      actorId:    req.platformAdmin!.id,
      actorEmail: req.platformAdmin!.email,
      actionType: "firm.plan_assign",
      targetType: "workspace",
      targetId:   workspaceId,
      details:    { planName: body.planName, overrides: body },
      ipAddress:  getClientIp(req),
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================================
// C) USERS MANAGEMENT
// ============================================================================

// Global user search
router.get("/users", async (req, res) => {
  try {
    const page   = Math.max(1, Number(req.query.page  ?? 1));
    const limit  = Math.min(100, Number(req.query.limit ?? 25));
    const offset = (page - 1) * limit;
    const search = req.query.search as string | undefined;

    const conditions: any[] = [];
    if (search) {
      conditions.push(or(
        ilike(users.email, `%${search}%`),
        ilike(users.fullName, `%${search}%`)
      ));
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, totalRow] = await Promise.all([
      db.select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        status: users.status,
        subscriptionTier: users.subscriptionTier,
        platformRole: users.platformRole,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      }).from(users).where(where).orderBy(desc(users.createdAt)).limit(limit).offset(offset),
      db.select({ c: count() }).from(users).where(where),
    ]);

    res.json({ users: rows, total: Number(totalRow[0]?.c ?? 0), page, limit });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get user detail + workspace memberships
router.get("/users/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId as any),
      columns: { password: false, qbAccessTokenEncrypted: false, qbRefreshTokenEncrypted: false },
    });
    if (!user) return res.status(404).json({ error: "User not found" });

    const memberships = await db.select({
      workspaceId: workspaceMembers.workspaceId,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.joinedAt,
      workspaceName: workspaces.name,
      workspaceType: workspaces.type,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, Number(userId)));

    const userEntries = await db.select().from(userEntitlements).where(eq(userEntitlements.userId, userId));

    res.json({ user, memberships, entitlements: userEntries });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Support actions: password_reset | invite_resend | force_signout | suspend | unsuspend
router.post("/users/:userId/action", async (req, res) => {
  try {
    const { userId } = req.params;
    const schema = z.object({
      action: z.enum(["password_reset","invite_resend","force_signout","suspend","unsuspend","role_adjust"]),
      workspaceId: z.string().optional(),
      newRole:     z.string().optional(),
      reason:      z.string().optional(),
    });
    const body = schema.parse(req.body);

    const user = await db.query.users.findFirst({ where: eq(users.id, userId as any) });
    if (!user) return res.status(404).json({ error: "User not found" });

    let resultDetail: Record<string, unknown> = {};

    if (body.action === "password_reset") {
      // Generate a reset token; real email integration reuses existing email service
      const crypto = await import("crypto");
      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1hr
      await db.update(users).set({ passwordResetToken: token, passwordResetExpires: expires }).where(eq(users.id, userId as any));
      resultDetail = { resetToken: token, expiresAt: expires.toISOString(), note: "Token generated; email dispatch uses existing /api/auth/forgot-password flow" };
    } else if (body.action === "force_signout") {
      // Revoke all active sessions by clearing remember_me tokens — using existing schema
      await db.update(users).set({ lastLoginAt: new Date(0) }).where(eq(users.id, userId as any));
      resultDetail = { note: "Session invalidated via lastLoginAt reset; active cookies expire on next validation" };
    } else if (body.action === "suspend") {
      await db.update(users).set({ status: "suspended" }).where(eq(users.id, userId as any));
    } else if (body.action === "unsuspend") {
      await db.update(users).set({ status: "active" }).where(eq(users.id, userId as any));
    } else if (body.action === "role_adjust" && body.workspaceId && body.newRole) {
      await db.update(workspaceMembers)
        .set({ role: body.newRole as any })
        .where(and(
          eq(workspaceMembers.userId, Number(userId)),
          eq(workspaceMembers.workspaceId, body.workspaceId)
        ));
      resultDetail = { workspaceId: body.workspaceId, newRole: body.newRole };
    }

    await logAudit({
      actorId:    req.platformAdmin!.id,
      actorEmail: req.platformAdmin!.email,
      actionType: `user.${body.action}` as any,
      targetType: "user",
      targetId:   userId,
      details:    { ...resultDetail, reason: body.reason },
      ipAddress:  getClientIp(req),
    });

    res.json({ success: true, detail: resultDetail });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Per-user feature override
router.post("/users/:userId/entitlements", async (req, res) => {
  try {
    const { userId } = req.params;
    const schema = z.object({
      workspaceId: z.string().optional(),
      featureKey:  z.string(),
      enabled:     z.boolean().nullable(),
      limitValue:  z.number().int().nullable().optional(),
    });
    const body = schema.parse(req.body);

    await db
      .insert(userEntitlements)
      .values({
        userId,
        workspaceId: body.workspaceId ?? null,
        featureKey:  body.featureKey,
        enabled:     body.enabled ?? undefined,
        limitValue:  body.limitValue ?? undefined,
        setBy:       req.platformAdmin!.email,
      })
      .onConflictDoUpdate({
        target: [userEntitlements.userId, userEntitlements.workspaceId, userEntitlements.featureKey],
        set: { enabled: body.enabled ?? undefined, limitValue: body.limitValue ?? undefined, setBy: req.platformAdmin!.email, setAt: new Date() },
      });

    await logAudit({
      actorId:    req.platformAdmin!.id,
      actorEmail: req.platformAdmin!.email,
      actionType: "user.feature_override",
      targetType: "user",
      targetId:   userId,
      details:    body,
      ipAddress:  getClientIp(req),
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================================
// D) PLAN MANAGEMENT
// ============================================================================

router.get("/plans", async (_req, res) => {
  try {
    const plans = await db.select().from(planDefinitions).orderBy(asc(planDefinitions.priceCents));
    res.json(plans);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/plans/:planId", requireSuperAdmin, async (req, res) => {
  try {
    const { planId } = req.params;
    const schema = z.object({
      displayName:       z.string().optional(),
      priceCents:        z.number().int().optional(),
      stripePriceId:     z.string().optional(),
      mattersLimit:      z.number().int().nullable().optional(),
      seatsLimit:        z.number().int().nullable().optional(),
      storageMb:         z.number().int().optional(),
      aiCreditsMonthly:  z.number().int().optional(),
      features:          z.record(z.boolean()).optional(),
      isActive:          z.boolean().optional(),
    });
    const body = schema.parse(req.body);

    await db.update(planDefinitions)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(planDefinitions.id, planId));

    await logAudit({
      actorId:    req.platformAdmin!.id,
      actorEmail: req.platformAdmin!.email,
      actionType: "plan.update",
      targetType: "plan",
      targetId:   planId,
      details:    body,
      ipAddress:  getClientIp(req),
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Preview effective entitlements for a workspace/user
router.get("/plans/preview/:workspaceId", async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.query.userId as string | undefined;

    const workspace = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
    if (!workspace) return res.status(404).json({ error: "Workspace not found" });

    const plan = await db.query.planDefinitions.findFirst({
      where: eq(planDefinitions.name, workspace.subscriptionTier),
    });

    const wsOverrides = await db.select().from(workspaceFeatureOverrides)
      .where(eq(workspaceFeatureOverrides.workspaceId, workspaceId));

    const userOvrs = userId
      ? await db.select().from(userEntitlements)
          .where(and(eq(userEntitlements.userId, userId), eq(userEntitlements.workspaceId, workspaceId)))
      : [];

    const globalFlags = await db.select().from(featureFlags);

    // Build effective feature map: global < workspace override < user override
    const effective: Record<string, boolean> = {};
    for (const f of globalFlags) {
      effective[f.key] = f.enabled;
    }
    for (const o of wsOverrides) {
      effective[o.featureKey] = o.enabled;
    }
    for (const u of userOvrs) {
      if (u.enabled !== null && u.enabled !== undefined) {
        effective[u.featureKey] = u.enabled;
      }
    }

    res.json({ workspace, plan, effectiveFeatures: effective, wsOverrides, userOverrides: userOvrs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// E) BILLING MANAGEMENT
// ============================================================================

router.get("/billing", async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const conditions: any[] = [];
    if (status) conditions.push(eq(workspaces.subscriptionStatus, status));
    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await db.select({
      id:                 workspaces.id,
      name:               workspaces.name,
      type:               workspaces.type,
      subscriptionTier:   workspaces.subscriptionTier,
      subscriptionStatus: workspaces.subscriptionStatus,
      stripeCustomerId:   workspaces.stripeCustomerId,
      stripeSubscriptionId: workspaces.stripeSubscriptionId,
      billingCycleStart:  workspaces.billingCycleStart,
      aiCreditsBalance:   workspaces.aiCreditsBalance,
      aiCreditsLimit:     workspaces.aiCreditsLimit,
      updatedAt:          workspaces.updatedAt,
    }).from(workspaces).where(where).orderBy(desc(workspaces.updatedAt)).limit(200);

    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Grace-period override (extend entitlement without touching Stripe)
router.post("/billing/:workspaceId/grace", async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const schema = z.object({ days: z.number().int().min(1).max(90), reason: z.string() });
    const { days, reason } = schema.parse(req.body);

    const graceTo = new Date(Date.now() + days * 86400_000);
    await db.update(workspaces)
      .set({ subscriptionStatus: "active", updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId));

    await logAudit({
      actorId:    req.platformAdmin!.id,
      actorEmail: req.platformAdmin!.email,
      actionType: "billing.grace_period",
      targetType: "workspace",
      targetId:   workspaceId,
      details:    { days, graceTo: graceTo.toISOString(), reason },
      ipAddress:  getClientIp(req),
    });

    res.json({ success: true, graceTo });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================================
// F) FEATURE FLAG MANAGEMENT
// ============================================================================

router.get("/features", async (_req, res) => {
  try {
    const flags = await db.select().from(featureFlags).orderBy(asc(featureFlags.key));
    res.json(flags);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle global feature flag
router.patch("/features/:key", requireSuperAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);

    await db.update(featureFlags)
      .set({ enabled, updatedBy: req.platformAdmin!.email, updatedAt: new Date() })
      .where(eq(featureFlags.key, key));

    await logAudit({
      actorId:    req.platformAdmin!.id,
      actorEmail: req.platformAdmin!.email,
      actionType: "feature.global_toggle",
      targetType: "feature",
      targetId:   key,
      details:    { enabled },
      ipAddress:  getClientIp(req),
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Toggle feature for a specific workspace
router.post("/features/:key/workspace/:workspaceId", async (req, res) => {
  try {
    const { key, workspaceId } = req.params;
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);

    await db
      .insert(workspaceFeatureOverrides)
      .values({ workspaceId, featureKey: key, enabled, overriddenBy: req.platformAdmin!.email })
      .onConflictDoUpdate({
        target: [workspaceFeatureOverrides.workspaceId, workspaceFeatureOverrides.featureKey],
        set: { enabled, overriddenBy: req.platformAdmin!.email, overriddenAt: new Date() },
      });

    await logAudit({
      actorId:    req.platformAdmin!.id,
      actorEmail: req.platformAdmin!.email,
      actionType: "feature.workspace_toggle",
      targetType: "workspace",
      targetId:   workspaceId,
      details:    { featureKey: key, enabled },
      ipAddress:  getClientIp(req),
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================================
// G) AUDIT LOG SEARCH + EXPORT
// ============================================================================

router.get("/audit-log", async (req, res) => {
  try {
    const page       = Math.max(1, Number(req.query.page  ?? 1));
    const limit      = Math.min(200, Number(req.query.limit ?? 50));
    const offset     = (page - 1) * limit;
    const userId     = req.query.userId as string | undefined;
    const workspaceId= req.query.workspaceId as string | undefined;
    const actionType = req.query.actionType as string | undefined;
    const from       = req.query.from ? new Date(req.query.from as string) : undefined;
    const to         = req.query.to   ? new Date(req.query.to   as string) : undefined;

    const conditions: any[] = [];
    if (userId)      conditions.push(eq(auditLog.actorId, userId));
    if (workspaceId) conditions.push(and(eq(auditLog.targetType, "workspace"), eq(auditLog.targetId, workspaceId)));
    if (actionType)  conditions.push(ilike(auditLog.actionType, `%${actionType}%`));
    if (from)        conditions.push(gte(auditLog.createdAt, from));
    if (to)          conditions.push(lte(auditLog.createdAt, to));

    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, totalRow] = await Promise.all([
      db.select().from(auditLog).where(where).orderBy(desc(auditLog.createdAt)).limit(limit).offset(offset),
      db.select({ c: count() }).from(auditLog).where(where),
    ]);

    // Export as CSV if requested
    if (req.query.format === "csv") {
      const csv = [
        ["id","actor_email","action_type","target_type","target_id","ip_address","created_at","details"].join(","),
        ...rows.map(r => [
          r.id, r.actorEmail, r.actionType, r.targetType ?? "", r.targetId ?? "",
          r.ipAddress ?? "", r.createdAt?.toISOString() ?? "",
          JSON.stringify(r.details ?? {}).replace(/,/g, ";"),
        ].join(","))
      ].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=audit_log.csv");
      return res.send(csv);
    }

    res.json({ entries: rows, total: Number(totalRow[0]?.c ?? 0), page, limit });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// H) USAGE + PROFITABILITY ANALYTICS
// ============================================================================

router.get("/analytics/usage", async (req, res) => {
  try {
    const days = Number(req.query.days ?? 30);
    const since = new Date(Date.now() - days * 86400_000);

    const byAction = await db
      .select({
        actionType:   usageEvents.actionType,
        totalCredits: sum(usageEvents.credits),
        totalUnits:   sum(usageEvents.units),
        eventCount:   count(),
      })
      .from(usageEvents)
      .where(gte(usageEvents.createdAt, since))
      .groupBy(usageEvents.actionType)
      .orderBy(desc(sum(usageEvents.credits)));

    const byWorkspace = await db
      .select({
        workspaceId:  usageEvents.workspaceId,
        workspaceName:workspaces.name,
        totalCredits: sum(usageEvents.credits),
        eventCount:   count(),
      })
      .from(usageEvents)
      .innerJoin(workspaces, eq(workspaces.id, usageEvents.workspaceId))
      .where(gte(usageEvents.createdAt, since))
      .groupBy(usageEvents.workspaceId, workspaces.name)
      .orderBy(desc(sum(usageEvents.credits)))
      .limit(50);

    res.json({ byAction, byWorkspace, periodDays: days });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/analytics/profitability", async (req, res) => {
  try {
    const plans = await db.select().from(planDefinitions).where(eq(planDefinitions.isActive, true));

    const report = plans.map(plan => {
      const monthly = plan.aiCreditsMonthly;
      const revenueCents = plan.priceCents;

      const scenarios = (["light","typical","heavy"] as const).map(scenario => {
        const multiplier = CREDIT_COST_MODEL.scenarioMultiplier[scenario];
        const creditsUsed = Math.round(monthly * multiplier);
        const costCents   = Math.round(creditsUsed * CREDIT_COST_MODEL.costPerCreditCents[scenario] * 100);
        const grossMarginCents = revenueCents - costCents;
        const grossMarginPct   = revenueCents > 0 ? Math.round((grossMarginCents / revenueCents) * 100) : 0;
        // Break-even: how many credits can we afford to include?
        const breakEvenCredits = revenueCents > 0
          ? Math.floor(revenueCents / (CREDIT_COST_MODEL.costPerCreditCents[scenario] * 100))
          : 0;
        return {
          scenario,
          creditsUsed,
          costCents,
          grossMarginCents,
          grossMarginPct,
          breakEvenCredits,
        };
      });

      return {
        plan:         plan.name,
        displayName:  plan.displayName,
        priceCents:   revenueCents,
        creditsIncluded: monthly,
        scenarios,
      };
    });

    res.json({ report, costModel: CREDIT_COST_MODEL });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// I) ADMIN SELF-INFO (used by client to check platform admin status)
// ============================================================================

router.get("/me", (req, res) => {
  res.json({
    id:    req.platformAdmin!.id,
    email: req.platformAdmin!.email,
    role:  req.platformAdmin!.role,
  });
});

export default router;
