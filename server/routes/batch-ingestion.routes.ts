/**
 * Batch Document Ingestion Routes
 *
 * Provides REST endpoints for multi-file batch upload sessions.
 * All existing single-file routes remain unchanged.
 *
 * Route overview:
 *   POST /api/batches                     — create a batch session
 *   GET  /api/batches                     — list batches for current user
 *   GET  /api/batches/:id                 — batch detail + document list
 *   GET  /api/batches/:id/status          — lightweight status poll (for UI polling)
 *   POST /api/batches/:id/upload          — upload one file into an existing batch
 *   POST /api/batches/:id/start           — trigger AI processing for all uploaded files
 *   POST /api/batches/:id/documents/bulk  — bulk actions: assign-case | approve | retry-failed
 *   POST /api/batches/documents/:docId/retry — retry a single failed document
 *   GET  /api/batches/documents/:docId/audit — audit trail for one document
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { batchIngestionService } from '../services/batch-ingestion.service';

interface AuthedRequest extends Request {
  file?: Express.Multer.File;
}

const router = Router();

// In-memory storage so we can hash the buffer before saving to disk ourselves
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB per file
  fileFilter: (_req, file, cb) => {
    // Accept all common document types
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'text/plain',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/tiff',
      'message/rfc822',      // .eml
      'application/zip',    // zip of documents
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type '${file.mimetype}' is not supported`));
    }
  },
});

// ─── Auth helper (matches existing pattern in storage.routes.ts) ───────────────
function getUserId(req: Request): string | null {
  const sessionUserId = (req.session as any)?.userId;
  if (sessionUserId) return sessionUserId;
  const reqUserId = (req as any).user?.id;
  if (reqUserId) return reqUserId;
  const headerUserId = req.headers['x-user-id'] as string;
  if (headerUserId?.trim()) return headerUserId.trim();
  if (process.env.NODE_ENV === 'development' || process.env.APP_MODE === 'demo') {
    return 'a538fa83-3e26-4421-ac27-4c9271ad5848';
  }
  return null;
}

function getEnvironment(req: Request): string {
  return (req.cookies?.environment as string) || (req.headers['x-environment'] as string) || 'live';
}

function unauthorized(res: Response, msg = 'Authentication required') {
  return res.status(401).json({ success: false, error: msg });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. CREATE BATCH SESSION
// POST /api/batches
// Body: { batchName?, caseId? }
// Returns: { batchId, status, createdAt }
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return unauthorized(res);
    const environment = getEnvironment(req);

    const { batchName, caseId } = req.body;

    const batch = await batchIngestionService.createBatch({
      userId,
      environment,
      caseId,
      batchName,
      sourceType: 'web_upload',
    });

    res.status(201).json({
      success: true,
      batchId: batch.id,
      status: batch.status,
      createdAt: batch.createdAt,
    });
  } catch (error: unknown) {
    console.error('[BatchRoutes] Create batch error:', error);
    res.status(500).json({ success: false, error: 'Failed to create batch' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. LIST BATCHES
// GET /api/batches?limit=20&offset=0
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return unauthorized(res);

    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;

    const batches = await batchIngestionService.listBatches(userId, limit, offset);
    res.json({ success: true, batches, total: batches.length, limit, offset });
  } catch (error: unknown) {
    console.error('[BatchRoutes] List batches error:', error);
    res.status(500).json({ success: false, error: 'Failed to list batches' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. BATCH DETAIL (full status + documents)
// GET /api/batches/:id
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return unauthorized(res);

    const detail = await batchIngestionService.getBatchStatus(req.params.id, userId);
    if (!detail) return res.status(404).json({ success: false, error: 'Batch not found' });

    res.json({ success: true, ...detail });
  } catch (error: unknown) {
    console.error('[BatchRoutes] Get batch error:', error);
    res.status(500).json({ success: false, error: 'Failed to get batch' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3b. DELETE BATCH
// DELETE /api/batches/:id
// Deletes the batch + all its documents (including financial records)
// ═══════════════════════════════════════════════════════════════════════════════
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return unauthorized(res);

    await batchIngestionService.deleteBatch(req.params.id, userId);
    res.json({ success: true, message: 'Batch deleted successfully' });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[BatchRoutes] Delete batch error:', errMsg);
    res.status(500).json({ success: false, error: errMsg });
  }
});


// ═══════════════════════════════════════════════════════════════════════════════
// 4. LIGHTWEIGHT STATUS POLL (for frontend polling during processing)
// GET /api/batches/:id/status
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/:id/status', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return unauthorized(res);

    const detail = await batchIngestionService.getBatchStatus(req.params.id, userId);
    if (!detail) return res.status(404).json({ success: false, error: 'Batch not found' });

    res.json({
      success: true,
      batchId: detail.batch.id,
      status: detail.batch.status,
      summary: detail.summary,
      updatedAt: detail.batch.updatedAt,
    });
  } catch (error: unknown) {
    console.error('[BatchRoutes] Batch status poll error:', error);
    res.status(500).json({ success: false, error: 'Failed to get batch status' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. UPLOAD ONE FILE INTO A BATCH
// POST /api/batches/:id/upload
// Body: multipart/form-data with field "file"
// ═══════════════════════════════════════════════════════════════════════════════
router.post(
  '/:id/upload',
  memoryUpload.single('file'),
  async (req: AuthedRequest, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return unauthorized(res);
      if (!req.file) return res.status(400).json({ success: false, error: 'No file provided' });

      const environment = getEnvironment(req);
      const batchId = req.params.id;

      const result = await batchIngestionService.addFileToBatch(
        batchId,
        userId,
        environment,
        {
          buffer: req.file.buffer,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size,
        },
        req.ip ?? undefined
      );

      res.json({ success: true, ...result });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error('[BatchRoutes] Upload to batch error:', errMsg);
      res.status(500).json({ success: false, error: errMsg });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// 6. START BATCH PROCESSING
// POST /api/batches/:id/start
// Triggers AI pipeline for all uploaded (non-duplicate) files
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/:id/start', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return unauthorized(res);

    // Fire-and-forget — respond immediately, processing runs in background
    batchIngestionService.startBatchProcessing(req.params.id, userId).catch((err) => {
      console.error('[BatchRoutes] Background processing error for batch', req.params.id, '—', err);
    });

    res.json({
      success: true,
      message: 'Batch processing started',
      batchId: req.params.id,
    });
  } catch (error: unknown) {
    console.error('[BatchRoutes] Start batch error:', error);
    res.status(500).json({ success: false, error: 'Failed to start batch processing' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. BULK ACTIONS ON BATCH DOCUMENTS
// POST /api/batches/:id/documents/bulk
// Body: { action: 'assign-case' | 'approve' | 'retry-failed', caseId? }
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/:id/documents/bulk', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return unauthorized(res);

    const { action, caseId } = req.body;
    const batchId = req.params.id;

    if (!action) return res.status(400).json({ success: false, error: 'action is required' });

    switch (action) {
      case 'assign-case': {
        if (!caseId) return res.status(400).json({ success: false, error: 'caseId is required for assign-case' });
        await batchIngestionService.bulkAssignCase(batchId, caseId, userId);
        return res.json({ success: true, message: `Case ${caseId} assigned to all documents in batch` });
      }
      case 'approve': {
        const approved = await batchIngestionService.bulkApprove(batchId, userId, userId);
        return res.json({ success: true, message: `${approved} documents approved`, approvedCount: approved });
      }
      case 'retry-failed': {
        // Get failed docs and queue retries
        const { db } = await import('../db');
        const { documents: docsTable } = await import('@shared/schema');
        const { eq, and } = await import('drizzle-orm');

        const failedDocs = await db
          .select({ id: docsTable.id })
          .from(docsTable)
          .where(and(eq(docsTable.batchId!, batchId), eq(docsTable.userId, userId), eq(docsTable.processingStatus!, 'failed')));

        let retried = 0;
        for (const d of failedDocs) {
          try {
            await batchIngestionService.retryDocument(d.id, userId);
            retried++;
          } catch { /* continue retrying others */ }
        }
        return res.json({ success: true, message: `${retried} failed documents queued for retry`, retriedCount: retried });
      }
      case 're-extract': {
        // Re-run analyzeAndPersist on all completed documents to (re)create financial records.
        // Safe to call multiple times — it clears existing parse results first.
        const { db } = await import('../db');
        const { documents: docsTable } = await import('@shared/schema');
        const { eq, and, inArray } = await import('drizzle-orm');
        const { analyzeAndPersist } = await import('../services/analyzeAndPersist');

        // Target all docs in this batch (completed and failed) to regenerate records
        const allDocs = await db
          .select({ id: docsTable.id, processingStatus: docsTable.processingStatus, isDuplicate: docsTable.isDuplicate })
          .from(docsTable)
          .where(and(eq(docsTable.batchId!, batchId), eq(docsTable.userId, userId)));

        const eligibleDocs = allDocs.filter(d =>
          !d.isDuplicate &&
          d.processingStatus !== 'duplicate_skipped'
        );

        let extracted = 0;
        let errors = 0;
        for (const d of eligibleDocs) {
          try {
            const result = await analyzeAndPersist(d.id, { createRecords: true, forceReparse: true });
            if (result.financialRecordsCreated.length > 0 || result.parseStatus === 'already_parsed') {
              extracted++;
            }
          } catch (err) {
            console.error(`[BatchRoutes] re-extract failed for doc ${d.id}:`, err);
            errors++;
          }
        }
        return res.json({
          success: true,
          message: `Re-extracted financial data from ${extracted} documents (${errors} errors)`,
          extractedCount: extracted,
          errorCount: errors,
        });
      }
      default:
        return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
    }
  } catch (error: unknown) {
    console.error('[BatchRoutes] Bulk action error:', error);
    res.status(500).json({ success: false, error: 'Bulk action failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. RETRY A SINGLE DOCUMENT
// POST /api/batches/documents/:docId/retry
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/documents/:docId/retry', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return unauthorized(res);

    await batchIngestionService.retryDocument(req.params.docId, userId);
    res.json({ success: true, message: 'Document queued for retry' });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[BatchRoutes] Retry document error:', errMsg);
    res.status(500).json({ success: false, error: errMsg });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. GET DOCUMENT AUDIT TRAIL
// GET /api/batches/documents/:docId/audit
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/documents/:docId/audit', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return unauthorized(res);

    const auditLog = await batchIngestionService.getDocumentAuditLog(req.params.docId, userId);
    res.json({ success: true, auditLog, total: auditLog.length });
  } catch (error: unknown) {
    console.error('[BatchRoutes] Audit log error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch audit log' });
  }
});

export default router;
