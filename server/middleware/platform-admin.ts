/**
 * server/middleware/platform-admin.ts
 *
 * Middleware to gate /api/superadmin/* routes.
 * Access is determined server-side by:
 *   1) Email allowlist (nedpearson@gmail.com)
 *   2) OR users.platform_role IN ('super_admin','support_admin')
 *
 * No client-side-only role check is trusted.
 */
import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { isPlatformAdmin, PLATFORM_ROLES } from '@shared/platform-admin-schema';
import type { PlatformRole } from '@shared/platform-admin-schema';
import { storage } from '../storage';

// Extend Express Request with platform admin context
declare global {
  namespace Express {
    interface Request {
      platformAdmin?: {
        id: string;
        email: string;
        role: PlatformRole;
      };
    }
  }
}

/**
 * requirePlatformAdmin
 * Hard-blocks any user that is not a verified platform admin.
 * Looks up the database record fresh on every request; does NOT trust
 * any client-supplied claim.
 */
export async function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    // Bridge newer cookie-based auth into req.user for platform admin checks
    if (!req.user?.id) {
      const cookies = (req as any).cookies as Record<string, string> | undefined;
      const sessionId = cookies?.session_id;

      if (!sessionId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const session = await storage.getSession(sessionId);
      if (!session || session.revokedAt !== null || new Date(session.expiresAt) <= new Date()) {
        return res.status(401).json({ error: 'Session expired' });
      }

      // Minimal req.user object so downstream middleware can operate
      req.user = {
        id: session.userId,
        isAdmin: false,
        environment: 'unknown',
      };
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, req.user.id as any),
      columns: { id: true, email: true, platformRole: true, status: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Account suspended' });
    }

    const isAdmin = isPlatformAdmin(user.email, user.platformRole);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Platform admin access required' });
    }

    // Determine effective role
    const role: PlatformRole = PLATFORM_ROLES.includes(user.platformRole as PlatformRole)
      ? (user.platformRole as PlatformRole)
      : 'super_admin'; // fallback for email-allowlisted user without DB role set

    req.platformAdmin = {
      id: String(user.id),
      email: user.email,
      role,
    };

    next();
  } catch (err) {
    console.error('[requirePlatformAdmin]', err);
    res.status(500).json({ error: 'Authorization check failed' });
  }
}

/**
 * requireSuperAdmin — stricter: only super_admin role
 */
export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  await requirePlatformAdmin(req, res, async () => {
    if (req.platformAdmin?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }
    next();
  });
}
