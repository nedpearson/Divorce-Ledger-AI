import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { workspaces, workspaceMembers, matterMembers, matters } from '@shared/workspace-schema';
import { eq, and } from 'drizzle-orm';
import type { WorkspaceContext, MatterContext } from '@shared/workspace-schema';

// Extend Express Request type to include workspace context
declare global {
  namespace Express {
    interface Request {
      workspace?: WorkspaceContext;
      matter?: MatterContext;
    }
  }
}

/**
 * Middleware to load workspace context from header or route params
 * Verifies user has access to the workspace
 */
export const loadWorkspaceContext = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Get workspace ID from route params or body
  const workspaceId = req.params.workspaceId || req.body.workspaceId || req.query.workspaceId;

  if (!workspaceId) {
    return res.status(400).json({ error: 'Workspace ID required' });
  }

  try {
    // Check if user is a member of the workspace
    const member = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, workspaceId as string),
        eq(workspaceMembers.userId, req.user.id)
      ),
      with: {
        workspace: true,
      },
    });

    if (!member) {
      return res.status(403).json({ error: 'Access denied to workspace' });
    }

    // Attach workspace context to request
    req.workspace = {
      id: workspaceId as string,
      role: member.role,
      type: member.workspace.type,
      subscriptionTier: member.workspace.subscriptionTier,
    };

    next();
  } catch (error) {
    console.error('Error loading workspace context:', error);
    res.status(500).json({ error: 'Failed to load workspace context' });
  }
};

/**
 * Middleware to require specific workspace roles
 */
export const requireWorkspaceRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.workspace) {
      return res.status(403).json({ error: 'Workspace context required' });
    }

    if (!allowedRoles.includes(req.workspace.role)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: req.workspace.role,
      });
    }

    next();
  };
};

/**
 * Middleware to require workspace type (consumer vs firm)
 */
export const requireWorkspaceType = (requiredType: 'consumer' | 'firm') => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.workspace) {
      return res.status(403).json({ error: 'Workspace context required' });
    }

    if (req.workspace.type !== requiredType) {
      return res.status(403).json({
        error: `This feature is only available for ${requiredType} workspaces`,
      });
    }

    next();
  };
};

/**
 * Middleware to load matter context and verify access
 */
export const loadMatterContext = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const matterId = req.params.matterId || req.body.matterId;

  if (!matterId) {
    return res.status(400).json({ error: 'Matter ID required' });
  }

  try {
    // Check if user is a matter member
    const member = await db.query.matterMembers.findFirst({
      where: and(
        eq(matterMembers.matterId, matterId as string),
        eq(matterMembers.userId, req.user.id)
      ),
      with: {
        matter: true,
      },
    });

    if (member) {
      // User is a direct matter member
      req.matter = {
        id: matterId as string,
        workspaceId: member.matter.workspaceId,
        role: member.role,
        permissions: member.permissions,
      };
      next();
      return;
    }

    // Check if user is a workspace member (staff can access all matters)
    const matter = await db.query.matters.findFirst({
      where: eq(matters.id, matterId as string),
    });

    if (!matter) {
      return res.status(404).json({ error: 'Matter not found' });
    }

    const workspaceMember = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, matter.workspaceId),
        eq(workspaceMembers.userId, req.user.id)
      ),
    });

    if (!workspaceMember || !['owner', 'admin', 'staff'].includes(workspaceMember.role)) {
      return res.status(403).json({ error: 'Access denied to matter' });
    }

    // Workspace staff has full access
    req.matter = {
      id: matterId as string,
      workspaceId: matter.workspaceId,
      role: 'attorney', // Treat staff as attorneys
      permissions: {
        can_view: true,
        can_upload: true,
        can_comment: true,
        can_edit: true,
      },
    };

    next();
  } catch (error) {
    console.error('Error loading matter context:', error);
    res.status(500).json({ error: 'Failed to load matter context' });
  }
};

/**
 * Middleware to require specific matter permissions
 */
export const requireMatterPermission = (permission: keyof MatterContext['permissions']) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.matter) {
      return res.status(403).json({ error: 'Matter context required' });
    }

    if (!req.matter.permissions[permission]) {
      return res.status(403).json({
        error: `Permission denied: ${permission}`,
      });
    }

    next();
  };
};

/**
 * Middleware to check entitlements before action
 */
export const checkEntitlement = (action: 'create_matter' | 'add_seat' | 'consume_ai_credits' | 'upload_file') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.workspace) {
      return res.status(403).json({ error: 'Workspace context required' });
    }

    try {
      const { resolveEntitlements, canPerformAction } = await import('../services/entitlements.service');

      const entitlements = await resolveEntitlements(req.workspace.id);
      const check = canPerformAction(entitlements, action);

      if (!check.allowed) {
        return res.status(402).json({
          error: 'Entitlement limit reached',
          reason: check.reason,
          tier: req.workspace.subscriptionTier,
        });
      }

      next();
    } catch (error) {
      console.error('Error checking entitlement:', error);
      res.status(500).json({ error: 'Failed to check entitlement' });
    }
  };
};

/**
 * Convenience middleware combos
 */
export const requireWorkspaceOwner = [
  loadWorkspaceContext,
  requireWorkspaceRole(['owner']),
];

export const requireWorkspaceAdmin = [
  loadWorkspaceContext,
  requireWorkspaceRole(['owner', 'admin']),
];

export const requireWorkspaceStaff = [
  loadWorkspaceContext,
  requireWorkspaceRole(['owner', 'admin', 'staff']),
];

export const requireFirmWorkspace = [
  loadWorkspaceContext,
  requireWorkspaceType('firm'),
];

export const requireConsumerWorkspace = [
  loadWorkspaceContext,
  requireWorkspaceType('consumer'),
];
