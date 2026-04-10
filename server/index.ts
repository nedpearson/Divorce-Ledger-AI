import express, { type Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import { registerRoutes } from './routes';
import { validateEnv, isLiveMode, isDemoMode, getAppMode } from './config';

// Run environment sanity check
validateEnv();
import { serveStatic } from './static';
import { createServer } from 'http';
import { startDemoResetScheduler, maybeResetDemo } from './demo-reset';
import { demoResetMiddleware } from './middleware/demoReset';
import adminDemoRouter from './routes/adminDemo';
import { testDatabaseConnection } from './db';
import { runMigrations } from 'stripe-replit-sync';
import {
  getStripeSync,
  initStripe as initStripeClient,
  isStripeAvailable,
  getStripeMode,
} from './stripeClient';
import { WebhookHandlers } from './webhookHandlers';
import { startupService } from './startup';
import { cronScheduler } from './cron-scheduler';
import { liveScheduler } from './live-scheduler';
import { Pool } from 'pg';
import { DashboardService } from './services/dashboard-service';
import { WebSocketService } from './services/websocket-service';
import { complianceService } from './services/compliance.service';
import { logFireflyConfigStatus } from './config/firefly.config';
import { getBaseUrl } from './lib/baseUrl';

import { createLogger } from './lib/logger';
import { globalErrorHandler } from './lib/errorHandler';

const startupLogger = createLogger('Startup');

process.on('uncaughtException', (err) => {
  startupLogger.error('Uncaught Exception', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  startupLogger.error('Unhandled Promise Rejection', reason as Error, {
    promiseInfo: String(promise),
  });
});

import helmet from 'helmet';
import hpp from 'hpp';
import xss from 'xss-clean';
import rateLimit from 'express-rate-limit';

import { loopWatchdogMiddleware } from './middleware/loopWatchdog';

const app = express();

// Security Middlewares
app.use(loopWatchdogMiddleware);
app.use(
  helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production',
    crossOriginEmbedderPolicy: false,
  })
);
app.use(xss());
app.use(hpp());

// Enable trust proxy for proper IP detection behind Replit's proxy
app.set('trust proxy', 1);
const httpServer = createServer(app);

// Initialize monitoring services (only if database is configured)
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;
const dashboardService = pool ? new DashboardService(pool) : null;
const wsService = dashboardService ? new WebSocketService(httpServer, dashboardService) : null;

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Initialize Stripe schema and sync data (called after startupService has validated Stripe)
async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log('DATABASE_URL not set, skipping Stripe sync/webhook setup');
    return;
  }

  // Stripe credentials already validated by startupService
  if (!isStripeAvailable()) {
    return;
  }

  try {
    console.log('Initializing Stripe schema...');
    await runMigrations({ databaseUrl });
    console.log('Stripe schema ready');

    const stripeSync = await getStripeSync();

    console.log('Setting up managed webhook...');
    const webhookBaseUrl = getBaseUrl();
    try {
      const result = await stripeSync.findOrCreateManagedWebhook(
        `${webhookBaseUrl}/api/stripe/webhook`
      );
      if (result?.webhook?.url) {
        console.log(`Webhook configured: ${result.webhook.url}`);
      } else {
        console.log('Webhook setup returned without URL - may be already configured');
      }
    } catch (webhookError: any) {
      console.log('Webhook setup skipped:', webhookError.message);
    }

    // Sync all existing Stripe data in background
    console.log('Syncing Stripe data...');
    stripeSync
      .syncBackfill()
      .then(() => console.log('Stripe data synced'))
      .catch((err: any) => {
        console.error('Error syncing Stripe data:', err);
        // Non-critical - don't crash the app
      });
  } catch (error) {
    console.error('Failed to initialize Stripe:', error);
  }
}

// Register Stripe webhook route BEFORE express.json() - needs raw Buffer
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const { isStripeAvailable } = await import('./stripeClient');
  if (!isStripeAvailable()) {
    return res.status(503).json({ error: 'Stripe not configured' });
  }

  const signature = req.headers['stripe-signature'];
  if (!signature) {
    return res.status(400).json({ error: 'Missing stripe-signature' });
  }

  try {
    const sig = Array.isArray(signature) ? signature[0] : signature;
    if (!Buffer.isBuffer(req.body)) {
      console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer');
      return res.status(500).json({ error: 'Webhook processing error' });
    }
    await WebhookHandlers.processWebhook(req.body as Buffer, sig);
    res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error.message);
    res.status(400).json({ error: 'Webhook processing error' });
  }
});

