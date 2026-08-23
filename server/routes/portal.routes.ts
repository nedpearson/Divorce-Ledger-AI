import { Router } from 'express';
import crypto from 'crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '@shared/schema';
import { requireAuth } from '../middleware/authz';
import { loadPortalContext, requirePortalRole, portalAudit } from '../middleware/portal-auth';
import {
  createDisputeBodySchema,
  resolveDisputeBodySchema,
  inviteMemberBodySchema,
} from '@shared/portal-schema';

export const portalRouter = Router();

// Every portal route is authenticated and resolved into a portal context first.
portalRouter.use(requireAuth, loadPortalContext);

// A dispute removes its contested amount from the net while it is OPEN or APPROVED.
const GATING_STATUSES = ['open', 'approved'] as const;

// ==========================================
// GET /api/portal/context — who am I here
// ==========================================
portalRouter.get('/context', async (req, res) => {
  const ctx = req.portal!;
  res.json({
    ownerUserId: ctx.ownerUserId,
    role: ctx.role,
    memberId: ctx.memberId,
    can: {
      fileDisputes: ctx.role === 'disputer' || ctx.role === 'owner',
      resolveDisputes: ctx.role === 'owner',
      inviteMembers: ctx.role === 'owner',
      viewAudit: true,
    },
  });
});

// ==========================================
// GET /api/portal/summary — statement + net-due gate
// ==========================================
portalRouter.get('/summary', async (req, res) => {
  try {
    const ctx = req.portal!;

    const lines = await db
      .select()
      .from(schema.reimbursements)
      .where(eq(schema.reimbursements.userId, ctx.ownerUserId))
      .orderBy(desc(schema.reimbursements.createdAt));

    const disputes = await db
      .select()
      .from(schema.portalDisputes)
      .where(
        and(
          eq(schema.portalDisputes.ownerUserId, ctx.ownerUserId),
          inArray(schema.portalDisputes.status, [...GATING_STATUSES])
        )
      );

    const contestedByTarget = new Map<string, number>();
    for (const d of disputes) {
      contestedByTarget.set(
        d.targetId,
        (contestedByTarget.get(d.targetId) || 0) + (d.contestedAmount || 0)
      );
    }

    let gross = 0;
    let contested = 0;

    const items = lines.map((line) => {
      const rawContested = contestedByTarget.get(line.id) || 0;
      // A dispute can never remove more than the line is worth.
      const lineContested = Math.min(rawContested, line.amount);
      gross += line.amount;
      contested += lineContested;
      return {
        id: line.id,
        category: line.category,
        description: line.description,
        amount: line.amount,
        owedBy: line.owedBy,
        status: line.status,
        dueDate: line.dueDate,
        notes: line.notes,
        createdAt: line.createdAt,
        contestedAmount: lineContested,
        countsTowardNet: line.amount - lineContested,
        hasOpenDispute: disputes.some((d) => d.targetId === line.id && d.status === 'open'),
      };
    });

    res.json({
      ownerUserId: ctx.ownerUserId,
      role: ctx.role,
      currency: 'USD',
      amountsIn: 'cents',
      totals: {
        gross,
        contested,
        net: gross - contested,
        lineCount: items.length,
        openDisputes: disputes.filter((d) => d.status === 'open').length,
        approvedDisputes: disputes.filter((d) => d.status === 'approved').length,
      },
      items,
    });
  } catch (error) {
    console.error('[Portal Summary Error]', error);
    res.status(500).json({ error: 'Failed to build portal summary' });
  }
});

// ==========================================
// GET /api/portal/disputes
// ==========================================
portalRouter.get('/disputes', async (req, res) => {
  try {
    const ctx = req.portal!;
    const status = req.query.status as string | undefined;

    const where = status
      ? and(
          eq(schema.portalDisputes.ownerUserId, ctx.ownerUserId),
          eq(schema.portalDisputes.status, status)
        )
      : eq(schema.portalDisputes.ownerUserId, ctx.ownerUserId);

    const rows = await db
      .select()
      .from(schema.portalDisputes)
      .where(where)
      .orderBy(desc(schema.portalDisputes.createdAt));

    res.json(rows);
  } catch (error) {
    console.error('[Portal Disputes Error]', error);
    res.status(500).json({ error: 'Failed to fetch disputes' });
  }
});

// ==========================================
// POST /api/portal/disputes — disputer or owner files against one line
// ==========================================
portalRouter.post('/disputes', requirePortalRole('disputer', 'owner'), async (req, res) => {
  try {
    const ctx = req.portal!;
    const parsed = createDisputeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid dispute', details: parsed.error.flatten() });
    }
    const body = parsed.data;

    // The line must belong to this portal's owner.
    const [line] = await db
      .select()
      .from(schema.reimbursements)
      .where(
        and(
          eq(schema.reimbursements.id, body.targetId),
          eq(schema.reimbursements.userId, ctx.ownerUserId)
        )
      );

    if (!line) {
      return res.status(404).json({ error: 'Charge not found on this portal' });
    }

    // Default to contesting the whole line; never more than the line is worth.
    const contestedAmount = Math.min(
      body.contestedAmount === undefined ? line.amount : body.contestedAmount,
      line.amount
    );

    const [dispute] = await db
      .insert(schema.portalDisputes)
      .values({
        ownerUserId: ctx.ownerUserId,
        raisedByUserId: ctx.userId,
        raisedByRole: ctx.role,
        targetType: body.targetType,
        targetId: body.targetId,
        kind: body.kind,
        contestedAmount,
        reason: body.reason,
        evidenceUrl: body.evidenceUrl,
        status: 'open',
        environment: ctx.environment,
      })
      .returning();

    await portalAudit(req, {
      action: body.kind === 'paid_claim' ? 'dispute.paid_claim' : 'dispute.create',
      targetType: body.targetType,
      targetId: body.targetId,
      summary: `${ctx.role} contested ${contestedAmount} cents on "${line.description}"`,
      metadata: { disputeId: dispute.id, contestedAmount, reason: body.reason },
    });

    res.status(201).json(dispute);
  } catch (error) {
    console.error('[Portal Create Dispute Error]', error);
    res.status(500).json({ error: 'Failed to file dispute' });
  }
});

