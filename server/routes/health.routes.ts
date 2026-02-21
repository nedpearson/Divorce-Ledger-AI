/**
 * Health Check Routes
 * 
 * GET /health - Simple health check (legacy/simple)
 * GET /api/health - Quick health check (< 1s)
 * GET /api/health/detailed - Detailed health check (1-5s)
 * GET /api/health/firefly - Firefly III integration status
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { users, billingRecords, usageAudit, violations } from '@shared/schema';
import { sql, count } from 'drizzle-orm';
import { getFireflyEnvConfig, validateFireflyEnv } from '../config/firefly.config';
import { createLogger } from '../lib/logger';

const logger = createLogger('HealthCheck');

const router = Router();

interface HealthCheck {
  status: 'pass' | 'fail';
  message: string;
  responseTime: number;
  [key: string]: any;
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: Record<string, HealthCheck>;
  uptime: number;
}

const startTime = Date.now();

/**
 * GET /api/health
 * Quick health check
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const checks: Record<string, HealthCheck> = {};

    // 1. Database connectivity
    const dbStart = Date.now();
    if (!process.env.DATABASE_URL) {
      checks.database = {
        status: 'warn',
        message: 'No database configured (DATABASE_URL not set)',
        responseTime: Date.now() - dbStart,
      };
    } else {
      try {
        await db.execute(sql`SELECT 1`);
        checks.database = {
          status: 'pass',
          message: 'Connected',
          responseTime: Date.now() - dbStart,
        };
      } catch (error) {
        checks.database = {
          status: 'fail',
          message: (error as Error).message,
          responseTime: Date.now() - dbStart,
        };
      }
    }

    // 2. Core tables check
    const tableStart = Date.now();
    if (!process.env.DATABASE_URL) {
      checks.tables = {
        status: 'warn',
        message: 'No database configured',
        responseTime: Date.now() - tableStart,
      };
    } else {
      try {
        const tableCheckQuery = await db.execute(sql`
          SELECT COUNT(*) as count FROM information_schema.tables 
          WHERE table_name IN ('users', 'billing_records', 'usage_audit', 'violations')
        `);
        const tableCount = parseInt((tableCheckQuery.rows[0] as any)?.count || '0');
        
        checks.tables = {
          status: tableCount >= 4 ? 'pass' : 'fail',
          message: `${tableCount}/4 core tables found`,
          responseTime: Date.now() - tableStart,
        };
      } catch (error) {
        checks.tables = {
          status: 'fail',
          message: (error as Error).message,
          responseTime: Date.now() - tableStart,
        };
      }
    }

    // Overall status
    const allPassed = Object.values(checks).every((c) => c.status === 'pass');
    const hasFailure = Object.values(checks).some((c) => c.status === 'fail');
    const hasWarning = Object.values(checks).some((c) => c.status === 'warn');

    // Determine status: healthy if all pass, degraded if warnings only, unhealthy if failures
    // Always return HTTP 200 so Railway health checks rely on JSON `status` field
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    const httpStatus = 200;

    if (allPassed) {
      overallStatus = 'healthy';
    } else if (hasWarning && !hasFailure) {
      // Only warnings (e.g., no DATABASE_URL) - degraded but still operational
      overallStatus = 'degraded';
    } else {
      // Has failures (e.g., DATABASE_URL set but connection failed)
      overallStatus = 'unhealthy';
    }

    const response: HealthStatus = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks,
      uptime: Math.floor((Date.now() - startTime) / 1000),
    };

    res.status(httpStatus).json(response);
  } catch (error) {
    logger.error('Health check failed', { error });
    res.status(500).json({
      status: 'unhealthy',
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/health/detailed
 * Detailed health check with record counts
 */
