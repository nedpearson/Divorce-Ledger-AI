import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from '../supabase/clientAnon.js';
import { UnauthorizedError } from '../errors/AppError.js';
import { logger } from '../logging/logger.js';

// Extend FastifyRequest to include user property
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      user_metadata?: Record<string, any>;
    };
  }
}

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 */
export async function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid authorization header');
  }

  const token = authHeader.replace('Bearer ', '');

  if (!token) {
    throw new UnauthorizedError('Missing access token');
  }

  try {
    const user = await verifyToken(token);

    if (!user) {
      throw new UnauthorizedError('Invalid or expired token');
    }

    // Attach user to request
    request.user = {
      id: user.id,
      email: user.email!,
      user_metadata: user.user_metadata,
    };

    logger.debug({ userId: user.id }, 'User authenticated');
  } catch (err) {
    logger.warn({ error: err }, 'Authentication failed');
    throw new UnauthorizedError('Invalid or expired token');
  }
}
