import { FastifyRequest } from 'fastify';
import { AuditService } from './AuditService.js';
import { supabaseService } from '../supabase/clientService.js';
import { logger } from '../logging/logger.js';

/**
 * Enhanced audit service for RBAC logging
 * Extends the existing AuditService with workspace and platform admin logging
 */
export class RBACuditService {
  /**
   * Log workspace-related action
   */
  static async logWorkspaceAction(
    request: FastifyRequest,
    action: string,
    workspaceId: string,
    changes?: Record<string, any>
  ): Promise<void> {
    try {
      await supabaseService.from('audit_log').insert({
        workspace_id: workspaceId,
        user_id: request.user?.id || 'unknown',
        actor_email: request.user?.email || 'unknown',
        is_platform_admin: !!request.platformRole,
        action,
        resource_type: 'workspace',
        resource_id: workspaceId,
        changes,
        ip_address: request.ip,
        user_agent: request.headers['user-agent'],
      });

      logger.info({ workspaceId, action }, 'Workspace action logged');
    } catch (error) {
      logger.error({ error, workspaceId, action }, 'Failed to log workspace action');
    }
  }

  /**
   * Log matter-related action
   */
  static async logMatterAction(
    request: FastifyRequest,
    action: string,
    matterId: string,
    changes?: Record<string, any>
  ): Promise<void> {
    try {
      await supabaseService.from('audit_log').insert({
        workspace_id: request.workspace?.id,
        user_id: request.user?.id || 'unknown',
        actor_email: request.user?.email || 'unknown',
        is_platform_admin: !!request.platformRole,
        action,
        resource_type: 'matter',
        resource_id: matterId,
        changes,
        ip_address: request.ip,
        user_agent: request.headers['user-agent'],
      });

      logger.info({ matterId, action }, 'Matter action logged');
    } catch (error) {
      logger.error({ error, matterId, action }, 'Failed to log matter action');
    }
  }

  /**
   * Log impersonation events
   */
  static async logImpersonation(
    request: FastifyRequest,
    action: 'start' | 'end',
    targetUserId: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      await supabaseService.from('audit_log').insert({
        user_id: request.user?.id || 'unknown',
        actor_email: request.user?.email || 'unknown',
        is_platform_admin: true,
        action: `impersonation.${action}`,
        resource_type: 'user',
        resource_id: targetUserId,
        metadata: {
          ...metadata,
          impersonator_id: request.user?.id,
          impersonator_email: request.user?.email,
        },
        ip_address: request.ip,
        user_agent: request.headers['user-agent'],
      });

      logger.info({ targetUserId, action }, 'Impersonation logged');
    } catch (error) {
      logger.error({ error, targetUserId, action }, 'Failed to log impersonation');
    }
  }

  /**
   * Log privileged admin action
   */
  static async logAdminAction(
    request: FastifyRequest,
    action: string,
    resourceType: string,
    resourceId: string,
    changes?: Record<string, any>
  ): Promise<void> {
    try {
      await supabaseService.from('audit_log').insert({
        user_id: request.user?.id || 'unknown',
        actor_email: request.user?.email || 'unknown',
        is_platform_admin: true,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        changes,
        ip_address: request.ip,
        user_agent: request.headers['user-agent'],
      });

      logger.info({ action, resourceType, resourceId }, 'Admin action logged');
    } catch (error) {
      logger.error({ error, action, resourceType }, 'Failed to log admin action');
    }
  }
}