// ==========================================
// POST /api/portal/disputes/:id/resolve — OWNER ONLY
// Nothing changes the net without the owner.
// ==========================================
portalRouter.post('/disputes/:id/resolve', requirePortalRole('owner'), async (req, res) => {
  try {
    const ctx = req.portal!;
    const parsed = resolveDisputeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid resolution', details: parsed.error.flatten() });
    }

    const disputeId = String(req.params.id);

    const [existing] = await db
      .select()
      .from(schema.portalDisputes)
      .where(
        and(
          eq(schema.portalDisputes.id, disputeId),
          eq(schema.portalDisputes.ownerUserId, ctx.ownerUserId)
        )
      );

    if (!existing) {
      return res.status(404).json({ error: 'Dispute not found' });
    }
    if (existing.status !== 'open') {
      return res.status(409).json({ error: `Dispute already ${existing.status}` });
    }

    const newStatus = parsed.data.action === 'approve' ? 'approved' : 'rejected';

    const [updated] = await db
      .update(schema.portalDisputes)
      .set({
        status: newStatus,
        resolvedByUserId: ctx.userId,
        resolutionNote: parsed.data.note,
        resolvedAt: new Date(),
      })
      .where(eq(schema.portalDisputes.id, existing.id))
      .returning();

    await portalAudit(req, {
      action: `dispute.${newStatus}`,
      targetType: existing.targetType,
      targetId: existing.targetId,
      summary: `Owner ${newStatus} a ${existing.contestedAmount}-cent dispute`,
      metadata: { disputeId: existing.id, note: parsed.data.note },
    });

    res.json(updated);
  } catch (error) {
    console.error('[Portal Resolve Dispute Error]', error);
    res.status(500).json({ error: 'Failed to resolve dispute' });
  }
});

// ==========================================
// GET /api/portal/members
// ==========================================
portalRouter.get('/members', async (req, res) => {
  try {
    const ctx = req.portal!;
    const rows = await db
      .select({
        id: schema.portalMembers.id,
        email: schema.portalMembers.email,
        displayName: schema.portalMembers.displayName,
        role: schema.portalMembers.role,
        status: schema.portalMembers.status,
        acceptedAt: schema.portalMembers.acceptedAt,
        createdAt: schema.portalMembers.createdAt,
      })
      .from(schema.portalMembers)
      .where(eq(schema.portalMembers.ownerUserId, ctx.ownerUserId))
      .orderBy(desc(schema.portalMembers.createdAt));

    res.json(rows);
  } catch (error) {
    console.error('[Portal Members Error]', error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// ==========================================
// POST /api/portal/members/invite — OWNER ONLY
// ==========================================
portalRouter.post('/members/invite', requirePortalRole('owner'), async (req, res) => {
  try {
    const ctx = req.portal!;
    const parsed = inviteMemberBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid invite', details: parsed.error.flatten() });
    }
    const { email, role, displayName } = parsed.data;

    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    // If the invitee already has an account, bind it now.
    const [existingUser] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email));

    const [member] = await db
      .insert(schema.portalMembers)
      .values({
        ownerUserId: ctx.ownerUserId,
        memberUserId: existingUser?.id ?? null,
        email,
        displayName,
        role,
        status: 'invited',
        inviteToken,
        inviteExpiresAt,
        invitedByUserId: ctx.userId,
        environment: ctx.environment,
      })
      .onConflictDoUpdate({
        target: [schema.portalMembers.ownerUserId, schema.portalMembers.email],
        set: { role, displayName, inviteToken, inviteExpiresAt, status: 'invited' },
      })
      .returning();

    await portalAudit(req, {
      action: 'member.invite',
      targetType: 'portal_member',
      targetId: member.id,
      summary: `Invited ${email} as ${role}`,
      metadata: { email, role },
    });

    // The token is returned so the caller can send the magic link. It is never logged.
    res.status(201).json({
      id: member.id,
      email: member.email,
      role: member.role,
      status: member.status,
      inviteToken,
      inviteExpiresAt,
    });
  } catch (error) {
    console.error('[Portal Invite Error]', error);
    res.status(500).json({ error: 'Failed to invite member' });
  }
});

// ==========================================
// GET /api/portal/audit — full settlement record, visible to all three roles
// ==========================================
portalRouter.get('/audit', async (req, res) => {
  try {
    const ctx = req.portal!;
    const limit = Math.min(Number(req.query.limit) || 200, 1000);

    const rows = await db
      .select()
      .from(schema.portalAuditLog)
      .where(eq(schema.portalAuditLog.ownerUserId, ctx.ownerUserId))
      .orderBy(desc(schema.portalAuditLog.createdAt))
      .limit(limit);

    res.json(rows);
  } catch (error) {
    console.error('[Portal Audit Fetch Error]', error);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

export default portalRouter;