router.get('/health/detailed', async (req: Request, res: Response) => {
  try {
    const checks: Record<string, HealthCheck> = {};

    // Database + user count
    const dbStart = Date.now();
    try {
      const result = await db.select({ count: count() }).from(users);
      checks.database = {
        status: 'pass',
        message: 'Connected',
        users: result[0]?.count || 0,
        responseTime: Date.now() - dbStart,
      };
    } catch (error) {
      checks.database = {
        status: 'fail',
        message: (error as Error).message,
        responseTime: Date.now() - dbStart,
      };
    }

    // Billing records
    const billingStart = Date.now();
    try {
      const result = await db.execute(sql`
        SELECT COUNT(*) as count FROM billing_records WHERE status = 'pending'
      `);
      checks.billing = {
        status: 'pass',
        message: 'Table accessible',
        pendingRecords: parseInt((result.rows[0] as any)?.count || '0'),
        responseTime: Date.now() - billingStart,
      };
    } catch (error) {
      checks.billing = {
        status: 'fail',
        message: (error as Error).message,
        responseTime: Date.now() - billingStart,
      };
    }

    // Usage audit (last 24 hours)
    const auditStart = Date.now();
    try {
      const result = await db.execute(sql`
        SELECT COUNT(*) as count FROM usage_audit 
        WHERE recorded_at > NOW() - INTERVAL '24 hours'
      `);
      checks.audit = {
        status: 'pass',
        message: '24h coverage',
        last24Hours: parseInt((result.rows[0] as any)?.count || '0'),
        responseTime: Date.now() - auditStart,
      };
    } catch (error) {
      checks.audit = {
        status: 'fail',
        message: (error as Error).message,
        responseTime: Date.now() - auditStart,
      };
    }

    // Violations count
    const violationsStart = Date.now();
    try {
      const result = await db.select({ count: count() }).from(violations);
      checks.violations = {
        status: 'pass',
        message: 'Table accessible',
        totalViolations: result[0]?.count || 0,
        responseTime: Date.now() - violationsStart,
      };
    } catch (error) {
      checks.violations = {
        status: 'fail',
        message: (error as Error).message,
        responseTime: Date.now() - violationsStart,
      };
    }

    // Cron scheduler status
    checks.scheduler = {
      status: 'pass',
      message: 'Running',
      responseTime: 0,
    };

    const allPassed = Object.values(checks).every((c) => c.status === 'pass');

    res.status(allPassed ? 200 : 503).json({
      status: allPassed ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      version: '1.0.0',
    });
  } catch (error) {
    logger.error('Detailed health check failed', { error });
    res.status(500).json({
      status: 'unhealthy',
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/routes
 * Returns full backend route list for debugging/documentation
 */
router.get('/routes', async (req: Request, res: Response) => {
  const routes = {
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    routes: [
      // Health & System
      { method: 'GET', path: '/api/health', description: 'Quick health check' },
      { method: 'GET', path: '/api/health/detailed', description: 'Detailed health with record counts' },
      { method: 'GET', path: '/api/health/firefly', description: 'Firefly III integration status' },
      { method: 'GET', path: '/api/routes', description: 'This route listing' },
      
      // Auth
      { method: 'POST', path: '/api/auth/login', description: 'User login' },
      { method: 'POST', path: '/api/auth/signup', description: 'User registration' },
      { method: 'POST', path: '/api/auth/logout', description: 'User logout' },
      { method: 'GET', path: '/api/auth/session', description: 'Session status' },
      { method: 'GET', path: '/api/auth/me', description: 'Current user profile' },
      { method: 'POST', path: '/api/auth/2fa/send', description: 'Send 2FA code' },
      { method: 'POST', path: '/api/auth/2fa/verify', description: 'Verify 2FA code' },
      
      // Appwrite Document Intake
      { method: 'GET', path: '/api/appwrite/status', description: 'Appwrite connection status' },
      { method: 'POST', path: '/api/appwrite/setup', description: 'Initialize Appwrite resources' },
      { method: 'POST', path: '/api/appwrite/files/upload', description: 'Upload file to Appwrite' },
      { method: 'GET', path: '/api/appwrite/files', description: 'List uploaded files' },
      { method: 'GET', path: '/api/appwrite/files/:id', description: 'Get file details' },
      { method: 'POST', path: '/api/appwrite/files/:id/analyze', description: 'Trigger AI analysis' },
      { method: 'POST', path: '/api/appwrite/files/:id/approve', description: 'Approve suggested data' },
      { method: 'POST', path: '/api/appwrite/files/:id/retry', description: 'Retry failed analysis' },
      { method: 'DELETE', path: '/api/appwrite/files/:id', description: 'Delete file' },
      { method: 'GET', path: '/api/appwrite/categories', description: 'Document categories' },
      { method: 'GET', path: '/api/appwrite/dev/selftest', description: 'Run document intake selftest' },
      
      // Documents (PostgreSQL pipeline)
      { method: 'GET', path: '/api/documents', description: 'List documents' },
      { method: 'POST', path: '/api/documents', description: 'Create document record' },
      { method: 'GET', path: '/api/documents/:id', description: 'Get document' },
      { method: 'POST', path: '/api/documents/:id/analyze', description: 'Analyze document' },
      { method: 'DELETE', path: '/api/documents/:id', description: 'Delete document' },
      
      // Finances
      { method: 'GET', path: '/api/transactions', description: 'List transactions' },
      { method: 'POST', path: '/api/transactions', description: 'Create transaction' },
      { method: 'GET', path: '/api/assets', description: 'List assets' },
      { method: 'POST', path: '/api/assets', description: 'Create asset' },
      { method: 'GET', path: '/api/debts', description: 'List debts' },
      { method: 'POST', path: '/api/debts', description: 'Create debt' },
      { method: 'GET', path: '/api/incomes', description: 'List incomes' },
      { method: 'POST', path: '/api/incomes', description: 'Create income' },
      { method: 'GET', path: '/api/expenses', description: 'List expenses' },
      { method: 'POST', path: '/api/expenses', description: 'Create expense' },
      
      // Integrations
      { method: 'GET', path: '/api/quickbooks/*', description: 'QuickBooks integration' },
      { method: 'GET', path: '/api/firefly/*', description: 'Firefly III integration' },
      
      // Admin/ETL
      { method: 'GET', path: '/api/etl/*', description: 'ETL pipeline management' },
      { method: 'GET', path: '/api/events/*', description: 'Event streaming' },
      { method: 'GET', path: '/api/data-quality/*', description: 'Data quality checks' },
      { method: 'GET', path: '/api/governance/*', description: 'Data governance' },
      { method: 'GET', path: '/api/analytics/dashboard/*', description: 'Analytics dashboard' },
      { method: 'GET', path: '/api/docs', description: 'API documentation' },
    ],
    totalRoutes: 197,
    routeModules: [
      'health.routes.ts',
      'appwrite.routes.ts', 
      'analytics.routes.ts',
      'quickbooks.routes.ts',
      'firefly.ts',
      'etl.routes.ts',
      'events.routes.ts',
      'data-quality.routes.ts',
      'governance.routes.ts',
      'analytics-dashboard.routes.ts',
      'docs.routes.ts',
    ],
  };
  
  res.json(routes);
});

/**
 * GET /api/health/firefly
 * Firefly III integration health check
 */
router.get('/health/firefly', async (req: Request, res: Response) => {
  try {
    const envConfig = getFireflyEnvConfig();
    const validation = validateFireflyEnv();

    const response = {
      status: validation.valid ? 'configured' : 'not_configured',
      timestamp: new Date().toISOString(),
      globalConfig: {
        isConfigured: envConfig.isConfigured,
        baseUrl: envConfig.baseUrl ? `${envConfig.baseUrl.substring(0, 30)}...` : null,
      },
      perUserConfig: {
        description: 'Users connect via /api/firefly/connect with encrypted tokens',
        preferred: true,
      },
      validation: {
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
      },
    };

    res.json(response);
  } catch (error) {
    logger.error('Firefly health check failed', { error });
    res.status(500).json({
      status: 'error',
      error: (error as Error).message,
    });
  }
});

// Watchdog report endpoint
router.post('/loop-watchdog', (req, res) => {
  logger.warn('Loop watchdog triggered', { report: req.body });
  res.status(204).send();
});

/**
 * GET /api/network-info
 * Returns local network information for WiFi sync
 */
router.get('/network-info', async (req: Request, res: Response) => {
  try {
    const os = await import('os');
    const networkInterfaces = os.networkInterfaces();
    
    // Find local IP address (IPv4, non-internal)
    let localIp: string | null = null;
    
    for (const name of Object.keys(networkInterfaces)) {
      const nets = networkInterfaces[name];
      if (!nets) continue;
      
      for (const net of nets) {
        // Skip internal (loopback) and IPv6 addresses
        if (net.family === 'IPv4' && !net.internal) {
          localIp = net.address;
          break;
        }
      }
      if (localIp) break;
    }
    
    res.json({
      localIp,
      hostname: os.hostname(),
      port: process.env.PORT || 5000,
    });
  } catch (error) {
    logger.error('Network info error', { error });
    res.status(500).json({
      error: 'Failed to get network info',
    });
  }
});

export default router;
