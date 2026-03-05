import { Router } from 'express';
import { requireAuth } from '../middleware/authz';
import {
  loadWorkspaceContext,
  requireWorkspaceOwner,
  requireWorkspaceAdmin,
  requireWorkspaceStaff,
  requireFirmWorkspace,
  checkEntitlement,
} from '../middleware/workspace-auth';
import {
  createCheckoutSession,
  createCustomerPortalSession,
  getWorkspaceBillingSummary,
} from '../services/workspace-billing.service';
import { resolveEntitlements } from '../services/entitlements.service';
import { getAICreditBalance, getAICreditHistory } from '../services/ai-credits.service';
import { db } from '../db';
import { workspaces, workspaceMembers, matters, matterMembers, invitations } from '@shared/workspace-schema';
import { eq, and, or, sql } from 'drizzle-orm';
import crypto from 'crypto';

const router = Router();

// ============================================================================
// BILLING ROUTES
// ============================================================================

/**
 * POST /api/billing/checkout
 * Create Stripe Checkout session for subscription
 */
router.post('/billing/checkout', requireAuth, async (req, res) => {
  try {
    const { planId, workspaceType } = req.body;

    if (!planId || !workspaceType) {
      return res.status(400).json({ error: 'planId and workspaceType required' });
    }

    const { checkoutUrl, workspaceId } = await createCheckoutSession(
      req.user!.id,
      planId,
      workspaceType
    );

    res.json({ checkoutUrl, workspaceId });
  } catch (error: any) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: error.message || 'Failed to create checkout session' });
  }
});

/**
 * POST /api/billing/portal
 * Create Stripe Customer Portal session
 */
router.post('/billing/portal', requireAuth, loadWorkspaceContext, async (req, res) => {
  try {
    const workspaceId = req.workspace!.id;

    const { portalUrl } = await createCustomerPortalSession(
      req.user!.id,
      workspaceId
    );

    res.json({ portalUrl });
  } catch (error: any) {
    console.error('Error creating portal session:', error);
    res.status(500).json({ error: error.message || 'Failed to create portal session' });
  }
});

/**
 * GET /api/workspaces/:workspaceId/billing
 * Get workspace billing summary
 */
router.get('/workspaces/:workspaceId/billing', requireAuth, loadWorkspaceContext, async (req, res) => {
  try {
    const summary = await getWorkspaceBillingSummary(req.workspace!.id);
    res.json(summary);
  } catch (error: any) {
    console.error('Error getting billing summary:', error);
    res.status(500).json({ error: error.message || 'Failed to get billing summary' });
  }
});

/**
 * GET /api/workspaces/:workspaceId/entitlements
 * Get workspace entitlements and usage
 */
router.get('/workspaces/:workspaceId/entitlements', requireAuth, loadWorkspaceContext, async (req, res) => {
  try {
    const entitlements = await resolveEntitlements(req.workspace!.id);
    res.json(entitlements);
  } catch (error: any) {
    console.error('Error getting entitlements:', error);
    res.status(500).json({ error: error.message || 'Failed to get entitlements' });
  }
});

/**
 * GET /api/workspaces/:workspaceId/ai-credits
 * Get AI credits balance and history
 */
router.get('/workspaces/:workspaceId/ai-credits', requireAuth, loadWorkspaceContext, async (req, res) => {
  try {
    const balance = await getAICreditBalance(req.workspace!.id);
    const history = await getAICreditHistory(req.workspace!.id, 20);

    res.json({ balance, history });
  } catch (error: any) {
    console.error('Error getting AI credits:', error);
    res.status(500).json({ error: error.message || 'Failed to get AI credits' });
  }
});

// ============================================================================
// WORKSPACE ROUTES
// ============================================================================

/**
 * GET /api/workspaces
 * @deprecated Migrated to Python Core ('/python_api/app/api/endpoints/workspaces.py')
 */
router.get('/workspaces', requireAuth, async (req, res) => {
  try {
    const userWorkspaces = await db.query.workspaceMembers.findMany({
      where: eq(workspaceMembers.userId, req.user!.id),
      with: {
        workspace: true,
      },
    });

    res.json(userWorkspaces.map(m => ({
      ...(m.workspace as any),
      role: m.role,
      joinedAt: m.joinedAt,
    })));
  } catch (error: any) {
    console.error('Error getting workspaces:', error);
    res.status(500).json({ error: 'Failed to get workspaces' });
  }
});

/**
 * POST /api/workspaces
 * @deprecated Migrated to Python Core 
 */
router.post('/workspaces', requireAuth, async (req, res) => {
  try {
    const { name, type } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'name and type required' });
    }

    const [workspace] = await db
      .insert(workspaces)
      .values({
        name,
        type,
        ownerId: req.user!.id,
        subscriptionTier: 'free',
        aiCreditsBalance: 100,
        aiCreditsLimit: 100,
      })
      .returning();

    // Add user as owner
    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: req.user!.id,
      role: 'owner',
    });

    res.json(workspace);
  } catch (error: any) {
    console.error('Error creating workspace:', error);
    res.status(500).json({ error: 'Failed to create workspace' });
  }
});

