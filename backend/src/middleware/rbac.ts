import { FastifyRequest, FastifyReply } from 'fastify';
import { supabaseService } from '../supabase/clientService.js';
import { ForbiddenError } from '../errors/AppError.js';
import { logger } from '../logging/logger.js';

// Extend FastifyRequest to include workspace context
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      user_metadata?: Record<string, any>;
    };
    workspace?: {
      id: string;
      type: 'firm' | 'consumer';
      role: string;
      status: string;
    };
    platformRole?: 'super_admin' | 'support_admin' | null;
  }
}

/**
 * Workspace context middleware
 * Loads workspace context from header and attaches to request
 */
export async function workspaceMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.user) {
    throw new ForbiddenError('User not authenticated');
  }

  const workspaceId = request.headers['x-workspace-id'] as string;

  if (!workspaceId) {
    // No workspace context required for this route
    return;
  }

  try {
    // Load workspace membership
    const { data: membership, error } = await supabaseService
      .from('active_workspace_memberships')
      .select('workspace_id, workspace_type, workspace_status, role')
      .eq('user_id', request.user.id)
      .eq('workspace_id', workspaceId)
      .single();

    if (error || !membership) {
      throw new ForbiddenError('Access denied to workspace');
    }

    // Check workspace status
    if (membership.workspace_status === 'suspended') {
      throw new ForbiddenError('Workspace is suspended');
    }

    if (membership.workspace_status === 'pending') {
      throw new ForbiddenError('Workspace is pending approval');
    }

    request.workspace = {
      id: membership.workspace_id,
      type: membership.workspace_type as 'firm' | 'consumer',
      role: membership.role,
      status: membership.workspace_status,
    };

    logger.debug(
      {
        userId: request.user.id,
        workspaceId: membership.workspace_id,
        role: membership.role,
      },
      'Workspace context loaded'
    );
  } catch (err) {
    logger.warn({ error: err, workspaceId }, 'Failed to load workspace context');
    throw err;
  }
}

/**
 * Platform role middleware
 * Loads platform role and attaches to request
 */
export async function platformRoleMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.user) {
    throw new ForbiddenError('User not authenticated');
  }

  try {
    const { data: profile, error } = await supabaseService
      .from('profiles')
      .select('platform_role')
      .eq('id', request.user.id)
      .single();

    if (error) {
      throw error;
    }

    request.platformRole = profile?.platform_role || null;

    logger.debug(
      {
        userId: request.user.id,
        platformRole: request.platformRole,
      },
      'Platform role loaded'
    );
  } catch (err) {
    logger.warn({ error: err }, 'Failed to load platform role');
    throw new ForbiddenError('Failed to verify permissions');
  }
}

/**
 * Require platform admin role
 */
export function requirePlatformAdmin(allowSupportAdmin: boolean = true) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.platformRole) {
      await platformRoleMiddleware(request, reply);
    }

    const allowedRoles = allowSupportAdmin ? ['super_admin', 'support_admin'] : ['super_admin'];

    if (!request.platformRole || !allowedRoles.includes(request.platformRole)) {
      throw new ForbiddenError('Platform admin access required');
    }
  };
}

/**
 * Require specific workspace role
 */
export function requireWorkspaceRole(roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.workspace) {
      throw new ForbiddenError('Workspace context required');
    }

    if (!roles.includes(request.workspace.role)) {
      throw new ForbiddenError(`Required role: ${roles.join(' or ')}`);
    }
  };
}

/**
 * Require firm workspace
 */
export function requireFirmWorkspace() {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.workspace) {
      throw new ForbiddenError('Workspace context required');
    }

    if (request.workspace.type !== 'firm') {
      throw new ForbiddenError('Firm workspace required');
    }
  };
}

/**
 * Require consumer workspace
 */
export function requireConsumerWorkspace() {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.workspace) {
      throw new ForbiddenError('Workspace context required');
    }

    if (request.workspace.type !== 'consumer') {
      throw new ForbiddenError('Consumer workspace required');
    }
  };
}
