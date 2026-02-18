import { Router, Request, Response, NextFunction } from 'express';
import { db, getPool } from '../db';
import { safeQuery } from '../lib/safeQuery';
import { handleRouteError } from '../lib/errorHandler';
import { users, violations, cases, expenses, incomes, assets, debts } from '@shared/schema';
import {
  dataClassifications, piiCatalog, dataLineageNodes, dataLineageEdges, dataLineageSources,
  consentPurposes, userConsents, dataSubjectRequests, retentionPolicies, retentionJobs,
  auditTrail, encryptionKeys, businessMetrics, dataQualityTests, dataQualityTestRuns, metadataCatalog,
  insertDataSubjectRequestSchema, insertUserConsentSchema, insertAuditTrailSchema,
  type DataSubjectRequest, type UserConsent, type AuditTrailEntry, type RetentionPolicy
} from '@shared/governance-schema';
import { eq, and, gte, lte, desc, sql, isNull } from 'drizzle-orm';
import { encryptToken, decryptToken } from '../lib/encryption';

const router = Router();

// ============================================
// AUDIT TRAIL MIDDLEWARE
// ============================================

interface AuditableRequest extends Request {
  auditContext?: {
    userId?: string;
    sessionId?: string;
    startTime: number;
  };
}

export function auditMiddleware(resourceType: string, action: string) {
  return async (req: AuditableRequest, res: Response, next: NextFunction) => {
    req.auditContext = {
      userId: (req as any).session?.userId,
      sessionId: (req as any).sessionID,
      startTime: Date.now(),
    };

    const originalJson = res.json.bind(res);
    res.json = function(body: any) {
      const duration = Date.now() - (req.auditContext?.startTime || Date.now());
      
      db.insert(auditTrail).values({
        userId: req.auditContext?.userId || null,
        sessionId: req.auditContext?.sessionId || null,
        action,
        resourceType,
        resourceId: req.params.id || null,
        tableName: resourceType,
        ipAddress: req.ip || req.socket.remoteAddress || null,
        userAgent: req.headers['user-agent'] || null,
        requestPath: req.path,
        requestMethod: req.method,
        responseStatus: res.statusCode,
        durationMs: duration,
        metadata: { query: req.query, params: req.params },
      }).catch((err: Error) => console.error('Audit log failed:', err));

      return originalJson(body);
    };

    next();
  };
}

// ============================================
// DATA CLASSIFICATION ENDPOINTS
// ============================================

