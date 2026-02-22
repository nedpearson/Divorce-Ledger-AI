import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { authService } from '../services/AuthService.js';
import { auditService } from '../services/AuditService.js';
import { logger } from '../logging/logger.js';
import {
  loginSchema,
  signupSchema,
  passwordResetRequestSchema,
  oauthCallbackSchema,
  tokenRefreshSchema,
  LoginInput,
  SignupInput,
} from '../validators/authValidators.js';
import { ValidationError } from '../errors/AppError.js';

export async function authRoutes(fastify: FastifyInstance) {
  // Register rate limiting plugin if not already registered
  if (!fastify.hasDecorator('rateLimit')) {
    await fastify.register(rateLimit, {
      global: false,
    });
  }
  /**
   * POST /auth/signup
   * Register a new user
   */
  fastify.post('/auth/signup', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '15m',
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const result = signupSchema.safeParse(request.body);

    if (!result.success) {
      throw new ValidationError('Invalid signup data', { errors: result.error.errors });
    }

    const { user, session } = await authService.signup(result.data);

    // Log audit event
    await auditService.log({
      user_id: user.id,
      action: 'user_signup',
      severity: 'info',
      ip_address: request.ip,
      user_agent: request.headers['user-agent'],
    });

    return reply.code(201).send({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name,
          subscription_tier: user.user_metadata?.subscription_tier,
        },
        session: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
        },
      },
    });
  });

  /**
   * POST /auth/login
   * Login with email and password
   */
  fastify.post('/auth/login', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '15m',
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const result = loginSchema.safeParse(request.body);

    if (!result.success) {
      throw new ValidationError('Invalid login data', { errors: result.error.errors });
    }

    const { user, session } = await authService.login(result.data);

    // Log audit event
    await auditService.logUserLogin(user.id, request.ip, request.headers['user-agent']);

    return reply.send({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name,
          subscription_tier: user.user_metadata?.subscription_tier,
        },
        session: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
        },
      },
    });
  });

  /**
   * POST /auth/logout
   * Logout current user
   */
  fastify.post('/auth/logout', {
    onRequest: [fastify.authenticate], // Auth middleware
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.id;
    const accessToken = request.headers.authorization?.replace('Bearer ', '') || '';

    await authService.logout(accessToken);

    // Log audit event
    await auditService.logUserLogout(userId, request.ip, request.headers['user-agent']);

    return reply.send({
      success: true,
      message: 'Logged out successfully',
    });
  });

  /**
   * GET /auth/session
   * Get current user session
   */
  fastify.get('/auth/session', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;

    return reply.send({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name,
          subscription_tier: user.user_metadata?.subscription_tier,
        },
      },
    });
  });

  /**
   * POST /auth/refresh
   * Refresh access token
   */
  fastify.post('/auth/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const result = tokenRefreshSchema.safeParse(request.body);

    if (!result.success) {
      throw new ValidationError('Invalid refresh token', { errors: result.error.errors });
    }

    const { session } = await authService.refreshToken(result.data.refreshToken);

    return reply.send({
      success: true,
      data: {
        session: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
        },
      },
    });
  });

  /**
   * POST /auth/password/reset-request
   * Request password reset email
   */
  fastify.post('/auth/password/reset-request', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1h',
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const result = passwordResetRequestSchema.safeParse(request.body);

    if (!result.success) {
      throw new ValidationError('Invalid email', { errors: result.error.errors });
    }

    await authService.requestPasswordReset(result.data.email);

    return reply.send({
      success: true,
      message: 'Password reset email sent',
    });
  });

  /**
   * POST /auth/password/update
   * Update password (requires valid access token)
   */
  fastify.post('/auth/password/update', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { newPassword: string };
    const accessToken = request.headers.authorization?.replace('Bearer ', '') || '';

    if (!body.newPassword || body.newPassword.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }

    await authService.updatePassword(accessToken, body.newPassword);

    // Log audit event
    await auditService.log({
      user_id: request.user!.id,
      action: 'password_changed',
      severity: 'warning',
      ip_address: request.ip,
      user_agent: request.headers['user-agent'],
    });

    return reply.send({
      success: true,
      message: 'Password updated successfully',
    });
  });

  /**
   * GET /auth/oauth/:provider
   * Initiate OAuth sign-in
   */
  fastify.get('/auth/oauth/:provider', async (request: FastifyRequest<{
    Params: { provider: string };
  }>, reply: FastifyReply) => {
    const { provider } = request.params;

    if (provider !== 'google' && provider !== 'github') {
      throw new ValidationError(`Unsupported OAuth provider: ${provider}`);
    }

    const { url } = await authService.initiateOAuthSignIn(provider as 'google' | 'github');

    return reply.redirect(url);
  });

  /**
   * POST /auth/oauth/callback
   * Handle OAuth callback
   */
  fastify.post('/auth/oauth/callback', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '15m',
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const result = oauthCallbackSchema.safeParse(request.body);

    if (!result.success) {
      throw new ValidationError('Invalid OAuth callback data', { errors: result.error.errors });
    }

    const { user, session } = await authService.exchangeOAuthCode(result.data.code);

    // Log audit event
    await auditService.logUserLogin(user.id, request.ip, request.headers['user-agent']);

    return reply.send({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name,
        },
        session: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
        },
      },
    });
  });
}
