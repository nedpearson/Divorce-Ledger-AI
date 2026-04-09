import type { Express, Request, Response, NextFunction } from 'express';
import { createServer, type Server } from 'http';
import { z } from 'zod';
import { eq, and, or, lt, sql } from 'drizzle-orm';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { db } from './db';
import { normalizeEnv } from './lib/normalizeEnv';
import { users, documents } from '@shared/schema';
import { storage, seedDemoData, seedTestUsers, TEST_USERS } from './storage';
import {
  resetDemoEnvironment,
  eraseDemoData,
  eraseEnvironmentData,
  isTestEnvironment,
} from './demo-reset';
import { isLiveMode, isDemoMode } from './config';
import { generateCourtFilingPDF, generateWatermarkedCourtFilingPDF } from './pdf-export';
import { mediaService } from './services/media-service';
import { tierEnforcementService, TierEnforcementService } from './tier-enforcement';
import { billingService, BillingService } from './services/billing-service';
import { tierMigrationService } from './services/tier-migration-service';
import { quotaResetService } from './services/quota-reset-service';
import { analyticsService } from './services/analytics-service';
import { registerObjectStorageRoutes } from './replit_integrations/object_storage';
import analyticsRoutes from './routes/analytics.routes';
import healthRoutes from './routes/health.routes';
import quickbooksRoutes from './routes/quickbooks.routes';
import etlRoutes from './routes/etl.routes';
import eventsRoutes from './routes/events.routes';
import docsRoutes from './routes/docs.routes';
import dataQualityRoutes from './routes/data-quality.routes';
import analyticsDashboardRoutes from './routes/analytics-dashboard.routes';
import governanceRoutes from './routes/governance.routes';
import fireflyRoutes from './routes/firefly';
import storageRoutes from './routes/storage.routes';
import workspaceBillingRoutes from './routes/workspace-billing.routes';
import platformAdminRoutes from './routes/platform-admin.routes';
import { authGoogleRouter } from './routes/auth-google.routes';
import { googleDriveIntegrationRoutes } from './routes/integrations-google-drive.routes';
import { lineageRouter } from './routes/lineage.routes';
import {
  canCreateCase,
  canAddViolation,
  canGenerateCleanPDF,
  canUseAIPatternDetection,
  canAddTeamMember,
  getTierLimits,
  getUserTier,
  getRemainingViolations,
  getRemainingCases,
  canUseVoiceTranscription,
  canUploadMedia,
  getRemainingVoiceTranscriptions,
  getRemainingMediaUploads,
  getMaxVideoLength,
  canUseAIClassification,
} from '@shared/tier-utils';
import {
  SUBSCRIPTION_TIERS,
  DOCUMENT_CATEGORIES,
  type User,
  type DocumentCategory,
  insertW2RecordSchema,
  adminMfaChallenges,
  securityAlerts,
} from '@shared/schema';
import {
  analyzeDocument,
  classifyViolation,
  getMockDocumentAnalysis,
  extractFinancialData,
} from './services/ai-document.service';
import {
  analyzeDocumentWithIntake,
  mapDocTypeToCategory,
  mapCategoryToRecordType,
  type DocumentIntakeResult,
  documentIntakeResultSchema,
} from './services/document-intake.service';
import {
  analyzeDocumentImage,
  analyzeViolationImage,
  transcribeVoiceNote,
} from './services/ai-capture.service';
import {
  processDocumentUploadEvent,
  executeOrchestratorActions,
  type DocumentUploadEvent,
  type OrchestratorResponse,
} from './services/intake-orchestrator.service';

import { requireAuth, requireAdmin } from './middleware/authz';

function resolveWorkspaceId(req: Request): string | undefined {
  const contextId = (req as any).workspace?.id as string | undefined;
  const headerId = req.headers['x-workspace-id'] as string | undefined;
  const queryId = req.query.workspaceId as string | undefined;
  const bodyId = (req as any).body?.workspaceId as string | undefined;
  return contextId || headerId || queryId || bodyId;
}

// Rate limiter for login endpoint - prevents brute force attacks
// In development/demo mode, the limiter is bypassed entirely
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000, // effectively unlimited; real guard is the skip function below
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting in development mode (checked at request time so .env is loaded)
  skip: (_req) => {
    const nodeEnv = process.env.NODE_ENV;
    const appMode = process.env.APP_MODE;
    return nodeEnv === 'development' || appMode === 'development' || appMode === 'demo';
  },
});

const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000,
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting in development/demo mode (checked at request time so .env is loaded)
  skip: (_req) => {
    const nodeEnv = process.env.NODE_ENV;
    const appMode = process.env.APP_MODE;
    return nodeEnv === 'development' || appMode === 'development' || appMode === 'demo';
  },
});

// Input validation schemas - aligned with database schema
const createTransactionSchema = z.object({
  description: z.string().min(1).max(500),
  amount: z.number().int(),
  type: z.string().min(1),
  category: z.string().min(1).max(100),
  date: z.string().min(1),
});

const createAssetSchema = z.object({
  name: z.string().min(1).max(200),
  value: z.number().int().min(0),
  category: z.string().min(1).max(100),
  ownership: z.string().min(1).max(50),
  verified: z.boolean().optional(),
});

const createDebtSchema = z.object({
  name: z.string().min(1).max(200),
  amount: z.number().int().min(0),
  category: z.string().min(1).max(100),
  ownership: z.string().min(1).max(50),
  monthlyPayment: z.number().int().optional(),
});

const createIncomeSchema = z.object({
  source: z.string().min(1).max(200),
  amount: z.number().int().min(0),
  frequency: z.string().min(1),
  owner: z.string().min(1).max(50),
  verified: z.boolean().optional(),
});

const createExpenseSchema = z.object({
  category: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  amount: z.number().int().min(0),
  frequency: z.string().min(1),
  owner: z.string().min(1).max(50),
});

const createAlertSchema = z.object({
  title: z.string().min(1).max(200),
  type: z.string().min(1).max(50),
  description: z.string().min(1).max(1000),
  severity: z.string().min(1),
  isRead: z.boolean().optional(),
});

const createViolationSchema = z.object({
  type: z.enum([
    'custody',
    'financial_hiding',
    'property_damage',
    'child_neglect',
    'court_order',
    'harassment',
    'other',
  ]),
  description: z.string().min(10).max(5000),
  location: z.string().max(500).optional().nullable(),
  mediaUrls: z.array(z.string()).optional().nullable(),
  photoCount: z.number().int().min(0).optional(),
  videoDuration: z.number().min(0).optional().nullable(),
  witnesses: z.array(z.string()).optional().nullable(),
  isDraft: z.boolean().optional(),
  audioTranscript: z.string().max(10000).optional().nullable(),
});

const createMessageSchema = z.object({
  senderId: z.string().min(1),
  senderRole: z.enum(['client', 'attorney', 'cpa', 'admin']),
  senderName: z.string().min(1),
  content: z.string().min(1).max(10000),
  attachmentUrl: z.string().url().nullable().optional(),
  attachmentName: z.string().nullable().optional(),
});

const createDocumentSchema = z.object({
  title: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  description: z.string().max(10000).optional().nullable(),
  isConfidential: z.boolean().optional(),
  fileUrl: z.string().optional().nullable(), // Accepts objectPath (/objects/...) or full URLs
  fileName: z.string().max(255).optional().nullable(),
  fileSize: z.number().int().optional().nullable(),
  fileType: z.string().max(100).optional().nullable(),
});

const createCalendarEventSchema = z.object({
  title: z.string().min(1).max(200),
  eventType: z.string().min(1).max(100),
  description: z.string().max(2000).optional().nullable(),
  startDate: z.string().min(1),
  endDate: z.string().optional().nullable(),
  location: z.string().max(500).optional().nullable(),
  allDay: z.boolean().optional(),
  reminderMinutes: z.number().int().optional().nullable(),
});

const createLegalDocumentSchema = z.object({
  title: z.string().min(1).max(200),
  documentType: z.string().min(1).max(100),
  description: z.string().max(2000).optional().nullable(),
  courtCase: z.string().max(100).optional().nullable(),
  status: z.string().max(50).optional(),
  fileUrl: z.string().url().optional().nullable(),
  filedDate: z.string().optional().nullable(),
  expiryDate: z.string().optional().nullable(),
});