// Now apply JSON middleware for all other routes
// Increased limit to 50MB for base64 encoded images
app.use(
  express.json({
    limit: '50mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Apply basic body parsing for all routes early
app.use(express.urlencoded({ extended: false, limit: '50mb' }));
app.use(cookieParser());

// Session middleware — required for Google OAuth CSRF state tokens
app.use(session({
  secret: process.env.SESSION_SECRET || process.env.DATABASE_URL?.slice(-32) || 'divorce-ledger-session-fallback',
  resave: false,
  saveUninitialized: false,
  name: 'dl.sid',
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 10 * 60 * 1000, // 10 minutes — only needed for OAuth flow
    sameSite: 'lax',
  },
}));

app.use(demoResetMiddleware);
app.use(adminDemoRouter);

export function log(message: string, source = 'express') {
  const formattedTime = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on('finish', () => {
    const duration = Date.now() - start;
    if (path.startsWith('/api')) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Run centralized startup health checks
  try {
    await startupService.initialize();
  } catch (error) {
    console.error('Startup health check failed:', error instanceof Error ? error.message : error);
    if (startupService.hasCriticalErrors()) {
      console.error('Critical errors detected - some features may not work');
    }
  }

  // Validate Firefly III configuration (optional global config)
  logFireflyConfigStatus();

  const dbConnected = startupService.isDatabaseConnected();

  // Run database migrations if database is connected
  if (dbConnected) {
    let currentMigrationFile = 'init';
    try {
      console.log('[STARTUP] Running database migrations...');
      const fs = await import('fs');
      const path = await import('path');
      const pg = await import('pg');
      const migrationsDir = path.resolve('./migrations');

      // Try DIRECT_URL first (preferred for DDL), fall back to pooler
      const directUrl = process.env.DIRECT_URL;
      const poolerUrl = process.env.DATABASE_URL;

      // Pick the best available URL — test direct first, fall back to pooler
      let migrationUrl: string | undefined;
      if (directUrl) {
        const testPool = new pg.default.Pool({
          connectionString: directUrl.replace(/[?&]sslmode=\w+/g, '').replace(/[?&]ssl=\w+/g, ''),
          ssl: directUrl.includes('supabase') ? { rejectUnauthorized: false } : undefined,
          max: 1,
          connectionTimeoutMillis: 5000,
        });
        try {
          const c = await testPool.connect();
          await c.query('SELECT 1');
          c.release();
          migrationUrl = directUrl;
          console.log('[STARTUP] Using DIRECT_URL for migrations');
        } catch {
          console.log(
            '[STARTUP] DIRECT_URL unreachable, falling back to DATABASE_URL for migrations'
          );
        } finally {
          await testPool.end().catch(() => {});
        }
      }
      if (!migrationUrl) migrationUrl = poolerUrl;

      const isSupabase = migrationUrl?.includes('supabase');
      const cleanUrl = migrationUrl
        ? migrationUrl.replace(/[?&]sslmode=\w+/g, '').replace(/[?&]ssl=\w+/g, '')
        : migrationUrl;

      const migPool = new pg.default.Pool({
        connectionString: cleanUrl,
        ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
        max: 1,
      });

      const client = await migPool.connect();
      try {
        // Create tracking table if missing
        await client.query(`
          CREATE TABLE IF NOT EXISTS _migrations (
            id SERIAL PRIMARY KEY,
            filename TEXT UNIQUE NOT NULL,
            applied_at TIMESTAMPTZ DEFAULT NOW()
          )
        `);
        const sqlFiles = fs
          .readdirSync(migrationsDir)
          .filter((f: string) => f.endsWith('.sql'))
          .sort();
        for (const file of sqlFiles) {
          currentMigrationFile = file;

          // In local development on Supabase, skip the multi-tenant billing migration
          // which can fail due to stricter operator/type checks. Mark it as applied
          // so subsequent migrations can proceed.
          if (process.env.NODE_ENV === 'development' && file === '008-multi-tenant-billing.sql') {
            await client.query(
              'INSERT INTO _migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
              [file]
            );
            continue;
          }

          const { rows } = await client.query('SELECT id FROM _migrations WHERE filename = $1', [
            file,
          ]);
          if (rows.length === 0) {
            const sql_query = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
            try {
              await client.query(sql_query);
              await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
              console.log(`  ✅ Applied migration: ${file}`);
            } catch (migErr: any) {
              if (migErr.code === '42P07' || migErr.message?.includes('already exists')) {
                console.warn(`  ⚠ Skipping duplicate migration: ${file} (Tables already exist)`);
                await client.query('INSERT INTO _migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
              } else {
                throw migErr;
              }
            }
          }
        }
        console.log('✅ [STARTUP] Database migrations completed successfully');
      } finally {
        client.release();
        await migPool.end();
      }
    } catch (error) {
      console.error(
        `❌ [STARTUP] CRITICAL: Database migration failed while applying ${currentMigrationFile}:`,
        error
      );
      console.error('❌ [STARTUP] Halting application. Resolve schema issues before running.');
      process.exit(1);
    }

    // Bootstrap users (admin + demo)
    try {
      const { bootstrapUsers } = await import('./services/bootstrap.service');

      // In production, only create missing users (don't reset existing passwords)
      await bootstrapUsers({
        forcePasswordReset: false,
      });
    } catch (error) {
      console.error('❌ [STARTUP] User bootstrap failed:', error);
      console.error(
        '[STARTUP] Application will continue but admin/demo accounts may not be available'
      );
    }
  }

  // Initialize Stripe webhook/sync if database is connected
  if (dbConnected && isStripeAvailable() && process.env.ENABLE_OPTIONAL_INTEGRATIONS === 'true') {
    await initStripe();
  }

  await registerRoutes(httpServer, app);

  if (dbConnected) {
    const appMode = getAppMode();
    console.log(`[STARTUP] Application mode: ${appMode.toUpperCase()}`);

    // LIVE MODE: Start live scheduler for billing, quotas, tier migrations
    if (isLiveMode()) {
      console.log('[STARTUP] Live mode detected - initializing live scheduler...');
      liveScheduler.start();
    }

    // COMPLIANCE AGENT: Start security monitoring
    complianceService.start();

    // DEMO MODE: Start demo-specific schedulers
    if (isDemoMode()) {
      console.log('[STARTUP] Demo mode detected - initializing demo reset scheduler...');
      startDemoResetScheduler();

      // Legacy cron scheduler for demo mode (if needed)
      if (process.env.CRON_ENABLED === 'true') {
        cronScheduler.start();
      }

      // Lazy check stale demo on startup
      maybeResetDemo().catch((err) => {
        console.error('[DEMO] Initial startup reset check failed:', err);
        // Non-critical - don't crash the app
      });
    }

    // Start monitoring services (both modes)
    if (dashboardService) {
      dashboardService.start().catch((err) => {
        console.error('Failed to start dashboard service:', err);
        // Non-critical - don't crash the app
      });
    }
    if (wsService) {
      wsService.initialize();
    }
  }



  // Monitor dashboard — rate-limited to prevent info scraping
  const adminMonitorLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });
  app.get('/admin/monitor', adminMonitorLimiter, (_req, res) => {
    res.sendFile('dashboard.html', { root: 'public' });
  });


  app.use(globalErrorHandler);

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === 'production') {
    serveStatic(app);
  } else {
    const { setupVite } = await import('./vite');
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  const serverInstance = httpServer.listen(
    {
      port,
      host: '0.0.0.0',
      ...(process.platform !== 'win32' && { reusePort: true }),
    },
    () => {
      log(`serving on port ${port}`);
    }
  );

  // Bulletproof graceful shutdown hooks to prevent EADDRINUSE on rapid restarts
  const gracefulShutdown = (signal: string) => {
    startupLogger.info(`Received ${signal}. Shutting down gracefully...`);
    serverInstance.close(() => {
      startupLogger.info('HTTP server closed.');
      if (pool) {
        pool.end().then(() => {
          startupLogger.info('Database pool closed.');
          process.exit(0);
        });
      } else {
        process.exit(0);
      }
    });

    // Force exit after 3s if hanging
    setTimeout(() => {
      startupLogger.error('Forced shutdown after timeout.');
      process.exit(1);
    }, 3000);
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // Nodemon explicit restart
})();
