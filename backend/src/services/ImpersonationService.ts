import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { platformRoleMiddleware, requirePlatformAdmin } from '../middleware/rbac.js';
import { RBACauditService } from '../services/RBACauditService.js';
import { supabaseService } from '../supabase/clientService.js';
import { BadRequestError, ForbiddenError } from '../errors/AppError.js';

/**
 * Impersonation service for super admins
 * Allows read-only access to user accounts for support purposes
 */
export class ImpersonationService {
  private static activeImpersonations = new Map<string, {
    adminId: string;
    targetUserId: string;
    startedAt: Date;
  }>();

  /**
   * Start impersonation session (super admin only)
   */
  static async startImpersonation(
    request: FastifyRequest<{ Body: { target_user_id: string } }>,
    reply: FastifyReply
  ): Promise<{ token: string; user: any }> {
    // Verify super admin
    if (request.platformRole !== 'super_admin') {
      throw new ForbiddenError('Only super admins can impersonate users');
    }

    const { target_user_id } = request.body;

    if (!target_user_id) {
      throw new BadRequestError('target_user_id is required');
    }

    // Load target user
    const { data: targetProfile, error } = await supabaseService
      .from('profiles')
      .select('*')
      .eq('id', target_user_id)
      .single();

    if (error || !targetProfile) {
      throw new BadRequestError('User not found');
    }

    // Prevent impersonating other admins
    if (targetProfile.platform_role === 'super_admin') {
      throw new ForbiddenError('Cannot impersonate other super admins');
    }

    // Create impersonation session with secure randomness
    let randomPart: string;
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      randomPart = crypto.randomUUID();
    } else if (typeof crypto !== 'undefined' && crypto.randomBytes) {
      randomPart = crypto.randomBytes(16).toString('hex');
    } else {
      randomPart = Math.floor(Math.random() * 1e18).toString();
    }
    const sessionId = `imp_${Date.now()}_${randomPart}`;
    
    this.activeImpersonations.set(sessionId, {
      adminId: request.user!.id,
      targetUserId: target_user_id,
      startedAt: new Date(),
    });

    // Log impersonation start
    await RBACauditService.logImpersonation(
      request,
      'start',
      target_user_id,
      { target_email: targetProfile.email }
    );

    // Return limited token (not actual auth token - just session identifier)
    return {
      token: sessionId,
      user: {
        id: targetProfile.id,
        email: targetProfile.email,
        full_name: targetProfile.full_name,
        is_impersonated: true,
        impersonator_email: request.user!.email,
      },
    };
  }

  /**
   * End impersonation session
   */
  static async endImpersonation(
    request: FastifyRequest<{ Params: { session_id: string } }>,
    reply: FastifyReply
  ): Promise<{ success: boolean }> {
    const { session_id } = request.params;

    const session = this.activeImpersonations.get(session_id);

    if (!session) {
      throw new BadRequestError('Invalid or expired impersonation session');
    }

    // Verify the requester is the admin who started the impersonation
    if (session.adminId !== request.user!.id) {
      throw new ForbiddenError('Can only end your own impersonation sessions');
    }

    // Log impersonation end
    await RBACauditService.logImpersonation(request, 'end', session.targetUserId);

    // Remove session
    this.activeImpersonations.delete(session_id);

    return { success: true };
  }

  /**
   * Get active impersonation session info
   */
  static getImpersonationInfo(sessionId: string) {
    return this.activeImpersonations.get(sessionId);
  }

  /**
   * Check if a session is impersonated
   */
  static isImpersonated(sessionId: string): boolean {
    return this.activeImpersonations.has(sessionId);
  }

  /**
   * Clean up expired sessions (called periodically)
   */
  static cleanupExpiredSessions(maxAgeHours: number = 8): void {
    const now = new Date();
    const maxAge = maxAgeHours * 60 * 60 * 1000;

    for (const [sessionId, session] of this.activeImpersonations.entries()) {
      if (now.getTime() - session.startedAt.getTime() > maxAge) {
        this.activeImpersonations.delete(sessionId);
      }
    }
  }
}

/**
 * Register impersonation routes
 */
export async function registerImpersonationRoutes(fastify: FastifyInstance): Promise<void> {
  // Start impersonation
  fastify.post(
    '/admin/impersonate',
    {
      preHandler: [authMiddleware, platformRoleMiddleware, requirePlatformAdmin(false)],
    },
    async (request, reply) => {
      const result = await ImpersonationService.startImpersonation(
        request as FastifyRequest<{ Body: { target_user_id: string } }>,
        reply
      );
      return result;
    }
  );

  // End impersonation
  fastify.delete(
    '/admin/impersonate/:session_id',
    {
      preHandler: [authMiddleware, platformRoleMiddleware, requirePlatformAdmin(false)],
    },
    async (request, reply) => {
      const result = await ImpersonationService.endImpersonation(
        request as FastifyRequest<{ Params: { session_id: string } }>,
        reply
      );
      return result;
    }
  );

  // Cleanup expired sessions every hour
  setInterval(() => {
    ImpersonationService.cleanupExpiredSessions(8);
  }, 60 * 60 * 1000);
}