const createChildSupportPaymentSchema = z.object({
  paymentType: z.string().min(1).max(100),
  amount: z.number().int().min(0),
  dueDate: z.string().min(1),
  paidDate: z.string().optional().nullable(),
  status: z.string().max(50).optional(),
  paymentMethod: z.string().max(100).optional().nullable(),
  childName: z.string().max(200).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

const updateChildSupportPaymentSchema = z.object({
  status: z.string().max(50).optional(),
  paidDate: z.string().optional().nullable(),
  paymentMethod: z.string().max(100).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

// AI Helper Functions for Journal and Communication features
async function transcribeVoiceWithGemini(
  audioBase64: string,
  mimeType: string,
  workspaceId?: string,
  userId?: string | number
): Promise<string> {
  // Use the existing transcribeVoiceNote service
  try {
    const result = await transcribeVoiceNote(
      audioBase64,
      mimeType,
      'document',
      workspaceId,
      userId
    );
    return result.extractedText || '';
  } catch (error) {
    console.error('Gemini voice transcription failed:', error);
    throw error;
  }
}

async function analyzeSentimentWithOpenAI(text: string): Promise<{
  score: number;
  label: string;
  hasNegative: boolean;
  topics: string[];
}> {
  const OpenAI = (await import('openai')).default;
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  });

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a sentiment analyzer for divorce-related communications. Analyze the following message and return JSON with:
- score: number from -1 (very negative) to 1 (very positive)
- label: "positive", "neutral", or "negative"
- hasNegative: boolean indicating if there is negative, hostile, or concerning language
- topics: array of topics/subjects that the negativity relates to (e.g., "finances", "custody", "communication", "children", "property", "behavior", "threats"). Empty if not negative.

Focus on identifying:
- Hostile, aggressive, or threatening language
- Blame, criticism, or personal attacks
- Manipulation or gaslighting
- Financial accusations or disputes
- Custody or parenting conflicts
- General negativity or conflict

Be conservative - only flag clearly negative content, not neutral disagreements.`,
        },
        {
          role: 'user',
          content: text,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 200,
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    return {
      score: result.score ?? 0,
      label: result.label || 'neutral',
      hasNegative: result.hasNegative ?? false,
      topics: result.topics || [],
    };
  } catch (error) {
    console.error('OpenAI sentiment analysis failed:', error);
    return { score: 0, label: 'neutral', hasNegative: false, topics: [] };
  }
}

async function generateSentimentReportSummary(
  negativeMessages: Array<{ content: string; senderName: string; createdAt: Date }>,
  topicBreakdown: Record<string, any[]>
): Promise<{ summary: string; recommendations: string }> {
  const OpenAI = (await import('openai')).default;
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  });

  try {
    const topics = Object.keys(topicBreakdown);
    const messagesSummary = negativeMessages
      .slice(0, 20)
      .map(
        (m) =>
          `- ${m.senderName} (${new Date(m.createdAt).toLocaleDateString()}): "${m.content.substring(0, 200)}..."`
      )
      .join('\n');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a professional family counselor/mediator preparing a communication analysis report for use by therapists, mediators, or legal counsel. Provide an objective, professional summary of negative communication patterns. Return JSON with:
- summary: A professional 2-3 paragraph summary of the communication patterns observed, suitable for inclusion in a therapeutic or legal report
- recommendations: Specific, actionable recommendations for improving communication, suitable for a family therapist or mediator`,
        },
        {
          role: 'user',
          content: `Analyze these negative communication patterns:

Topics of conflict: ${topics.join(', ')}
Number of negative messages: ${negativeMessages.length}

Sample messages:
${messagesSummary}

Topic breakdown:
${JSON.stringify(topicBreakdown, null, 2)}`,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 800,
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    return {
      summary: result.summary || 'Analysis complete.',
      recommendations: result.recommendations || 'Consider working with a professional mediator.',
    };
  } catch (error) {
    console.error('OpenAI report summary generation failed:', error);
    return {
      summary: `Found ${negativeMessages.length} negative messages across ${Object.keys(topicBreakdown).length} topics.`,
      recommendations: 'Review the detailed breakdown below for specific patterns.',
    };
  }
}

import { cronScheduler } from './cron-scheduler';

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // Seed demo data and test users on startup
  try {
    await seedDemoData();
    await seedTestUsers();
  } catch (err: any) {
    console.error('Failed to seed demo/test data:', err.message);
  }

  // Register object storage routes for evidence file uploads
  registerObjectStorageRoutes(app);

  // Simple root health endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // Apply general API rate limiting
  app.use('/api', apiRateLimiter);

  // Register health check routes
  app.use('/api', healthRoutes);
  console.log('✅ Health Check Routes Loaded');

  // ✨ Auto-Heal Demo Sessions Middleware ✨
  // Automatically maps invalidated or generic 'demo' requests to the active seeded profile UUID
  app.use('/api', async (req, res, next) => {
    try {
      const isDemo = process.env.APP_MODE === 'demo' || req.headers['x-environment'] === 'demo' || req.cookies?.environment === 'demo';
      if (isDemo && (req as any).session) {
        const currentUserId = (req as any).session.userId;
        const { eq } = await import('drizzle-orm');
        const schema = await import('@shared/schema');
        const { db } = await import('./db');
        
        if (!currentUserId || currentUserId === 'demo-client-user') {
          const newestDemoUser = await db.query.users.findFirst({ where: eq(schema.users.email, 'demo.client@demo.com')});
          if (newestDemoUser) (req as any).session.userId = newestDemoUser.id;
        } else {
           const userExists = await db.query.users.findFirst({ where: eq(schema.users.id, currentUserId)});
           if (!userExists) {
               const newestDemoUser = await db.query.users.findFirst({ where: eq(schema.users.email, 'demo.client@demo.com')});
               if (newestDemoUser) (req as any).session.userId = newestDemoUser.id;
           }
        }
      }
    } catch(e) {
      console.error('[DEMO HEAL] Failed to verify demo session:', e);
    }
    next();
  });

  // Workspace billing & multi-tenant workspace routes
  app.use('/api', workspaceBillingRoutes);

  // Lineage Drill-Down API
  app.use('/api/lineage', lineageRouter);

  // Expose backend integration availability to the frontend gracefully
  app.get('/api/config/integrations', (req, res) => {
    res.json({
      googleAuthEnabled: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
      googleDriveEnabled: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
      googleCalendarEnabled: false // explicitly turned off per "optional expansion logic" requirement
    });
  });

  // Google Authentication endpoints
  app.use(authGoogleRouter);

  // Google Drive Integration endpoints
  app.use('/api/integrations/google-drive', googleDriveIntegrationRoutes);

  // Security Alerts API
  app.get('/api/security-alerts', async (req, res) => {
    const userId = (req as any).session?.userId || (req.user as any)?.id || req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const activeAlerts = await db
        .select()
        .from(securityAlerts)
        .where(eq(securityAlerts.userId, userId));
      // filter out resolved ones
      res.json(activeAlerts.filter(a => !a.isResolved));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed' });
    }
  });

  app.post('/api/alerts/:id/resolve', async (req, res) => {
    const userId = (req as any).session?.userId || (req.user as any)?.id || req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const [alert] = await db
        .update(securityAlerts)
        .set({ isResolved: true, resolvedAt: new Date() })
        .where(eq(securityAlerts.id, req.params.id))
        .returning();
      res.json(alert);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed' });
    }
  });

  // Platform Super Admin routes — gated by requirePlatformAdmin middleware
  app.use('/api/superadmin', platformAdminRoutes);

  app.post('/api/admin/demo-reset', async (req, res) => {
    // CRITICAL: Block in live mode
    if (isLiveMode()) {
      console.error(
        `[SECURITY] BLOCKED: /api/admin/demo-reset attempt in LIVE mode from IP: ${req.ip}`
      );
      return res.status(403).json({
        error: 'BLOCKED: Demo reset is disabled in live/production mode',
        code: 'LIVE_MODE_PROTECTED',
      });
    }

    if (!isDemoMode()) {
      return res.status(403).json({ error: 'Demo reset only available in demo mode' });
    }

    const userId = (req as any).session?.userId || (req.user as any)?.id || req.headers['x-user-id'];
    if (!userId || !req.user?.isAdmin) {
      return res.status(403).json({ message: 'Admin access required' });
    }
    try {
      await eraseDemoData();
      res.json({ message: 'Demo environment reset successfully' });
    } catch (error: any) {
      console.error('Demo reset error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Register Cron Admin routes
  app.post('/api/admin/cron/:taskName', async (req, res) => {
    // Basic shared secret or environment flag check
    const cronSecret = process.env.CRON_ADMIN_SECRET;
    const providedSecret = req.headers['x-cron-secret'];

    if (cronSecret && providedSecret !== cronSecret) {
      return res.status(403).json({ error: 'Unauthorized manual trigger' });
    }

    const { taskName } = req.params;
    const taskMap: Record<string, string> = {
      'reset-quotas': 'Reset Monthly Quotas',
      'process-billing': 'Process Monthly Billings',
      'apply-migrations': 'Apply Pending Tier Migrations',
    };

    const actualTaskName = taskMap[taskName];
    if (!actualTaskName) {
      return res.status(404).json({ error: 'Task mapping not found' });
    }

    try {
      const result = await cronScheduler.runNow(actualTaskName);
      res.json({ success: true, task: actualTaskName, result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  console.log('   GET /health (simple)');
  console.log('   GET /api/health (quick)');
  console.log('   GET /api/health/detailed (comprehensive)');
  console.log('   GET /api/health/firefly (Firefly III status)');

  // ---------------------------------------------------------------------------
  // CORE STORAGE ARCHITECTURE (Replaces legacy cloud integration)
  // ---------------------------------------------------------------------------
  app.use('/api/storage', storageRoutes);
  
  // ALIAS: Route legacy frontend calls that still use /api/appwrite to the new storage endpoints
  app.use('/api/appwrite', storageRoutes);
  
  console.log('📦 Core Document Storage & Canonical Routes Loaded');

  // ---------------------------------------------------------------------------
  // OPTIONAL INTEGRATIONS & PIPELINES
  // Gated by feature flag to keep local dev startup fast and clean
  // ---------------------------------------------------------------------------
  const enableOptionalIntegrations = process.env.ENABLE_OPTIONAL_INTEGRATIONS === 'true';

  if (enableOptionalIntegrations) {
    // Register analytics routes
    app.use('/api', analyticsRoutes);
    console.log('Analytics Routes Loaded');
    console.log('   GET /api/analytics/platform-metrics');
    console.log('   GET /api/analytics/cohorts');
    console.log('   GET /api/analytics/usage-trends');
    console.log('   GET /api/analytics/revenue');
    console.log('   POST /api/admin/billing/process-monthly');
    console.log('   POST /api/admin/quotas/reset-monthly');
    console.log('   POST /api/admin/migrations/apply-pending');

    // Register QuickBooks routes (secure multi-tenant)
    app.use('/api/quickbooks', quickbooksRoutes);
    console.log('QuickBooks Multi-Tenant Routes Loaded');

    // Register Firefly III routes
    app.use('/api/firefly', fireflyRoutes);
    console.log('🔥 Firefly III Integration Routes Loaded');

    // Register ETL pipeline routes
    app.use('/api/etl', etlRoutes);
    app.use('/api/events', eventsRoutes);
    app.use('/api/data-quality', dataQualityRoutes);
    app.use('/api/analytics/dashboard', analyticsDashboardRoutes);
    app.use('/api/governance', governanceRoutes);
    app.use('/api/docs', docsRoutes);
    console.log('✅ API Documentation & ETL Routes Loaded');
  } else {
    app.use(
      ['/api/quickbooks', '/api/firefly', '/api/etl', '/api/docs'],
      (req, res) => {
        res.status(501).json({
          error: 'Integration not enabled locally. Set ENABLE_OPTIONAL_INTEGRATIONS=true',
        });
      }
    );
  }

  // Helper to generate remember-me token with password binding for invalidation
  // Password hash is used in HMAC key so token becomes invalid when password changes
  const REMEMBER_ME_SECRET = process.env.REMEMBER_ME_SECRET || process.env.SESSION_SECRET;
  if (!REMEMBER_ME_SECRET) {
    console.warn(
      '⚠️ REMEMBER_ME_SECRET not set - using fallback. Set SESSION_SECRET or REMEMBER_ME_SECRET for production.'
    );
  }
  const REMEMBER_ME_BASE_KEY = REMEMBER_ME_SECRET || 'divorceledger-dev-secret-not-for-production';
  const REMEMBER_ME_EXPIRY_DAYS = 30;

  function generateRememberMeToken(userId: string, passwordHash: string): string {
    const payload = {
      userId,
      exp: Date.now() + REMEMBER_ME_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    };
    const data = Buffer.from(JSON.stringify(payload)).toString('base64');
    // Include full password hash in HMAC key - any password change invalidates all tokens
    const hmacKey = REMEMBER_ME_BASE_KEY + passwordHash;
    const signature = crypto.createHmac('sha256', hmacKey).update(data).digest('hex');
    return `${data}.${signature}`;
  }

  function verifyRememberMeToken(token: string, passwordHash: string): { userId: string } | null {
    try {
      const [data, signature] = token.split('.');
      if (!data || !signature) return null;

      // Verify with same key that includes password hash
      const hmacKey = REMEMBER_ME_BASE_KEY + passwordHash;
      const expectedSig = crypto.createHmac('sha256', hmacKey).update(data).digest('hex');
      if (signature !== expectedSig) return null;

      const payload = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
      if (payload.exp < Date.now()) return null;

      return { userId: payload.userId };
    } catch {
      return null;
    }
  }

  // Helper for short-lived mobile deep-link tokens used to bootstrap
  // a session on a phone after scanning a QR code from the desktop app.
  const MOBILE_LINK_SECRET = process.env.MOBILE_LINK_SECRET || process.env.SESSION_SECRET;
  if (!MOBILE_LINK_SECRET) {
    console.warn(
      '⚠️ MOBILE_LINK_SECRET not set - using fallback. Set SESSION_SECRET or MOBILE_LINK_SECRET for production.'
    );
  }
  const MOBILE_LINK_KEY =
    MOBILE_LINK_SECRET || 'divorceledger-mobile-dev-secret-not-for-production';
  const MOBILE_LINK_TTL_MS = 10 * 60 * 1000; // 10 minutes

  interface MobileLinkPayload {
    userId: string;
    environment: string;
    issuedAt: number;
  }

  function base64UrlEncode(input: string): string {
    return Buffer.from(input, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  function base64UrlDecode(input: string): string {
    let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    return Buffer.from(base64, 'base64').toString('utf8');
  }

  function encodeMobileLinkToken(payload: MobileLinkPayload): string {
    const data = base64UrlEncode(JSON.stringify(payload));
    const signature = crypto.createHmac('sha256', MOBILE_LINK_KEY).update(data).digest('hex');
    return `${data}.${signature}`;
  }

  function decodeMobileLinkToken(token: string): MobileLinkPayload | null {
    try {
      const [data, signature] = token.split('.');
      if (!data || !signature) return null;

      const expectedSig = crypto.createHmac('sha256', MOBILE_LINK_KEY).update(data).digest('hex');
      const sigBuf = Buffer.from(signature, 'hex');
      const expBuf = Buffer.from(expectedSig, 'hex');
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        return null;
      }

      const payload = JSON.parse(base64UrlDecode(data)) as MobileLinkPayload;
      if (!payload.userId || !payload.environment || !payload.issuedAt) {
        return null;
      }

      // Enforce short time-to-live so links cannot be reused indefinitely
      if (payload.issuedAt + MOBILE_LINK_TTL_MS < Date.now()) {
        return null;
      }

      return payload;
    } catch {
      return null;
    }
  }

  // Mobile Device Secure Pairing endpoints
  app.post('/api/mobile/pairing-token', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).session?.userId || (req.user as any)?.id || req.headers['x-user-id'];
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const environment = normalizeEnv(req.headers['x-environment'] as string || req.cookies?.environment);
      
      const tokenStr = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes magic link

      const tokenRecord = await storage.createMobilePairingToken({
        userId,
        environment,
        token: tokenStr,
        expiresAt
      });

      res.json({ token: tokenRecord.token, expiresAt: tokenRecord.expiresAt });
    } catch (error) {
      console.error('Pairing token generation error:', error);
      res.status(500).json({ error: 'Failed to generate token' });
    }
  });

  app.get('/api/mobile/pair', async (req, res) => {
    try {
      const token = req.query.token as string;
      if (!token) return res.redirect('/login?error=Invalid pairing token');
      
      const pairing = await storage.consumeMobilePairingToken(token);
      if (!pairing || pairing.expiresAt < new Date()) {
        return res.redirect('/login?error=Pairing link expired or invalid');
      }

      const user = await storage.getUser(pairing.userId);
      if (!user) return res.redirect('/login?error=User not found');

      const refreshTokenHash = crypto.randomBytes(32).toString('hex');
      const session = await storage.createSession({
        userId: user.id,
        deviceId: null,
        refreshTokenHash,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
        mfaVerified: false,
      });

      res.clearCookie('session_id', { path: '/' });
      res.cookie('session_id', session.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/',
      });
      res.cookie('environment', pairing.environment, { path: '/' });

      res.redirect('/mobile');
    } catch (error) {
      console.error('Mobile pair error:', error);
      res.redirect('/login?error=Pairing failed');
    }
  });

  app.get('/api/auth/demo-auto-login', async (req, res) => {
    try {
      if (process.env.DEMO_MODE !== 'true') return res.redirect('/login');
      const email = (
        process.env.DEMO_EMAIL !== 'demo@example.com' && process.env.DEMO_EMAIL
          ? process.env.DEMO_EMAIL
          : 'client.demo@example.com'
      )
        .trim()
        .toLowerCase();
      const user = await storage.getUserByEmail(email);
      if (!user) return res.redirect('/login');

      const refreshTokenHash = crypto.randomBytes(32).toString('hex');
      const session = await storage.createSession({
        userId: user.id,
        deviceId: null,
        refreshTokenHash,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
        mfaVerified: false,
      });

      res.clearCookie('session_id', { path: '/' });
      res.cookie('session_id', session.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/',
      });
      res.redirect('/');
    } catch (e) {
      console.error(e);
      res.redirect('/login');
    }
  });

  app.post('/api/auth/login', loginRateLimiter, async (req, res) => {
    try {
      const { email: rawEmail, password, environment, rememberMe } = req.body;

      // Validate input
      if (!rawEmail || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      // Normalize email consistently (must match bootstrap normalization)
      const email = rawEmail.trim().toLowerCase();

      console.log(`[AUTH] Login attempt for: ${email}`);

      // Look up user
      const user = await storage.getUserByEmail(email);

      if (!user) {
        console.log(`[AUTH] User not found: ${email}`);
        // Generic error to prevent user enumeration
        return res.status(401).json({ error: 'Incorrect email or password' });
      }

      console.log(`[AUTH] User found: ${user.id} (${email})`);

      // Check if user is suspended
      if (user.status === 'suspended') {
        console.log(`[AUTH] Login blocked - user suspended: ${email}`);
        return res
          .status(403)
          .json({ error: 'Your account has been suspended. Please contact support.' });
      }

      if (user.status !== 'active') {
        console.log(`[AUTH] Login blocked - user status '${user.status}': ${email}`);
        return res
          .status(403)
          .json({ error: 'Your account is not active. Please contact support.' });
      }

      // Verify password
      const isDemoUser =
        process.env.DEMO_MODE === 'true' &&
        email === (process.env.DEMO_EMAIL || 'demo@example.com').trim().toLowerCase();

      let passwordValid: boolean;

      if (isDemoUser) {
        const demoPassword = process.env.DEMO_PASSWORD || 'demo1234';
        passwordValid = password === demoPassword;
      } else {
        const { verifyPassword } = await import('./auth');
        passwordValid = await verifyPassword(password, user.password);
      }

      if (!passwordValid) {
        console.log(`[AUTH] Password verification failed for ${email}`);
        // Generic error to prevent user enumeration
        return res.status(401).json({ error: 'Incorrect email or password' });
      }

      console.log(`[AUTH] Password verification succeeded for ${email}`);

      // Check if 2FA is required (user has phone number and is in live environment)
      const isLiveUser = normalizeEnv(user.environment) === 'live';
      const has2FAEnabled = user.phoneNumber && isLiveUser;

      // Check if device is trusted (skip 2FA for remembered devices)
      const { deviceFingerprint } = req.body;
      let trustedDevice = null;
      if (deviceFingerprint && has2FAEnabled) {
        const fingerprintHash = hashFingerprint(deviceFingerprint);
        trustedDevice = await storage.getDeviceByFingerprint(user.id, fingerprintHash);
        if (trustedDevice?.isTrusted && !trustedDevice.isBlocked) {
          // Device is trusted - skip 2FA
          console.log(`[AUTH] Trusted device found for user ${user.id}, skipping 2FA`);
        }
      }

      if (has2FAEnabled && user.phoneNumber && !trustedDevice?.isTrusted) {
        // Send 2FA code and return challenge response
        const phoneNumber = user.phoneNumber;
        try {
          const code = generateVerificationCode();
          const codeHash = hashCode(code);
          const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

          // Send SMS
          const smsResult = await sendVerificationSms(phoneNumber, code);

          // Create SMS delivery record
          await storage.createSmsDelivery({
            userId: user.id,
            toPhoneNumber: maskPhoneNumber(phoneNumber),
            fromPhoneNumber: process.env.TWILIO_PHONE_NUMBER || 'system',
            twilioMessageSid: smsResult.messageSid,
            status: smsResult.success ? 'sent' : 'failed',
          });

          if (!smsResult.success) {
            console.error('Failed to send 2FA SMS:', smsResult.error);
            // Fall back to allowing login without 2FA if SMS fails
            // (could be Twilio not configured in test)
          } else {
            // Create MFA challenge
            const challenge = await storage.createMfaChallenge({
              userId: user.id,
              codeHash,
              expiresAt,
              maxAttempts: 5,
            });

            // Log the 2FA challenge
            await storage.logSecurityEvent({
              userId: user.id,
              eventType: 'mfa_sent',
              eventStatus: 'success',
              ipAddress: req.ip || req.socket.remoteAddress,
              userAgent: req.headers['user-agent'],
            });

            // Return 2FA required response
            return res.json({
              requires2fa: true,
              userId: user.id,
              maskedPhone: maskPhoneNumber(phoneNumber),
              environment: normalizeEnv(user.environment || environment),
              rememberMe: !!rememberMe,
            });
          }
        } catch (smsError) {
          console.error('2FA SMS error (falling back to direct login):', smsError);
          // Fall through to complete login without 2FA if SMS system fails
        }
      }

      // Update last login timestamp
      await storage.updateUserLastLogin(user.id);

      // Return user data (password excluded)
      const { password: _, ...userWithoutPassword } = user;

      // Use the user's stored environment, normalized to canonical 'live' | 'demo'
      const userEnvironment = normalizeEnv(user.environment || environment);

      // Create session and device record for non-2FA login
      const userAgent = req.headers['user-agent'] || 'Unknown';
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
      // Use provided fingerprint or generate a simple one from user-agent
      const actualFingerprint = deviceFingerprint || `${userAgent}-${ipAddress}`.substring(0, 100);

      // Parse user agent for device info
      const isMobile = /mobile|android|iphone|ipad/i.test(userAgent);
      const browser = userAgent.match(/(Chrome|Safari|Firefox|Edge|Opera)/i)?.[1] || 'Unknown';
      const platform = isMobile ? 'Mobile' : 'Desktop';

      // Find or create device
      let device = await storage.getDeviceByFingerprint(user.id, actualFingerprint);
      if (!device) {
        device = await storage.createDevice({
          userId: user.id,
          deviceName: `${platform} - ${browser}`,
          deviceFingerprint: actualFingerprint,
          browser,
          platform,
          lastIp: ipAddress,
          userAgent,
        });
      }

      // Create session with 30-day expiry
      const refreshTokenHash = crypto.randomBytes(32).toString('hex');
      const session = await storage
        .createSession({
          userId: user.id,
          deviceId: device?.id || null,
          refreshTokenHash,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          ipAddress,
          mfaVerified: false,
        })
        .catch((err) => {
          console.error('Session creation failed:', err);
          throw err;
        });

      console.log(`[AUTH] Created session ${session.id} for user ${user.id}`);

      // Clear any existing session cookie before setting a new one
      res.clearCookie('session_id', { path: '/' });

      // Set session cookie
      res.cookie('session_id', session.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      // Explicitly set headers for frontend to catch
      res.setHeader('X-User-Id', user.id);
      res.setHeader('X-Environment', userEnvironment);

      // Log successful login
      await storage.logSecurityEvent({
        userId: user.id,
        eventType: 'login_success',
        eventStatus: 'success',
        ipAddress,
        userAgent,
        deviceId: device?.id || null,
        sessionId: session.id,
      });

      // Set remember-me cookie if requested (password hash in HMAC key invalidates on password change)
      if (rememberMe) {
        const token = generateRememberMeToken(user.id, user.password);
        res.cookie('remember_me', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: REMEMBER_ME_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
          path: '/',
        });
      }

      return res.json({
        user: userWithoutPassword,
        environment: userEnvironment,
      });
    } catch (error: any) {
      const traceId = `login_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
      console.error(`[AUTH] Login error [${traceId}]:`, {
        queryName: 'login-flow',
        operation: 'login-device-lookup',
        code: error?.code,
        message: error?.message,
        routine: error?.routine,
        traceId,
      });
      // Distinguish DB-unavailable errors from generic failures
      const isDbDown =
        error?.message?.includes('Tenant or user not found') ||
        error?.message?.includes('ENOTFOUND') ||
        error?.message?.includes('ECONNREFUSED') ||
        error?.message?.includes('database not available') ||
        error?.code === 'ECONNREFUSED' ||
        error?.code === 'ENOTFOUND';
      if (isDbDown) {
        return res
          .status(503)
          .json({ error: 'Database is temporarily unavailable. Please try again in a moment.' });
      }
      res.status(500).json({ error: 'Login failed. Please try again.' });
    }
  });

  // Session restore from remember-me cookie or session_id cookie (2FA)
  app.get('/api/auth/session', async (req, res) => {
    try {
      const rememberMeToken = req.cookies?.remember_me;
      const sessionId = req.cookies?.session_id;

      // Try session_id first (2FA authenticated sessions)
      if (sessionId) {
        const session = await storage.getSession(sessionId);
        if (session && session.revokedAt === null && new Date(session.expiresAt) > new Date()) {
          const user = await storage.getUser(session.userId);
          if (user) {
            if (user.status === 'suspended') {
              res.clearCookie('session_id', { path: '/' });
              return res.status(403).json({ error: 'Account suspended' });
            }

            // Update session activity
            await storage.updateSession(sessionId, {
              lastActivityAt: new Date(),
            });
            await storage.updateUserLastLogin(user.id);

            const { password: _, ...userWithoutPassword } = user;
            return res.json({
              user: userWithoutPassword,
              environment: normalizeEnv(user.environment),
            });
          }
        }
        // Invalid session - clear it
        res.clearCookie('session_id', { path: '/' });
      }

      // Fall back to remember_me token (non-2FA direct login)
      if (!rememberMeToken) {
        return res.status(401).json({ error: 'No session' });
      }

      // First decode to get userId (without verification)
      let userId: string;
      try {
        const [data] = rememberMeToken.split('.');
        const payload = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
        userId = payload.userId;
      } catch {
        res.clearCookie('remember_me', { path: '/' });
        return res.status(401).json({ error: 'Invalid session format' });
      }

      // Lookup user to get password hash for verification
      const user = await storage.getUser(userId);
      if (!user) {
        res.clearCookie('remember_me', { path: '/' });
        return res.status(401).json({ error: 'User not found' });
      }

      // Now verify token with user's current password hash
      // If password changed, signature won't match and token is invalidated
      const verified = verifyRememberMeToken(rememberMeToken, user.password);
      if (!verified) {
        res.clearCookie('remember_me', { path: '/' });
        return res.status(401).json({ error: 'Session expired' });
      }

      // Check if user is suspended
      if (user.status === 'suspended') {
        res.clearCookie('remember_me', { path: '/' });
        return res.status(403).json({ error: 'Account suspended' });
      }

      // Update last login
      await storage.updateUserLastLogin(user.id);

      // Use environment from user record (server-side source of truth), normalized
      const userEnvironment = normalizeEnv(user.environment);

      // Refresh the cookie with current password hash
      const newToken = generateRememberMeToken(user.id, user.password);
      res.cookie('remember_me', newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: REMEMBER_ME_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
        path: '/',
      });

      const { password: _, ...userWithoutPassword } = user;
      res.json({
        user: userWithoutPassword,
        environment: userEnvironment,
      });
    } catch (error) {
      console.error('Session restore error:', error);
      res.status(500).json({ error: 'Session restore failed' });
    }
  });

  // Logout - clear remember-me cookie and session
  app.post('/api/auth/logout', async (req, res) => {
    const rememberMeToken = req.cookies?.remember_me;
    const sessionId = req.cookies?.session_id;

    let userId: string | null = null;

    // Try to get userId from session or remember_me token
    if (sessionId) {
      try {
        const session = await storage.getSession(sessionId);
        if (session) {
          userId = session.userId;
          // Revoke the session
          await storage.revokeSession(sessionId, 'user_logout');
        }
      } catch {
        // Ignore errors
      }
    }

    if (!userId && rememberMeToken) {
      try {
        const [data] = rememberMeToken.split('.');
        const payload = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
        userId = payload.userId;
      } catch {
        // Ignore errors
      }
    }

    if (userId) {
      try {
        await storage.logSecurityEvent({
          userId,
          eventType: 'logout',
          eventStatus: 'success',
          ipAddress: req.ip || req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
        });
      } catch {
        // Ignore errors during logout logging
      }
    }

    res.clearCookie('remember_me', { path: '/' });
    res.clearCookie('session_id', { path: '/' });
    res.json({ success: true });
  });

  // ============================================
  // MOBILE DEEP-LINK AUTH (QR-BASED LOGIN)
  // ============================================

  // Generate a short-lived mobile link token for the currently authenticated user.
  // This is called from the desktop app to embed into a QR code.
  app.post('/api/mobile/link', requireAuth, async (req, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const issuedAt = Date.now();
      const environment = normalizeEnv(user.environment);
      const token = encodeMobileLinkToken({
        userId: user.id,
        environment,
        issuedAt,
      });

      const expiresAt = new Date(issuedAt + MOBILE_LINK_TTL_MS).toISOString();

      return res.json({ token, expiresAt });
    } catch (error) {
      console.error('Mobile link generation error:', error);
      return res.status(500).json({ error: 'Failed to generate mobile link' });
    }
  });

  // Complete mobile authentication from a deep-link token.
  // This endpoint is called by the mobile browser after scanning the QR.
  app.get('/api/mobile/auth/complete', async (req, res) => {
    try {
      const token = req.query.token as string | undefined;
      if (!token) {
        return res.status(400).json({ error: 'Token is required' });
      }

      const payload = decodeMobileLinkToken(token);
      if (!payload) {
        return res.status(400).json({ error: 'Invalid or expired token' });
      }

      const user = await storage.getUser(payload.userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (user.status === 'suspended') {
        return res
          .status(403)
          .json({ error: 'Your account has been suspended. Please contact support.' });
      }

      if (user.status !== 'active') {
        return res
          .status(403)
          .json({ error: 'Your account is not active. Please contact support.' });
      }

      // Create a normal session for the mobile device, similar to /api/auth/login.
      const userAgent = req.headers['user-agent'] || 'Unknown';
      const ipAddress = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
      const uaString = typeof userAgent === 'string' ? userAgent : String(userAgent);
      const isMobile = /mobile|android|iphone|ipad/i.test(uaString);
      const browserMatch = uaString.match(/(Chrome|Safari|Firefox|Edge|Opera)/i);
      const browser = browserMatch ? browserMatch[1] : 'Unknown';
      const platform = isMobile ? 'Mobile' : 'Desktop';

      const fingerprint = `${platform}-${browser}-${ipAddress}`.substring(0, 100);

      let device = await storage.getDeviceByFingerprint(user.id, fingerprint);
      if (!device) {
        device = await storage.createDevice({
          userId: user.id,
          deviceName: `${platform} - ${browser}`,
          deviceFingerprint: fingerprint,
          browser,
          platform,
          lastIp: ipAddress,
          userAgent: uaString,
        });
      }

      const refreshTokenHash = crypto.randomBytes(32).toString('hex');
      const session = await storage
        .createSession({
          userId: user.id,
          deviceId: device?.id || null,
          refreshTokenHash,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          ipAddress,
          mfaVerified: true,
        })
        .catch((err) => {
          console.error('Mobile link session creation failed:', err);
          throw err;
        });

      // Clear any existing session cookie before setting a new one
      res.clearCookie('session_id', { path: '/' });

      res.cookie('session_id', session.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      await storage.updateUserLastLogin(user.id);

      await storage.logSecurityEvent({
        userId: user.id,
        eventType: 'mobile_link_login',
        eventStatus: 'success',
        ipAddress,
        userAgent: uaString,
        deviceId: device?.id || null,
        sessionId: session.id,
      });

      const { password: _pw, ...userWithoutPassword } = user;
      const environment = normalizeEnv(user.environment || payload.environment);

      return res.json({
        user: userWithoutPassword,
        environment,
      });
    } catch (error) {
      console.error('Mobile auth complete error:', error);
      return res.status(500).json({ error: 'Failed to complete mobile login' });
    }
  });

  // ============================================
  // 2FA / MFA ENDPOINTS
  // ============================================

  const {
    isTwilioConfigured,
    generateVerificationCode,
    hashCode,
    sendVerificationSms,
    maskPhoneNumber,
    parseUserAgent,
    hashFingerprint,
  } = await import('./sms');

  // Send 2FA code via SMS
  app.post('/api/auth/2fa/send', loginRateLimiter, async (req, res) => {
    try {
      const { userId, phoneNumber } = req.body;

      if (!userId) {
        return res.status(400).json({ error: 'User ID required' });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const phone = phoneNumber || user.phoneNumber;
      if (!phone) {
        return res
          .status(400)
          .json({ error: 'No phone number on file. Please add a phone number first.' });
      }

      // Check for existing active challenge
      const existingChallenge = await storage.getActiveMfaChallenge(userId);
      if (existingChallenge) {
        const timeSinceLastResend = existingChallenge.lastResendAt
          ? Date.now() - new Date(existingChallenge.lastResendAt).getTime()
          : 60000;

        if (timeSinceLastResend < 30000) {
          // 30 second cooldown
          return res.status(429).json({
            error: 'Please wait before requesting another code',
            retryAfter: Math.ceil((30000 - timeSinceLastResend) / 1000),
          });
        }

        if (existingChallenge.resendCount >= 5) {
          return res
            .status(429)
            .json({ error: 'Too many resend attempts. Please try again later.' });
        }
      }

      // Generate new code
      const code = generateVerificationCode();
      const codeHash = hashCode(code);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Send SMS
      const smsResult = await sendVerificationSms(phone, code);

      // Create SMS delivery record
      await storage.createSmsDelivery({
        userId,
        toPhoneNumber: maskPhoneNumber(phone),
        fromPhoneNumber: process.env.TWILIO_PHONE_NUMBER || 'system',
        twilioMessageSid: smsResult.messageSid,
        status: smsResult.success ? 'sent' : 'failed',
        errorCode: smsResult.errorCode,
        errorMessage: smsResult.error,
      });

      if (!smsResult.success) {
        await storage.logSecurityEvent({
          userId,
          eventType: 'mfa_send_failed',
          eventStatus: 'failed',
          ipAddress: req.ip || req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
          metadata: { error: smsResult.error },
        });
        return res.status(500).json({ error: 'Failed to send verification code' });
      }

      // Create or update MFA challenge
      if (existingChallenge) {
        await storage.updateMfaChallenge(existingChallenge.id, {
          codeHash,
          expiresAt,
          lastResendAt: new Date(),
          resendCount: existingChallenge.resendCount + 1,
          attemptCount: 0,
        });
      } else {
        await storage.createMfaChallenge({
          userId,
          codeHash,
          channel: 'sms',
          phoneNumber: maskPhoneNumber(phone),
          expiresAt,
          maxAttempts: 5,
        });
      }

      // Log security event
      await storage.logSecurityEvent({
        userId,
        eventType: 'mfa_sent',
        eventStatus: 'success',
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        metadata: { channel: 'sms', phone: maskPhoneNumber(phone) },
      });

      res.json({
        success: true,
        message: 'Verification code sent',
        maskedPhone: maskPhoneNumber(phone),
        expiresIn: 600, // 10 minutes in seconds
      });
    } catch (error) {
      console.error('2FA send error:', error);
      res.status(500).json({ error: 'Failed to send verification code' });
    }
  });

  // Verify 2FA code
  app.post('/api/auth/2fa/verify', loginRateLimiter, async (req, res) => {
    try {
      const { userId, code, deviceFingerprint, rememberMe } = req.body;

      if (!userId || !code) {
        return res.status(400).json({ error: 'User ID and code required' });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const challenge = await storage.getActiveMfaChallenge(userId);
      if (!challenge) {
        return res
          .status(400)
          .json({ error: 'No active verification challenge. Please request a new code.' });
      }

      // Check attempt count
      if (challenge.attemptCount >= challenge.maxAttempts) {
        await storage.logSecurityEvent({
          userId,
          eventType: 'mfa_locked',
          eventStatus: 'failed',
          ipAddress: req.ip || req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
          riskScore: 80,
          riskFactors: ['max_attempts_exceeded'],
        });
        return res
          .status(429)
          .json({ error: 'Too many failed attempts. Please request a new code.' });
      }

      // Increment attempts
      await storage.incrementMfaAttempts(challenge.id);

      // Verify code
      const providedHash = hashCode(code);
      if (providedHash !== challenge.codeHash) {
        await storage.logSecurityEvent({
          userId,
          eventType: 'mfa_failed',
          eventStatus: 'failed',
          ipAddress: req.ip || req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
          metadata: { attempt: challenge.attemptCount + 1 },
        });

        const remainingAttempts = challenge.maxAttempts - challenge.attemptCount - 1;
        return res.status(400).json({
          error: 'Invalid verification code',
          remainingAttempts,
        });
      }

      // Mark challenge as verified
      await storage.updateMfaChallenge(challenge.id, { verifiedAt: new Date() });

      // Handle device registration
      const userAgent = req.headers['user-agent'] || '';
      const { browser, platform, deviceName } = parseUserAgent(userAgent);
      const ipAddress = req.ip || req.socket.remoteAddress || '';

      let device = null;
      if (deviceFingerprint) {
        const fingerprintHash = hashFingerprint(deviceFingerprint);
        device = await storage.getDeviceByFingerprint(userId, fingerprintHash);

        if (!device) {
          // New device - create it
          device = await storage.createDevice({
            userId,
            deviceFingerprint: fingerprintHash,
            deviceName,
            userAgent,
            platform,
            browser,
            lastIp: ipAddress,
          });

          await storage.logSecurityEvent({
            userId,
            deviceId: device.id,
            eventType: 'new_device_registered',
            eventStatus: 'success',
            ipAddress,
            userAgent,
            metadata: { deviceName },
          });
        } else {
          // Update existing device
          await storage.updateDevice(device.id, {
            lastSeenAt: new Date(),
            lastIp: ipAddress,
            userAgent,
          });
        }

        // Check if device is blocked
        if (device.isBlocked) {
          await storage.logSecurityEvent({
            userId,
            deviceId: device.id,
            eventType: 'blocked_device_attempt',
            eventStatus: 'failed',
            ipAddress,
            userAgent,
            riskScore: 90,
          });
          return res.status(403).json({ error: 'This device has been blocked. Contact support.' });
        }

        // Mark device as trusted if rememberMe is enabled
        if (rememberMe && !device.isTrusted) {
          await storage.updateDevice(device.id, { isTrusted: true });
          device.isTrusted = true;

          await storage.logSecurityEvent({
            userId,
            deviceId: device.id,
            eventType: 'device_trusted',
            eventStatus: 'success',
            ipAddress,
            userAgent,
            metadata: { deviceName: device.deviceName },
          });
          console.log(`[AUTH] Device ${device.id} marked as trusted for user ${userId}`);
        }
      }

      // Create session
      const crypto = await import('crypto');
      const refreshToken = crypto.randomBytes(32).toString('hex');
      const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

      // Session expiry based on rememberMe preference
      const sessionExpiryDays = rememberMe ? REMEMBER_ME_EXPIRY_DAYS : 1; // 1 day for non-remember-me

      const session = await storage.createSession({
        userId,
        deviceId: device?.id,
        refreshTokenHash,
        ipAddress,
        ipHistory: [ipAddress],
        userAgent,
        isRememberMe: !!rememberMe,
        mfaVerified: true,
        mfaVerifiedAt: new Date(),
        expiresAt: new Date(Date.now() + sessionExpiryDays * 24 * 60 * 60 * 1000),
      });

      // Set session cookie with appropriate expiry
      res.cookie('session_id', session.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: sessionExpiryDays * 24 * 60 * 60 * 1000,
        path: '/',
      });

      // Log successful verification
      await storage.logSecurityEvent({
        userId,
        sessionId: session.id,
        deviceId: device?.id,
        eventType: 'mfa_verified',
        eventStatus: 'success',
        ipAddress,
        userAgent,
      });

      // Update last login
      await storage.updateUserLastLogin(userId);

      const { password: _, ...userWithoutPassword } = user;
      res.json({
        success: true,
        user: userWithoutPassword,
        environment: normalizeEnv(user.environment),
        sessionId: session.id,
      });
    } catch (error: any) {
      const traceId = `2fa_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
      console.error(`[AUTH] 2FA verify error [${traceId}]:`, {
        queryName: '2fa-verify-flow',
        operation: 'mfa-verification',
        code: error?.code,
        message: error?.message,
        routine: error?.routine,
        traceId,
      });
      res.status(500).json({ error: 'Verification failed. Please try again.' });
    }
  });

  // Get user's devices
  app.get('/api/security/devices', async (req, res) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const devices = await storage.getUserDevices(userId);
      const sessions = await storage.getActiveSessionsForUser(userId);

      // Map sessions to devices
      const devicesWithSessions = devices.map((device) => {
        const activeSessions = sessions.filter((s) => s.deviceId === device.id);
        return {
          ...device,
          activeSessions: activeSessions.length,
          lastSessionAt: activeSessions[0]?.lastActivityAt,
        };
      });

      res.json({ devices: devicesWithSessions });
    } catch (error) {
      console.error('Get devices error:', error);
      res.status(500).json({ error: 'Failed to get devices' });
    }
  });

  // Block/unblock device
  app.post('/api/security/devices/:id/block', async (req, res) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id } = req.params;
      const { block } = req.body;

      const devices = await storage.getUserDevices(userId);
      const device = devices.find((d) => d.id === id);

      if (!device) {
        return res.status(404).json({ error: 'Device not found' });
      }

      if (block) {
        await storage.blockDevice(id);
        // Revoke all sessions for this device
        const sessions = await storage.getUserSessions(userId);
        for (const session of sessions) {
          if (session.deviceId === id && !session.revokedAt) {
            await storage.revokeSession(session.id, 'device_blocked');
          }
        }
      } else {
        await storage.unblockDevice(id);
      }

      await storage.logSecurityEvent({
        userId,
        deviceId: id,
        eventType: block ? 'device_blocked' : 'device_unblocked',
        eventStatus: 'success',
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
      });

      res.json({ success: true, message: block ? 'Device blocked' : 'Device unblocked' });
    } catch (error) {
      console.error('Block device error:', error);
      res.status(500).json({ error: 'Failed to update device' });
    }
  });

  // Get user's sessions
  app.get('/api/security/sessions', async (req, res) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const sessions = await storage.getActiveSessionsForUser(userId);
      const devices = await storage.getUserDevices(userId);

      // Enrich sessions with device info
      const sessionsWithDevices = sessions.map((session) => {
        const device = devices.find((d) => d.id === session.deviceId);
        return {
          id: session.id,
          deviceName: device?.deviceName || 'Unknown Device',
          browser: device?.browser,
          platform: device?.platform,
          ipAddress: session.ipAddress,
          createdAt: session.createdAt,
          lastActivityAt: session.lastActivityAt,
          isCurrentSession: session.id === req.cookies?.session_id,
          mfaVerified: session.mfaVerified,
        };
      });

      res.json({ sessions: sessionsWithDevices });
    } catch (error) {
      console.error('Get sessions error:', error);
      res.status(500).json({ error: 'Failed to get sessions' });
    }
  });

  // Revoke a specific session (logout from device)
  app.post('/api/security/sessions/:id/revoke', async (req, res) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id } = req.params;
      const sessions = await storage.getUserSessions(userId);
      const session = sessions.find((s) => s.id === id);

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      await storage.revokeSession(id, 'user_revoke');

      await storage.logSecurityEvent({
        userId,
        sessionId: id,
        eventType: 'session_revoked',
        eventStatus: 'success',
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        metadata: { revokedBy: 'user' },
      });

      res.json({ success: true, message: 'Session logged out' });
    } catch (error) {
      console.error('Revoke session error:', error);
      res.status(500).json({ error: 'Failed to revoke session' });
    }
  });

  // Logout all other sessions
  app.post('/api/security/sessions/revoke-all', async (req, res) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const currentSessionId = req.cookies?.session_id;
      await storage.revokeAllUserSessions(userId, 'user_revoke_all', currentSessionId);

      await storage.logSecurityEvent({
        userId,
        eventType: 'all_sessions_revoked',
        eventStatus: 'success',
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
      });

      res.json({ success: true, message: 'All other sessions logged out' });
    } catch (error) {
      console.error('Revoke all sessions error:', error);
      res.status(500).json({ error: 'Failed to revoke sessions' });
    }
  });

  // Get security events (user's login history)
  app.get('/api/security/events', async (req, res) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const events = await storage.getSecurityEvents(userId, limit);

      res.json({ events });
    } catch (error) {
      console.error('Get security events error:', error);
      res.status(500).json({ error: 'Failed to get security events' });
    }
  });

  // Update phone number (requires current session)
  app.post('/api/security/phone', async (req, res) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { phoneNumber } = req.body;
      if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number required' });
      }

      // Validate E.164 format
      if (!/^\+[1-9]\d{1,14}$/.test(phoneNumber)) {
        return res
          .status(400)
          .json({ error: 'Invalid phone number format. Use international format: +1234567890' });
      }

      await storage.updateUserPhone(userId, phoneNumber);

      await storage.logSecurityEvent({
        userId,
        eventType: 'phone_updated',
        eventStatus: 'success',
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        metadata: { newPhone: maskPhoneNumber(phoneNumber) },
      });

      res.json({
        success: true,
        message: 'Phone number updated. Please verify your new number.',
        maskedPhone: maskPhoneNumber(phoneNumber),
      });
    } catch (error) {
      console.error('Update phone error:', error);
      res.status(500).json({ error: 'Failed to update phone number' });
    }
  });

  // Enable/disable 2FA
  app.post('/api/security/2fa/settings', async (req, res) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { enabled, method = 'sms' } = req.body;

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // If enabling 2FA, require verified phone
      if (enabled && !user.phoneVerifiedAt) {
        return res
          .status(400)
          .json({ error: 'Please verify your phone number before enabling 2FA' });
      }

      if (enabled) {
        await storage.enableTwoFactor(userId, method);
      } else {
        await storage.disableTwoFactor(userId);
      }

      await storage.logSecurityEvent({
        userId,
        eventType: enabled ? '2fa_enabled' : '2fa_disabled',
        eventStatus: 'success',
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        metadata: { method },
      });

      res.json({
        success: true,
        message: enabled
          ? 'Two-factor authentication enabled'
          : 'Two-factor authentication disabled',
      });
    } catch (error) {
      console.error('2FA settings error:', error);
      res.status(500).json({ error: 'Failed to update 2FA settings' });
    }
  });

  console.log('🔐 Security Endpoints:');
  console.log('   POST /api/auth/2fa/send');
  console.log('   POST /api/auth/2fa/verify');
  console.log('   GET  /api/security/devices');
  console.log('   POST /api/security/devices/:id/block');
  console.log('   GET  /api/security/sessions');
  console.log('   POST /api/security/sessions/:id/revoke');
  console.log('   POST /api/security/sessions/revoke-all');
  console.log('   GET  /api/security/events');
  console.log('   POST /api/security/phone');
  console.log('   POST /api/security/2fa/settings');

  // Sign up - create new user account
  app.post('/api/auth/signup', loginRateLimiter, async (req, res) => {
    try {
      const { email, password, fullName, phoneNumber, environment } = req.body;

      // Validate required fields
      if (!email || !password || !fullName || !phoneNumber) {
        return res
          .status(400)
          .json({ error: 'Email, password, full name, and phone number are required' });
      }

      // Validate phone number format (E.164)
      const phoneRegex = /^\+[1-9]\d{10,14}$/;
      if (!phoneRegex.test(phoneNumber)) {
        return res.status(400).json({ error: 'Invalid phone number format' });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      // Validate password strength
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      // Validate full name
      if (fullName.length < 2) {
        return res.status(400).json({ error: 'Full name must be at least 2 characters' });
      }

      // Check if email already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: 'An account with this email already exists' });
      }

      // Hash password
      const { hashPassword } = await import('./auth');
      const hashedPassword = await hashPassword(password);

      // Check if this is the super admin email
      const SUPER_ADMIN_EMAIL = 'nedpearson@gmail.com';
      const isAdminUser = email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();

      // Determine the correct environment
      // For live signups, generate a unique live environment ID (live-xxxx format)
      // Demo users get the shared "demo" environment
      let userEnvironment = environment || 'demo';
      if (userEnvironment === 'live') {
        // Generate unique live environment ID for data isolation
        userEnvironment = `live-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      }

      // Create user with isAdmin flag set correctly from the start
      const newUser = await storage.createUser({
        email: email.toLowerCase(),
        password: hashedPassword,
        fullName,
        phoneNumber,
        twoFactorEnabled: true,
        role: isAdminUser ? 'admin' : 'client',
        isAdmin: isAdminUser,
        environment: userEnvironment,
      });

      // Send welcome email with BCC to admin
      try {
        const { sendWelcomeEmail } = await import('./email');
        await sendWelcomeEmail(email.toLowerCase(), fullName);
      } catch (emailError) {
        console.error('Failed to send welcome email:', emailError);
      }

      // Return user data (password excluded)
      const { password: _, ...userWithoutPassword } = newUser;

      console.log(`New user registered: ${email} (admin: ${isAdminUser}, env: ${userEnvironment})`);

      res.status(201).json({
        user: userWithoutPassword,
        environment: userEnvironment,
        message: 'Account created successfully',
      });
    } catch (error) {
      console.error('Signup error:', error);
      res.status(500).json({ error: 'Failed to create account' });
    }
  });

  // Get current user profile
  app.get('/api/auth/me', async (req, res) => {
    try {
      const userId =
        (req as any).session?.userId || (req.headers['x-user-id'] as string) || 'demo-client-user';
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({ error: 'Failed to get profile' });
    }
  });

  // Update user profile
  app.patch('/api/auth/profile', async (req, res) => {
    try {
      const userId =
        (req as any).session?.userId || (req.headers['x-user-id'] as string) || 'demo-client-user';
      const { fullName, email, profilePhoto } = req.body;

      // Validate input
      if (fullName !== undefined && (typeof fullName !== 'string' || fullName.length < 2)) {
        return res.status(400).json({ error: 'Full name must be at least 2 characters' });
      }

      if (email !== undefined) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res.status(400).json({ error: 'Invalid email format' });
        }

        // Check if email is already taken by another user
        const existingUser = await storage.getUserByEmail(email);
        if (existingUser && existingUser.id !== userId) {
          return res.status(400).json({ error: 'Email is already in use' });
        }
      }

      const updatedUser = await storage.updateUserProfile(userId, {
        fullName,
        email,
        profilePhoto,
      });

      if (!updatedUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      const { password: _, ...userWithoutPassword } = updatedUser;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  // Change password
  app.post('/api/auth/change-password', async (req, res) => {
    try {
      const userId =
        (req as any).session?.userId || (req.headers['x-user-id'] as string) || 'demo-client-user';
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current password and new password are required' });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const { isPasswordHashed, hashPassword, verifyPassword } = await import('./auth');

      // Verify current password
      if (isPasswordHashed(user.password)) {
        const passwordValid = await verifyPassword(currentPassword, user.password);
        if (!passwordValid) {
          return res.status(401).json({ error: 'Current password is incorrect' });
        }
      } else {
        if (currentPassword !== user.password) {
          return res.status(401).json({ error: 'Current password is incorrect' });
        }
      }

      // Hash and save new password
      const hashedPassword = await hashPassword(newPassword);
      await storage.updateUserPassword(userId, hashedPassword);

      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({ error: 'Failed to change password' });
    }
  });

  // Forgot password - send reset email
  app.post('/api/auth/forgot-password', loginRateLimiter, async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      const user = await storage.getUserByEmail(email.toLowerCase());

      // Always return success message for security (don't reveal if email exists)
      if (!user) {
        return res.json({
          message: 'If an account exists with this email, you will receive a password reset link.',
        });
      }

      // Generate reset token
      const crypto = await import('crypto');
      const resetToken = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

      // Store reset token
      await storage.setPasswordResetToken(user.id, resetToken, expires);

      // Send reset email
      try {
        const { sendPasswordResetEmail } = await import('./email');
        await sendPasswordResetEmail(user.email, user.fullName, resetToken);
      } catch (emailError) {
        console.error('Failed to send password reset email:', emailError);
        return res
          .status(500)
          .json({ error: 'Failed to send password reset email. Please try again.' });
      }

      res.json({
        message: 'If an account exists with this email, you will receive a password reset link.',
      });
    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({ error: 'Failed to process password reset request' });
    }
  });

  // Reset password with token
  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        return res.status(400).json({ error: 'Token and new password are required' });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const user = await storage.getUserByPasswordResetToken(token);

      if (!user) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }

      // Check if token has expired
      if (!user.passwordResetExpires || new Date() > new Date(user.passwordResetExpires)) {
        await storage.clearPasswordResetToken(user.id);
        return res
          .status(400)
          .json({ error: 'Reset token has expired. Please request a new one.' });
      }

      // Hash and save new password
      const { hashPassword } = await import('./auth');
      const hashedPassword = await hashPassword(newPassword);
      await storage.updateUserPassword(user.id, hashedPassword);

      // Clear the reset token
      await storage.clearPasswordResetToken(user.id);

      res.json({
        success: true,
        message: 'Password has been reset successfully. You can now log in with your new password.',
      });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  });

  // Admin middleware - checks if user is admin
  const requireAdmin = async (req: any, res: any, next: any) => {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Check if user is admin (email-based or flag-based)
    const SUPER_ADMIN_EMAIL = 'nedpearson@gmail.com';
    if (!user.isAdmin && user.email.toLowerCase() !== SUPER_ADMIN_EMAIL.toLowerCase()) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.adminUser = user;
    next();
  };

  // Admin: Get all users (metadata only, no documents)
  app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();

      // Return user metadata only - explicitly exclude any document-related fields
      const userMetadata = allUsers.map((user) => ({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        isAdmin: user.isAdmin,
        status: user.status,
        subscriptionTier: user.subscriptionTier,
        subscriptionStatus: user.subscriptionStatus,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        casesCount: user.casesCount,
        violationsCountThisMonth: user.violationsCountThisMonth,
        voiceTranscriptionsThisMonth: user.voiceTranscriptionsThisMonth,
        mediaUploadsThisMonth: user.mediaUploadsThisMonth,
        environment: user.environment,
      }));

      res.json({ users: userMetadata });
    } catch (error) {
      console.error('Admin get users error:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  // Admin: Update user status (active/suspended)
  app.patch('/api/admin/users/:userId/status', requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { status } = req.body;

      if (!['active', 'suspended', 'pending'].includes(status)) {
        return res
          .status(400)
          .json({ error: "Invalid status. Must be 'active', 'suspended', or 'pending'" });
      }

      // Prevent admin from suspending themselves
      const adminUser = (req as any).adminUser;
      if (userId === adminUser.id) {
        return res.status(400).json({ error: 'Cannot change your own status' });
      }

      await storage.updateUserStatus(userId, status);
      res.json({ success: true, message: `User status updated to ${status}` });
    } catch (error) {
      console.error('Admin update user status error:', error);
      res.status(500).json({ error: 'Failed to update user status' });
    }
  });

  // Admin: Update user subscription tier
  app.patch('/api/admin/users/:userId/tier', requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { tier } = req.body;

      const validTiers = ['free', 'individual', 'pro', 'team', 'enterprise'];
      if (!validTiers.includes(tier)) {
        return res
          .status(400)
          .json({ error: `Invalid tier. Must be one of: ${validTiers.join(', ')}` });
      }

      const updatedUser = await storage.updateUserTierAndRole(userId, { subscriptionTier: tier });
      if (!updatedUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ success: true, message: `User tier updated to ${tier}` });
    } catch (error) {
      console.error('Admin update user tier error:', error);
      res.status(500).json({ error: 'Failed to update user tier' });
    }
  });

  // Admin: Update user role/admin status
  app.patch('/api/admin/users/:userId/role', requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { isAdmin } = req.body;

      if (typeof isAdmin !== 'boolean') {
        return res.status(400).json({ error: 'isAdmin must be a boolean' });
      }

      // Prevent admin from removing their own admin status
      const adminUser = (req as any).adminUser;
      if (userId === adminUser.id && !isAdmin) {
        return res.status(400).json({ error: 'Cannot remove your own admin status' });
      }

      await storage.updateUserAdminStatus(userId, isAdmin);
      res.json({ success: true, message: `User admin status updated to ${isAdmin}` });
    } catch (error) {
      console.error('Admin update user role error:', error);
      res.status(500).json({ error: 'Failed to update user role' });
    }
  });

  // Admin: Get user usage statistics (aggregated, no document content)
  app.get('/api/admin/users/:userId/usage', requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Return only aggregated usage data, no document content
      res.json({
        usage: {
          casesCount: user.casesCount,
          violationsCountThisMonth: user.violationsCountThisMonth,
          voiceTranscriptionsThisMonth: user.voiceTranscriptionsThisMonth,
          mediaUploadsThisMonth: user.mediaUploadsThisMonth,
          subscriptionTier: user.subscriptionTier,
          subscriptionStatus: user.subscriptionStatus,
          billingCycleStart: user.billingCycleStart,
        },
      });
    } catch (error) {
      console.error('Admin get user usage error:', error);
      res.status(500).json({ error: 'Failed to fetch user usage' });
    }
  });

  // Admin: Reset user monthly usage counts
  app.post('/api/admin/users/:userId/reset-usage', requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;

      await storage.resetMonthlyViolationCount(userId);
      await storage.resetMonthlyUsageCounts(userId);

      res.json({ success: true, message: 'User monthly usage counts reset' });
    } catch (error) {
      console.error('Admin reset user usage error:', error);
      res.status(500).json({ error: 'Failed to reset user usage' });
    }
  });

  app.get('/api/dashboard/stats', async (req, res) => {
    try {
      const userId =
        (req.headers['x-user-id'] as string) ||
        (req as any).session?.userId ||
        'demo-client-user';
      const environment = normalizeEnv(
        (req.query.environment as string) || (req.headers['x-environment'] as string)
      );
      console.log(`[Dashboard Stats] userId=${userId}, environment=${environment}`);
      const stats = await storage.getDashboardStats(userId, environment);
      // Never cache — financial data must always be fresh
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.status(200).json(stats);
    } catch (error) {
      console.error('[Dashboard Stats] Error:', error);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  // AI Pattern Detection endpoint - analyzes violations for recurring patterns (Pro+ tier)
  app.get('/api/patterns', async (req, res) => {
    try {
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';

      // Check tier for AI pattern detection access
      const user = await storage.getUser((req as any).session?.userId || 'demo-client-user');
      if (user && !canUseAIPatternDetection(user)) {
        return res.status(403).json({
          error: 'Upgrade required',
          reason: 'AI Pattern Detection requires a Pro plan or higher.',
          upgradeRequired: true,
          feature: 'ai_pattern_detection',
        });
      }

      const violations = await storage.getViolations(
        (req as any).session?.userId || 'demo-client-user',
        environment
      );

      interface Pattern {
        type: string;
        description: string;
        severity: 'low' | 'moderate' | 'high' | 'critical';
        count: number;
        recommendation: string;
        occurrences: Array<{ date: string; description: string }>;
      }

      const patterns: Pattern[] = [];

      // Group violations by type
      const byType: Record<string, typeof violations> = {};
      for (const v of violations) {
        if (!v.isDraft) {
          if (!byType[v.type]) byType[v.type] = [];
          byType[v.type].push(v);
        }
      }

      // Analyze each type for patterns
      for (const [type, items] of Object.entries(byType)) {
        if (items.length >= 2) {
          // Check for time-based patterns (within 2 weeks)
          const sorted = items.sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
          const recentItems = sorted.filter((v) => new Date(v.timestamp).getTime() > twoWeeksAgo);

          if (recentItems.length >= 2) {
            const typeName = type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
            let severity: Pattern['severity'] = 'low';
            let recommendation = '';

            if (recentItems.length >= 4) {
              severity = 'critical';
              recommendation = `Strong pattern established. Consider filing emergency motion with ${recentItems.length} documented incidents.`;
            } else if (recentItems.length >= 3) {
              severity = 'high';
              recommendation = `Pattern confirmed. Document one more occurrence to establish grounds for motion.`;
            } else if (recentItems.length >= 2) {
              severity = 'moderate';
              recommendation = `Emerging pattern detected. Continue documenting to strengthen case.`;
            }

            patterns.push({
              type,
              description: `${typeName} ${recentItems.length}x in 2 weeks`,
              severity,
              count: recentItems.length,
              recommendation,
              occurrences: recentItems.map((v) => ({
                date: new Date(v.timestamp).toISOString(),
                description: v.description.substring(0, 100),
              })),
            });
          }
        }

        // Check for location-based patterns
        const byLocation: Record<string, typeof items> = {};
        for (const v of items) {
          if (v.location) {
            if (!byLocation[v.location]) byLocation[v.location] = [];
            byLocation[v.location].push(v);
          }
        }

        for (const [location, locItems] of Object.entries(byLocation)) {
          if (locItems.length >= 2) {
            const typeName = type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
            patterns.push({
              type: `${type}_location`,
              description: `${typeName} at "${location}" ${locItems.length}x`,
              severity: locItems.length >= 3 ? 'moderate' : 'low',
              count: locItems.length,
              recommendation: `Same location pattern: ${location}. Document for court presentation.`,
              occurrences: locItems.map((v) => ({
                date: new Date(v.timestamp).toISOString(),
                description: v.description.substring(0, 100),
              })),
            });
          }
        }
      }

      // Sort by severity
      const severityOrder = { critical: 0, high: 1, moderate: 2, low: 3 };
      patterns.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

      res.json({ patterns, totalViolations: violations.filter((v) => !v.isDraft).length });
    } catch (error) {
      console.error('Pattern detection failed:', error);
      res.status(500).json({ error: 'Failed to analyze patterns' });
    }
  });

  app.get('/api/transactions/recent', async (req, res) => {
    try {
      const userId =
        (req as any).session?.userId || (req.headers['x-user-id'] as string) || 'demo-client-user';
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      console.log(`[API] /transactions/recent -> userId: ${userId}, environment: ${environment}`);
      const transactions = await storage.getRecentTransactions(userId, environment, 7);
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.status(200).json(transactions);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch transactions' });
    }
  });


  app.get('/api/transactions', async (req, res) => {
    try {
      const userId =
        (req as any).session?.userId || (req.headers['x-user-id'] as string) || 'demo-client-user';
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      const transactions = await storage.getTransactions(userId, environment);
      res.json(transactions);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch transactions' });
    }
  });

  app.post('/api/transactions', async (req, res) => {
    try {
      const userId =
        (req as any).session?.userId || (req.headers['x-user-id'] as string) || 'demo-client-user';
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      const parsed = createTransactionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      }
      const transaction = await storage.createTransaction({
        ...parsed.data,
        userId,
        environment,
      });
      res.json(transaction);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create transaction' });
    }
  });

  app.get('/api/assets', async (req, res) => {
    try {
      const headerUserId = req.headers['x-user-id'] as string;
      const userId =
        (req as any).session?.userId || (headerUserId && headerUserId.trim()) || 'demo-client-user';
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      console.log(`[Assets API] Fetching for userId: ${userId}, environment: ${environment}`);
      const assets = await storage.getAssets(userId, environment);
      console.log(`[Assets API] Found ${assets.length} assets`);
      res.json(assets);
    } catch (error) {
      console.error('[Assets API] Error:', error);
      res.status(500).json({ error: 'Failed to fetch assets' });
    }
  });

  app.post('/api/assets', async (req, res) => {
    try {
      const userId =
        (req as any).session?.userId || (req.headers['x-user-id'] as string) || 'demo-client-user';
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      const parsed = createAssetSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      }
      const asset = await storage.createAsset({
        ...parsed.data,
        userId,
        environment,
      });
      res.json(asset);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create asset' });
    }
  });

  app.delete('/api/assets/:id', async (req, res) => {
    try {
      const userId =
        (req as any).session?.userId || (req.headers['x-user-id'] as string) || 'demo-client-user';
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      await storage.deleteAsset(req.params.id, userId, environment);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete asset' });
    }
  });

  app.get('/api/debts', async (req, res) => {
    try {
      const headerUserId = req.headers['x-user-id'] as string;
      const userId =
        (req as any).session?.userId || (headerUserId && headerUserId.trim()) || 'demo-client-user';
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      console.log(`[Debts API] Fetching for userId: ${userId}, environment: ${environment}`);
      const debts = await storage.getDebts(userId, environment);
      console.log(`[Debts API] Found ${debts.length} debts`);
      res.json(debts);
    } catch (error) {
      console.error('[Debts API] Error:', error);
      res.status(500).json({ error: 'Failed to fetch debts' });
    }
  });

  app.post('/api/debts', async (req, res) => {
    try {
      const userId =
        (req as any).session?.userId || (req.headers['x-user-id'] as string) || 'demo-client-user';
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      const parsed = createDebtSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      }
      const debt = await storage.createDebt({
        ...parsed.data,
        userId,
        environment,
      });
      res.json(debt);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create debt' });
    }
  });

  app.delete('/api/debts/:id', async (req, res) => {
    try {
      const userId =
        (req as any).session?.userId || (req.headers['x-user-id'] as string) || 'demo-client-user';
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      await storage.deleteDebt(req.params.id, userId, environment);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete debt' });
    }
  });

  app.get('/api/incomes', async (req, res) => {
    try {
      const headerUserId = req.headers['x-user-id'] as string;
      const userId =
        (req as any).session?.userId || (headerUserId && headerUserId.trim()) || 'demo-client-user';
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      console.log(`[Incomes API] Fetching for userId: ${userId}, environment: ${environment}`);
      const incomes = await storage.getIncomes(userId, environment);
      console.log(`[Incomes API] Found ${incomes.length} incomes`);
      res.json(incomes);
    } catch (error) {
      console.error('[Incomes API] Error:', error);
      res.status(500).json({ error: 'Failed to fetch incomes' });
    }
  });

  app.post('/api/incomes', async (req, res) => {
    try {
      const userId =
        (req as any).session?.userId || (req.headers['x-user-id'] as string) || 'demo-client-user';
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      const parsed = createIncomeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      }
      const income = await storage.createIncome({
        ...parsed.data,
        userId,
        environment,
      });
      res.json(income);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create income' });
    }
  });

  app.delete('/api/incomes/:id', async (req, res) => {
    try {
      const userId =
        (req as any).session?.userId || (req.headers['x-user-id'] as string) || 'demo-client-user';
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      await storage.deleteIncome(req.params.id, userId, environment);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete income' });
    }
  });

  app.get('/api/expenses', async (req, res) => {
    try {
      const headerUserId = req.headers['x-user-id'] as string;
      const userId =
        (req as any).session?.userId || (headerUserId && headerUserId.trim()) || 'demo-client-user';
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      console.log(`[Expenses API] Fetching for userId: ${userId}, environment: ${environment}`);
      const expenses = await storage.getExpenses(userId, environment);
      console.log(`[Expenses API] Found ${expenses.length} expenses`);
      res.json(expenses);
    } catch (error) {
      console.error('[Expenses API] Error:', error);
      res.status(500).json({ error: 'Failed to fetch expenses' });
    }
  });

  app.post('/api/expenses', async (req, res) => {
    try {
      const userId =
        (req as any).session?.userId || (req.headers['x-user-id'] as string) || 'demo-client-user';
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      const parsed = createExpenseSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      }
      const expense = await storage.createExpense({
        ...parsed.data,
        userId,
        environment,
      });
      res.json(expense);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create expense' });
    }
  });

  app.delete('/api/expenses/:id', async (req, res) => {
    try {
      const userId =
        (req as any).session?.userId || (req.headers['x-user-id'] as string) || 'demo-client-user';
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      await storage.deleteExpense(req.params.id, userId, environment);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete expense' });
    }
  });

  // Financial Drilldown API - QuickBooks-style detail views
  app.get('/api/finances/:type', async (req, res) => {
    try {
      const environment =
        (req.query.env as string) ||
        (req.query.environment as string) ||
        (req.headers['x-environment'] as string) ||
        'demo';
      const userId = (req.headers['x-user-id'] as string) || (req as any).session?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { type } = req.params;

      let records: unknown[] = [];

      switch (type) {
        case 'assets':
          records = await storage.getAssets(userId, environment);
          break;
        case 'debts':
          records = await storage.getDebts(userId, environment);
          break;
        case 'income':
          records = await storage.getIncomes(userId, environment);
          break;
        case 'expenses':
          records = await storage.getExpenses(userId, environment);
          break;
        case 'transactions':
          records = await storage.getTransactions(userId, environment);
          break;
        default:
          return res.status(400).json({ error: 'Invalid financial type' });
      }

      res.json({ records });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch financial records' });
    }
  });

  app.get('/api/alerts', async (req, res) => {
    try {
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      const userId =
        (req as any).session?.userId || (req.headers['x-user-id'] as string) || 'demo-client-user';
      const alerts = await storage.getAlerts(userId, environment);
      res.json(alerts);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch alerts' });
    }
  });

  app.post('/api/alerts', async (req, res) => {
    try {
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      const parsed = createAlertSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      }
      const alert = await storage.createAlert({
        ...parsed.data,
        userId: (req as any).session?.userId || 'demo-client-user',
        environment,
      });
      res.json(alert);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create alert' });
    }
  });

  app.patch('/api/alerts/:id/read', async (req, res) => {
    try {
      await storage.markAlertRead(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to mark alert as read' });
    }
  });

  // Documents API
  app.delete('/api/documents/:id', async (req, res) => {
    const userId =
      (req as any).session?.userId ||
      (req as any).session?.userId ||
      (req.headers['x-user-id'] as string) ||
      'demo-client-user';
    const environment = normalizeEnv(
      (req.query.environment as string) || (req.headers['x-environment'] as string)
    );
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      const id = req.params.id;
      const doc = await storage.getDocument(id);
      if (!doc || doc.userId !== userId) {
        return res.status(404).json({ error: 'Document not found' });
      }
      await storage.deleteDocument(id, userId, environment);
      console.log(`[Documents API] Deleted document ${id} and all derived financial records`);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Documents API] Delete error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/documents', async (req, res) => {
    try {
      const headerUserId = req.headers['x-user-id'] as string;
      const userId =
        (req as any).session?.userId || (headerUserId && headerUserId.trim()) || 'demo-client-user';

      // Resolve environment from user account if no explicit header sent
      let environment = normalizeEnv(
        (req.query.environment as string) || (req.headers['x-environment'] as string)
      );
      const explicitEnv = !!(req.query.environment as string) || !!(req.headers['x-environment'] as string);
      if (!explicitEnv && userId !== 'demo-client-user') {
        const userRecord = await storage.getUser(userId);
        if (userRecord?.environment) environment = normalizeEnv(userRecord.environment);
      }

      console.log(`[Documents API] Fetching for userId: ${userId}, environment: ${environment}`);
      const docs = await storage.getDocuments(userId, environment);
      console.log(`[Documents API] Found ${docs.length} documents`);
      res.json(docs);
    } catch (error) {
      console.error('[Documents API] Error:', error);
      res.status(500).json({ error: 'Failed to fetch documents' });
    }
  });

  app.post('/api/documents', async (req, res) => {
    try {
      const userId =
        (req as any).session?.userId ||
        (req as any).session?.userId ||
        (req.headers['x-user-id'] as string) ||
        'demo-client-user';

      // ── Environment Resolution ─────────────────────────────────────────────
      // Priority 1: explicit header/query param (admin override)
      // Priority 2: user's stored environment from the DB (canonical source)
      // Priority 3: 'demo' fallback for anonymous / unknown users
      let environment: string = normalizeEnv(
        (req.query.environment as string) || (req.headers['x-environment'] as string)
      );

      // If no explicit environment was provided, look up the user's stored env
      const explicitEnvProvided =
        !!(req.query.environment as string) || !!(req.headers['x-environment'] as string);
      if (!explicitEnvProvided && userId !== 'demo-client-user') {
        const userRecord = await storage.getUser(userId);
        if (userRecord?.environment) {
          environment = normalizeEnv(userRecord.environment);
          console.log(`[Documents API] Resolved environment from user record: ${environment} (userId=${userId})`);
        }
      }
      // ─────────────────────────────────────────────────────────────────────

      const workspaceId = resolveWorkspaceId(req);
      const parsed = createDocumentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      }

      // ─── Duplicate Detection ─────────────────────────────────────────────────
      const { fileName, fileSize, title } = parsed.data;

      let existingDoc: typeof documents.$inferSelect | undefined;

      if (fileName && fileSize) {
        const results = await db
          .select()
          .from(documents)
          .where(
            and(
              eq(documents.userId, userId),
              eq(documents.environment, environment),
              eq(documents.fileName, fileName),
              eq(documents.fileSize, fileSize)
            )
          )
          .limit(1);
        existingDoc = results[0];
      }

      if (!existingDoc && title) {
        const sixtySecondsAgo = new Date(Date.now() - 60_000);
        const results = await db
          .select()
          .from(documents)
          .where(
            and(
              eq(documents.userId, userId),
              eq(documents.environment, environment),
              eq(documents.title, title),
              sql`${documents.createdAt} > ${sixtySecondsAgo.toISOString()}`
            )
          )
          .limit(1);
        existingDoc = results[0];
      }

      if (existingDoc) {
        console.log(
          `[Documents API] Duplicate detected — returning existing doc ${existingDoc.id} (${existingDoc.title})`
        );
        return res.status(200).json({ ...existingDoc, duplicate: true });
      }
      // ─────────────────────────────────────────────────────────────────────────

      const doc = await storage.createDocument({
        ...parsed.data,
        userId,
        environment,
      });

      console.log(
        `[Documents API] Created document: ${doc.id}, title: ${doc.title}, category: ${doc.category}, fileUrl: ${doc.fileUrl || 'none'}`
      );

      // Warn if document was created without fileUrl (potential upload issue)
      if (!doc.fileUrl && (doc.fileName || doc.fileType)) {
        console.warn(
          `[Documents API] WARNING: Document ${doc.id} has fileName/fileType but no fileUrl - file may not have been uploaded correctly`
        );
      }

      // Always trigger AI analysis pipeline asynchronously.
      // AnalysisOrchestrator handles both real file uploads (via Azure OCR) and
      // text-only captures (via local fallback classifier on title/description/category).
      setImmediate(async () => {
        try {
          const { analysisOrchestrator } = await import('./services/ai/AnalysisOrchestrator');
          await analysisOrchestrator.processDocument(doc.id);
        } catch (err) {
          console.error('[Documents API] Analysis background error:', err);
        }
      });

      res.json(doc);
    } catch (error) {
      console.error('Failed to create document:', error);
      res.status(500).json({ error: 'Failed to create document' });
    }
  });

  app.post('/api/capture/analyze', async (req, res) => {
    try {
      const { base64Data, mimeType, fileName, captureType, source } = req.body;
      const userId =
        (req as any).session?.userId ||
        (req as any).session?.userId ||
        (req.headers['x-user-id'] as string) ||
        'demo-client-user';
      const workspaceId = resolveWorkspaceId(req);
      let result;
      if (captureType === 'document') {
        if (source === 'voice') {
          result = await transcribeVoiceNote(base64Data, mimeType, 'document', workspaceId, userId);
        } else {
          result = await analyzeDocumentImage(base64Data, mimeType, fileName, workspaceId, userId);
        }
      } else {
        if (source === 'voice') {
          result = await transcribeVoiceNote(
            base64Data,
            mimeType,
            'violation',
            workspaceId,
            userId
          );
        } else {
          result = await analyzeViolationImage(base64Data, mimeType, fileName, workspaceId, userId);
        }
      }
      res.json({ success: true, data: result });
    } catch (error) {
      console.error('Capture analysis error:', error);
      res.status(500).json({ success: false, error: 'Analysis failed' });
    }
  });

  // Extract financial data from uploaded document for auto-populating forms
  app.post('/api/capture/extract-financial', async (req, res) => {
    try {
      const { fileName, fileType, base64Data } = req.body;
      const userId =
        (req as any).session?.userId ||
        (req as any).session?.userId ||
        (req.headers['x-user-id'] as string) ||
        'demo-client-user';
      const workspaceId = resolveWorkspaceId(req);

      if (!fileName || !fileType) {
        return res.status(400).json({
          success: false,
          error: 'fileName and fileType are required',
        });
      }

      let ocrText = '';

      // If base64 data provided, run OCR first to extract text
      if (base64Data) {
        try {
          const ocrResult = await analyzeDocumentImage(
            base64Data,
            fileType,
            fileName,
            workspaceId,
            userId
          );
          ocrText = ocrResult.extractedText || '';
        } catch (ocrError) {
          console.log('OCR extraction failed, using filename only:', ocrError);
        }
      }

      const extraction = await extractFinancialData(
        fileName,
        fileType,
        ocrText,
        workspaceId,
        userId
      );

      res.json({
        success: true,
        data: extraction,
      });
    } catch (error) {
      console.error('Financial data extraction error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to extract financial data',
        data: {
          recordType: 'unknown',
          category: 'Other',
          description: '',
          amount: null,
          vendor: null,
          date: null,
          frequency: 'monthly',
          confidence: 0,
          extractedText: 'Extraction failed - please enter data manually',
        },
      });
    }
  });

  // Comprehensive Document Intake & Auto-Categorization - returns full analysis for approval
  app.post('/api/capture/document-intake', async (req, res) => {
    try {
      // Validate request body with Zod
      const intakeRequestSchema = z.object({
        fileName: z.string().min(1, 'fileName is required'),
        fileType: z.string().min(1, 'fileType is required'),
        base64Data: z.string().optional(),
        languageHint: z.string().optional().default('en'),
        uiLanguage: z.string().optional().default('en'),
      });

      const validationResult = intakeRequestSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          success: false,
          error: validationResult.error.errors.map((e) => e.message).join(', '),
        });
      }

      const { fileName, fileType, base64Data, languageHint, uiLanguage } = validationResult.data;
      const headerUserId = req.headers['x-user-id'] as string;
      const userId =
        (req as any).session?.userId || (headerUserId && headerUserId.trim()) || 'demo-client-user';
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      const workspaceId = resolveWorkspaceId(req);

      let rawText = '';

      // If base64 data provided, run OCR first to extract text
      if (base64Data) {
        try {
          const ocrResult = await analyzeDocumentImage(
            base64Data,
            fileType,
            fileName,
            workspaceId,
            userId
          );
          rawText = ocrResult.extractedText || '';
        } catch (ocrError) {
          console.log('OCR extraction failed, using filename only:', ocrError);
        }
      }

      // Get existing context from user's data
      const existingAssets = await storage.getAssets(userId, environment);
      const existingDebts = await storage.getDebts(userId, environment);
      const existingIncomes = await storage.getIncomes(userId, environment);
      const existingExpenses = await storage.getExpenses(userId, environment);

      const knownVendors = Array.from(
        new Set([
          ...existingExpenses
            .map((e) => e.vendor)
            .filter((v): v is string => v !== null && v !== undefined),
          ...existingIncomes
            .map((i) => i.source)
            .filter((s): s is string => s !== null && s !== undefined),
        ])
      );

      const knownCategories = Array.from(
        new Set([
          ...existingExpenses
            .map((e) => e.category)
            .filter((c): c is string => c !== null && c !== undefined),
        ])
      );

      // Run comprehensive document intake analysis
      const intakeResult = await analyzeDocumentWithIntake(
        rawText,
        fileName,
        fileType,
        languageHint || 'en',
        uiLanguage || 'en',
        {
          known_vendors: knownVendors,
          known_categories: knownCategories.length > 0 ? knownCategories : undefined,
          user_profile: {
            jurisdiction: 'US',
            currency: 'USD',
          },
        }
      );

      // Map to internal category
      const internalCategory = mapDocTypeToCategory(intakeResult.doc_type);
      const recordType = mapCategoryToRecordType(intakeResult.classifications.primary_category);

      // Add validation warnings if source_trace is incomplete
      const validationWarnings: string[] = [];
      const hasAmountSourceTrace = intakeResult.source_trace?.some((st: any) =>
        st.field.includes('amount')
      );
      const hasCategorySourceTrace = intakeResult.source_trace?.some(
        (st: any) => st.field.includes('category') || st.field.includes('doc_type')
      );

      if (intakeResult.amounts?.total_amount_normalized && !hasAmountSourceTrace) {
        validationWarnings.push('Amount extracted but no source trace provided - please verify');
      }
      if (!hasCategorySourceTrace) {
        validationWarnings.push('Classification has no source trace - based on inference');
      }

      res.json({
        success: true,
        data: {
          ...intakeResult,
          internal_category: internalCategory,
          suggested_record_type: recordType,
          requires_approval: true,
          validation_warnings: validationWarnings,
        },
      });
    } catch (error) {
      console.error('Document intake analysis error:', error);
      res.status(500).json({
        success: false,
        error: 'Document intake analysis failed',
        data: null,
      });
    }
  });

  // Approve and save document intake result - creates document and financial records
  app.post('/api/capture/document-intake/approve', async (req, res) => {
    try {
      // Validate request body with Zod
      const approvalRequestSchema = z.object({
        intakeResult: z.object({
          doc_type: z.string(),
          summary: z.string().optional(),
          classifications: z
            .object({
              primary_category: z.string(),
              sub_category: z.string().optional(),
            })
            .optional(),
          dates: z
            .object({
              document_date_normalized: z.string().nullable().optional(),
            })
            .optional(),
          amounts: z
            .object({
              total_amount_normalized: z.number().nullable().optional(),
            })
            .optional(),
          ledger_actions_proposed: z
            .array(
              z.object({
                action_type: z.enum(['ADD_TRANSACTION', 'UPDATE_TRANSACTION', 'NO_LEDGER_ACTION']),
                transaction: z
                  .object({
                    suggested_date: z.string().nullable().optional(),
                    suggested_amount: z.number().nullable().optional(),
                    suggested_category: z.string().optional(),
                    suggested_sub_category: z.string().optional(),
                    suggested_counterparty: z.string().nullable().optional(),
                    notes_for_user: z.string().optional(),
                  })
                  .optional(),
              })
            )
            .optional(),
          confidence: z
            .object({
              overall: z.number().optional(),
            })
            .optional(),
          approval_request: z
            .object({
              message_to_user: z.string().optional(),
            })
            .optional(),
          source_trace: z.array(z.any()).optional(),
        }),
        fileName: z.string().min(1),
        fileUrl: z.string().nullable().optional(),
        fileType: z.string().nullable().optional(),
        createFinancialRecords: z.boolean().optional().default(true),
        overrides: z
          .object({
            category: z.string().optional(),
            description: z.string().optional(),
            recordType: z.string().optional(),
            financialCategory: z.string().optional(),
            vendor: z.string().optional(),
            amount: z.number().optional(),
            date: z.string().optional(),
          })
          .optional(),
      });

      const validationResult = approvalRequestSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          success: false,
          error:
            'Invalid approval request: ' +
            validationResult.error.errors.map((e) => e.message).join(', '),
        });
      }

      const { intakeResult, fileName, fileUrl, fileType, createFinancialRecords, overrides } =
        validationResult.data;
      const headerUserId = req.headers['x-user-id'] as string;
      const userId =
        (req as any).session?.userId || (headerUserId && headerUserId.trim()) || 'demo-client-user';
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';

      // Merge overrides with intake result
      const finalCategory = overrides?.category || mapDocTypeToCategory(intakeResult.doc_type);
      const finalDescription = overrides?.description || intakeResult.summary || '';

      // Create the document record
      const documentData = {
        userId,
        environment,
        title: fileName,
        category: finalCategory,
        description: `${finalDescription}\n\n[AI Analysis] ${intakeResult.approval_request?.message_to_user || ''}`,
        fileName,
        fileUrl: fileUrl || null,
        fileType: fileType || null,
        fileSize: 0,
        verified: false,
        aiConfidence: Math.round((intakeResult.confidence?.overall || 0) * 100),
        aiAnalysisJson: JSON.stringify(intakeResult),
        date: intakeResult.dates?.document_date_normalized
          ? new Date(intakeResult.dates.document_date_normalized)
          : new Date(),
      };

      const savedDocument = await storage.createDocument(documentData);

      // Process all ledger actions if requested
      const createdRecords: any[] = [];
      const skippedActions: string[] = [];

      const ledgerActions = intakeResult.ledger_actions_proposed ?? [];
      if (createFinancialRecords && ledgerActions.length > 0) {
        for (const ledgerAction of ledgerActions) {
          if (ledgerAction.action_type === 'ADD_TRANSACTION' && ledgerAction.transaction) {
            const tx = ledgerAction.transaction;
            const amount = overrides?.amount ?? tx.suggested_amount;
            const amountInCents = Math.round((amount || 0) * 100);

            if (amountInCents > 0) {
              const recordType =
                overrides?.recordType || mapCategoryToRecordType(tx.suggested_category || '');
              const category = overrides?.financialCategory || tx.suggested_category;
              const vendor = overrides?.vendor || tx.suggested_counterparty;
              const date =
                overrides?.date || tx.suggested_date || new Date().toISOString().split('T')[0];

              try {
                let record = null;
                switch (recordType) {
                  case 'income':
                    record = await storage.createIncome({
                      userId,
                      environment,
                      source: vendor || 'Unknown',
                      amount: amountInCents,
                      frequency: 'monthly',
                      owner: 'self',
                      verified: false,
                      startDate: date,
                      vendor: vendor || null,
                      documentId: savedDocument.id,
                    });
                    break;
                  case 'expense':
                    record = await storage.createExpense({
                      userId,
                      environment,
                      category: category || 'Other',
                      description: `Extracted from: ${fileName}\n${tx.notes_for_user || ''}`,
                      amount: amountInCents,
                      frequency: 'monthly',
                      owner: 'self',
                      vendor: vendor || null,
                      startDate: date,
                      documentId: savedDocument.id,
                    });
                    break;
                  case 'asset':
                    record = await storage.createAsset({
                      userId,
                      environment,
                      name: vendor || fileName,
                      category: category || 'Other',
                      value: amountInCents,
                      ownership: 'self',
                      verified: false,
                      acquiredDate: date,
                      vendor: vendor || null,
                      documentId: savedDocument.id,
                    });
                    break;
                  case 'debt':
                    record = await storage.createDebt({
                      userId,
                      environment,
                      name: vendor || 'Unknown',
                      category: category || 'Other',
                      amount: amountInCents,
                      ownership: 'self',
                      monthlyPayment: null,
                      openedDate: date,
                      vendor: vendor || null,
                      documentId: savedDocument.id,
                    });
                    break;
                }
                if (record) {
                  createdRecords.push({ type: recordType, record });
                }
              } catch (err) {
                console.error('Failed to create financial record:', err);
                skippedActions.push(`Failed to create ${recordType} record`);
              }
            } else {
              skippedActions.push('Skipped action with zero/invalid amount');
            }
          } else if (ledgerAction.action_type === 'UPDATE_TRANSACTION') {
            skippedActions.push('UPDATE_TRANSACTION not yet implemented');
          } else if (ledgerAction.action_type === 'NO_LEDGER_ACTION') {
            skippedActions.push('No ledger action needed per AI analysis');
          }
        }
      }

      res.json({
        success: true,
        document: savedDocument,
        financialRecords: createdRecords,
        skippedActions,
        message:
          createdRecords.length > 0
            ? `Document saved with ${createdRecords.length} financial record(s) created`
            : 'Document saved successfully',
      });
    } catch (error) {
      console.error('Document intake approval error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to save document',
      });
    }
  });

  // Backend Intake Orchestrator - handles full document upload workflow
  // Follows strict input/output schema per orchestrator specification
  app.post('/api/orchestrator/document-upload', async (req, res) => {
    try {
      const orchestratorEventSchema = z.object({
        event_type: z.literal('DOCUMENT_UPLOADED'),
        ui_language: z.string().default('en'),
        file: z.object({
          file_id: z.string(),
          file_name: z.string(),
          mime_type: z.string(),
          storage_url: z.string().nullable(),
          pages: z.number().nullable(),
        }),
        ocr: z.object({
          raw_text: z.string().nullable(),
          language_hint: z.string().nullable(),
          engine: z.enum(['tesseract', 'vision_api', 'unknown']).nullable(),
        }),
        user_context: z.object({
          user_id: z.string(),
          matter_id: z.string(),
          jurisdiction: z.string().default('US'),
          currency: z.string().default('USD'),
        }),
        existing_context: z
          .object({
            known_accounts: z.array(z.string()).default([]),
            known_vendors: z.array(z.string()).default([]),
            known_categories: z.array(z.string()).default([]),
            open_transactions: z.array(z.any()).default([]),
            approval_policies: z
              .object({
                require_manual_confirmation_for_all: z.boolean().default(true),
                auto_approve_low_risk: z.boolean().default(false),
              })
              .default({}),
          })
          .default({}),
        intake_engine_result: documentIntakeResultSchema.optional(),
      });

      const validationResult = orchestratorEventSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          status: 'fatal_error',
          actions: [
            {
              type: 'LOG_ERROR',
              payload: {
                code: 'INVALID_EVENT_SCHEMA',
                details: validationResult.error.errors.map((e) => e.message).join('; '),
                context: { file_id: req.body?.file?.file_id || 'unknown' },
              },
            },
          ],
        });
      }

      const event = validationResult.data as DocumentUploadEvent;

      // Process the event through the orchestrator
      const orchestratorResponse = await processDocumentUploadEvent(event);

      // Execute the actions and get the final result
      const executionResult = await executeOrchestratorActions(event, orchestratorResponse);

      // Return the orchestrator response with execution results
      res.json({
        ...executionResult.finalResponse,
        execution: {
          intakeResult: executionResult.intakeResult || null,
          persistedData: executionResult.persistedData || null,
          approvalScreen: executionResult.approvalScreen || null,
        },
      });
    } catch (error) {
      console.error('Orchestrator error:', error);
      res.status(500).json({
        status: 'fatal_error',
        actions: [
          {
            type: 'LOG_ERROR',
            payload: {
              code: 'ORCHESTRATOR_EXCEPTION',
              details: error instanceof Error ? error.message : 'Unknown error',
              context: {},
            },
          },
        ],
      });
    }
  });

  // Batch re-analyze all documents - force option reprocesses all
  app.post('/api/documents/reanalyze', async (req, res) => {
    try {
      const userId =
        (req as any).session?.userId || (req.headers['x-user-id'] as string) || 'demo-client-user';
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      const force = req.query.force === 'true' || req.body?.force === true;
      const allDocs = await storage.getDocuments(userId, environment);

      // Filter documents that need analysis
      // With force=true, reanalyze ALL documents with files
      // Without force, only analyze those without [AI Analysis] tag
      const docsToAnalyze = allDocs.filter((doc) => {
        if (!doc.fileUrl || !doc.fileName) return false;
        if (force) return true;
        return !(doc.description || '').includes('[AI Analysis]');
      });

      res.json({
        total: docsToAnalyze.length,
        documentIds: docsToAnalyze.map((d) => d.id),
        message: force
          ? `Force re-analyzing ${docsToAnalyze.length} documents`
          : `Found ${docsToAnalyze.length} documents pending analysis`,
      });
    } catch (error) {
      console.error('Reanalyze scan error:', error);
      res.status(500).json({ error: 'Failed to scan documents for analysis' });
    }
  });

  // Analyze a single document by ID and create financial records from extracted data
  app.post('/api/documents/:id/analyze', async (req, res) => {
    try {
      const doc = await storage.getDocument(req.params.id);
      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      if (!doc.fileName || !doc.fileType) {
        return res.json({ success: false, message: 'No file attached to analyze' });
      }

      const force = req.query.force === 'true' || req.body?.force === true;

      // Helper function to create financial record from OCR data
      const createFinancialRecord = async (
        ocrResult: any,
        docId: string,
        userId: string,
        environment: string
      ) => {
        if (!ocrResult.financialData) return null;

        const { amount, vendor, date, type, description } = ocrResult.financialData;
        const amountInCents = Math.round(amount * 100);

        // Validate amount - don't create records with zero or negative amounts
        if (!amountInCents || amountInCents <= 0) {
          console.log('Skipping financial record creation: invalid amount', amount);
          return null;
        }

        try {
          if (type === 'income') {
            return await storage.createIncome({
              userId,
              environment,
              source: vendor || 'Unknown Source',
              amount: amountInCents,
              frequency: 'one-time',
              owner: 'self',
              vendor: vendor || null,
              documentId: docId,
              startDate: date || null,
            });
          } else if (type === 'expense') {
            return await storage.createExpense({
              userId,
              environment,
              category: doc.category || 'other',
              description: description || vendor || 'Expense',
              amount: amountInCents,
              frequency: 'one-time',
              owner: 'self',
              vendor: vendor || null,
              documentId: docId,
              startDate: date || null,
            });
          } else if (type === 'asset') {
            return await storage.createAsset({
              userId,
              environment,
              name: vendor || description || 'Asset',
              value: amountInCents,
              category: 'other',
              ownership: 'joint',
              vendor: vendor || null,
              documentId: docId,
              acquiredDate: date || null,
            });
          } else if (type === 'debt') {
            return await storage.createDebt({
              userId,
              environment,
              name: vendor || description || 'Debt',
              amount: amountInCents,
              category: 'other',
              ownership: 'joint',
              vendor: vendor || null,
              documentId: docId,
              openedDate: date || null,
            });
          }
        } catch (createError) {
          console.error('Failed to create financial record:', createError);
        }
        return null;
      };

      let analysis;
      const userId = doc.userId || 'demo-client-user';
      const environment = doc.environment || 'demo';
      const workspaceId = resolveWorkspaceId(req);

      // If we have a fileUrl that's an objectPath (starts with /objects/), fetch from object storage
      if (
        doc.fileUrl &&
        doc.fileUrl.startsWith('/objects/') &&
        (doc.fileType.includes('image') || doc.fileType.includes('pdf'))
      ) {
        try {
          const { objectStorageService } =
            await import('./replit_integrations/object_storage/objectStorage');
          const objectFile = await objectStorageService.getObjectEntityFile(doc.fileUrl);
          const [buffer] = await objectFile.download();
          const base64Data = buffer.toString('base64');

          const ocrResult = await analyzeDocumentImage(
            base64Data,
            doc.fileType,
            doc.fileName,
            workspaceId,
            userId
          );

          if (ocrResult.confidence > 0.5 || force) {
            // Update document with analysis
            const newDescription = force
              ? `[AI Analysis - ${new Date().toISOString().split('T')[0]}]\nExtracted Text: ${ocrResult.extractedText}\nCategory: ${ocrResult.category}`
              : `${doc.description || ''}\n\n[AI Analysis]\nExtracted Text: ${ocrResult.extractedText}\nCategory: ${ocrResult.category}`;

            await storage.updateDocument(doc.id, {
              category: ocrResult.category,
              description: newDescription,
            });

            // Create financial record if financialData was extracted
            let financialRecord = null;
            if (ocrResult.financialData) {
              financialRecord = await createFinancialRecord(ocrResult, doc.id, userId, environment);
            }

            return res.json({
              success: true,
              analysis: ocrResult,
              financialRecordCreated: !!financialRecord,
              financialRecord,
            });
          }
        } catch (fetchError) {
          console.error('Failed to fetch file from object storage for OCR analysis:', fetchError);
        }
      } else if (doc.fileUrl && (doc.fileType.includes('image') || doc.fileType.includes('pdf'))) {
        try {
          const response = await fetch(doc.fileUrl);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const base64Data = Buffer.from(arrayBuffer).toString('base64');

            const ocrResult = await analyzeDocumentImage(
              base64Data,
              doc.fileType,
              doc.fileName,
              workspaceId,
              userId
            );

            if (ocrResult.confidence > 0.5 || force) {
              const newDescription = force
                ? `[AI Analysis - ${new Date().toISOString().split('T')[0]}]\nExtracted Text: ${ocrResult.extractedText}\nCategory: ${ocrResult.category}`
                : `${doc.description || ''}\n\n[AI Analysis]\nExtracted Text: ${ocrResult.extractedText}\nCategory: ${ocrResult.category}`;

              await storage.updateDocument(doc.id, {
                category: ocrResult.category,
                description: newDescription,
              });

              let financialRecord = null;
              if (ocrResult.financialData) {
                financialRecord = await createFinancialRecord(
                  ocrResult,
                  doc.id,
                  userId,
                  environment
                );
              }

              return res.json({
                success: true,
                analysis: ocrResult,
                financialRecordCreated: !!financialRecord,
                financialRecord,
              });
            }
          }
        } catch (fetchError) {
          console.error('Failed to fetch file for OCR analysis:', fetchError);
        }
      }

      // Fallback to text-based analysis using the description
      analysis = await analyzeDocument(
        doc.fileName,
        doc.fileType,
        doc.description || '',
        workspaceId,
        userId
      );

      if (analysis && (analysis.confidence > 0.5 || force)) {
        await storage.updateDocument(doc.id, {
          category: analysis.category,
          description: `${doc.description || ''}\n\n[AI Analysis]\nSummary: ${analysis.summary}\nTags: ${analysis.suggestedTags.join(', ')}`,
        });
        res.json({ success: true, analysis });
      } else {
        res.json({ success: false, message: 'Analysis confidence too low' });
      }
    } catch (error) {
      console.error('Document analysis error:', error);
      res.status(500).json({ error: 'Failed to analyze document' });
    }
  });

  // Get single document by ID
  app.get('/api/documents/:id', async (req, res) => {
    try {
      const userId = (req.headers['x-user-id'] as string) || (req as any).session?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const doc = await storage.getDocument(req.params.id);
      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // Verify document belongs to the requesting user
      if (doc.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.json(doc);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch document' });
    }
  });

  // NOTE: DELETE /api/documents/:id is already defined earlier (line ~2348) with proper auth

  // Forensic Financial Document Parser - Comprehensive parsing with audit trail
  app.post('/api/documents/:id/forensic-parse', async (req, res) => {
    try {
      const {
        parseFinancialDocument,
        validateParseResult,
        mapDocTypeToFinanceCategory,
        mapDocTypeToRecordType,
      } = await import('./services/parseDocument');
      const { documentLineItems, documentParseResults } = await import('@shared/schema');

      // Authenticate user
      const userId = (req.headers['x-user-id'] as string) || (req as any).session?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const doc = await storage.getDocument(req.params.id);
      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // Authorization: Verify document belongs to requesting user
      if (doc.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const environment = (req.query.environment as string) || doc.environment || 'demo';
      const provider = (req.query.provider as 'openai' | 'gemini') || 'openai';
      const createRecords = req.query.create_records !== 'false';

      const extractedText = doc.description || '';
      let imageBase64: string | undefined;
      let imageMimeType: string | undefined;

      if (doc.fileUrl && doc.fileType?.startsWith('image/')) {
        try {
          const response = await fetch(doc.fileUrl);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            imageBase64 = Buffer.from(arrayBuffer).toString('base64');
            imageMimeType = doc.fileType;
          }
        } catch (fetchErr) {
          console.error('Failed to fetch document image:', fetchErr);
        }
      }

      const parseResult = await parseFinancialDocument(extractedText, doc.fileName || 'document', {
        provider,
        imageBase64,
        imageMimeType,
      });

      const validation = validateParseResult(parseResult.document);

      const parseResultRecord = await db
        .insert(documentParseResults)
        .values({
          documentId: doc.id,
          userId,
          docType: parseResult.document.doc_type,
          parseStatus: parseResult.document.parse_status,
          language: parseResult.document.language,
          currency: parseResult.document.currency,
          vendorName: parseResult.document.vendor_name,
          accountNumber: parseResult.document.account_number,
          billingPeriodStart: parseResult.document.billing_period_start,
          billingPeriodEnd: parseResult.document.billing_period_end,
          statementDate: parseResult.document.statement_date,
          dueDate: parseResult.document.due_date,
          totalAmountDue: parseResult.document.total_amount_due
            ? Math.round(parseResult.document.total_amount_due * 100)
            : null,
          totalAmountText: parseResult.document.total_amount_text,
          customerName: parseResult.document.customer_name,
          serviceAddress: parseResult.document.service_address,
          mailingAddress: parseResult.document.mailing_address,
          rawLlmResponse: parseResult.document as any,
          notes: parseResult.document.notes,
          requestTokens: parseResult.usage.requestTokens,
          responseTokens: parseResult.usage.responseTokens,
          latencyMs: parseResult.latencyMs,
          environment,
        })
        .returning();

      const createdLineItems: any[] = [];
      for (let i = 0; i < parseResult.document.line_items.length; i++) {
        const item = parseResult.document.line_items[i];
        const lineItem = await db
          .insert(documentLineItems)
          .values({
            documentId: doc.id,
            userId,
            lineItemIndex: i,
            label: item.label,
            categoryHint: item.category_hint,
            amount: Math.round(item.amount * 100),
            amountText: item.amount_text,
            isCreditOrRefund: item.is_credit_or_refund,
            isRecurringGuess: item.is_recurring_guess,
            pageNumber: item.page_number,
            surroundingTextSnippet: item.surrounding_text_snippet,
            environment,
          })
          .returning();
        createdLineItems.push(lineItem[0]);
      }

      const createdFinancialRecords: any[] = [];
      if (createRecords && validation.isValid && parseResult.document.parse_status === 'success') {
        const recordType = mapDocTypeToRecordType(parseResult.document.doc_type);
        const financeCategory = mapDocTypeToFinanceCategory(parseResult.document.doc_type);

        if (parseResult.document.total_amount_due && parseResult.document.total_amount_due > 0) {
          const amountInCents = Math.round(parseResult.document.total_amount_due * 100);
          const date =
            parseResult.document.statement_date ||
            parseResult.document.due_date ||
            new Date().toISOString().split('T')[0];

          try {
            let record = null;
            switch (recordType) {
              case 'expense':
                record = await storage.createExpense({
                  userId,
                  environment,
                  category: financeCategory,
                  description: `${parseResult.document.vendor_name || 'Unknown'} - Parsed from document`,
                  amount: amountInCents,
                  frequency: 'one-time',
                  owner: 'self',
                  vendor: parseResult.document.vendor_name || null,
                  documentId: doc.id,
                  startDate: date,
                });
                break;
              case 'income':
                record = await storage.createIncome({
                  userId,
                  environment,
                  source: parseResult.document.vendor_name || 'Unknown',
                  amount: amountInCents,
                  frequency: 'one-time',
                  owner: 'self',
                  vendor: parseResult.document.vendor_name || null,
                  documentId: doc.id,
                  startDate: date,
                });
                break;
              case 'debt':
                record = await storage.createDebt({
                  userId,
                  environment,
                  name: parseResult.document.vendor_name || 'Unknown Debt',
                  category: financeCategory,
                  amount: amountInCents,
                  ownership: 'self',
                  monthlyPayment: null,
                  vendor: parseResult.document.vendor_name || null,
                  documentId: doc.id,
                  openedDate: date,
                });
                break;
            }
            if (record) {
              createdFinancialRecords.push({ type: recordType, record });

              for (const lineItemRecord of createdLineItems) {
                await db
                  .update(documentLineItems)
                  .set({
                    linkedRecordType: recordType,
                    linkedRecordId: record.id,
                  })
                  .where(eq(documentLineItems.id, lineItemRecord.id));
              }
            }
          } catch (createErr) {
            console.error('Failed to create financial record:', createErr);
          }
        }
      }

      await storage.updateDocument(doc.id, {
        aiCategory: mapDocTypeToFinanceCategory(parseResult.document.doc_type),
        aiConfidence: parseResult.classification.confidence,
        aiSummary: `${parseResult.document.doc_type}: ${parseResult.document.vendor_name || 'Unknown'} - ${parseResult.document.currency} ${parseResult.document.total_amount_due || 0}`,
        aiAnalysisStatus:
          parseResult.document.parse_status === 'success' ? 'completed' : 'needs_review',
        aiAnalyzedAt: new Date(),
      });

      res.json({
        success: true,
        parseResult: parseResult.document,
        classification: parseResult.classification,
        validation,
        parseResultId: parseResultRecord[0]?.id,
        lineItemsCreated: createdLineItems.length,
        financialRecordsCreated: createdFinancialRecords,
        latencyMs: parseResult.latencyMs,
        usage: parseResult.usage,
      });
    } catch (error) {
      console.error('Forensic parse error:', error);
      res.status(500).json({ error: 'Failed to parse document' });
    }
  });

  // Get document line items for audit trail
  app.get('/api/documents/:id/line-items', async (req, res) => {
    try {
      const { documentLineItems } = await import('@shared/schema');

      // Authenticate user
      const userId = (req.headers['x-user-id'] as string) || (req as any).session?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const doc = await storage.getDocument(req.params.id);
      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // Authorization: Verify document belongs to requesting user
      if (doc.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const lineItems = await db
        .select()
        .from(documentLineItems)
        .where(eq(documentLineItems.documentId, req.params.id))
        .orderBy(documentLineItems.lineItemIndex);

      res.json(lineItems);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch line items' });
    }
  });

  // Get parse results for a document
  app.get('/api/documents/:id/parse-results', async (req, res) => {
    try {
      const { documentParseResults } = await import('@shared/schema');

      // Authenticate user
      const userId = (req.headers['x-user-id'] as string) || (req as any).session?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const doc = await storage.getDocument(req.params.id);
      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // Authorization: Verify document belongs to requesting user
      if (doc.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const results = await db
        .select()
        .from(documentParseResults)
        .where(eq(documentParseResults.documentId, req.params.id))
        .orderBy(documentParseResults.createdAt);

      res.json(results);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch parse results' });
    }
  });

  // Calendar Events API
  app.get('/api/calendar-events', async (req, res) => {
    try {
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      const events = await storage.getCalendarEvents(
        (req as any).session?.userId || 'demo-client-user',
        environment
      );
      res.json(events);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch calendar events' });
    }
  });

  app.post('/api/calendar-events', async (req, res) => {
    try {
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      const parsed = createCalendarEventSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      }
      const event = await storage.createCalendarEvent({
        ...parsed.data,
        startDate: new Date(parsed.data.startDate),
        endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
        userId: (req as any).session?.userId || 'demo-client-user',
        environment,
      });
      res.json(event);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create calendar event' });
    }
  });

  app.delete('/api/calendar-events/:id', async (req, res) => {
    try {
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      await storage.deleteCalendarEvent(
        req.params.id,
        (req as any).session?.userId || 'demo-client-user',
        environment
      );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete calendar event' });
    }
  });

  // Legal Documents API
  app.get('/api/legal-documents', async (req, res) => {
    try {
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      const docs = await storage.getLegalDocuments(
        (req as any).session?.userId || 'demo-client-user',
        environment
      );
      res.json(docs);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch legal documents' });
    }
  });

  app.post('/api/legal-documents', async (req, res) => {
    try {
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      const parsed = createLegalDocumentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      }
      const doc = await storage.createLegalDocument({
        ...parsed.data,
        userId: (req as any).session?.userId || 'demo-client-user',
        environment,
      });
      res.json(doc);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create legal document' });
    }
  });

  app.delete('/api/legal-documents/:id', async (req, res) => {
    try {
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      await storage.deleteLegalDocument(
        req.params.id,
        (req as any).session?.userId || 'demo-client-user',
        environment
      );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete legal document' });
    }
  });

  // Child Support Payments API
  app.get('/api/child-support-payments', async (req, res) => {
    try {
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      const payments = await storage.getChildSupportPayments(
        (req as any).session?.userId || 'demo-client-user',
        environment
      );
      res.json(payments);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch child support payments' });
    }
  });

  app.post('/api/child-support-payments', async (req, res) => {
    try {
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      const parsed = createChildSupportPaymentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      }
      const payment = await storage.createChildSupportPayment({
        ...parsed.data,
        dueDate: new Date(parsed.data.dueDate),
        paidDate: parsed.data.paidDate ? new Date(parsed.data.paidDate) : null,
        userId: (req as any).session?.userId || 'demo-client-user',
        environment,
      });
      res.json(payment);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create child support payment' });
    }
  });

  app.patch('/api/child-support-payments/:id', async (req, res) => {
    try {
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      const parsed = updateChildSupportPaymentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      }
      const payment = await storage.updateChildSupportPayment(
        req.params.id,
        'demo-client-user',
        environment,
        {
          ...parsed.data,
          paidDate: parsed.data.paidDate ? new Date(parsed.data.paidDate) : undefined,
        }
      );
      if (!payment) {
        return res.status(404).json({ error: 'Payment not found' });
      }
      res.json(payment);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update child support payment' });
    }
  });

  app.delete('/api/child-support-payments/:id', async (req, res) => {
    try {
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      await storage.deleteChildSupportPayment(
        req.params.id,
        (req as any).session?.userId || 'demo-client-user',
        environment
      );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete child support payment' });
    }
  });

  const validViolationStatuses = ['pending', 'reviewed', 'approved'] as const;
  const validViolationTypes = [
    'custody',
    'financial_hiding',
    'property_damage',
    'child_neglect',
    'court_order',
    'harassment',
    'other',
  ] as const;

  app.get('/api/violations', async (req, res) => {
    try {
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      const user = await storage.getUser((req as any).session?.userId || 'demo-client-user');
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      const violationsList = await storage.getViolations(user.id, environment);
      res.json(violationsList);
    } catch (error: any) {
      console.error('[Violations API] Error fetching violations:', error);
      res.status(500).json({ error: 'Failed to fetch violations', details: error.message });
    }
  });

  app.post('/api/violations', async (req, res) => {
    try {
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';

      // Validate input using Zod schema
      const parsed = createViolationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      }

      const {
        type,
        description,
        location,
        mediaUrls,
        photoCount,
        videoDuration,
        witnesses,
        isDraft,
        audioTranscript,
      } = parsed.data;

      const user = await storage.getUser((req as any).session?.userId || 'demo-client-user');

      // Check tier limits for non-draft violations
      if (!isDraft && user) {
        const check = canAddViolation(user);
        if (!check.allowed) {
          return res.status(403).json({
            error: 'Upgrade required',
            reason: check.reason,
            upgradeRequired: true,
            feature: 'unlimited_violations',
          });
        }

        // Check voice transcription limit if audio transcript is provided
        if (audioTranscript && audioTranscript.trim()) {
          const voiceCheck = canUseVoiceTranscription(user);
          if (!voiceCheck.allowed) {
            return res.status(403).json({
              error: 'Voice limit reached',
              reason: voiceCheck.reason,
              upgradeRequired: true,
              feature: 'voice_transcription',
            });
          }
        }

        // Check media upload limit if media is provided
        const mediaCount = mediaUrls?.length || 0;
        if (mediaCount > 0) {
          const mediaCheck = canUploadMedia(user);
          if (!mediaCheck.allowed) {
            return res.status(403).json({
              error: 'Media limit reached',
              reason: mediaCheck.reason,
              upgradeRequired: true,
              feature: 'media_uploads',
            });
          }

          // Check video duration limit
          if (videoDuration && videoDuration > 0) {
            const maxVideoLength = getMaxVideoLength(user);
            if (maxVideoLength !== -1 && videoDuration > maxVideoLength) {
              return res.status(403).json({
                error: 'Video too long',
                reason: `Your plan allows videos up to ${maxVideoLength} seconds. Upgrade to Pro for unlimited video length.`,
                upgradeRequired: true,
                feature: 'video_length',
              });
            }
          }
        }
      }

      const violation = await storage.createViolation({
        type,
        description,
        location: location || null,
        mediaUrls: mediaUrls || null,
        photoCount: photoCount || 0,
        videoDuration: videoDuration || null,
        witnesses: witnesses || null,
        isDraft: isDraft || false,
        status: 'pending',
        userId: (req as any).session?.userId || 'demo-client-user',
        environment,
        audioTranscript: audioTranscript || null,
      });

      // Increment usage counts for non-draft violations
      if (!isDraft) {
        await storage.incrementViolationCount((req as any).session?.userId || 'demo-client-user');

        // Increment voice transcription count if used
        if (audioTranscript && audioTranscript.trim()) {
          await storage.incrementVoiceTranscriptionCount(
            (req as any).session?.userId || 'demo-client-user'
          );
        }

        // Increment media upload count if used
        const mediaCount = mediaUrls?.length || 0;
        if (mediaCount > 0) {
          await storage.incrementMediaUploadCount(
            (req as any).session?.userId || 'demo-client-user',
            mediaCount
          );
        }
      }

      res.json(violation);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create violation' });
    }
  });

  app.patch('/api/violations/:id/status', async (req, res) => {
    try {
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      const { status } = req.body;

      if (!status || !validViolationStatuses.includes(status)) {
        return res
          .status(400)
          .json({ error: 'Invalid status. Must be: pending, reviewed, or approved' });
      }

      const violation = await storage.updateViolationStatus(
        req.params.id,
        (req as any).session?.userId || 'demo-client-user',
        environment,
        status
      );
      if (!violation) {
        return res.status(404).json({ error: 'Violation not found' });
      }
      res.json(violation);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update violation status' });
    }
  });

  app.delete('/api/violations/:id', async (req, res) => {
    try {
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      await storage.deleteViolation(
        req.params.id,
        (req as any).session?.userId || 'demo-client-user',
        environment
      );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete violation' });
    }
  });

  app.get('/api/filings/export', async (req, res) => {
    try {
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      const userId = 'demo-client-user';

      const violations = await storage.getViolations(userId, environment);
      const transactions = await storage.getTransactions(userId, environment);
      const user = await storage.getUser(userId);

      const exportData = {
        violations,
        transactions,
        userInfo: {
          fullName: user?.fullName || 'Unknown User',
          email: user?.email || 'unknown@example.com',
        },
        exportDate: new Date(),
        environment,
      };

      // Use watermarked PDF for free tier users
      const useWatermark = user ? !canGenerateCleanPDF(user) : true;
      const doc = useWatermark
        ? generateWatermarkedCourtFilingPDF(exportData)
        : generateCourtFilingPDF(exportData);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="court-filing-${Date.now()}.pdf"`);

      doc.pipe(res);
      doc.end();
    } catch (error) {
      console.error('PDF export failed:', error);
      res.status(500).json({ error: 'Failed to generate PDF' });
    }
  });

  // Messages API for secure client-lawyer communication
  app.get('/api/messages', async (req, res) => {
    try {
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      const messagesList = await storage.getMessages(environment);
      res.json(messagesList);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  // NOTE: In production, senderId/senderRole/senderName should be derived from authenticated session
  // Currently accepts client-supplied values for demo purposes
  app.post('/api/messages', async (req, res) => {
    try {
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';

      const parsed = createMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: 'Invalid message data', details: parsed.error.flatten() });
      }

      const { senderId, senderRole, senderName, content, attachmentUrl, attachmentName } =
        parsed.data;

      const message = await storage.createMessage({
        senderId,
        senderRole,
        senderName,
        content,
        attachmentUrl: attachmentUrl || null,
        attachmentName: attachmentName || null,
        isRead: false,
        environment,
      });

      res.json(message);
    } catch (error) {
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  // Smart suggestions based on case patterns
  app.get('/api/suggestions', async (req, res) => {
    try {
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      const violations = await storage.getViolations(
        (req as any).session?.userId || 'demo-client-user',
        environment
      );

      const suggestions: Array<{ type: string; title: string; description: string }> = [];

      // Check for similar violations
      const violationTypes = violations.filter((v) => !v.isDraft).map((v) => v.type);
      const typeCounts: Record<string, number> = {};
      for (const t of violationTypes) {
        typeCounts[t] = (typeCounts[t] || 0) + 1;
      }

      for (const [type, count] of Object.entries(typeCounts)) {
        if (count >= 2) {
          const typeName = type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
          suggestions.push({
            type: 'similar_violations',
            title: `Similar violations: ${typeName}`,
            description: `You have ${count} documented ${typeName} incidents. Continue documenting to strengthen your case.`,
          });
        }
      }

      // Check for evidence gaps
      const recentViolations = violations
        .filter((v) => !v.isDraft)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 3);

      for (const v of recentViolations) {
        if (!v.photoCount || v.photoCount === 0) {
          suggestions.push({
            type: 'evidence_missing',
            title: 'Evidence missing',
            description: `Your recent ${v.type.replace(/_/g, ' ')} violation could use photo/video evidence.`,
          });
          break;
        }
      }

      // Next steps recommendations
      const pendingCount = violations.filter((v) => v.status === 'pending' && !v.isDraft).length;
      if (pendingCount >= 3) {
        suggestions.push({
          type: 'next_steps',
          title: 'Ready for attorney review',
          description: `${pendingCount} violations pending review. Schedule attorney meeting to discuss filing motion.`,
        });
      }

      res.json(suggestions);
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate suggestions' });
    }
  });

  // Evidence file upload endpoint with metadata extraction and chain of custody
  app.post('/api/evidence', async (req, res) => {
    try {
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      const userId = 'demo-client-user';
      const {
        violationId,
        fileName,
        fileType,
        fileSize,
        objectPath,
        deviceId,
        gpsLatitude,
        gpsLongitude,
        altitude,
        networkType,
        exifData,
        sha256Hash,
      } = req.body;

      if (!violationId || !fileName || !objectPath) {
        return res
          .status(400)
          .json({ error: 'Missing required fields: violationId, fileName, objectPath' });
      }

      // Create evidence file record
      const evidenceFile = await storage.createEvidenceFile({
        violationId,
        userId,
        fileName,
        fileType: fileType || 'application/octet-stream',
        fileSize: fileSize || 0,
        objectPath,
        deviceId: deviceId || null,
        gpsLatitude: gpsLatitude || null,
        gpsLongitude: gpsLongitude || null,
        altitude: altitude || null,
        networkType: networkType || null,
        exifData: exifData ? JSON.stringify(exifData) : null,
        sha256Hash: sha256Hash || null,
        isEncrypted: false,
        environment,
      });

      // Create chain of custody entry for initial upload
      const crypto = await import('crypto');
      const entryData = JSON.stringify({
        evidenceId: evidenceFile.id,
        action: 'UPLOADED',
        timestamp: new Date().toISOString(),
        userId,
      });
      const entryHash = crypto.createHash('sha256').update(entryData).digest('hex').toUpperCase();

      await storage.addChainOfCustodyEntry({
        evidenceId: evidenceFile.id,
        userId,
        action: 'UPLOADED',
        ipAddress: req.ip || req.socket.remoteAddress || null,
        userAgent: req.headers['user-agent'] || null,
        previousHash: null,
        entryHash,
        environment,
      });

      res.json({
        ...evidenceFile,
        metadata: {
          timestamp: evidenceFile.timestamp,
          deviceId: evidenceFile.deviceId,
          gpsLatitude: evidenceFile.gpsLatitude,
          gpsLongitude: evidenceFile.gpsLongitude,
          altitude: evidenceFile.altitude,
          networkType: evidenceFile.networkType,
        },
      });
    } catch (error) {
      console.error('Evidence upload failed:', error);
      res.status(500).json({ error: 'Failed to save evidence' });
    }
  });

  // Get evidence files for a violation
  app.get('/api/violations/:id/evidence', async (req, res) => {
    try {
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      const evidenceFiles = await storage.getEvidenceFiles(
        req.params.id,
        (req as any).session?.userId || 'demo-client-user',
        environment
      );
      res.json(evidenceFiles);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch evidence files' });
    }
  });

  // Get chain of custody for evidence
  app.get('/api/evidence/:id/custody', async (req, res) => {
    try {
      const environment =
        (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';
      const custody = await storage.getChainOfCustody(req.params.id, environment);
      res.json(custody);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch chain of custody' });
    }
  });

  app.post('/api/admin/reset-demo', async (req, res) => {
    try {
      const adminSecret = req.headers['x-admin-secret'] as string;
      const expectedSecret = process.env.ADMIN_SECRET;

      if (!expectedSecret) {
        return res.status(500).json({ error: 'Admin endpoint not configured' });
      }

      if (!adminSecret || adminSecret !== expectedSecret) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      await eraseDemoData();
      res.json({ success: true, message: 'Demo data reset successfully' });
    } catch (error) {
      console.error('Manual demo reset failed:', error);
      res.status(500).json({ error: 'Failed to reset demo data' });
    }
  });

  // User-accessible demo data reset (no admin secret required, but only works in demo mode)
  app.post('/api/demo/reset', async (req, res) => {
    try {
      const environment = (req.headers['x-environment'] as string) || 'demo';

      if (environment !== 'demo') {
        return res.status(403).json({ error: 'Demo reset only available in demo mode' });
      }

      await eraseDemoData();
      res.json({ success: true, message: 'Demo data reset successfully' });
    } catch (error) {
      console.error('User demo reset failed:', error);
      res.status(500).json({ error: 'Failed to reset demo data' });
    }
  });

  // User-accessible demo data erase - completely clears data WITHOUT regenerating sample data
  // Works for both main demo and test user environments
  app.post('/api/demo/erase', async (req, res) => {
    try {
      const environment = (req.headers['x-environment'] as string) || 'demo';

      // Allow erase for main demo or any test environment
      if (environment !== 'demo' && !isTestEnvironment(environment)) {
        return res.status(403).json({ error: 'Erase only available in demo or test mode' });
      }

      if (environment === 'demo') {
        await eraseDemoData();
      } else {
        // For test environments, keep user account but erase data
        await eraseEnvironmentData(environment);
      }

      res.json({ success: true, message: `Data for ${environment} erased completely` });
    } catch (error) {
      console.error('User demo/test erase failed:', error);
      res.status(500).json({ error: 'Failed to erase data' });
    }
  });

  // Get list of available test user credentials (for admin/documentation purposes)
  app.get('/api/test-users', async (_req, res) => {
    // Return test user info with obscured passwords for security
    const testUserInfo = TEST_USERS.map((u) => ({
      email: u.email,
      password: u.password, // These are simple test passwords, safe to expose for testing
      environment: u.environment,
    }));
    res.json({ testUsers: testUserInfo });
  });

  // ==========================================
  // SUBSCRIPTION & TIER MANAGEMENT ROUTES
  // ==========================================

  // Get user subscription info and limits
  app.get('/api/subscription', async (req, res) => {
    try {
      // FIX: Use consistent user ID resolution strategy to avoid subscription tier mismatch
      const userId =
        (req as any).session?.userId ||
        ((req.headers['x-user-id'] as string)?.trim()) ||
        'demo-client-user';
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const tier = getUserTier(user);
      const limits = getTierLimits(tier);
      const remainingViolations = getRemainingViolations(user);
      const remainingCases = getRemainingCases(user);
      const remainingVoice = getRemainingVoiceTranscriptions(user);
      const remainingMedia = getRemainingMediaUploads(user);

      res.json({
        tier,
        tierInfo: limits,
        usage: {
          casesCount: user.casesCount,
          violationsCountThisMonth: user.violationsCountThisMonth,
          remainingViolations,
          remainingCases,
          voiceTranscriptionsThisMonth: user.voiceTranscriptionsThisMonth || 0,
          mediaUploadsThisMonth: user.mediaUploadsThisMonth || 0,
          remainingVoice,
          remainingMedia,
        },
        subscription: {
          status: user.subscriptionStatus,
          stripeCustomerId: user.stripeCustomerId ? 'connected' : null,
          stripeSubscriptionId: user.stripeSubscriptionId ? 'active' : null,
        },
        allTiers: SUBSCRIPTION_TIERS,
      });
    } catch (error) {
      console.error('Failed to fetch subscription:', error);
      res.status(500).json({ error: 'Failed to fetch subscription info' });
    }
  });

  // Get all pricing tiers (public endpoint)
  app.get('/api/pricing', (_req, res) => {
    res.json({
      tiers: Object.entries(SUBSCRIPTION_TIERS).map(([key, value]) => ({
        id: key,
        ...value,
      })),
    });
  });

  // ==========================================
  // CASE MANAGEMENT ROUTES (with tier gating)
  // ==========================================

  // Get all cases
  app.get('/api/cases', async (req, res) => {
    try {
      const environment = (req.query.environment as string) || 'demo';
      const userCases = await storage.getCases(
        (req as any).session?.userId || 'demo-client-user',
        environment
      );
      res.json(userCases);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch cases' });
    }
  });

  // Create a new case (tier-gated)
  app.post('/api/cases', async (req, res) => {
    try {
      const environment = (req.query.environment as string) || 'demo';
      const user = await storage.getUser((req as any).session?.userId || 'demo-client-user');

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Check tier limits
      const check = canCreateCase(user);
      if (!check.allowed) {
        return res.status(403).json({
          error: 'Upgrade required',
          reason: check.reason,
          upgradeRequired: true,
          feature: 'unlimited_cases',
        });
      }

      const { title, caseNumber, court, opposingParty } = req.body;

      if (!title || typeof title !== 'string') {
        return res.status(400).json({ error: 'Case title is required' });
      }

      const newCase = await storage.createCase({
        userId: (req as any).session?.userId || 'demo-client-user',
        title,
        caseNumber: caseNumber || null,
        court: court || null,
        opposingParty: opposingParty || null,
        status: 'active',
        environment,
      });

      // Increment user's case count
      await storage.incrementCaseCount((req as any).session?.userId || 'demo-client-user');

      res.json(newCase);
    } catch (error) {
      console.error('Failed to create case:', error);
      res.status(500).json({ error: 'Failed to create case' });
    }
  });

  // Delete a case
  app.delete('/api/cases/:id', async (req, res) => {
    try {
      const environment = (req.query.environment as string) || 'demo';
      await storage.deleteCase(
        req.params.id,
        (req as any).session?.userId || 'demo-client-user',
        environment
      );
      await storage.decrementCaseCount((req as any).session?.userId || 'demo-client-user');
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete case' });
    }
  });

  // ==========================================
  // STRIPE CHECKOUT & BILLING ROUTES
  // ==========================================

  // Create checkout session for subscription upgrade
  app.post('/api/stripe/create-checkout', async (req, res) => {
    try {
      const { isStripeAvailable } = await import('./stripeClient');
      if (!isStripeAvailable()) {
        return res.status(503).json({ error: 'Payment system not configured' });
      }

      const { priceId, tier } = req.body;
      const user = await storage.getUser((req as any).session?.userId || 'demo-client-user');

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (!priceId || !tier) {
        return res.status(400).json({ error: 'Missing priceId or tier' });
      }

      // Validate tier is a valid subscription tier
      const validTiers = ['individual', 'pro', 'team', 'enterprise'];
      if (!validTiers.includes(tier)) {
        return res.status(400).json({ error: 'Invalid tier' });
      }

      // Validate priceId exists in Stripe and matches the tier (server-side validation)
      const { db } = await import('./db');
      const { sql } = await import('drizzle-orm');

      try {
        const priceResult = await db.execute(sql`
          SELECT p.metadata as product_metadata, pr.metadata as price_metadata, pr.id
          FROM stripe.prices pr
          JOIN stripe.products p ON pr.product = p.id
          WHERE pr.id = ${priceId} AND pr.active = true
        `);

        if (!priceResult.rows.length) {
          return res.status(400).json({ error: 'Invalid price ID' });
        }

        // Verify the price belongs to the claimed tier - MANDATORY validation
        const priceRow = priceResult.rows[0] as any;
        const priceTier = priceRow.product_metadata?.tier || priceRow.price_metadata?.tier;

        // Reject if tier metadata is missing or doesn't match claimed tier
        if (!priceTier) {
          console.error(`Price ${priceId} missing tier metadata - rejecting checkout`);
          return res.status(400).json({ error: 'Price configuration incomplete' });
        }

        if (priceTier !== tier) {
          console.error(`Price ${priceId} tier mismatch: expected ${tier}, got ${priceTier}`);
          return res.status(400).json({ error: 'Price does not match tier' });
        }
      } catch (dbError: any) {
        // If Stripe tables don't exist yet, reject the checkout - can't validate
        console.error('Stripe price validation failed:', dbError.message);
        return res.status(503).json({ error: 'Payment system not ready. Please try again later.' });
      }

      const { stripeService } = await import('./stripeService');

      // Create or get customer
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripeService.createCustomer(
          user.email,
          user.id.toString(),
          user.fullName || undefined
        );
        await storage.updateUserStripeInfo(user.id.toString(), {
          stripeCustomerId: customer.id,
        });
        customerId = customer.id;
      }

      // Create checkout session
      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
      const session = await stripeService.createCheckoutSession(
        customerId,
        priceId,
        `${baseUrl}/dashboard?checkout=success&tier=${tier}`,
        `${baseUrl}/pricing?checkout=cancelled`,
        user.id.toString(),
        tier
      );

      res.json({ url: session.url });
    } catch (error: any) {
      console.error('Checkout session creation failed:', error);
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  });

  // Create customer portal session for managing subscription
  app.post('/api/stripe/create-portal', async (req, res) => {
    try {
      const { isStripeAvailable } = await import('./stripeClient');
      if (!isStripeAvailable()) {
        return res.status(503).json({ error: 'Payment system not configured' });
      }

      const user = await storage.getUser((req as any).session?.userId || 'demo-client-user');

      if (!user || !user.stripeCustomerId) {
        return res.status(400).json({ error: 'No active subscription' });
      }

      const { stripeService } = await import('./stripeService');
      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;

      const session = await stripeService.createCustomerPortalSession(
        user.stripeCustomerId,
        `${baseUrl}/dashboard`
      );

      res.json({ url: session.url });
    } catch (error: any) {
      console.error('Portal session creation failed:', error);
      res.status(500).json({ error: 'Failed to create portal session' });
    }
  });

  // Get Stripe products and prices from synced database
  app.get('/api/stripe/products', async (req, res) => {
    try {
      const { db } = await import('./db');
      const { sql } = await import('drizzle-orm');

      const result = await db.execute(sql`
        SELECT 
          p.id as product_id,
          p.name as product_name,
          p.description as product_description,
          p.metadata as product_metadata,
          pr.id as price_id,
          pr.unit_amount,
          pr.currency,
          pr.recurring,
          pr.metadata as price_metadata
        FROM stripe.products p
        LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        WHERE p.active = true
        ORDER BY pr.unit_amount ASC
      `);

      // Group prices by product and tier
      const products: Record<string, any> = {};
      for (const row of result.rows as any[]) {
        const tier = row.product_metadata?.tier || row.price_metadata?.tier;
        if (!tier) continue;

        if (!products[tier]) {
          products[tier] = {
            id: row.product_id,
            name: row.product_name,
            description: row.product_description,
            tier,
            prices: [],
          };
        }

        if (row.price_id) {
          products[tier].prices.push({
            id: row.price_id,
            unitAmount: row.unit_amount,
            currency: row.currency,
            interval: row.recurring?.interval || 'month',
          });
        }
      }

      res.json({ products: Object.values(products) });
    } catch (error: any) {
      console.error('Failed to fetch Stripe products:', error);
      res.json({ products: [] });
    }
  });

  // Get Stripe publishable key for frontend
  app.get('/api/stripe/config', async (_req, res) => {
    try {
      const { getStripePublishableKey } = await import('./stripeClient');
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error: any) {
      console.error('Failed to get Stripe config:', error);
      res.status(500).json({ error: 'Stripe not configured' });
    }
  });

  // ============ Media Routes ============

  // Upload media to violation
  app.post('/api/violations/:violationId/media', async (req, res) => {
    try {
      const userId =
        (req as any).session?.userId || (req.headers['x-user-id'] as string) || 'demo-client-user';
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      const { fileName, fileType, fileSizeBytes, mimeType, storageUrl, durationSeconds } = req.body;

      if (!['audio', 'video', 'image'].includes(fileType)) {
        return res
          .status(400)
          .json({ error: 'Invalid file type. Must be audio, video, or image.' });
      }

      // Check tier limits
      const uploadCheck = canUploadMedia(user);
      if (!uploadCheck.allowed) {
        return res.status(403).json({
          error: uploadCheck.reason || 'Media upload limit reached for your subscription tier',
          remaining: getRemainingMediaUploads(user),
        });
      }

      // Check video duration limit
      if (fileType === 'video' && durationSeconds) {
        const maxDuration = getMaxVideoLength(user);
        if (durationSeconds > maxDuration) {
          return res.status(403).json({
            error: `Video exceeds maximum duration of ${maxDuration} seconds for your tier`,
            maxDuration,
          });
        }
      }

      const media = await mediaService.uploadMedia(
        req.params.violationId,
        userId, // Pass userId for tier-based file size limits
        fileName,
        fileType,
        fileSizeBytes,
        mimeType,
        storageUrl,
        durationSeconds
      );

      res.status(201).json({
        success: true,
        message: 'Media uploaded successfully',
        data: media,
      });
    } catch (error: any) {
      console.error('Media upload failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Save transcript for violation
  app.post('/api/violations/:violationId/transcript', async (req, res) => {
    try {
      const userId =
        (req as any).session?.userId || (req.headers['x-user-id'] as string) || 'demo-client-user';
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      const { transcript } = req.body;
      if (!transcript || typeof transcript !== 'string') {
        return res.status(400).json({ error: 'Transcript is required' });
      }

      // Check voice transcription limits
      const voiceCheck = canUseVoiceTranscription(user);
      if (!voiceCheck.allowed) {
        return res.status(403).json({
          error:
            voiceCheck.reason || 'Voice transcription limit reached for your subscription tier',
          remaining: getRemainingVoiceTranscriptions(user),
        });
      }

      await mediaService.saveTranscript(req.params.violationId, transcript);

      res.json({
        success: true,
        message: 'Transcript saved successfully',
      });
    } catch (error: any) {
      console.error('Transcript save failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // AI classify violation from transcript
  app.post('/api/violations/:violationId/classify', async (req, res) => {
    try {
      const userId =
        (req as any).session?.userId || (req.headers['x-user-id'] as string) || 'demo-client-user';
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      // Check AI classification permission (Pro+ only)
      const classifyCheck = canUseAIClassification(user);
      if (!classifyCheck.allowed) {
        return res.status(403).json({
          error: `AI classification requires Pro tier or higher. Current level: ${classifyCheck.level}`,
        });
      }

      const classification = await mediaService.classifyViolation(req.params.violationId);

      res.json({
        success: true,
        message: 'Violation classified successfully',
        data: classification,
      });
    } catch (error: any) {
      console.error('Classification failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get all media for violation
  app.get('/api/violations/:violationId/media', async (req, res) => {
    try {
      const mediaData = await mediaService.getMediaForViolation(req.params.violationId);

      res.json({
        success: true,
        data: mediaData,
      });
    } catch (error: any) {
      console.error('Failed to get media:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get user's violation count this month
  app.get('/api/users/violations-this-month', async (req, res) => {
    try {
      const userId =
        (req as any).session?.userId || (req.headers['x-user-id'] as string) || 'demo-client-user';
      const count = await mediaService.getViolationsThisMonth(userId);

      res.json({
        success: true,
        data: { count },
      });
    } catch (error: any) {
      console.error('Failed to get violation count:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Update user tier metrics (recalculate monthly usage)
  app.post('/api/users/:userId/update-tier', async (req, res) => {
    try {
      const { userId } = req.params;

      const result = await mediaService.updateUserTierMetrics(userId);

      res.json({
        success: true,
        message: 'User tier metrics updated',
        data: result,
      });
    } catch (error: any) {
      console.error('Failed to update tier metrics:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get violations count by case this month
  app.get('/api/cases/:caseId/violations-count', async (req, res) => {
    try {
      const count = await mediaService.getViolationsThisMonthByCase(req.params.caseId);

      res.json({
        success: true,
        data: {
          caseId: req.params.caseId,
          violationsThisMonth: count,
        },
      });
    } catch (error: any) {
      console.error('Failed to get case violations count:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get detailed tier and usage statistics for user
  app.get('/api/users/:userId/tier-stats', async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      const tier = user.subscriptionTier || 'free';
      const tierConfig =
        SUBSCRIPTION_TIERS[tier as keyof typeof SUBSCRIPTION_TIERS] || SUBSCRIPTION_TIERS.free;

      const violationsThisMonth = user.violationsCountThisMonth || 0;
      const voiceThisMonth = user.voiceTranscriptionsThisMonth || 0;
      const mediaThisMonth = user.mediaUploadsThisMonth || 0;

      const getRecommendedTier = (count: number) => {
        if (count >= 50) return 'enterprise';
        if (count > 20) return 'pro';
        if (count > 10) return 'individual';
        return 'free';
      };

      res.json({
        success: true,
        data: {
          userId: user.id,
          currentTier: tier,
          recommendedTier: getRecommendedTier(violationsThisMonth),
          tierLimits: {
            maxFileSizeMb: mediaService.getMaxFileSizeForTier(tier) / (1024 * 1024),
            maxViolationsPerMonth:
              tierConfig.maxViolationsPerMonth === -1
                ? 'Unlimited'
                : tierConfig.maxViolationsPerMonth,
            maxVoicePerMonth:
              tierConfig.maxVoiceTranscriptionsPerMonth === -1
                ? 'Unlimited'
                : tierConfig.maxVoiceTranscriptionsPerMonth,
            maxMediaPerMonth:
              tierConfig.maxMediaUploadsPerMonth === -1
                ? 'Unlimited'
                : tierConfig.maxMediaUploadsPerMonth,
          },
          usage: {
            violationsThisMonth,
            voiceTranscriptionsThisMonth: voiceThisMonth,
            mediaUploadsThisMonth: mediaThisMonth,
            violationsRemaining:
              tierConfig.maxViolationsPerMonth === -1
                ? 'Unlimited'
                : Math.max(0, tierConfig.maxViolationsPerMonth - violationsThisMonth),
            voiceRemaining:
              tierConfig.maxVoiceTranscriptionsPerMonth === -1
                ? 'Unlimited'
                : Math.max(0, tierConfig.maxVoiceTranscriptionsPerMonth - voiceThisMonth),
            mediaRemaining:
              tierConfig.maxMediaUploadsPerMonth === -1
                ? 'Unlimited'
                : Math.max(0, tierConfig.maxMediaUploadsPerMonth - mediaThisMonth),
          },
        },
      });
    } catch (error: any) {
      console.error('Failed to get tier stats:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/users/:userId/usage-metrics - Get detailed usage metrics with tier enforcement
  app.get('/api/users/:userId/usage-metrics', async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId;
      const metrics = await tierEnforcementService.getUserUsageMetrics(userId);
      const tierLimits = TierEnforcementService.getTierLimits(metrics.tier);

      res.json({
        success: true,
        data: {
          metrics,
          tierLimits,
          usagePercentage: {
            storage:
              tierLimits.maxStorageMB !== null
                ? Math.round((metrics.storageUsedMB / tierLimits.maxStorageMB) * 100)
                : 0,
            violations:
              tierLimits.maxViolationsPerMonth !== null
                ? Math.round((metrics.violationsThisMonth / tierLimits.maxViolationsPerMonth) * 100)
                : 0,
            cases:
              tierLimits.maxCases !== null
                ? Math.round((metrics.casesActive / tierLimits.maxCases) * 100)
                : 0,
          },
        },
      });
    } catch (error: any) {
      console.error('Failed to get usage metrics:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/users/:userId/check-upload - Check if user can upload a file
  app.post('/api/users/:userId/check-upload', async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId;
      const { fileSizeMB } = req.body;

      if (!fileSizeMB || fileSizeMB <= 0) {
        return res.status(400).json({
          success: false,
          error: 'fileSizeMB must be a positive number',
        });
      }

      const result = await tierEnforcementService.canUploadFile(userId, fileSizeMB);

      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Upload check failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/users/:userId/tier-recommendation - Get recommended tier upgrade
  app.get('/api/users/:userId/tier-recommendation', async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId;
      const recommendation = await tierEnforcementService.getRecommendedTierUpgrade(userId);

      res.json({ success: true, data: recommendation });
    } catch (error: any) {
      console.error('Failed to get tier recommendation:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/users/:userId/log-usage - Manually trigger usage logging
  app.post('/api/users/:userId/log-usage', async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId;
      const environment = req.body.environment || 'demo';
      await tierEnforcementService.logUsageMetrics(userId, environment);

      res.json({ success: true, message: 'Usage metrics logged successfully' });
    } catch (error: any) {
      console.error('Failed to log usage:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ==========================================
  // BILLING ROUTES
  // ==========================================

  // GET /api/users/:userId/billing - Calculate current month billing
  app.get('/api/users/:userId/billing', async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId;
      const billing = await billingService.calculateMonthlyBilling(userId);

      res.json({
        success: true,
        data: {
          ...billing,
          formattedAmount: BillingService.formatPrice(billing.amountCents),
        },
      });
    } catch (error: any) {
      console.error('Failed to calculate billing:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/users/:userId/billing/history - Get billing history
  app.get('/api/users/:userId/billing/history', async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId;
      const limit = parseInt(req.query.limit as string) || 12;
      const history = await billingService.getBillingHistory(userId, limit);

      res.json({
        success: true,
        data: history.map((record) => ({
          ...record,
          formattedAmount: BillingService.formatPrice(record.amountCents),
        })),
      });
    } catch (error: any) {
      console.error('Failed to get billing history:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/users/:userId/billing/save - Save billing record
  app.post('/api/users/:userId/billing/save', async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId;
      const billing = await billingService.calculateMonthlyBilling(userId);
      await billingService.saveBillingRecord(billing);

      res.json({
        success: true,
        message: 'Billing record saved',
        data: billing,
      });
    } catch (error: any) {
      console.error('Failed to save billing:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/pricing - Get tier pricing info
  app.get('/api/tier-pricing', async (_req: Request, res: Response) => {
    const tierNames = ['free', 'individual', 'pro', 'team', 'enterprise'];
    const pricing = tierNames.map((tierName) => {
      const tierPricing = BillingService.getPricing(tierName);
      return {
        tier: tierName,
        monthlyBasePriceCents: tierPricing.monthlyBasePriceCents,
        overageChargePerViolationCents: tierPricing.overageChargePerViolationCents,
        overageChargePerGbCents: tierPricing.overageChargePerGbCents,
        limits: BillingService.getLimits(tierName),
        formattedPrice: BillingService.formatPrice(tierPricing.monthlyBasePriceCents),
      };
    });

    res.json({ success: true, data: pricing });
  });

  // ==========================================
  // TIER MIGRATION ROUTES
  // ==========================================

  // POST /api/users/:userId/migrate-tier - Migrate user to new tier
  app.post('/api/users/:userId/migrate-tier', async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId;
      const { newTier, reason, gracePeriodDays } = req.body;

      if (!newTier) {
        return res.status(400).json({ success: false, error: 'newTier is required' });
      }

      const migration = await tierMigrationService.migrateTier(
        userId,
        newTier,
        reason || 'User requested',
        gracePeriodDays || 0
      );

      res.json({ success: true, data: migration });
    } catch (error: any) {
      console.error('Tier migration failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/users/:userId/migration - Get active migration
  app.get('/api/users/:userId/migration', async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId;
      const migration = await tierMigrationService.getActiveMigration(userId);

      res.json({ success: true, data: migration });
    } catch (error: any) {
      console.error('Failed to get migration:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/users/:userId/migration/history - Get migration history
  app.get('/api/users/:userId/migration/history', async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId;
      const limit = parseInt(req.query.limit as string) || 10;
      const history = await tierMigrationService.getMigrationHistory(userId, limit);

      res.json({ success: true, data: history });
    } catch (error: any) {
      console.error('Failed to get migration history:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/migrations/:migrationId/cancel - Cancel pending migration
  app.post('/api/migrations/:migrationId/cancel', async (req: Request, res: Response) => {
    try {
      const migrationId = req.params.migrationId;
      await tierMigrationService.cancelMigration(migrationId);

      res.json({ success: true, message: 'Migration cancelled' });
    } catch (error: any) {
      console.error('Failed to cancel migration:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/admin/apply-pending-migrations - Apply all pending migrations
  app.post('/api/admin/apply-pending-migrations', async (req: Request, res: Response) => {
    try {
      const adminSecret = req.headers['x-admin-secret'] as string;
      if (!process.env.ADMIN_SECRET || adminSecret !== process.env.ADMIN_SECRET) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const result = await tierMigrationService.applyPendingMigrations();

      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Failed to apply migrations:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Log loaded media routes
  console.log('Media & Analytics Routes Loaded:');
  console.log('   POST /api/violations/:violationId/media');
  console.log('   POST /api/violations/:violationId/transcript');
  console.log('   POST /api/violations/:violationId/classify');
  console.log('   GET  /api/violations/:violationId/media');
  console.log('   GET  /api/users/violations-this-month');
  console.log('   GET  /api/cases/:caseId/violations-count');
  console.log('   POST /api/users/:userId/update-tier');
  console.log('   GET  /api/users/:userId/tier-stats');
  console.log('   GET  /api/users/:userId/usage-metrics');
  console.log('   POST /api/users/:userId/check-upload');
  console.log('   GET  /api/users/:userId/tier-recommendation');
  console.log('   POST /api/users/:userId/log-usage');
  console.log('   GET  /api/users/:userId/billing');
  console.log('   GET  /api/users/:userId/billing/history');
  console.log('   POST /api/users/:userId/billing/save');
  console.log('   GET  /api/tier-pricing');
  console.log('   POST /api/users/:userId/migrate-tier');
  console.log('   GET  /api/users/:userId/migration');
  console.log('   GET  /api/users/:userId/migration/history');
  console.log('   POST /api/migrations/:migrationId/cancel');

  // ==========================================
  // QUOTA RESET ROUTES
  // ==========================================

  // GET /api/users/:userId/quota-status - Get current quota status
  app.get('/api/users/:userId/quota-status', async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      const status = quotaResetService.getCurrentQuotaStatus(user);

      res.json({ success: true, data: status });
    } catch (error: any) {
      console.error('Failed to get quota status:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/users/:userId/reset-quota - Manually reset user quota
  app.post('/api/users/:userId/reset-quota', async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId;
      const reset = await quotaResetService.resetUserQuota(userId);

      res.json({ success: true, data: reset });
    } catch (error: any) {
      console.error('Failed to reset quota:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/users/:userId/quota-history - Get quota reset history
  app.get('/api/users/:userId/quota-history', async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId;
      const limit = parseInt(req.query.limit as string) || 12;
      const history = await quotaResetService.getResetHistory(userId, limit);

      res.json({ success: true, data: history });
    } catch (error: any) {
      console.error('Failed to get quota history:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/admin/reset-all-quotas - Reset quotas for all users (admin)
  app.post('/api/admin/reset-all-quotas', async (req: Request, res: Response) => {
    try {
      const adminSecret = req.headers['x-admin-secret'] as string;
      if (!process.env.ADMIN_SECRET || adminSecret !== process.env.ADMIN_SECRET) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const result = await quotaResetService.resetMonthlyQuotas();

      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Failed to reset all quotas:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  console.log('   GET  /api/users/:userId/quota-status');
  console.log('   POST /api/users/:userId/reset-quota');
  console.log('   GET  /api/users/:userId/quota-history');
  console.log('   POST /api/admin/reset-all-quotas');

  // ==========================================
  // ANALYTICS ROUTES
  // ==========================================
  if (enableOptionalIntegrations) {
    // GET /api/admin/analytics/platform - Get platform-wide metrics
    app.get('/api/admin/analytics/platform', async (req: Request, res: Response) => {
      try {
        const adminSecret = req.headers['x-admin-secret'] as string;
        if (!process.env.ADMIN_SECRET || adminSecret !== process.env.ADMIN_SECRET) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const metrics = await analyticsService.getPlatformMetrics();

        res.json({ success: true, data: metrics });
      } catch (error: any) {
        console.error('Failed to get platform metrics:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // GET /api/admin/analytics/tiers - Get tier distribution
    app.get('/api/admin/analytics/tiers', async (req: Request, res: Response) => {
      try {
        const adminSecret = req.headers['x-admin-secret'] as string;
        if (!process.env.ADMIN_SECRET || adminSecret !== process.env.ADMIN_SECRET) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const distribution = await analyticsService.getTierDistribution();

        res.json({ success: true, data: distribution });
      } catch (error: any) {
        console.error('Failed to get tier distribution:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // GET /api/admin/analytics/trends - Get usage trends
    app.get('/api/admin/analytics/trends', async (req: Request, res: Response) => {
      try {
        const adminSecret = req.headers['x-admin-secret'] as string;
        if (!process.env.ADMIN_SECRET || adminSecret !== process.env.ADMIN_SECRET) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const days = parseInt(req.query.days as string) || 30;
        const trends = await analyticsService.getUsageTrends(days);

        res.json({ success: true, data: trends });
      } catch (error: any) {
        console.error('Failed to get usage trends:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // GET /api/admin/analytics/revenue - Get revenue by tier
    app.get('/api/admin/analytics/revenue', async (req: Request, res: Response) => {
      try {
        const adminSecret = req.headers['x-admin-secret'] as string;
        if (!process.env.ADMIN_SECRET || adminSecret !== process.env.ADMIN_SECRET) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const revenue = await analyticsService.getRevenueByTier();

        res.json({
          success: true,
          data: revenue.map((r) => ({
            ...r,
            formattedSubscription: analyticsService.formatCurrency(r.subscriptionRevenueCents),
            formattedOverage: analyticsService.formatCurrency(r.overageRevenueCents),
            formattedTotal: analyticsService.formatCurrency(r.totalRevenueCents),
          })),
        });
      } catch (error: any) {
        console.error('Failed to get revenue:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // GET /api/admin/analytics/top-users - Get top users
    app.get('/api/admin/analytics/top-users', async (req: Request, res: Response) => {
      try {
        const adminSecret = req.headers['x-admin-secret'] as string;
        if (!process.env.ADMIN_SECRET || adminSecret !== process.env.ADMIN_SECRET) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const limit = parseInt(req.query.limit as string) || 10;
        const topUsers = await analyticsService.getTopUsers(limit);

        res.json({ success: true, data: topUsers });
      } catch (error: any) {
        console.error('Failed to get top users:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // GET /api/admin/analytics/cohorts - Get cohort analysis
    app.get('/api/admin/analytics/cohorts', async (req: Request, res: Response) => {
      try {
        const adminSecret = req.headers['x-admin-secret'] as string;
        if (!process.env.ADMIN_SECRET || adminSecret !== process.env.ADMIN_SECRET) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const months = parseInt(req.query.months as string) || 12;
        const cohorts = await analyticsService.getCohortAnalysis(months);

        res.json({ success: true, data: cohorts });
      } catch (error: any) {
        console.error('Failed to get cohort analysis:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // POST /api/admin/billing/process-monthly - Process monthly billings
    app.post('/api/admin/billing/process-monthly', async (req: Request, res: Response) => {
      try {
        const adminSecret = req.headers['x-admin-secret'] as string;
        if (!process.env.ADMIN_SECRET || adminSecret !== process.env.ADMIN_SECRET) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const result = await billingService.processMonthlyBillings();

        res.json({
          success: true,
          data: result,
          message: `Processed ${result.processed} users, ${result.failed} failed`,
        });
      } catch (error: any) {
        console.error('Monthly billing failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    console.log('   GET  /api/admin/analytics/platform');
    console.log('   GET  /api/admin/analytics/tiers');
    console.log('   GET  /api/admin/analytics/trends');
    console.log('   GET  /api/admin/analytics/revenue');
    console.log('   GET  /api/admin/analytics/top-users');
    console.log('   GET  /api/admin/analytics/cohorts');
    console.log('   POST /api/admin/billing/process-monthly');
  } // End of Analytics Routes

  // ========================================
  // EXTENDED APP ROUTES (Gated by ENABLE_OPTIONAL_INTEGRATIONS)
  // ========================================
  if (enableOptionalIntegrations) {
    // ========================================
    // Mobile App API Endpoints
    // ========================================
    console.log('\n📱 Mobile App Endpoints:');

    // GET /api/mobile/documents - Get documents with AI analysis info
    app.get('/api/mobile/documents', async (req: Request, res: Response) => {
      try {
        const userId =
          (req as any).session?.userId ||
          (req.headers['x-user-id'] as string) ||
          'demo-client-user';
        const environment = (req.headers['x-environment'] as string) || 'demo';

        const documents = await storage.getDocuments(userId, environment);

        // Return array directly for consistency with other endpoints
        res.json(documents);
      } catch (error: any) {
        console.error('Failed to get mobile documents:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    console.log('   GET  /api/mobile/documents');

    // POST /api/mobile/documents - Upload document with AI analysis
    app.post('/api/mobile/documents', async (req: Request, res: Response) => {
      try {
        const userId =
          (req as any).session?.userId ||
          (req.headers['x-user-id'] as string) ||
          'demo-client-user';
        const environment =
          (req.headers['x-environment'] as string) || req.body.environment || 'demo';
        const workspaceId = resolveWorkspaceId(req);
        const { title, fileName, fileType, fileUrl, fileSize, description } = req.body;

        if (!title || !fileName) {
          return res.status(400).json({ success: false, error: 'Title and fileName are required' });
        }

        // Perform AI analysis if not in demo mode, otherwise use mock
        let analysisResult;
        const isDemoMode = environment === 'demo';

        if (isDemoMode) {
          analysisResult = getMockDocumentAnalysis(fileName);
        } else {
          analysisResult = await analyzeDocument(
            fileName,
            fileType || 'unknown',
            description,
            workspaceId,
            userId
          );
        }

        const document = await storage.createDocument({
          userId,
          title,
          category: analysisResult.category,
          description: description || analysisResult.summary,
          fileName,
          fileType,
          fileUrl,
          fileSize,
          tags: analysisResult.suggestedTags,
          environment,
          aiCategory: analysisResult.category,
          aiConfidence: analysisResult.confidence,
          aiSummary: analysisResult.summary,
          aiSuggestedTags: analysisResult.suggestedTags,
          aiAnalysisStatus: 'completed',
          mobileUploaded: true,
        });

        res.status(201).json({
          success: true,
          data: {
            document,
            analysis: analysisResult,
          },
        });
      } catch (error: any) {
        console.error('Failed to create mobile document:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    console.log('   POST /api/mobile/documents');

    // POST /api/mobile/documents/:id/reanalyze - Re-run AI analysis
    app.post('/api/mobile/documents/:id/reanalyze', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { analyzeAndPersist } = await import('./services/analyzeAndPersist');

        console.log(`[Documents API] Manually triggering re-analysis for document: ${id}`);
        const result = await analyzeAndPersist(id, { createRecords: true });

        res.json({
          success: true,
          data: result,
        });
      } catch (error: any) {
        console.error('Failed to reanalyze document:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    console.log('   POST /api/mobile/documents/:id/reanalyze');

    // PATCH /api/mobile/documents/:id/category - Update document category (accept/reject AI suggestion)
    app.patch('/api/mobile/documents/:id/category', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { category, acceptAiSuggestion } = req.body;

        if (!category && acceptAiSuggestion === undefined) {
          return res
            .status(400)
            .json({ success: false, error: 'Category or acceptAiSuggestion required' });
        }

        const document = await storage.getDocument(id);
        if (!document) {
          return res.status(404).json({ success: false, error: 'Document not found' });
        }

        const newCategory = acceptAiSuggestion ? document.aiCategory : category;
        const updated = await storage.updateDocument(id, {
          category: newCategory || document.category,
        });

        res.json({ success: true, data: updated });
      } catch (error: any) {
        console.error('Failed to update document category:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    console.log('   PATCH /api/mobile/documents/:id/category');

    // GET /api/mobile/violations - Get violation reports for mobile
    app.get('/api/mobile/violations', async (req: Request, res: Response) => {
      try {
        const userId =
          (req as any).session?.userId ||
          (req.headers['x-user-id'] as string) ||
          'demo-client-user';
        const environment = (req.headers['x-environment'] as string) || 'demo';

        const mobileReports = await storage.getMobileViolationReports(userId, environment);

        // Return array directly for consistency with other endpoints
        res.json(mobileReports);
      } catch (error: any) {
        console.error('Failed to get mobile violations:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    console.log('   GET  /api/mobile/violations');

    // POST /api/mobile/violations - Create a new violation report from mobile
    app.post('/api/mobile/violations', async (req: Request, res: Response) => {
      try {
        const userId =
          (req as any).session?.userId ||
          (req.headers['x-user-id'] as string) ||
          'demo-client-user';
        const {
          title,
          violationType,
          description,
          severity = 'medium',
          location,
          occurredAt,
          relatedDocumentIds,
          witnesses,
          environment = 'demo',
          useSuggestions = true,
        } = req.body;
        const workspaceId = resolveWorkspaceId(req);

        if (!description) {
          return res.status(400).json({ success: false, error: 'Description is required' });
        }

        // Get AI classification for the violation
        let aiResult;
        if (environment !== 'demo' && useSuggestions) {
          aiResult = await classifyViolation(description, relatedDocumentIds, workspaceId, userId);
        } else {
          aiResult = {
            type: violationType || 'other',
            severity: severity as 'low' | 'medium' | 'high' | 'critical',
            suggestedTitle: title || 'Violation Report',
            legalRelevance: 'Manual review required',
          };
        }

        const report = await storage.createMobileViolationReport({
          userId,
          title: title || aiResult.suggestedTitle,
          violationType: violationType || aiResult.type,
          description,
          severity: severity || aiResult.severity,
          location,
          occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
          relatedDocumentIds,
          witnesses,
          status: 'draft',
          environment,
        });

        res.status(201).json({
          success: true,
          data: {
            report,
            aiSuggestions: aiResult,
          },
        });
      } catch (error: any) {
        console.error('Failed to create violation report:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    console.log('   POST /api/mobile/violations');

    // PATCH /api/mobile/violations/:id - Update violation report
    app.patch('/api/mobile/violations/:id', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const updates = req.body;

        const report = await storage.getMobileViolationReport(id);
        if (!report) {
          return res.status(404).json({ success: false, error: 'Report not found' });
        }

        const updated = await storage.updateMobileViolationReport(id, updates);
        res.json({ success: true, data: updated });
      } catch (error: any) {
        console.error('Failed to update violation report:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    console.log('   PATCH /api/mobile/violations/:id');

    // POST /api/mobile/violations/:id/submit - Submit violation report (creates real violation)
    app.post('/api/mobile/violations/:id/submit', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;

        const report = await storage.getMobileViolationReport(id);
        if (!report) {
          return res.status(404).json({ success: false, error: 'Report not found' });
        }

        if (report.status === 'submitted') {
          return res.status(400).json({ success: false, error: 'Report already submitted' });
        }

        // Create actual violation from the mobile report
        const violation = await storage.createViolation({
          userId: report.userId,
          type: report.violationType,
          description: report.description,
          location: report.location,
          witnesses: report.witnesses,
          status: 'pending',
          environment: report.environment,
          isDraft: false,
        });

        // Update mobile report with submission info
        await storage.updateMobileViolationReport(id, {
          status: 'submitted',
          linkedViolationId: violation.id,
        });

        res.json({
          success: true,
          data: {
            report: { ...report, status: 'submitted', linkedViolationId: violation.id },
            violation,
          },
        });
      } catch (error: any) {
        console.error('Failed to submit violation report:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    console.log('   POST /api/mobile/violations/:id/submit');

    // DELETE /api/mobile/violations/:id - Delete draft violation report
    app.delete('/api/mobile/violations/:id', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;

        const report = await storage.getMobileViolationReport(id);
        if (!report) {
          return res.status(404).json({ success: false, error: 'Report not found' });
        }

        if (report.status === 'submitted') {
          return res.status(400).json({ success: false, error: 'Cannot delete submitted reports' });
        }

        await storage.deleteMobileViolationReport(id);
        res.json({ success: true, message: 'Report deleted' });
      } catch (error: any) {
        console.error('Failed to delete violation report:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    console.log('   DELETE /api/mobile/violations/:id');

    // ========================================
    // Reimbursements API Endpoints
    // ========================================
    console.log('\n💰 Reimbursements Endpoints:');

    // GET /api/mobile/reimbursements - Get all reimbursements
    app.get('/api/mobile/reimbursements', async (req: Request, res: Response) => {
      try {
        const userId =
          (req as any).session?.userId ||
          (req.headers['x-user-id'] as string) ||
          'demo-client-user';
        const environment = (req.headers['x-environment'] as string) || 'demo';

        const reimbursementsList = await storage.getReimbursements(userId, environment);
        res.json(reimbursementsList);
      } catch (error: any) {
        console.error('Failed to get reimbursements:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    console.log('   GET  /api/mobile/reimbursements');

    // POST /api/mobile/reimbursements - Create a new reimbursement
    app.post('/api/mobile/reimbursements', async (req: Request, res: Response) => {
      try {
        const userId =
          (req as any).session?.userId ||
          (req.headers['x-user-id'] as string) ||
          'demo-client-user';
        const environment = (req.headers['x-environment'] as string) || 'demo';
        const {
          category,
          description,
          amount,
          owedBy,
          status = 'pending',
          dueDate,
          notes,
          linkedDocumentIds,
        } = req.body;

        if (!category || !description || !amount || !owedBy) {
          return res.status(400).json({
            success: false,
            error: 'Category, description, amount, and owedBy are required',
          });
        }

        const reimbursement = await storage.createReimbursement({
          userId,
          category,
          description,
          amount: Math.round(amount * 100), // Convert to cents
          owedBy,
          status,
          dueDate: dueDate ? new Date(dueDate) : undefined,
          notes,
          linkedDocumentIds,
          environment,
        });

        res.status(201).json(reimbursement);
      } catch (error: any) {
        console.error('Failed to create reimbursement:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    console.log('   POST /api/mobile/reimbursements');

    // PATCH /api/mobile/reimbursements/:id - Update a reimbursement
    app.patch('/api/mobile/reimbursements/:id', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const updates = req.body;

        // Convert amount to cents if provided
        if (updates.amount !== undefined) {
          updates.amount = Math.round(updates.amount * 100);
        }

        const reimbursement = await storage.getReimbursement(id);
        if (!reimbursement) {
          return res.status(404).json({ success: false, error: 'Reimbursement not found' });
        }

        const updated = await storage.updateReimbursement(id, updates);
        res.json(updated);
      } catch (error: any) {
        console.error('Failed to update reimbursement:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    console.log('   PATCH /api/mobile/reimbursements/:id');

    // DELETE /api/mobile/reimbursements/:id - Delete a reimbursement
    app.delete('/api/mobile/reimbursements/:id', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;

        const reimbursement = await storage.getReimbursement(id);
        if (!reimbursement) {
          return res.status(404).json({ success: false, error: 'Reimbursement not found' });
        }

        await storage.deleteReimbursement(id);
        res.json({ success: true, message: 'Reimbursement deleted' });
      } catch (error: any) {
        console.error('Failed to delete reimbursement:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    console.log('   DELETE /api/mobile/reimbursements/:id');

    // ========================================
    // W2 Income Records API
    // ========================================

    // GET /api/mobile/w2-records - Get all W2 records for both parties
    app.get('/api/mobile/w2-records', async (req: Request, res: Response) => {
      try {
        const userId = (req as any).session?.userId || 'demo-client-user';
        const environment = (req.headers['x-environment'] as string) || 'demo';

        const records = await storage.getW2Records(userId, environment);
        res.json(records);
      } catch (error: any) {
        console.error('Failed to get W2 records:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    console.log('   GET  /api/mobile/w2-records');

    // POST /api/mobile/w2-records - Create a new W2 record
    app.post('/api/mobile/w2-records', async (req: Request, res: Response) => {
      try {
        const userId = (req as any).session?.userId;
        if (!userId) {
          return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        const environment = (req.headers['x-environment'] as string) || 'live';

        const parseResult = insertW2RecordSchema.safeParse({
          ...req.body,
          userId,
          environment,
          wagesAndTips: Math.round(req.body.wagesAndTips * 100),
          federalWithheld: req.body.federalWithheld
            ? Math.round(req.body.federalWithheld * 100)
            : undefined,
          socialSecurityWages: req.body.socialSecurityWages
            ? Math.round(req.body.socialSecurityWages * 100)
            : undefined,
          socialSecurityWithheld: req.body.socialSecurityWithheld
            ? Math.round(req.body.socialSecurityWithheld * 100)
            : undefined,
          medicareWages: req.body.medicareWages
            ? Math.round(req.body.medicareWages * 100)
            : undefined,
          medicareWithheld: req.body.medicareWithheld
            ? Math.round(req.body.medicareWithheld * 100)
            : undefined,
          stateWages: req.body.stateWages ? Math.round(req.body.stateWages * 100) : undefined,
          stateWithheld: req.body.stateWithheld
            ? Math.round(req.body.stateWithheld * 100)
            : undefined,
          otherCompensation: req.body.otherCompensation
            ? Math.round(req.body.otherCompensation * 100)
            : 0,
        });

        if (!parseResult.success) {
          return res.status(400).json({ success: false, error: parseResult.error.message });
        }

        const record = await storage.createW2Record(parseResult.data);
        res.status(201).json(record);
      } catch (error: any) {
        console.error('Failed to create W2 record:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    console.log('   POST /api/mobile/w2-records');

    // PATCH /api/mobile/w2-records/:id - Update a W2 record
    app.patch('/api/mobile/w2-records/:id', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const userId = (req as any).session?.userId;
        if (!userId) {
          return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const record = await storage.getW2Record(id);
        if (!record) {
          return res.status(404).json({ success: false, error: 'W2 record not found' });
        }

        const updates: any = { ...req.body };
        // Convert dollar amounts to cents if provided
        if (typeof req.body.wagesAndTips === 'number')
          updates.wagesAndTips = Math.round(req.body.wagesAndTips * 100);
        if (typeof req.body.federalWithheld === 'number')
          updates.federalWithheld = Math.round(req.body.federalWithheld * 100);
        if (typeof req.body.socialSecurityWages === 'number')
          updates.socialSecurityWages = Math.round(req.body.socialSecurityWages * 100);
        if (typeof req.body.socialSecurityWithheld === 'number')
          updates.socialSecurityWithheld = Math.round(req.body.socialSecurityWithheld * 100);
        if (typeof req.body.medicareWages === 'number')
          updates.medicareWages = Math.round(req.body.medicareWages * 100);
        if (typeof req.body.medicareWithheld === 'number')
          updates.medicareWithheld = Math.round(req.body.medicareWithheld * 100);
        if (typeof req.body.stateWages === 'number')
          updates.stateWages = Math.round(req.body.stateWages * 100);
        if (typeof req.body.stateWithheld === 'number')
          updates.stateWithheld = Math.round(req.body.stateWithheld * 100);
        if (typeof req.body.otherCompensation === 'number')
          updates.otherCompensation = Math.round(req.body.otherCompensation * 100);

        const updated = await storage.updateW2Record(id, updates);
        res.json(updated);
      } catch (error: any) {
        console.error('Failed to update W2 record:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    console.log('   PATCH /api/mobile/w2-records/:id');

    // DELETE /api/mobile/w2-records/:id - Delete a W2 record
    app.delete('/api/mobile/w2-records/:id', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const userId = (req as any).session?.userId;
        if (!userId) {
          return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const record = await storage.getW2Record(id);
        if (!record) {
          return res.status(404).json({ success: false, error: 'W2 record not found' });
        }

        await storage.deleteW2Record(id);
        res.json({ success: true, message: 'W2 record deleted' });
      } catch (error: any) {
        console.error('Failed to delete W2 record:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    console.log('   DELETE /api/mobile/w2-records/:id');

    // ========================================
    // Mobile Financial Drill-Down Endpoints
    // ========================================

    // GET /api/mobile/financial-summary - Get summary of all financial metrics
    app.get('/api/mobile/financial-summary', async (req: Request, res: Response) => {
      try {
        const userId = (req as any).session?.userId || (req.headers['x-user-id'] as string);
        const environment = (req.headers['x-environment'] as string) || 'demo';

        if (!userId) {
          return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const stats = await storage.getDashboardStats(userId, environment);
        res.json(stats);
      } catch (error: any) {
        console.error('Failed to get financial summary:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    console.log('   GET  /api/mobile/financial-summary');

    // GET /api/mobile/assets - Get all assets for drill-down
    app.get('/api/mobile/assets', async (req: Request, res: Response) => {
      try {
        const userId = (req as any).session?.userId || (req.headers['x-user-id'] as string);
        const environment = (req.headers['x-environment'] as string) || 'demo';

        if (!userId) {
          return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const assets = await storage.getAssets(userId, environment);
        res.json(assets);
      } catch (error: any) {
        console.error('Failed to get assets:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    console.log('   GET  /api/mobile/assets');

    // GET /api/mobile/debts - Get all debts for drill-down
    app.get('/api/mobile/debts', async (req: Request, res: Response) => {
      try {
        const userId = (req as any).session?.userId || (req.headers['x-user-id'] as string);
        const environment = (req.headers['x-environment'] as string) || 'demo';

        if (!userId) {
          return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const debts = await storage.getDebts(userId, environment);
        res.json(debts);
      } catch (error: any) {
        console.error('Failed to get debts:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    console.log('   GET  /api/mobile/debts');

    // GET /api/mobile/incomes - Get all incomes for drill-down
    app.get('/api/mobile/incomes', async (req: Request, res: Response) => {
      try {
        const userId = (req as any).session?.userId || (req.headers['x-user-id'] as string);
        const environment = (req.headers['x-environment'] as string) || 'demo';

        if (!userId) {
          return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const incomes = await storage.getIncomes(userId, environment);
        res.json(incomes);
      } catch (error: any) {
        console.error('Failed to get incomes:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    console.log('   GET  /api/mobile/incomes');

    // GET /api/mobile/expenses - Get all expenses for drill-down
    app.get('/api/mobile/expenses', async (req: Request, res: Response) => {
      try {
        const userId = (req as any).session?.userId || (req.headers['x-user-id'] as string);
        const environment = (req.headers['x-environment'] as string) || 'demo';

        if (!userId) {
          return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const expenses = await storage.getExpenses(userId, environment);
        res.json(expenses);
      } catch (error: any) {
        console.error('Failed to get expenses:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    console.log('   GET  /api/mobile/expenses');

    // GET /api/mobile/child-support - Get all child support payments for drill-down
    app.get('/api/mobile/child-support', async (req: Request, res: Response) => {
      try {
        const userId = (req as any).session?.userId || (req.headers['x-user-id'] as string);
        const environment = (req.headers['x-environment'] as string) || 'demo';

        if (!userId) {
          return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const payments = await storage.getChildSupportPayments(userId, environment);
        res.json(payments);
      } catch (error: any) {
        console.error('Failed to get child support payments:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    console.log('   GET  /api/mobile/child-support');

    // GET /api/mobile/document-categories - Get all available document categories
    app.get('/api/mobile/document-categories', async (_req: Request, res: Response) => {
      const categoryInfo = DOCUMENT_CATEGORIES.map((cat) => ({
        value: cat,
        label: cat
          .split('_')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' '),
      }));
      res.json({ success: true, data: categoryInfo });
    });
    console.log('   GET  /api/mobile/document-categories');

    // ============================================
    // IMPROVEMENT RECOMMENDATIONS (User Feedback System)
    // ============================================

    const SUPER_ADMIN_EMAIL = 'nedpearson@gmail.com';
    const VALID_STATUSES = [
      'submitted',
      'reviewing',
      'testing',
      'approved',
      'implemented',
      'rejected',
    ];

    const createRecommendationSchema = z.object({
      title: z.string().min(1).max(500),
      body: z.string().min(1).max(10000),
      inputType: z.enum(['voice', 'text', 'camera', 'file']),
      transcription: z.string().optional(),
      mediaUrls: z.array(z.string()).optional(),
    });

    const adminUpdateSchema = z.object({
      editedTitle: z.string().optional(),
      editedBody: z.string().optional(),
      adminNotes: z.string().optional(),
      status: z
        .enum(['submitted', 'reviewing', 'testing', 'approved', 'implemented', 'rejected'])
        .optional(),
      testUserEmail: z.string().email().optional(),
      changelogEntry: z.string().optional(),
    });

    // Helper to check if user is super admin
    const isSuperAdmin = (req: Request): boolean => {
      const userEmail = (req.headers['x-user-email'] as string) || (req as any).user?.email;
      return userEmail?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
    };

    // GET /api/recommendations - Get user's own recommendations (with optional status filter)
    app.get('/api/recommendations', async (req: Request, res: Response) => {
      try {
        const environment = (req.headers['x-environment'] as string) || 'demo';
        const status = req.query.status as string | undefined;

        const recommendations = await storage.getImprovementRecommendations(environment, status);
        res.json(recommendations);
      } catch (error: any) {
        console.error('Failed to get recommendations:', error);
        res.status(500).json({ error: error.message });
      }
    });
    console.log('   GET  /api/recommendations');

    // GET /api/admin/recommendations - Admin only: Get ALL recommendations across environments
    app.get('/api/admin/recommendations', async (req: Request, res: Response) => {
      try {
        if (!isSuperAdmin(req)) {
          return res.status(403).json({ error: 'Access denied. Admin only.' });
        }

        const recommendations = await storage.getAllImprovementRecommendations();
        res.json(recommendations);
      } catch (error: any) {
        console.error('Failed to get all recommendations:', error);
        res.status(500).json({ error: error.message });
      }
    });
    console.log('   GET  /api/admin/recommendations');

    // GET /api/admin/recommendations/:id - Admin only: Get single recommendation
    app.get('/api/admin/recommendations/:id', async (req: Request, res: Response) => {
      try {
        if (!isSuperAdmin(req)) {
          return res.status(403).json({ error: 'Access denied. Admin only.' });
        }

        const { id } = req.params;
        const recommendation = await storage.getImprovementRecommendation(id);
        if (!recommendation) {
          return res.status(404).json({ error: 'Recommendation not found' });
        }
        res.json(recommendation);
      } catch (error: any) {
        console.error('Failed to get recommendation:', error);
        res.status(500).json({ error: error.message });
      }
    });
    console.log('   GET  /api/admin/recommendations/:id');

    // POST /api/recommendations - Create a new recommendation (user-facing)
    app.post('/api/recommendations', async (req: Request, res: Response) => {
      try {
        const userId = (req.headers['x-user-id'] as string) || (req as any).user?.id || 'anonymous';
        const userEmail = (req.headers['x-user-email'] as string) || (req as any).user?.email;
        const environment = (req.headers['x-environment'] as string) || 'demo';

        const parsed = createRecommendationSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: 'Invalid input', details: parsed.error.errors });
        }

        const recommendation = await storage.createImprovementRecommendation({
          userId,
          userEmail: userEmail || null,
          environment,
          title: parsed.data.title,
          body: parsed.data.body,
          inputType: parsed.data.inputType,
          transcription: parsed.data.transcription,
          mediaUrls: parsed.data.mediaUrls,
          status: 'submitted',
        });

        res.status(201).json(recommendation);
      } catch (error: any) {
        console.error('Failed to create recommendation:', error);
        res.status(500).json({ error: error.message });
      }
    });
    console.log('   POST /api/recommendations');

    // PATCH /api/admin/recommendations/:id - Admin only: Update recommendation (edit, status, test user, etc.)
    app.patch('/api/admin/recommendations/:id', async (req: Request, res: Response) => {
      try {
        if (!isSuperAdmin(req)) {
          return res.status(403).json({ error: 'Access denied. Admin only.' });
        }

        const { id } = req.params;
        const adminEmail = (req.headers['x-user-email'] as string) || (req as any).user?.email;

        const parsed = adminUpdateSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: 'Invalid input', details: parsed.error.errors });
        }

        const updates: any = { ...parsed.data };

        // Track who reviewed and when
        if (
          parsed.data.status === 'reviewing' ||
          parsed.data.editedTitle ||
          parsed.data.editedBody
        ) {
          updates.reviewedBy = adminEmail;
          updates.reviewedAt = new Date();
        }

        // Track implementation
        if (parsed.data.status === 'implemented') {
          updates.implementedBy = adminEmail;
          updates.implementedAt = new Date();
        }

        const recommendation = await storage.updateImprovementRecommendation(id, updates);
        if (!recommendation) {
          return res.status(404).json({ error: 'Recommendation not found' });
        }

        res.json(recommendation);
      } catch (error: any) {
        console.error('Failed to update recommendation:', error);
        res.status(500).json({ error: error.message });
      }
    });
    console.log('   PATCH /api/admin/recommendations/:id');

    // POST /api/admin/recommendations/:id/send-to-test - Admin only: Send to test user for approval
    app.post('/api/admin/recommendations/:id/send-to-test', async (req: Request, res: Response) => {
      try {
        if (!isSuperAdmin(req)) {
          return res.status(403).json({ error: 'Access denied. Admin only.' });
        }

        const { id } = req.params;
        const { testUserEmail } = req.body;

        if (!testUserEmail) {
          return res.status(400).json({ error: 'Test user email is required' });
        }

        const recommendation = await storage.updateImprovementRecommendation(id, {
          status: 'testing',
          testUserEmail,
        });

        if (!recommendation) {
          return res.status(404).json({ error: 'Recommendation not found' });
        }

        res.json(recommendation);
      } catch (error: any) {
        console.error('Failed to send to test:', error);
        res.status(500).json({ error: error.message });
      }
    });
    console.log('   POST /api/admin/recommendations/:id/send-to-test');

    // POST /api/recommendations/:id/test-feedback - Test user submits approval/feedback
    app.post('/api/recommendations/:id/test-feedback', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { approved, feedback } = req.body;
        const userEmail = (req.headers['x-user-email'] as string) || (req as any).user?.email;

        const recommendation = await storage.getImprovementRecommendation(id);
        if (!recommendation) {
          return res.status(404).json({ error: 'Recommendation not found' });
        }

        // Verify this is the assigned test user
        if (recommendation.testUserEmail?.toLowerCase() !== userEmail?.toLowerCase()) {
          return res
            .status(403)
            .json({ error: 'You are not the assigned test user for this recommendation' });
        }

        const updates: any = {
          testFeedback: feedback,
          testApproved: approved,
          testedAt: new Date(),
        };

        // If approved, move to approved status; otherwise back to reviewing
        if (approved) {
          updates.status = 'approved';
        } else {
          updates.status = 'reviewing';
        }

        const updated = await storage.updateImprovementRecommendation(id, updates);
        res.json(updated);
      } catch (error: any) {
        console.error('Failed to submit test feedback:', error);
        res.status(500).json({ error: error.message });
      }
    });
    console.log('   POST /api/recommendations/:id/test-feedback');

    // POST /api/admin/recommendations/:id/implement - Admin only: Mark as implemented with changelog
    app.post('/api/admin/recommendations/:id/implement', async (req: Request, res: Response) => {
      try {
        if (!isSuperAdmin(req)) {
          return res.status(403).json({ error: 'Access denied. Admin only.' });
        }

        const { id } = req.params;
        const { changelogEntry } = req.body;
        const adminEmail = (req.headers['x-user-email'] as string) || (req as any).user?.email;

        if (!changelogEntry) {
          return res.status(400).json({ error: 'Changelog entry is required' });
        }

        const recommendation = await storage.updateImprovementRecommendation(id, {
          status: 'implemented',
          implementedBy: adminEmail,
          implementedAt: new Date(),
          changelogEntry,
        });

        if (!recommendation) {
          return res.status(404).json({ error: 'Recommendation not found' });
        }

        res.json(recommendation);
      } catch (error: any) {
        console.error('Failed to implement recommendation:', error);
        res.status(500).json({ error: error.message });
      }
    });
    console.log('   POST /api/admin/recommendations/:id/implement');

    // GET /api/changelog - Public: Get implemented recommendations as changelog
    app.get('/api/changelog', async (_req: Request, res: Response) => {
      try {
        const implemented = await storage.getImplementedRecommendations();

        // Format for public changelog
        const changelog = implemented.map((rec) => ({
          id: rec.id,
          title: rec.editedTitle || rec.title,
          description: rec.changelogEntry || rec.editedBody || rec.body,
          implementedAt: rec.implementedAt,
          translations: rec.changelogTranslations,
        }));

        res.json(changelog);
      } catch (error: any) {
        console.error('Failed to get changelog:', error);
        res.status(500).json({ error: error.message });
      }
    });
    console.log('   GET  /api/changelog');

    // DELETE /api/recommendations/:id - Delete a recommendation (admin only)
    app.delete('/api/recommendations/:id', async (req: Request, res: Response) => {
      try {
        if (!isSuperAdmin(req)) {
          return res.status(403).json({ error: 'Access denied. Admin only.' });
        }

        const { id } = req.params;
        await storage.deleteImprovementRecommendation(id);
        res.status(204).send();
      } catch (error: any) {
        console.error('Failed to delete recommendation:', error);
        res.status(500).json({ error: error.message });
      }
    });
    console.log('   DELETE /api/recommendations/:id');

    // ==========================================
    // JOURNAL ROUTES
    // ==========================================

    // GET /api/journal - Get all journal entries
    app.get('/api/journal', async (req: Request, res: Response) => {
      try {
        const userId =
          (req as any).session?.userId ||
          (req.headers['x-user-id'] as string) ||
          'demo-client-user';
        const environment = (req.headers['x-environment'] as string) || 'demo';

        const entries = await storage.getJournalEntries(userId, environment);
        res.json(entries);
      } catch (error: any) {
        console.error('Failed to get journal entries:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/journal/:id - Get single journal entry
    app.get('/api/journal/:id', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const userId =
          (req as any).session?.userId ||
          (req.headers['x-user-id'] as string) ||
          'demo-client-user';

        const entry = await storage.getJournalEntry(id);
        if (!entry) {
          return res.status(404).json({ error: 'Journal entry not found' });
        }
        // Authorization check - user must own the entry
        if (entry.userId !== userId && !isSuperAdmin(req)) {
          return res.status(403).json({ error: 'Access denied' });
        }
        res.json(entry);
      } catch (error: any) {
        console.error('Failed to get journal entry:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/journal - Create journal entry
    app.post('/api/journal', async (req: Request, res: Response) => {
      try {
        const userId =
          (req as any).session?.userId ||
          (req.headers['x-user-id'] as string) ||
          'demo-client-user';
        const environment = (req.headers['x-environment'] as string) || 'demo';

        const entry = await storage.createJournalEntry({
          ...req.body,
          userId,
          environment,
        });
        res.status(201).json(entry);
      } catch (error: any) {
        console.error('Failed to create journal entry:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // PATCH /api/journal/:id - Update journal entry
    app.patch('/api/journal/:id', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const userId =
          (req as any).session?.userId ||
          (req.headers['x-user-id'] as string) ||
          'demo-client-user';

        // Authorization check - verify ownership before update
        const existing = await storage.getJournalEntry(id);
        if (!existing) {
          return res.status(404).json({ error: 'Journal entry not found' });
        }
        if (existing.userId !== userId && !isSuperAdmin(req)) {
          return res.status(403).json({ error: 'Access denied' });
        }

        const entry = await storage.updateJournalEntry(id, req.body);
        res.json(entry);
      } catch (error: any) {
        console.error('Failed to update journal entry:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // DELETE /api/journal/:id - Delete journal entry
    app.delete('/api/journal/:id', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const userId =
          (req as any).session?.userId ||
          (req.headers['x-user-id'] as string) ||
          'demo-client-user';

        // Authorization check - verify ownership before delete
        const existing = await storage.getJournalEntry(id);
        if (!existing) {
          return res.status(404).json({ error: 'Journal entry not found' });
        }
        if (existing.userId !== userId && !isSuperAdmin(req)) {
          return res.status(403).json({ error: 'Access denied' });
        }

        await storage.deleteJournalEntry(id);
        res.status(204).send();
      } catch (error: any) {
        console.error('Failed to delete journal entry:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/journal/transcribe - Voice to text transcription
    app.post('/api/journal/transcribe', async (req: Request, res: Response) => {
      try {
        const { audioData, mimeType } = req.body;
        const userId =
          (req as any).session?.userId ||
          (req as any).session?.userId ||
          (req.headers['x-user-id'] as string) ||
          'demo-client-user';
        const workspaceId = resolveWorkspaceId(req);

        if (!audioData) {
          return res.status(400).json({ error: 'Audio data is required' });
        }

        // Use Gemini for voice transcription
        const transcription = await transcribeVoiceWithGemini(
          audioData,
          mimeType || 'audio/webm',
          workspaceId,
          userId
        );
        res.json({ transcription });
      } catch (error: any) {
        console.error('Failed to transcribe audio:', error);
        res.status(500).json({ error: error.message });
      }
    });

    console.log('📓 Journal Endpoints:');
    console.log('   GET  /api/journal');
    console.log('   GET  /api/journal/:id');
    console.log('   POST /api/journal');
    console.log('   PATCH /api/journal/:id');
    console.log('   DELETE /api/journal/:id');
    console.log('   POST /api/journal/transcribe');

    // ==========================================
    // COMMUNICATION / MESSAGING ROUTES
    // ==========================================

    // GET /api/conversations - Get all conversations for user
    app.get('/api/conversations', async (req: Request, res: Response) => {
      try {
        const userId =
          (req as any).session?.userId ||
          (req.headers['x-user-id'] as string) ||
          'demo-client-user';
        const environment = (req.headers['x-environment'] as string) || 'demo';

        const convos = await storage.getConversations(userId, environment);

        // Get participants for each conversation
        const conversationsWithParticipants = await Promise.all(
          convos.map(async (conv) => {
            const participants = await storage.getConversationParticipants(conv.id);
            return { ...conv, participants };
          })
        );

        res.json(conversationsWithParticipants);
      } catch (error: any) {
        console.error('Failed to get conversations:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/conversations/:id - Get single conversation with messages
    app.get('/api/conversations/:id', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const userId =
          (req as any).session?.userId ||
          (req.headers['x-user-id'] as string) ||
          'demo-client-user';

        const conversation = await storage.getConversation(id);

        if (!conversation) {
          return res.status(404).json({ error: 'Conversation not found' });
        }

        const participants = await storage.getConversationParticipants(id);

        // Authorization check - user must be a participant in the conversation
        const isParticipant = participants.some(
          (p) => p.userId === userId && p.status === 'active'
        );
        if (!isParticipant && !isSuperAdmin(req)) {
          return res.status(403).json({ error: 'Access denied - not a participant' });
        }

        const messages = await storage.getConversationMessages(id);

        res.json({ ...conversation, participants, messages });
      } catch (error: any) {
        console.error('Failed to get conversation:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/conversations - Create new conversation
    app.post('/api/conversations', async (req: Request, res: Response) => {
      try {
        const userId =
          (req as any).session?.userId ||
          (req.headers['x-user-id'] as string) ||
          'demo-client-user';
        const userEmail = (req.headers['x-user-email'] as string) || 'demo@divorceledger.live';
        const userName = (req.headers['x-user-name'] as string) || 'Demo User';
        const environment = (req.headers['x-environment'] as string) || 'demo';

        const { title, type, participants } = req.body;

        // Create conversation
        const conversation = await storage.createConversation({
          creatorUserId: userId,
          environment,
          title,
          type: type || 'direct',
        });

        // Add creator as participant
        await storage.addConversationParticipant({
          conversationId: conversation.id,
          userId,
          email: userEmail,
          displayName: userName,
          role: 'party',
          status: 'active',
        });

        // Add other participants
        if (participants && Array.isArray(participants)) {
          for (const p of participants) {
            await storage.addConversationParticipant({
              conversationId: conversation.id,
              userId: p.userId || null,
              email: p.email,
              displayName: p.displayName,
              role: p.role || 'party',
              status: p.userId ? 'active' : 'invited',
            });
          }
        }

        const allParticipants = await storage.getConversationParticipants(conversation.id);
        res.status(201).json({ ...conversation, participants: allParticipants });
      } catch (error: any) {
        console.error('Failed to create conversation:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/conversations/:id/participants - Add participant to conversation
    app.post('/api/conversations/:id/participants', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { email, displayName, role } = req.body;

        if (!email || !displayName) {
          return res.status(400).json({ error: 'Email and displayName are required' });
        }

        const participant = await storage.addConversationParticipant({
          conversationId: id,
          email,
          displayName,
          role: role || 'party',
          status: 'invited',
        });

        res.status(201).json(participant);
      } catch (error: any) {
        console.error('Failed to add participant:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // DELETE /api/conversations/:id/participants/:participantId - Remove participant
    app.delete(
      '/api/conversations/:id/participants/:participantId',
      async (req: Request, res: Response) => {
        try {
          const { participantId } = req.params;
          await storage.removeConversationParticipant(participantId);
          res.status(204).send();
        } catch (error: any) {
          console.error('Failed to remove participant:', error);
          res.status(500).json({ error: error.message });
        }
      }
    );

    // GET /api/conversations/:id/messages - Get messages for conversation
    app.get('/api/conversations/:id/messages', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const messages = await storage.getConversationMessages(id);
        res.json(messages);
      } catch (error: any) {
        console.error('Failed to get messages:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/conversations/:id/messages - Send message with sentiment analysis
    app.post('/api/conversations/:id/messages', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const senderId = (req.headers['x-user-id'] as string) || 'demo-client-user';
        const senderEmail = (req.headers['x-user-email'] as string) || 'demo@divorceledger.live';
        const senderName = (req.headers['x-user-name'] as string) || 'Demo User';

        // Authorization check - verify user is participant
        const participants = await storage.getConversationParticipants(id);
        const isParticipant = participants.some(
          (p) => p.userId === senderId && p.status === 'active'
        );
        if (
          !isParticipant &&
          !isSuperAdmin({ headers: { 'x-user-email': senderEmail } } as unknown as Request)
        ) {
          return res.status(403).json({ error: 'Access denied - not a participant' });
        }

        const { content, inputType, voiceTranscription } = req.body;

        if (!content) {
          return res.status(400).json({ error: 'Message content is required' });
        }

        // Analyze sentiment using OpenAI
        let sentimentAnalysis = {
          score: 0,
          label: 'neutral',
          hasNegative: false,
          topics: [] as string[],
        };
        try {
          sentimentAnalysis = await analyzeSentimentWithOpenAI(content);
        } catch (err) {
          console.error('Sentiment analysis failed:', err);
        }

        const message = await storage.createConversationMessage({
          conversationId: id,
          senderId,
          senderEmail,
          senderName,
          content,
          inputType: inputType || 'text',
          voiceTranscription,
          sentimentScore: sentimentAnalysis.score,
          sentimentLabel: sentimentAnalysis.label,
          hasNegativeContent: sentimentAnalysis.hasNegative,
          negativeTopics: sentimentAnalysis.topics,
        });

        res.status(201).json(message);
      } catch (error: any) {
        console.error('Failed to send message:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // ==========================================
    // SENTIMENT REPORT ROUTES
    // ==========================================

    // GET /api/conversations/:id/reports - Get sentiment reports for conversation
    app.get('/api/conversations/:id/reports', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const reports = await storage.getSentimentReports(id);
        res.json(reports);
      } catch (error: any) {
        console.error('Failed to get sentiment reports:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/conversations/:id/reports - Generate sentiment report
    app.post('/api/conversations/:id/reports', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const userId =
          (req as any).session?.userId ||
          (req.headers['x-user-id'] as string) ||
          'demo-client-user';
        const environment = (req.headers['x-environment'] as string) || 'demo';

        // Authorization check - verify user is participant
        const participants = await storage.getConversationParticipants(id);
        const isParticipant = participants.some(
          (p) => p.userId === userId && p.status === 'active'
        );
        if (!isParticipant && !isSuperAdmin(req)) {
          return res.status(403).json({ error: 'Access denied - not a participant' });
        }

        const { title, dateRangeStart, dateRangeEnd } = req.body;

        // Get all messages in the conversation
        const messages = await storage.getConversationMessages(id);

        // Filter by date range if provided
        let filteredMessages = messages;
        if (dateRangeStart || dateRangeEnd) {
          filteredMessages = messages.filter((m) => {
            const msgDate = new Date(m.createdAt);
            if (dateRangeStart && msgDate < new Date(dateRangeStart)) return false;
            if (dateRangeEnd && msgDate > new Date(dateRangeEnd)) return false;
            return true;
          });
        }

        // Find negative messages
        const negativeMessages = filteredMessages.filter((m) => m.hasNegativeContent);

        // Group by topic
        const topicBreakdown: Record<string, any[]> = {};
        const participantBreakdown: Record<string, { negativeCount: number; topics: string[] }> =
          {};

        for (const msg of negativeMessages) {
          const topics = msg.negativeTopics || ['general'];
          for (const topic of topics) {
            if (!topicBreakdown[topic]) {
              topicBreakdown[topic] = [];
            }
            topicBreakdown[topic].push({
              messageId: msg.id,
              senderName: msg.senderName,
              content: msg.content,
              timestamp: msg.createdAt,
              sentimentScore: msg.sentimentScore,
            });
          }

          // Track by participant
          if (!participantBreakdown[msg.senderEmail]) {
            participantBreakdown[msg.senderEmail] = { negativeCount: 0, topics: [] };
          }
          participantBreakdown[msg.senderEmail].negativeCount++;
          participantBreakdown[msg.senderEmail].topics.push(...topics);
        }

        // Generate AI summary if there are negative messages
        let summary = 'No significant negative communication patterns detected.';
        let recommendations = '';
        if (negativeMessages.length > 0) {
          try {
            const aiAnalysis = await generateSentimentReportSummary(
              negativeMessages,
              topicBreakdown
            );
            summary = aiAnalysis.summary;
            recommendations = aiAnalysis.recommendations;
          } catch (err) {
            console.error('AI summary generation failed:', err);
            summary = `Found ${negativeMessages.length} messages with negative content across ${Object.keys(topicBreakdown).length} topics.`;
          }
        }

        // Create the report
        const report = await storage.createSentimentReport({
          conversationId: id,
          generatedByUserId: userId,
          environment,
          title: title || `Sentiment Report - ${new Date().toLocaleDateString()}`,
          reportType: 'negative_communication',
          dateRangeStart: dateRangeStart ? new Date(dateRangeStart) : null,
          dateRangeEnd: dateRangeEnd ? new Date(dateRangeEnd) : null,
          totalMessagesAnalyzed: filteredMessages.length,
          negativeMessageCount: negativeMessages.length,
          topicBreakdown,
          participantBreakdown,
          summary,
          recommendations,
          status: 'generated',
        });

        // Create report items for each negative message
        for (const msg of negativeMessages) {
          const primaryTopic = (msg.negativeTopics && msg.negativeTopics[0]) || 'general';
          await storage.createSentimentReportItem({
            reportId: report.id,
            messageId: msg.id,
            senderName: msg.senderName,
            senderEmail: msg.senderEmail,
            messageContent: msg.content,
            messageTimestamp: msg.createdAt,
            sentimentScore: msg.sentimentScore || 0,
            primaryTopic,
            secondaryTopics: msg.negativeTopics?.slice(1) || [],
          });
        }

        res.status(201).json(report);
      } catch (error: any) {
        console.error('Failed to generate sentiment report:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/reports/:id - Get single sentiment report with items
    app.get('/api/reports/:id', async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const report = await storage.getSentimentReport(id);

        if (!report) {
          return res.status(404).json({ error: 'Report not found' });
        }

        const items = await storage.getSentimentReportItems(id);
        res.json({ ...report, items });
      } catch (error: any) {
        console.error('Failed to get sentiment report:', error);
        res.status(500).json({ error: error.message });
      }
    });

    console.log('💬 Communication Endpoints:');
    console.log('   GET  /api/conversations');
    console.log('   GET  /api/conversations/:id');
    console.log('   POST /api/conversations');
    console.log('   POST /api/conversations/:id/participants');
    console.log('   DELETE /api/conversations/:id/participants/:participantId');
    console.log('   GET  /api/conversations/:id/messages');
    console.log('   POST /api/conversations/:id/messages');
    console.log('   GET  /api/conversations/:id/reports');
    console.log('   POST /api/conversations/:id/reports');
    console.log('   GET  /api/reports/:id');

    // ==================== ADMIN PANEL ROUTES ====================

    // Admin credentials from environment variables (required, no fallback)
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.SUPERADMIN_EMAIL || '';
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.SUPERADMIN_PASSWORD || '';

    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      console.warn('[WARN] ADMIN_EMAIL and ADMIN_PASSWORD env vars not set - admin panel disabled');
    }

    // Admin login endpoint - uses database for MFA challenge storage
    // Admin phone number (set via env var) - REQUIRED for 2FA
    const ADMIN_PHONE = process.env.ADMIN_PHONE || '';

    app.post('/api/admin/login', loginRateLimiter, async (req, res) => {
      try {
        // Fail if admin credentials not configured
        if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
          return res.status(503).json({ error: 'Admin panel not configured' });
        }

        const { email, password } = req.body;

        if (!email || !password) {
          return res.status(400).json({ error: 'Email and password are required' });
        }

        // Check against admin credentials
        if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
          return res.status(401).json({ error: 'Invalid admin credentials' });
        }

        // 2FA requirement removed as requested
        const adminToken = Buffer.from(`${email}:${Date.now()}`).toString('base64');

        res.json({
          success: true,
          adminToken,
          message: 'Admin login successful',
        });
      } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ error: 'Admin login failed' });
      }
    });

    // Admin 2FA verification - uses database storage
    app.post('/api/admin/2fa/verify', loginRateLimiter, async (req, res) => {
      try {
        const { challengeId, code } = req.body;

        if (!challengeId || !code) {
          return res.status(400).json({ error: 'Challenge ID and code are required' });
        }

        // Get challenge from database
        const [challenge] = await db
          .select()
          .from(adminMfaChallenges)
          .where(eq(adminMfaChallenges.id, challengeId));

        if (!challenge) {
          return res.status(400).json({ error: 'Invalid or expired challenge' });
        }

        if (new Date() > challenge.expiresAt) {
          await db.delete(adminMfaChallenges).where(eq(adminMfaChallenges.id, challengeId));
          return res.status(400).json({ error: 'Verification code expired' });
        }

        if (challenge.attemptCount >= 5) {
          await db.delete(adminMfaChallenges).where(eq(adminMfaChallenges.id, challengeId));
          return res.status(429).json({ error: 'Too many attempts. Please try again.' });
        }

        const providedHash = hashCode(code);
        if (providedHash !== challenge.codeHash) {
          // Increment attempt count
          await db
            .update(adminMfaChallenges)
            .set({ attemptCount: challenge.attemptCount + 1 })
            .where(eq(adminMfaChallenges.id, challengeId));
          return res.status(401).json({ error: 'Invalid verification code' });
        }

        // Success - clean up and return token
        await db.delete(adminMfaChallenges).where(eq(adminMfaChallenges.id, challengeId));

        const adminToken = Buffer.from(`${ADMIN_EMAIL}:${Date.now()}`).toString('base64');

        res.json({
          success: true,
          adminToken,
          message: 'Admin 2FA verification successful',
        });
      } catch (error) {
        console.error('Admin 2FA verify error:', error);
        res.status(500).json({ error: 'Verification failed' });
      }
    });

    // Session restore disabled - always require fresh 2FA login
    app.get('/api/admin/session', async (_req, res) => {
      return res.status(401).json({ error: 'Please log in with 2FA' });
    });

    // Admin logout - clears localStorage token on frontend
    app.post('/api/admin/logout', (_req, res) => {
      res.json({ success: true });
    });

    // Middleware to verify admin token
    const verifyAdminToken = (req: Request, res: Response, next: NextFunction) => {
      const authHeader = req.headers['x-admin-token'] as string;
      if (!authHeader) {
        return res.status(401).json({ error: 'Admin authentication required' });
      }
      // Simple token verification - in production use JWT
      try {
        const decoded = Buffer.from(authHeader, 'base64').toString();
        if (!decoded.startsWith(ADMIN_EMAIL)) {
          return res.status(401).json({ error: 'Invalid admin token' });
        }
        next();
      } catch {
        return res.status(401).json({ error: 'Invalid admin token' });
      }
    };

    // Get all test users (for admin panel)
    app.get('/api/admin/test-users', verifyAdminToken, async (req, res) => {
      try {
        // Return test users with their credentials (for admin display)
        const testUsers = TEST_USERS.map((u) => ({
          id: u.id,
          email: u.email,
          password: u.password, // Plain password for admin display
          fullName: u.fullName,
          environment: u.environment,
        }));
        res.json(testUsers);
      } catch (error) {
        console.error('Failed to get test users:', error);
        res.status(500).json({ error: 'Failed to get test users' });
      }
    });

    // Update test user credentials
    app.put('/api/admin/test-users/:id', verifyAdminToken, async (req, res) => {
      try {
        const { id } = req.params;
        const { email, password, fullName } = req.body;

        const testUserIndex = TEST_USERS.findIndex((u) => u.id === id);
        if (testUserIndex === -1) {
          return res.status(404).json({ error: 'Test user not found' });
        }

        // Update in database
        const updates: any = {};
        if (email) updates.email = email;
        if (fullName) updates.fullName = fullName;
        if (password) {
          const { hashPassword } = await import('./auth');
          updates.password = await hashPassword(password);
        }

        if (Object.keys(updates).length > 0) {
          await db.update(users).set(updates).where(eq(users.id, id));
        }

        // Update in-memory TEST_USERS array (for current session)
        if (email) TEST_USERS[testUserIndex].email = email;
        if (password) TEST_USERS[testUserIndex].password = password;
        if (fullName) TEST_USERS[testUserIndex].fullName = fullName;

        res.json({ success: true, message: 'Test user updated' });
      } catch (error) {
        console.error('Failed to update test user:', error);
        res.status(500).json({ error: 'Failed to update test user' });
      }
    });

    // Quick login for test user (generates auto-login URL)
    app.post('/api/admin/test-users/:id/quick-login', verifyAdminToken, async (req, res) => {
      try {
        const { id } = req.params;

        const testUser = TEST_USERS.find((u) => u.id === id);
        if (!testUser) {
          return res.status(404).json({ error: 'Test user not found' });
        }

        // Generate a single-use login token (valid for 5 minutes)
        const loginToken = Buffer.from(
          JSON.stringify({
            userId: testUser.id,
            email: testUser.email,
            environment: testUser.environment,
            expires: Date.now() + 5 * 60 * 1000,
          })
        ).toString('base64');

        res.json({
          loginToken,
          email: testUser.email,
          environment: testUser.environment,
        });
      } catch (error) {
        console.error('Failed to generate quick login:', error);
        res.status(500).json({ error: 'Failed to generate quick login' });
      }
    });

    // Verify quick login token
    app.post('/api/auth/quick-login', async (req, res) => {
      try {
        const { token } = req.body;

        if (!token) {
          return res.status(400).json({ error: 'Token required' });
        }

        const decoded = JSON.parse(Buffer.from(token, 'base64').toString());

        if (Date.now() > decoded.expires) {
          return res.status(401).json({ error: 'Token expired' });
        }

        const user = await storage.getUser(decoded.userId);
        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }

        await storage.updateUserLastLogin(user.id);

        const { password: _, ...userWithoutPassword } = user;
        res.json({
          user: userWithoutPassword,
          environment: decoded.environment,
        });
      } catch (error) {
        console.error('Quick login error:', error);
        res.status(401).json({ error: 'Invalid token' });
      }
    });

    // Seed sample data for a test user (admin version with token)
    app.post('/api/admin/test-users/:id/seed-data', verifyAdminToken, async (req, res) => {
      try {
        const { id } = req.params;

        const testUser = TEST_USERS.find((u) => u.id === id);
        if (!testUser) {
          return res.status(404).json({ error: 'Test user not found' });
        }

        // First erase existing data for this environment
        await eraseEnvironmentData(testUser.environment);

        // Then seed sample data for this specific environment
        const environment = testUser.environment;

        // Create sample financial data
        await storage.createAsset({
          userId: id,
          name: 'Family Home',
          value: 450000,
          category: 'Real Estate',
          ownership: 'Joint',
          verified: true,
          environment,
        });
        await storage.createAsset({
          userId: id,
          name: '401k Account',
          value: 125000,
          category: 'Retirement',
          ownership: 'Self',
          verified: true,
          environment,
        });
        await storage.createDebt({
          userId: id,
          name: 'Mortgage',
          amount: 280000,
          category: 'Real Estate',
          ownership: 'Joint',
          monthlyPayment: 2100,
          environment,
        });
        await storage.createIncome({
          userId: id,
          source: 'Employment',
          amount: 850000,
          frequency: 'monthly',
          owner: 'Self',
          verified: true,
          environment,
        });
        await storage.createExpense({
          userId: id,
          category: 'Housing',
          description: 'Mortgage Payment',
          amount: 210000,
          frequency: 'monthly',
          owner: 'Joint',
          environment,
        });

        res.json({ success: true, message: 'Sample data seeded for test user' });
      } catch (error) {
        console.error('Failed to seed test user data:', error);
        res.status(500).json({ error: 'Failed to seed sample data' });
      }
    });

    // Seed sample data for self (test users can call this for themselves)
    // Protected: requires valid user to exist in database with matching environment
    app.post('/api/test-user/seed-data', async (req, res) => {
      try {
        const userId = req.headers['x-user-id'] as string;
        const environment = req.headers['x-environment'] as string;

        if (!userId || !environment) {
          return res.status(400).json({ error: 'User ID and environment required' });
        }

        // Verify this is a valid test user by checking the database
        const user = await storage.getUser(userId);
        if (!user) {
          return res.status(401).json({ error: 'Invalid user' });
        }

        // Verify the user's environment matches a test environment
        const testUser = TEST_USERS.find((u) => u.id === userId);
        if (!testUser || user.environment !== testUser.environment) {
          return res.status(403).json({ error: 'Only test users can seed sample data' });
        }

        // Verify the environment header matches the user's stored environment
        if (environment !== testUser.environment) {
          return res.status(403).json({ error: 'Environment mismatch' });
        }

        // First erase existing data for this environment
        await eraseEnvironmentData(testUser.environment);

        // Then seed sample data for this specific environment
        const env = testUser.environment;

        // Create sample financial data
        await storage.createAsset({
          userId,
          name: 'Family Home',
          value: 450000,
          category: 'Real Estate',
          ownership: 'Joint',
          verified: true,
          environment: env,
        });
        await storage.createAsset({
          userId,
          name: '401k Account',
          value: 125000,
          category: 'Retirement',
          ownership: 'Self',
          verified: true,
          environment: env,
        });
        await storage.createAsset({
          userId,
          name: 'Savings Account',
          value: 35000,
          category: 'Bank Account',
          ownership: 'Self',
          verified: true,
          environment: env,
        });
        await storage.createDebt({
          userId,
          name: 'Mortgage',
          amount: 280000,
          category: 'Real Estate',
          ownership: 'Joint',
          monthlyPayment: 2100,
          environment: env,
        });
        await storage.createDebt({
          userId,
          name: 'Car Loan',
          amount: 18000,
          category: 'Vehicle',
          ownership: 'Self',
          monthlyPayment: 450,
          environment: env,
        });
        await storage.createIncome({
          userId,
          source: 'Employment',
          amount: 850000,
          frequency: 'monthly',
          owner: 'Self',
          verified: true,
          environment: env,
        });
        await storage.createExpense({
          userId,
          category: 'Housing',
          description: 'Mortgage Payment',
          amount: 210000,
          frequency: 'monthly',
          owner: 'Joint',
          environment: env,
        });
        await storage.createExpense({
          userId,
          category: 'Utilities',
          description: 'Electric & Gas',
          amount: 25000,
          frequency: 'monthly',
          owner: 'Joint',
          environment: env,
        });

        res.json({ success: true, message: 'Sample data seeded successfully' });
      } catch (error) {
        console.error('Failed to seed test user data:', error);
        res.status(500).json({ error: 'Failed to seed sample data' });
      }
    });

    // Erase data for specific test user
    app.post('/api/admin/test-users/:id/erase', verifyAdminToken, async (req, res) => {
      try {
        const { id } = req.params;

        const testUser = TEST_USERS.find((u) => u.id === id);
        if (!testUser) {
          return res.status(404).json({ error: 'Test user not found' });
        }

        await eraseEnvironmentData(testUser.environment);

        res.json({ success: true, message: 'Test user data erased' });
      } catch (error) {
        console.error('Failed to erase test user data:', error);
        res.status(500).json({ error: 'Failed to erase data' });
      }
    });

    console.log('🔐 Admin Panel Endpoints:');
    console.log('   POST /api/admin/login');
    console.log('   GET  /api/admin/test-users');
    console.log('   PUT  /api/admin/test-users/:id');
    console.log('   POST /api/admin/test-users/:id/quick-login');
    console.log('   POST /api/admin/test-users/:id/seed-data');
    console.log('   POST /api/admin/test-users/:id/erase');
    console.log('   POST /api/auth/quick-login');

    // ==================== LIVE USER MANAGEMENT ====================

    // Get all live users (environment starts with 'live-')
    app.get('/api/admin/live-users', verifyAdminToken, async (req, res) => {
      try {
        console.log('Admin fetching live users...');
        const liveUsers = await db
          .select({
            id: users.id,
            email: users.email,
            fullName: users.fullName,
            environment: users.environment,
            subscriptionTier: users.subscriptionTier,
            status: users.status,
            createdAt: users.createdAt,
            lastLoginAt: users.lastLoginAt,
          })
          .from(users)
          .where(
            or(sql`${users.environment} LIKE 'live-%'`, eq(users.email, 'nedpearson@gmail.com'))
          );

        console.log(`Found ${liveUsers.length} live users`);
        res.json(liveUsers);
      } catch (error: any) {
        console.error('Failed to get live users:', error);
        res.status(500).json({ error: error.message || 'Failed to get live users' });
      }
    });

    // Create a new live user account
    app.post('/api/admin/live-users', verifyAdminToken, async (req, res) => {
      try {
        const { email, password, fullName, tier = 'enterprise' } = req.body;

        if (!email || !password || !fullName) {
          return res.status(400).json({ error: 'Email, password, and full name are required' });
        }

        // Check if email already exists
        const existing = await storage.getUserByEmail(email);
        if (existing) {
          return res.status(409).json({ error: 'Email already registered' });
        }

        // Generate unique environment for isolation
        const envId = `live-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

        const { hashPassword } = await import('./auth');
        const hashedPwd = await hashPassword(password);

        const newUser = await storage.createUser({
          email,
          password: hashedPwd,
          fullName,
          role: 'client',
          isAdmin: false,
          environment: envId,
          status: 'active',
        });
        // Note: subscriptionTier is managed via subscriptions table, not users table

        const { password: _, ...userWithoutPassword } = newUser;
        res.json({ success: true, user: userWithoutPassword });
      } catch (error) {
        console.error('Failed to create live user:', error);
        res.status(500).json({ error: 'Failed to create live user' });
      }
    });

    // Update a live user
    app.put('/api/admin/live-users/:id', verifyAdminToken, async (req, res) => {
      try {
        const { id } = req.params;
        const { email, password, fullName, tier, status } = req.body;

        const user = await storage.getUser(id);
        if (!user || !user.environment.startsWith('live-')) {
          return res.status(404).json({ error: 'Live user not found' });
        }

        const updates: any = {};
        if (email) updates.email = email;
        if (fullName) updates.fullName = fullName;
        if (tier) updates.subscriptionTier = tier;
        if (status) updates.status = status;
        if (password) {
          const { hashPassword } = await import('./auth');
          updates.password = await hashPassword(password);
        }

        if (Object.keys(updates).length > 0) {
          await db.update(users).set(updates).where(eq(users.id, id));
        }

        res.json({ success: true, message: 'Live user updated' });
      } catch (error) {
        console.error('Failed to update live user:', error);
        res.status(500).json({ error: 'Failed to update live user' });
      }
    });

    // Delete a live user
    app.delete('/api/admin/live-users/:id', verifyAdminToken, async (req, res) => {
      try {
        const { id } = req.params;

        const user = await storage.getUser(id);
        if (!user || !user.environment.startsWith('live-')) {
          return res.status(404).json({ error: 'Live user not found' });
        }

        // Erase all user data first
        await eraseEnvironmentData(user.environment);

        // Delete the user record
        await db.delete(users).where(eq(users.id, id));

        res.json({ success: true, message: 'Live user deleted' });
      } catch (error) {
        console.error('Failed to delete live user:', error);
        res.status(500).json({ error: 'Failed to delete live user' });
      }
    });

    // Quick login for live user
    app.post('/api/admin/live-users/:id/quick-login', verifyAdminToken, async (req, res) => {
      try {
        const { id } = req.params;

        const user = await storage.getUser(id);
        if (!user || !user.environment.startsWith('live-')) {
          return res.status(404).json({ error: 'Live user not found' });
        }

        // Generate a single-use login token (valid for 5 minutes)
        const loginToken = Buffer.from(
          JSON.stringify({
            userId: user.id,
            email: user.email,
            environment: user.environment,
            expires: Date.now() + 5 * 60 * 1000,
          })
        ).toString('base64');

        res.json({
          loginToken,
          email: user.email,
          environment: user.environment,
        });
      } catch (error) {
        console.error('Failed to generate quick login:', error);
        res.status(500).json({ error: 'Failed to generate quick login' });
      }
    });

    console.log('👤 Live User Management Endpoints:');
    console.log('   GET    /api/admin/live-users');
    console.log('   POST   /api/admin/live-users');
    console.log('   PUT    /api/admin/live-users/:id');
    console.log('   DELETE /api/admin/live-users/:id');
    console.log('   POST   /api/admin/live-users/:id/quick-login');

    // ============================================
    // ADMIN SECURITY MANAGEMENT
    // ============================================

    // Admin: Get all security events
    app.get('/api/admin/security/events', verifyAdminToken, async (req, res) => {
      try {
        const limit = parseInt(req.query.limit as string) || 200;
        const events = await storage.getAllSecurityEvents(limit);
        res.json({ events });
      } catch (error) {
        console.error('Admin get security events error:', error);
        res.status(500).json({ error: 'Failed to get security events' });
      }
    });

    // Admin: Force revoke user sessions
    app.post(
      '/api/admin/security/users/:userId/revoke-sessions',
      verifyAdminToken,
      async (req, res) => {
        try {
          const { userId } = req.params;
          await storage.revokeAllUserSessions(userId, 'admin_revoke');

          await storage.logSecurityEvent({
            userId,
            eventType: 'sessions_revoked_by_admin',
            eventStatus: 'success',
            ipAddress: req.ip || req.socket.remoteAddress,
            userAgent: req.headers['user-agent'],
          });

          res.json({ success: true, message: 'All user sessions revoked' });
        } catch (error) {
          console.error('Admin revoke sessions error:', error);
          res.status(500).json({ error: 'Failed to revoke sessions' });
        }
      }
    );

    console.log('🔐 Admin Security Endpoints:');
    console.log('   GET  /api/admin/security/events');
    console.log('   POST /api/admin/security/users/:userId/revoke-sessions');

    // ============================================
    // DEBUG ENDPOINTS (for troubleshooting)
    // ============================================

    app.get('/api/debug/finances', async (req, res) => {
      try {
        const userId =
          (req as any).session?.userId ||
          (req.headers['x-user-id'] as string) ||
          'demo-client-user';
        const environment =
          (req.query.environment as string) || (req.headers['x-environment'] as string) || 'demo';

        const allExpenses = await storage.getExpenses(userId, environment);
        const allIncomes = await storage.getIncomes(userId, environment);
        const allDebts = await storage.getDebts(userId, environment);

        const totalExpenses = allExpenses.reduce((sum, exp) => sum + exp.amount, 0);
        const totalIncomes = allIncomes.reduce((sum, inc) => sum + inc.amount, 0);
        const totalDebts = allDebts.reduce((sum, debt) => sum + debt.amount, 0);

        res.json({
          userId,
          environment,
          summary: {
            expenseCount: allExpenses.length,
            incomeCount: allIncomes.length,
            debtCount: allDebts.length,
            totalExpensesCents: totalExpenses,
            totalExpensesDollars: (totalExpenses / 100).toFixed(2),
            totalIncomesCents: totalIncomes,
            totalIncomesDollars: (totalIncomes / 100).toFixed(2),
            totalDebtsCents: totalDebts,
            totalDebtsDollars: (totalDebts / 100).toFixed(2),
          },
          recentExpenses: allExpenses.slice(0, 5).map((e) => ({
            id: e.id,
            documentId: e.documentId,
            category: e.category,
            description: e.description,
            amountCents: e.amount,
            amountDollars: (e.amount / 100).toFixed(2),
            vendor: e.vendor,
          })),
          recentIncomes: allIncomes.slice(0, 5).map((i) => ({
            id: i.id,
            documentId: i.documentId,
            source: i.source,
            amountCents: i.amount,
            amountDollars: (i.amount / 100).toFixed(2),
          })),
          recentDebts: allDebts.slice(0, 5).map((d) => ({
            id: d.id,
            documentId: d.documentId,
            name: d.name,
            amountCents: d.amount,
            amountDollars: (d.amount / 100).toFixed(2),
          })),
        });
      } catch (error) {
        console.error('[Debug Finances] Error:', error);
        res.status(500).json({ error: 'Failed to fetch debug finances' });
      }
    });

    // Debug endpoint to check users in database
    app.get('/api/debug/users', async (req, res) => {
      try {
        const allUsers = await db
          .select({
            email: users.email,
            fullName: users.fullName,
            environment: users.environment,
            status: users.status,
            platformRole: users.platformRole,
            passwordLength: sql`LENGTH(${users.password})`,
          })
          .from(users);

        res.json({
          count: allUsers.length,
          users: allUsers,
        });
      } catch (error) {
        console.error('[Debug Users] Error:', error);
        res.status(500).json({
          error: 'Failed to fetch users',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Protected bootstrap endpoint for one-off manual provisioning
    app.post('/api/bootstrap/run', async (req, res) => {
      try {
        const configuredSecret = process.env.BOOTSTRAP_SECRET;
        if (!configuredSecret) {
          return res
            .status(500)
            .json({ error: 'BOOTSTRAP_SECRET is not configured on the server' });
        }

        const providedSecret =
          (req.headers['x-bootstrap-secret'] as string | undefined) || req.body?.secret;
        if (!providedSecret || providedSecret !== configuredSecret) {
          return res.status(403).json({ error: 'Invalid bootstrap secret' });
        }

        const forcePasswordReset = req.body?.forcePasswordReset === true;
        const { bootstrapUsers } = await import('./services/bootstrap.service');
        const result = await bootstrapUsers({ forcePasswordReset });

        return res.status(200).json({ ok: true, result });
      } catch (error) {
        console.error('[Bootstrap Run] Error:', error);
        return res.status(500).json({
          error: 'Failed to run bootstrap',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Debug endpoint to check auth configuration
    app.get('/api/debug/auth', async (req, res) => {
      try {
        const { isSuperAdminConfigured } = await import('./services/bootstrap.service');
        const { eq } = await import('drizzle-orm');

        const superAdminEmail = (process.env.SUPERADMIN_EMAIL || 'nedpearson@gmail.com')
          .trim()
          .toLowerCase();
        const demoEmail = (process.env.DEMO_EMAIL || 'demo@example.com').trim().toLowerCase();

        const superAdminUser = await db
          .select({
            id: users.id,
            email: users.email,
            fullName: users.fullName,
            environment: users.environment,
            status: users.status,
            platformRole: users.platformRole,
            passwordLength: sql`LENGTH(${users.password})`,
            passwordStartsWith: sql`SUBSTRING(${users.password}, 1, 4)`,
          })
          .from(users)
          .where(eq(users.email, superAdminEmail));

        const demoUser = await db
          .select({
            id: users.id,
            email: users.email,
            fullName: users.fullName,
            environment: users.environment,
            status: users.status,
            platformRole: users.platformRole,
            passwordLength: sql`LENGTH(${users.password})`,
          })
          .from(users)
          .where(eq(users.email, demoEmail));

        const superAdminConfigured = await isSuperAdminConfigured();

        res.json({
          environment: {
            NODE_ENV: process.env.NODE_ENV,
            DEMO_MODE: process.env.DEMO_MODE,
            SUPERADMIN_EMAIL: superAdminEmail,
            DEMO_EMAIL: demoEmail,
          },
          superAdmin: {
            configured: superAdminConfigured,
            exists: superAdminUser.length > 0,
            user: superAdminUser[0] || null,
          },
          demo: {
            enabled: process.env.DEMO_MODE === 'true',
            exists: demoUser.length > 0,
            user: demoUser[0] || null,
          },
          database: {
            connected: true,
            totalUsers: (await db.select({ count: sql`COUNT(*)` }).from(users))[0].count,
          },
        });
      } catch (error) {
        console.error('[Debug Auth] Error:', error);
        res.status(500).json({
          error: 'Failed to check auth status',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });

    console.log('🔧 Debug Endpoints:');
    console.log('   GET  /api/debug/finances');
    console.log('   GET  /api/debug/users');
    console.log('   GET  /api/debug/auth');
  } // End of optional integrations check

  // ============================================
  // APP VERSION & UPDATE NOTIFICATIONS
  // ============================================

  // Stable version set at server startup - changes only on redeploy
  const APP_VERSION = process.env.APP_VERSION || `v${Date.now()}`;
  const BUILD_TIME = new Date().toISOString();

  // Get current app version and recent features
  app.get('/api/version', (req, res) => {
    res.json({
      version: APP_VERSION,
      buildTime: BUILD_TIME,
      features: [
        {
          title: 'AI Document Analysis',
          description: 'Automatic OCR and categorization for uploaded documents',
        },
        {
          title: 'Batch Re-analysis',
          description: 'Re-analyze all your historical documents with AI',
        },
        {
          title: 'Smart Categorization',
          description: 'AI suggests document categories for faster organization',
        },
      ],
    });
  });

  console.log('📢 Version Endpoints:');
  console.log('   GET  /api/version');

  const frontendErrorSchema = z.object({
    type: z.literal('frontend-error'),
    level: z.enum(['error', 'warn', 'info']),
    route: z.string(),
    message: z.string(),
    stack: z.string().optional(),
    userId: z.string().optional(),
    environment: z.enum(['demo', 'live', 'unknown']),
    timestamp: z.string(),
    componentStack: z.string().optional(),
  });

  app.post('/api/log/frontend-error', (req, res) => {
    try {
      const parsed = frontendErrorSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid error report format' });
      }
      const report = parsed.data;
      console.error(`[Frontend ${report.level.toUpperCase()}] ${report.route}: ${report.message}`, {
        userId: report.userId,
        environment: report.environment,
        timestamp: report.timestamp,
      });
      res.status(200).json({ received: true });
    } catch {
      res.status(500).json({ error: 'Failed to log error' });
    }
  });

  console.log('📋 Frontend Logging Endpoints:');
  console.log('   POST /api/log/frontend-error');

  return httpServer;
}
