import Fastify, { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyMultipart from '@fastify/multipart';
import { env } from './config/env.js';
import { logger } from './logging/logger.js';
import { errorHandler, notFoundHandler, setupProcessHandlers } from './errors/errorHandler.js';
import { authMiddleware } from './middleware/auth.js';

// Import routes
import { authRoutes } from './routes/auth.js';
import { documentRoutes } from './routes/documents.js';
import { uploadRoutes } from './routes/uploads.js';
import { classificationRoutes } from './routes/classifications.js';
import { healthRoutes } from './routes/health.js';
import { webhookRoutes } from './routes/webhooks.js';

/**
 * Create and configure Fastify server
 */
export async function createServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: logger,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    disableRequestLogging: false,
    trustProxy: true, // Important for Railway, Render, etc.
  });

  // Register plugins

  // CORS
  if (env.ENABLE_CORS) {
    // Allow production frontend and localhost for dev
    const allowedOrigins = [
      env.FRONTEND_URL || 'http://localhost:5000',
      'http://localhost:3000',
      'http://localhost:5000',
      'https://divorceledger.live',
      'https://divorceledger.replit.app',
    ];
    // Patch: Add Supabase public URL to allowedOrigins
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_API_URL || env.VITE_PUBLIC_URL || env.FRONTEND_URL;
    if (supabaseUrl && !allowedOrigins.includes(supabaseUrl)) {
      allowedOrigins.push(supabaseUrl);
    }
    await server.register(fastifyCors, {
      origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) {
          cb(null, true);
        } else {
          cb(new Error('Not allowed by CORS'), false);
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Request-ID',
        'X-User-Id',
        'X-Environment',
      ],
      exposedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Request-ID',
        'X-User-Id',
        'X-Environment',
      ],
    });
  }

  // Security headers
  await server.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  });

  // Rate limiting
  if (env.ENABLE_RATE_LIMITING) {
    await server.register(fastifyRateLimit, {
      max: 100, // 100 requests
      timeWindow: '1 minute',
      errorResponseBuilder: (request, context) => {
        return {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Rate limit exceeded. Try again in ${context.after}`,
          },
        };
      },
    });
  }

  // Multipart/form-data support for file uploads
  await server.register(fastifyMultipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB max file size
      files: 1, // Max 1 file per request
    },
  });

  // Register auth middleware decorator
  server.decorate('authenticate', authMiddleware);

  // Register routes
  await server.register(healthRoutes);
  await server.register(authRoutes);
  await server.register(documentRoutes);
  await server.register(uploadRoutes);
  await server.register(classificationRoutes);
  await server.register(webhookRoutes);

  // Setup error handler
  server.setErrorHandler(errorHandler);
  server.setNotFoundHandler(notFoundHandler);

  // Setup process handlers (uncaught exceptions, etc.)
  setupProcessHandlers();

  return server;
}

/**
 * Start server
 */
export async function startServer(): Promise<void> {
  const server = await createServer();

  try {
    const host = env.HOST;
    const port = env.PORT;

    await server.listen({ host, port });

    logger.info(
      {
        host,
        port,
        environment: env.NODE_ENV,
      },
      'Server started successfully'
    );

    // Log routes
    if (env.isDevelopment()) {
      logger.debug('Registered routes:');
      server.printRoutes();
    }
  } catch (err) {
    logger.fatal({ error: err }, 'Failed to start server');
    process.exit(1);
  }
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
