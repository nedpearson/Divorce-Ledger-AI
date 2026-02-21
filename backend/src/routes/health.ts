import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabaseServiceRole } from '../supabase/clientServiceRole.js';
import { logger } from '../logging/logger.js';
import { env } from '../config/env.js';

export async function healthRoutes(fastify: FastifyInstance) {
  /**
   * GET /health
   * Basic health check
   */
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'divorce-ledger-backend',
      environment: env.NODE_ENV,
    });
  });

  /**
   * GET /ready
   * Readiness check (checks dependencies)
   */
  fastify.get('/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    const checks = {
      database: false,
      storage: false,
    };

    let allHealthy = true;

    // Check database connection
    try {
      const { data, error } = await supabaseServiceRole
        .from('users')
        .select('id')
        .limit(1)
        .single();

      checks.database = !error || error.code === 'PGRST116'; // PGRST116 = no rows returned (acceptable)
    } catch (err) {
      logger.error({ error: err }, 'Database health check failed');
      checks.database = false;
      allHealthy = false;
    }

    // Check storage connection
    try {
      const { data, error } = await supabaseServiceRole.storage
        .from('documents_raw')
        .list('', { limit: 1 });

      checks.storage = !error;
    } catch (err) {
      logger.error({ error: err }, 'Storage health check failed');
      checks.storage = false;
      allHealthy = false;
    }

    const statusCode = allHealthy ? 200 : 503;

    return reply.code(statusCode).send({
      success: allHealthy,
      status: allHealthy ? 'ready' : 'not ready',
      timestamp: new Date().toISOString(),
      checks,
    });
  });

  /**
   * GET /metrics
   * Basic metrics (for monitoring)
   */
  fastify.get('/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();

    // Get database stats (basic counts)
    let dbStats = {
      users: 0,
      documents: 0,
      classifications: 0,
      jobs_queued: 0,
    };

    try {
      const [usersCount, docsCount, classificationsCount, jobsCount] = await Promise.all([
        supabaseServiceRole.from('users').select('id', { count: 'exact', head: true }),
        supabaseServiceRole.from('documents').select('id', { count: 'exact', head: true }),
        supabaseServiceRole.from('classifications').select('id', { count: 'exact', head: true }),
        supabaseServiceRole.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'queued'),
      ]);

      dbStats = {
        users: usersCount.count || 0,
        documents: docsCount.count || 0,
        classifications: classificationsCount.count || 0,
        jobs_queued: jobsCount.count || 0,
      };
    } catch (err) {
      logger.error({ error: err }, 'Failed to fetch metrics');
    }

    return reply.send({
      success: true,
      timestamp: new Date().toISOString(),
      uptime_seconds: uptime,
      memory: {
        heap_used_mb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heap_total_mb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        rss_mb: Math.round(memoryUsage.rss / 1024 / 1024),
      },
      database: dbStats,
    });
  });

  /**
   * GET /version
   * API version information
   */
  fastify.get('/version', async (request: FastifyRequest, reply: FastifyReply) => {
    // Read version from package.json if available
    // For now, return static version
    return reply.send({
      success: true,
      version: '1.0.0',
      api_version: 'v1',
      node_version: process.version,
      environment: env.NODE_ENV,
    });
  });
}