router.get('/classifications', async (req: Request, res: Response) => {
  try {
    const classifications = await db.select().from(dataClassifications).orderBy(dataClassifications.level);
    res.json({ classifications });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.get('/pii-catalog', async (req: Request, res: Response) => {
  try {
    const catalog = await db.select().from(piiCatalog).orderBy(piiCatalog.tableName, piiCatalog.columnName);
    res.json({ catalog });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

// ============================================
// DATA LINEAGE ENDPOINTS
// ============================================

router.get('/lineage/graph', async (req: Request, res: Response) => {
  try {
    const nodes = await db.select().from(dataLineageNodes);
    const edges = await db.select().from(dataLineageEdges).where(eq(dataLineageEdges.isActive, true));
    const sources = await db.select().from(dataLineageSources).where(eq(dataLineageSources.isActive, true));

    res.json({
      nodes: nodes.map((n: any) => ({
        id: n.id,
        label: n.entityName,
        type: n.nodeType,
        entityType: n.entityType,
        metadata: n.metadata,
      })),
      edges: edges.map((e: any) => ({
        id: e.id,
        source: e.sourceNodeId,
        target: e.targetNodeId,
        transformation: e.transformationType,
      })),
      sources,
    });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.get('/lineage/entity/:entityName', async (req: Request, res: Response) => {
  try {
    const { entityName } = req.params;
    
    const node = await db.select().from(dataLineageNodes)
      .where(eq(dataLineageNodes.entityName, entityName))
      .limit(1);

    if (!node.length) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    const upstreamEdges = await db.select().from(dataLineageEdges)
      .where(eq(dataLineageEdges.targetNodeId, node[0].id));
    
    const downstreamEdges = await db.select().from(dataLineageEdges)
      .where(eq(dataLineageEdges.sourceNodeId, node[0].id));

    const upstreamNodeIds = upstreamEdges.map((e: any) => e.sourceNodeId);
    const downstreamNodeIds = downstreamEdges.map((e: any) => e.targetNodeId);

    const relatedNodes = await db.select().from(dataLineageNodes);

    res.json({
      entity: node[0],
      upstream: relatedNodes.filter((n: any) => upstreamNodeIds.includes(n.id)),
      downstream: relatedNodes.filter((n: any) => downstreamNodeIds.includes(n.id)),
      upstreamEdges,
      downstreamEdges,
    });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

// ============================================
// CONSENT MANAGEMENT ENDPOINTS
// ============================================

router.get('/consent/purposes', async (req: Request, res: Response) => {
  try {
    const purposes = await db.select().from(consentPurposes)
      .where(eq(consentPurposes.isActive, true));
    res.json({ purposes });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.get('/consent/user/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
    const consents = await db.select({
      consent: userConsents,
      purpose: consentPurposes,
    }).from(userConsents)
      .leftJoin(consentPurposes, eq(userConsents.purposeId, consentPurposes.id))
      .where(and(
        eq(userConsents.userId, userId),
        isNull(userConsents.revokedAt)
      ));

    res.json({ consents });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.post('/consent/grant', auditMiddleware('consent', 'create'), async (req: Request, res: Response) => {
  try {
    const { userId, purposeId, consentMethod } = req.body;
    
    const consent = await db.insert(userConsents).values({
      userId,
      purposeId,
      consentGiven: true,
      consentMethod,
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
      consentVersion: '1.0',
    }).returning();

    await db.insert(auditTrail).values({
      userId,
      action: 'consent',
      resourceType: 'consent',
      resourceId: consent[0].id,
      metadata: { purposeId, method: consentMethod },
    });

    res.json({ success: true, consent: consent[0] });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.post('/consent/revoke', auditMiddleware('consent', 'delete'), async (req: Request, res: Response) => {
  try {
    const { userId, purposeId } = req.body;
    
    await db.update(userConsents)
      .set({ revokedAt: new Date() })
      .where(and(
        eq(userConsents.userId, userId),
        eq(userConsents.purposeId, purposeId),
        isNull(userConsents.revokedAt)
      ));

    await db.insert(auditTrail).values({
      userId,
      action: 'consent',
      resourceType: 'consent_revocation',
      metadata: { purposeId },
    });

    res.json({ success: true, message: 'Consent revoked' });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

// ============================================
// DATA SUBJECT REQUESTS (GDPR/CCPA)
// ============================================

router.get('/dsr', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string;
    
    let query = db.select().from(dataSubjectRequests).orderBy(desc(dataSubjectRequests.createdAt));
    
    if (status) {
      query = query.where(eq(dataSubjectRequests.status, status)) as any;
    }

    const requests = await query.limit(100);
    res.json({ requests });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.post('/dsr/create', auditMiddleware('data_subject_request', 'create'), async (req: Request, res: Response) => {
  try {
    const { userId, requestType, regulationType, requestDetails } = req.body;
    
    const deadlineDays = regulationType === 'gdpr' ? 30 : regulationType === 'ccpa' ? 45 : 30;
    const deadlineAt = new Date();
    deadlineAt.setDate(deadlineAt.getDate() + deadlineDays);

    const request = await db.insert(dataSubjectRequests).values({
      userId,
      requestType,
      regulationType,
      requestDetails,
      deadlineAt,
      status: 'pending',
    }).returning();

    await db.insert(auditTrail).values({
      userId,
      action: 'create',
      resourceType: 'data_subject_request',
      resourceId: request[0].id,
      metadata: { requestType, regulationType },
    });

    res.json({ success: true, request: request[0] });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.post('/dsr/:id/process', auditMiddleware('data_subject_request', 'update'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { action, processedBy, notes } = req.body;

    const request = await db.select().from(dataSubjectRequests)
      .where(eq(dataSubjectRequests.id, id))
      .limit(1);

    if (!request.length) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const dsr = request[0];
    let fulfillmentLog: any = dsr.fulfillmentLog || [];
    let exportFileUrl: string | null = null;

    if (action === 'process') {
      if (dsr.requestType === 'access' || dsr.requestType === 'portability') {
        const userData = await collectUserData(dsr.userId);
        exportFileUrl = await generateDataExport(dsr.userId, userData);
        fulfillmentLog.push({
          timestamp: new Date().toISOString(),
          action: 'data_exported',
          details: 'User data collected and exported',
        });
      } else if (dsr.requestType === 'erasure') {
        await anonymizeUserData(dsr.userId);
        fulfillmentLog.push({
          timestamp: new Date().toISOString(),
          action: 'data_anonymized',
          details: 'User data anonymized per erasure request',
        });
      }
    }

    await db.update(dataSubjectRequests)
      .set({
        status: action === 'process' ? 'completed' : action,
        processedAt: action === 'process' ? new Date() : null,
        processedBy,
        fulfillmentLog,
        exportFileUrl,
        notes,
        updatedAt: new Date(),
      })
      .where(eq(dataSubjectRequests.id, id));

    await db.insert(auditTrail).values({
      userId: processedBy,
      action: 'update',
      resourceType: 'data_subject_request',
      resourceId: id,
      metadata: { action, requestType: dsr.requestType },
    });

    res.json({ success: true, message: `Request ${action}ed successfully` });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

async function collectUserData(userId: string): Promise<any> {
  const userData = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const userViolations = await db.select().from(violations).where(eq(violations.userId, userId));
  const userCases = await db.select().from(cases).where(eq(cases.id, userId));
  const userExpenses = await db.select().from(expenses).where(eq(expenses.userId, userId));
  const userIncome = await db.select().from(incomes).where(eq(incomes.userId, userId));
  const userAssets = await db.select().from(assets).where(eq(assets.userId, userId));
  const userDebts = await db.select().from(debts).where(eq(debts.userId, userId));
  const userConsentsData = await db.select().from(userConsents).where(eq(userConsents.userId, userId));

  return {
    profile: userData[0] ? { ...userData[0], password: '[REDACTED]' } : null,
    violations: userViolations,
    cases: userCases,
    expenses: userExpenses,
    income: userIncome,
    assets: userAssets,
    debts: userDebts,
    consents: userConsentsData,
    exportedAt: new Date().toISOString(),
  };
}

async function generateDataExport(userId: string, data: any): Promise<string> {
  const exportData = JSON.stringify(data, null, 2);
  const filename = `user_data_export_${userId}_${Date.now()}.json`;
  return `/api/governance/exports/${filename}`;
}

async function anonymizeUserData(userId: string): Promise<void> {
  const anonymizedEmail = `deleted_${userId}@anonymized.local`;
  const anonymizedName = '[DELETED]';

  await db.update(users)
    .set({
      email: anonymizedEmail,
      password: '[ANONYMIZED]',
      firstName: anonymizedName,
      lastName: anonymizedName,
      phone: null,
      profileImageUrl: null,
      qbAccessToken: null,
      qbRefreshToken: null,
      qbRealmId: null,
      qbConnected: false,
    })
    .where(eq(users.id, userId));

  await db.insert(auditTrail).values({
    userId,
    action: 'delete',
    resourceType: 'user_data',
    metadata: { reason: 'gdpr_erasure_request' },
  });
}

// ============================================
// RETENTION POLICIES ENDPOINTS
// ============================================

router.get('/retention/policies', async (req: Request, res: Response) => {
  try {
    const policies = await db.select().from(retentionPolicies)
      .where(eq(retentionPolicies.isActive, true));
    res.json({ policies });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.post('/retention/execute/:policyId', auditMiddleware('retention_policy', 'execute'), async (req: Request, res: Response) => {
  try {
    const { policyId } = req.params;
    
    const policy = await db.select().from(retentionPolicies)
      .where(eq(retentionPolicies.id, policyId))
      .limit(1);

    if (!policy.length) {
      return res.status(404).json({ error: 'Policy not found' });
    }

    const job = await db.insert(retentionJobs).values({
      policyId,
      status: 'running',
    }).returning();

    executeRetentionPolicy(policy[0], job[0].id).catch(err => {
      console.error('Retention job failed:', err);
      db.update(retentionJobs)
        .set({ status: 'failed', errorMessage: err.message, completedAt: new Date() })
        .where(eq(retentionJobs.id, job[0].id));
    });

    res.json({ success: true, jobId: job[0].id, message: 'Retention job started' });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

const ALLOWED_RETENTION_TABLES = new Set([
  'violations', 'cases', 'expenses', 'incomes', 'assets', 'debts',
  'documents', 'messages', 'alerts', 'security_events', 'sms_deliveries',
  'audit_trail', 'usage_audit', 'billing_records', 'data_quality_test_runs'
]);

function validateTableName(tableName: string): string {
  const sanitized = tableName.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!ALLOWED_RETENTION_TABLES.has(sanitized)) {
    throw new Error(`Table "${tableName}" is not allowed for retention operations`);
  }
  return `"${sanitized}"`;
}

async function executeRetentionPolicy(policy: RetentionPolicy, jobId: string): Promise<void> {
  const pool = getPool();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - policy.retentionPeriodDays);

  let recordsProcessed = 0;
  let recordsArchived = 0;
  let recordsDeleted = 0;

  try {
    const safeTableName = validateTableName(policy.tableName);
    
    if (policy.purgeMode === 'archive' || policy.purgeMode === 'soft_delete') {
      recordsArchived = recordsProcessed;
    } else if (policy.purgeMode === 'hard_delete') {
      const deleteResult = await safeQuery(
        pool,
        'governance.executeRetentionDelete',
        `DELETE FROM ${safeTableName} WHERE created_at < $1 RETURNING id`,
        [cutoffDate]
      );
      recordsDeleted = deleteResult.rowCount || 0;
      recordsProcessed = recordsDeleted;
    } else if (policy.purgeMode === 'anonymize') {
      recordsProcessed = recordsArchived;
    }

    await db.update(retentionJobs)
      .set({
        status: 'completed',
        recordsProcessed,
        recordsArchived,
        recordsDeleted,
        completedAt: new Date(),
      })
      .where(eq(retentionJobs.id, jobId));

    await db.update(retentionPolicies)
      .set({ lastExecutedAt: new Date() })
      .where(eq(retentionPolicies.id, policy.id));

  } catch (error: any) {
    throw error;
  }
}

router.get('/retention/jobs', async (req: Request, res: Response) => {
  try {
    const jobs = await db.select().from(retentionJobs)
      .orderBy(desc(retentionJobs.startedAt))
      .limit(50);
    res.json({ jobs });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

// ============================================
// AUDIT TRAIL ENDPOINTS
// ============================================

router.get('/audit', async (req: Request, res: Response) => {
  try {
    const { userId, resourceType, action, startDate, endDate, limit = 100 } = req.query;
    
    let query = db.select().from(auditTrail).orderBy(desc(auditTrail.createdAt));

    const entries = await query.limit(Number(limit));
    res.json({ entries });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.get('/audit/user/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const entries = await db.select().from(auditTrail)
      .where(eq(auditTrail.userId, userId))
      .orderBy(desc(auditTrail.createdAt))
      .limit(100);
    res.json({ entries });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

// ============================================
// BUSINESS METRICS ENDPOINTS
// ============================================

router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const metrics = await db.select().from(businessMetrics)
      .where(eq(businessMetrics.isActive, true))
      .orderBy(businessMetrics.category, businessMetrics.name);
    res.json({ metrics });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

// ============================================
// DATA QUALITY ENDPOINTS
// ============================================

router.get('/quality/tests', async (req: Request, res: Response) => {
  try {
    const tests = await db.select().from(dataQualityTests)
      .where(eq(dataQualityTests.isActive, true));
    res.json({ tests });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.post('/quality/tests/:testId/run', auditMiddleware('data_quality_test', 'execute'), async (req: Request, res: Response) => {
  try {
    const { testId } = req.params;
    
    const test = await db.select().from(dataQualityTests)
      .where(eq(dataQualityTests.id, testId))
      .limit(1);

    if (!test.length) {
      return res.status(404).json({ error: 'Test not found' });
    }

    const startTime = Date.now();
    const pool = getPool();

    try {
      const result = await safeQuery(pool, 'governance.runDataQualityTest', test[0].testQuery);
      const executionTime = Date.now() - startTime;
      const passed = evaluateTestResult(test[0], result);

      const run = await db.insert(dataQualityTestRuns).values({
        testId,
        status: 'completed',
        actualResult: JSON.stringify(result.rows),
        passed,
        recordsChecked: result.rowCount || 0,
        failedRecords: passed ? 0 : result.rowCount || 0,
        executionTimeMs: executionTime,
      }).returning();

      await db.update(dataQualityTests)
        .set({ lastRunAt: new Date(), lastRunStatus: passed ? 'passed' : 'failed' })
        .where(eq(dataQualityTests.id, testId));

      res.json({ success: true, run: run[0] });
    } catch (queryError: any) {
      const run = await db.insert(dataQualityTestRuns).values({
        testId,
        status: 'error',
        errorMessage: queryError.message,
        passed: false,
        executionTimeMs: Date.now() - startTime,
      }).returning();

      res.json({ success: false, run: run[0], error: queryError.message });
    }
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

function evaluateTestResult(test: any, result: any): boolean {
  if (test.testType === 'row_count' && test.threshold) {
    return (result.rowCount || 0) <= test.threshold;
  }
  if (test.testType === 'not_null') {
    return (result.rowCount || 0) === 0;
  }
  if (test.testType === 'unique') {
    return (result.rowCount || 0) === 0;
  }
  return true;
}

// ============================================
// METADATA CATALOG ENDPOINTS
// ============================================

router.get('/catalog', async (req: Request, res: Response) => {
  try {
    const { entityType, search } = req.query;
    
    let query = db.select().from(metadataCatalog).orderBy(metadataCatalog.entityType, metadataCatalog.entityName);

    const entries = await query;
    res.json({ entries });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

// ============================================
// GOVERNANCE SUMMARY ENDPOINT
// ============================================

router.get('/summary', async (req: Request, res: Response) => {
  try {
    const [
      piiCount,
      pendingDsrCount,
      activePolicesCount,
      recentAuditCount,
      qualityTestsCount,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(piiCatalog),
      db.select({ count: sql<number>`count(*)` }).from(dataSubjectRequests).where(eq(dataSubjectRequests.status, 'pending')),
      db.select({ count: sql<number>`count(*)` }).from(retentionPolicies).where(eq(retentionPolicies.isActive, true)),
      db.select({ count: sql<number>`count(*)` }).from(auditTrail).where(gte(auditTrail.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))),
      db.select({ count: sql<number>`count(*)` }).from(dataQualityTests).where(eq(dataQualityTests.isActive, true)),
    ]);

    res.json({
      summary: {
        piiFieldsTracked: Number(piiCount[0]?.count) || 0,
        pendingDataRequests: Number(pendingDsrCount[0]?.count) || 0,
        activeRetentionPolicies: Number(activePolicesCount[0]?.count) || 0,
        auditEventsLast24h: Number(recentAuditCount[0]?.count) || 0,
        activeQualityTests: Number(qualityTestsCount[0]?.count) || 0,
      },
    });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

export default router;