/**
 * GET /api/workspaces/:workspaceId
 * @deprecated Migrated to Python Core
 */
router.get('/workspaces/:workspaceId', requireAuth, loadWorkspaceContext, async (req, res) => {
  try {
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, req.workspace!.id),
    });

    res.json(workspace);
  } catch (error: any) {
    console.error('Error getting workspace:', error);
    res.status(500).json({ error: 'Failed to get workspace' });
  }
});

/**
 * PATCH /api/workspaces/:workspaceId
 * Update workspace settings
 */
router.patch('/workspaces/:workspaceId', ...requireWorkspaceAdmin, async (req, res) => {
  try {
    const { name, settings } = req.body;

    const [updated] = await db
      .update(workspaces)
      .set({
        ...(name && { name }),
        ...(settings && { settings }),
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, req.workspace!.id))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error('Error updating workspace:', error);
    res.status(500).json({ error: 'Failed to update workspace' });
  }
});

// ============================================================================
// WORKSPACE MEMBERS ROUTES
// ============================================================================

/**
 * GET /api/workspaces/:workspaceId/members
 * Get workspace members
 */
router.get('/workspaces/:workspaceId/members', requireAuth, loadWorkspaceContext, async (req, res) => {
  try {
    const members = await db.query.workspaceMembers.findMany({
      where: eq(workspaceMembers.workspaceId, req.workspace!.id),
      with: {
        user: true,
      },
    });

    res.json(members);
  } catch (error: any) {
    console.error('Error getting members:', error);
    res.status(500).json({ error: 'Failed to get members' });
  }
});

/**
 * DELETE /api/workspaces/:workspaceId/members/:userId
 * Remove member from workspace
 */
router.delete('/workspaces/:workspaceId/members/:userId', ...requireWorkspaceAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    await db
      .delete(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, req.workspace!.id),
          eq(workspaceMembers.userId, userId)
        )
      );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error removing member:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// ============================================================================
// MATTERS ROUTES (Firm Only)
// ============================================================================

/**
 * GET /api/workspaces/:workspaceId/matters
 * List matters (firm only)
 */
router.get('/workspaces/:workspaceId/matters', ...requireFirmWorkspace, async (req, res) => {
  try {
    const mattersList = await db.query.matters.findMany({
      where: and(
        eq(matters.workspaceId, req.workspace!.id),
        sql`${matters.status} != 'archived'`
      ),
      orderBy: (matters, { desc }) => [desc(matters.createdAt)],
    });

    res.json(mattersList);
  } catch (error: any) {
    console.error('Error getting matters:', error);
    res.status(500).json({ error: 'Failed to get matters' });
  }
});

/**
 * POST /api/workspaces/:workspaceId/matters
 * Create new matter (firm only)
 */
router.post(
  '/workspaces/:workspaceId/matters',
  ...requireFirmWorkspace,
  requireWorkspaceStaff,
  checkEntitlement('create_matter'),
  async (req: any, res: any) => {
    try {
      const { matterNumber, title, description, leadAttorneyId } = req.body;

      if (!matterNumber || !title) {
        return res.status(400).json({ error: 'matterNumber and title required' });
      }

      const [matter] = await db
        .insert(matters)
        .values({
          workspaceId: req.workspace!.id,
          matterNumber,
          title,
          description,
          leadAttorneyId: leadAttorneyId || req.user!.id,
        })
        .returning();

      res.json(matter);
    } catch (error: any) {
      console.error('Error creating matter:', error);
      res.status(500).json({ error: 'Failed to create matter' });
    }
  }
);

/**
 * POST /api/matters/:matterId/invite
 * Invite client to matter
 */
router.post('/matters/:matterId/invite', requireAuth, async (req, res) => {
  try {
    const { matterId } = req.params;
    const { email, permissions } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'email required' });
    }

    // Get matter and verify access
    const matter = await db.query.matters.findFirst({
      where: eq(matters.id, matterId),
    });

    if (!matter) {
      return res.status(404).json({ error: 'Matter not found' });
    }

    // Verify user has access to matter's workspace
    const member = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, matter.workspaceId),
        eq(workspaceMembers.userId, req.user!.id),
        sql`role IN ('owner', 'admin', 'staff')`
      ),
    });

    if (!member) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Create invitation token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const [invitation] = await db
      .insert(invitations)
      .values({
        workspaceId: matter.workspaceId,
        matterId,
        email,
        role: 'client',
        invitedBy: req.user!.id,
        token,
        expiresAt,
      })
      .returning();

    // TODO: Send invitation email with token

    res.json(invitation);
  } catch (error: any) {
    console.error('Error creating invitation:', error);
    res.status(500).json({ error: 'Failed to create invitation' });
  }
});

export default router;
