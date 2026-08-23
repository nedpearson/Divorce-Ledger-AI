import { Request, Response, NextFunction } from 'express';
import { and, eq, or } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '@shared/schema';
import type { PortalRole } from '@shared/portal-schema';

/**
 * Resolves the caller into a portal context: which claim owner's portal they are
 * looking at, and what role they hold in it.
 *
 * Resolution order:
 *   1. The caller IS an owner (has an active portal_members row with role 'owner')
 *      -> owner of their own portal.
 *   2. The caller is an active member of exactly one owner's portal
 *      -> that owner's portal, with the member's role.
 *   3. Otherwise -> 403.
 *
 * An explicit ?owner=<userId> narrows the choice when a caller belongs to more
 * than one portal.
 */

export interface PortalContext {
  ownerUserId: string;
  role: PortalRole;
  memberId: string | null;
  userId: string;
  environment: string;
}

declare global {
  namespace Express {
    interface Request {
      portal?: PortalContext;
    }
  }
}

export async function loadPortalContext(req: Request, res: Response, next: NextFunction) {
  try {
    const userId =
      (req as any).session?.userId || (req.user as any)?.id || (req.headers['x-user-id'] as string);

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const environment = (req.user as any)?.environment || 'demo';
    const requestedOwner = (req.query.owner as string) || undefined;

    const memberships = await db
      .select()
      .from(schema.portalMembers)
      .where(
        and(
          eq(schema.portalMembers.memberUserId, userId),
          eq(schema.portalMembers.status, 'active')
        )
      );

    let chosen = memberships.find((m) => m.role === 'owner');

    if (requestedOwner) {
      chosen = memberships.find((m) => m.ownerUserId === requestedOwner) || chosen;
    }

    if (!chosen && memberships.length === 1) {
      chosen = memberships[0];
    }

    if (!chosen) {
      if (memberships.length > 1) {
        return res.status(400).json({
          error: 'Multiple portals available — specify ?owner=<userId>',
          owners: memberships.map((m) => ({ ownerUserId: m.ownerUserId, role: m.role })),
        });
      }
      return res.status(403).json({ error: 'No portal access' });
    }

    req.portal = {
      ownerUserId: chosen.ownerUserId,
      role: chosen.role as PortalRole,
      memberId: chosen.id,
      userId,
      environment,
    };

    next();
  } catch (error) {
    console.error('[Portal Auth Error]', error);
    res.status(500).json({ error: 'Failed to resolve portal context' });
  }
}

/** Gate a route to one or more portal roles. Must run after loadPortalContext. */
export function requirePortalRole(...roles: PortalRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.portal) {
      return res.status(403).json({ error: 'No portal access' });
    }
    if (!roles.includes(req.portal.role)) {
      return res.status(403).json({
        error: `This action requires role: ${roles.join(' or ')}`,
        yourRole: req.portal.role,
      });
    }
    next();
  };
}

/** Append-only settlement record. Never throws into the request path. */
export async function portalAudit(
  req: Request,
  entry: {
    action: string;
    targetType?: string;
    targetId?: string;
    summary?: string;
    metadata?: Record<string, unknown>;
  }
) {
  try {
    const ctx = req.portal;
    if (!ctx) return;
    await db.insert(schema.portalAuditLog).values({
      ownerUserId: ctx.ownerUserId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      summary: entry.summary,
      metadata: entry.metadata as any,
      ipAddress: (req.headers['x-forwarded-for'] as string) || req.ip,
      environment: ctx.environment,
    });
  } catch (error) {
    console.error('[Portal Audit Error]', error);
  }
}
