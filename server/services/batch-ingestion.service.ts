/**
 * BatchIngestionService
 *
 * Orchestrates multi-document batch uploads. This service is the single source
 * of truth for batch lifecycle management. It:
 *  - Creates and tracks upload_batches records
 *  - Registers each file into the documents table with batch linkage
 *  - Performs synchronous deduplication before pipeline dispatch
 *  - Controls concurrency (max 3 parallel pipeline runs per batch)
 *  - Writes to document_audit_log for every meaningful state transition
 *
 * Backward-compatible: existing single-file uploads still work via the
 * existing /api/storage/files/upload route. This service adds NEW behaviour
 * on top without touching existing code paths.
 */

import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { db } from '../db';
import { eq, and, inArray, sql as sqll } from 'drizzle-orm';
import {
  uploadBatches,
  documents,
  documentProcessingJobs,
  documentAuditLog,
  type UploadBatch,
  type Document,
  type DocumentProcessingStatus,
  type BatchStatus,
} from '@shared/schema';
import { analysisOrchestrator } from './ai/AnalysisOrchestrator';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BatchFileInput {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  size: number;
}

export interface CreateBatchOptions {
  userId: string;
  environment: string;
  caseId?: string;
  batchName?: string;
  sourceType?: 'web_upload' | 'mobile' | 'api';
}

export interface BatchFileResult {
  documentId: string;
  fileName: string;
  processingStatus: DocumentProcessingStatus;
  isDuplicate: boolean;
  duplicateOfDocumentId?: string;
  error?: string;
}

export interface BatchResult {
  batchId: string;
  status: BatchStatus;
  totalFiles: number;
  results: BatchFileResult[];
}

export interface BatchStatus_Detail {
  batch: UploadBatch;
  documents: Array<{
    id: string;
    fileName: string | null;
    mimeType: string | null;
    fileSize: number | null;
    processingStatus: string | null;
    reviewStatus: string | null;
    isDuplicate: boolean | null;
    aiConfidence: number | null;
    aiCategory: string | null;
    createdAt: Date;
  }>;
  summary: {
    queued: number;
    processing: number;
    completed: number;
    failed: number;
    needsReview: number;
    duplicates: number;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const MAX_FILENAME_LENGTH = 200;
const CONCURRENCY_LIMIT = 3; // max parallel AI pipeline invocations per batch

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeFilename(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  const base = path.basename(originalName, ext)
    .replace(/[^a-zA-Z0-9_\-. ]/g, '_')
    .replace(/\s+/g, '_')
    .trim()
    .slice(0, MAX_FILENAME_LENGTH - ext.length - 13); // leave room for timestamp prefix
  const timestamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `${timestamp}-${rand}-${base}${ext}`;
}

function computeFileHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function ensureUploadDir(): Promise<void> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

async function saveFileToDisk(sanitizedName: string, buffer: Buffer): Promise<string> {
  await ensureUploadDir();
  const filePath = path.join(UPLOAD_DIR, sanitizedName);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

// ─── Audit Helpers ────────────────────────────────────────────────────────────

async function writeAuditLog(
  documentId: string,
  eventType: string,
  actorType: 'system' | 'user' | 'ai',
  actorId?: string,
  batchId?: string,
  oldValue?: Record<string, unknown>,
  newValue?: Record<string, unknown>,
  notes?: string,
  ipAddress?: string
): Promise<void> {
  try {
    await db.insert(documentAuditLog).values({
      documentId,
      batchId,
      actorType,
      actorId,
      eventType,
      oldValue: oldValue ?? null,
      newValue: newValue ?? null,
      notes,
      ipAddress,
    });
  } catch (err) {
    // Non-fatal: audit log failures must not break the main flow
    console.error('[BatchIngestionService] Audit log write failed:', err);
  }
}

// ─── Deduplication ────────────────────────────────────────────────────────────

async function findDuplicateByHash(
  userId: string,
  fileHash: string,
  excludeDocumentId?: string
): Promise<Document | null> {
  try {
    const results = await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.userId, userId),
          eq(documents.fileHash!, fileHash),
          // Don't flag as duplicate of itself
          excludeDocumentId ? sqll`${documents.id} != ${excludeDocumentId}` : sqll`1=1`
        )
      )
      .limit(1);
    return (results[0] as Document) ?? null;
  } catch {
    return null;
  }
}

// ─── Batch Counters ───────────────────────────────────────────────────────────

async function refreshBatchCounters(batchId: string): Promise<void> {
  try {
    const docs = await db
      .select({
        processingStatus: documents.processingStatus,
      })
      .from(documents)
      .where(eq(documents.batchId!, batchId));

    let completed = 0;
    let failed = 0;
    let processing = 0;

    for (const d of docs) {
      const s = d.processingStatus as string | null;
      if (s === 'completed' || s === 'duplicate_skipped') completed++;
      else if (s === 'failed') failed++;
      else if (s === 'processing' || s === 'ocr_in_progress' || s === 'extracting' || s === 'classifying') processing++;
    }

    const total = docs.length;
    let batchStatus: BatchStatus = 'processing';

    if (processing === 0 && failed === 0 && completed === total) {
      batchStatus = 'completed';
    } else if (processing === 0 && failed > 0 && completed > 0) {
      batchStatus = 'partial_failure';
    } else if (processing === 0 && failed === total) {
      batchStatus = 'failed';
    }

    await db
      .update(uploadBatches)
      .set({
        totalCompleted: completed,
        totalFailed: failed,
        totalProcessing: processing,
        status: batchStatus,
        completedAt: batchStatus !== 'processing' ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(uploadBatches.id, batchId));
  } catch (err) {
    console.error('[BatchIngestionService] Failed to refresh batch counters:', err);
  }
}

// ─── Service Class ────────────────────────────────────────────────────────────

class BatchIngestionService {
  /**
   * Create a new upload batch session.
   * Returns the batch ID to use when adding files.
   */
  async createBatch(opts: CreateBatchOptions): Promise<UploadBatch> {
    const [batch] = await db
      .insert(uploadBatches)
      .values({
        userId: opts.userId,
        caseId: opts.caseId,
        batchName: opts.batchName,
        sourceType: opts.sourceType ?? 'web_upload',
        environment: opts.environment,
        status: 'created',
      })
      .returning();

    console.log(`[BatchIngestion] Created batch ${batch.id} for user ${opts.userId}`);
    return batch;
  }

  /**
   * Register a single file into a batch.
   * - Persists file to disk
   * - Creates document record linked to batch
   * - Performs deduplication check
   * - Creates initial processing job
   * - Writes audit log entry
   *
   * Does NOT start processing — call startBatch() to trigger the pipeline.
   */
  async addFileToBatch(
    batchId: string,
    userId: string,
    environment: string,
    file: BatchFileInput,
    ipAddress?: string
  ): Promise<BatchFileResult> {
    const sanitizedName = sanitizeFilename(file.originalName);
    const fileHash = computeFileHash(file.buffer);

    // ── Deduplication check ──
    const existing = await findDuplicateByHash(userId, fileHash);
    const isDuplicate = existing !== null;

    // Always save the file (preserves evidence trail even for duplicates)
    const storagePath = await saveFileToDisk(sanitizedName, file.buffer);
    const storageKey = path.relative(process.cwd(), storagePath);
    const fileUrl = `/uploads/${sanitizedName}`;

    // ── Create document record ──
    const docCategory = 'other'; // AI will classify later
    const [doc] = await db
      .insert(documents)
      .values({
        userId,
        title: file.originalName,
        category: docCategory,
        environment,
        fileName: sanitizedName,
        fileType: file.mimeType,
        fileSize: file.size,
        fileUrl,
        // Batch extension fields
        batchId,
        originalFilename: file.originalName,
        sanitizedFilename: sanitizedName,
        fileHash,
        mimeType: file.mimeType,
        storageKey,
        processingStatus: isDuplicate ? 'duplicate_skipped' : 'uploaded',
        reviewStatus: 'unreviewed',
        isDuplicate,
        duplicateOfDocumentId: existing?.id,
        aiAnalysisStatus: isDuplicate ? 'skipped' : 'pending',
      } as any)
      .returning();

    // ── Create processing job (even for duplicates, marked skipped) ──
    await db.insert(documentProcessingJobs).values({
      documentId: doc.id,
      batchId,
      jobType: 'full_pipeline',
      status: isDuplicate ? 'skipped' : 'queued',
      attemptCount: 0,
      maxAttempts: 3,
    } as any);

    // ── Increment batch file count ──
    await db
      .update(uploadBatches)
      .set({
        totalFiles: sqll`${uploadBatches.totalFiles} + 1`,
        status: 'uploading',
        startedAt: sqll`COALESCE(${uploadBatches.startedAt}, NOW())`,
        updatedAt: new Date(),
      })
      .where(eq(uploadBatches.id, batchId));

    // ── Audit log ──
    await writeAuditLog(
      doc.id,
      isDuplicate ? 'duplicate_flagged' : 'uploaded',
      'user',
      userId,
      batchId,
      undefined,
      { fileName: file.originalName, fileHash, fileSize: file.size, isDuplicate },
      isDuplicate ? `Duplicate of document ${existing?.id}` : undefined,
      ipAddress
    );

    if (isDuplicate) {
      console.log(`[BatchIngestion] Duplicate detected: ${file.originalName} matches ${existing?.id}`);
    }

    return {
      documentId: doc.id,
      fileName: file.originalName,
      processingStatus: isDuplicate ? 'duplicate_skipped' : 'uploaded',
      isDuplicate,
      duplicateOfDocumentId: existing?.id,
    };
  }

  /**
   * Trigger the AI processing pipeline for all queued documents in a batch.
   * Uses controlled concurrency — at most CONCURRENCY_LIMIT parallel jobs.
   * Each document is processed independently; one failure does not stop others.
   */
  async startBatchProcessing(batchId: string, userId: string): Promise<void> {
    // Get all queued documents for this batch (skip duplicates)
    const queuedDocs = await db
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.batchId!, batchId),
          eq(documents.userId, userId),
          eq(documents.processingStatus!, 'uploaded')
        )
      );

    if (queuedDocs.length === 0) {
      console.log(`[BatchIngestion] No queued docs in batch ${batchId}`);
      return;
    }

    // Update batch status to processing
    await db
      .update(uploadBatches)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(eq(uploadBatches.id, batchId));

    console.log(`[BatchIngestion] Starting ${queuedDocs.length} docs for batch ${batchId}`);

    // Process with controlled concurrency
    const docIds = queuedDocs.map((d) => d.id);
    await this.processWithConcurrency(docIds, batchId, userId);
  }

  private async processWithConcurrency(
    docIds: string[],
    batchId: string,
    userId: string
  ): Promise<void> {
    const chunks: string[][] = [];
    for (let i = 0; i < docIds.length; i += CONCURRENCY_LIMIT) {
      chunks.push(docIds.slice(i, i + CONCURRENCY_LIMIT));
    }

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map((docId) => this.processSingleDocument(docId, batchId, userId))
      );
      // Refresh counters after each chunk
      await refreshBatchCounters(batchId);
    }

    // Final counter refresh
    await refreshBatchCounters(batchId);
  }

  private async processSingleDocument(
    documentId: string,
    batchId: string,
    userId: string
  ): Promise<void> {
    // Mark as processing
    await db
      .update(documents)
      .set({ processingStatus: 'processing', aiAnalysisStatus: 'analyzing' } as any)
      .where(eq(documents.id, documentId));

    // Update job record
    await db
      .update(documentProcessingJobs)
      .set({
        status: 'running',
        startedAt: new Date(),
        attemptCount: sqll`${documentProcessingJobs.attemptCount} + 1`,
        updatedAt: new Date(),
      } as any)
      .where(
        and(
          eq(documentProcessingJobs.documentId, documentId),
          eq(documentProcessingJobs.batchId!, batchId)
        )
      );

    await writeAuditLog(documentId, 'processing_started', 'system', 'system', batchId);

    try {
      // Delegate to the existing AI orchestrator — no changes needed there
      await analysisOrchestrator.processDocument(documentId);

      // Mark as completed
      await db
        .update(documents)
        .set({
          processingStatus: 'completed',
          reviewStatus: 'ai_processed',
          processedAt: new Date(),
          updatedAt: new Date(),
        } as any)
        .where(eq(documents.id, documentId));

      await db
        .update(documentProcessingJobs)
        .set({
          status: 'completed',
          completedAt: new Date(),
          updatedAt: new Date(),
        } as any)
        .where(
          and(
            eq(documentProcessingJobs.documentId, documentId),
            eq(documentProcessingJobs.batchId!, batchId)
          )
        );

      await writeAuditLog(documentId, 'processing_completed', 'system', 'system', batchId);
      console.log(`[BatchIngestion] ✓ Processed ${documentId}`);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[BatchIngestion] ✗ Failed ${documentId}:`, errMsg);

      // Get current attempt count
      const [job] = await db
        .select({ attemptCount: documentProcessingJobs.attemptCount, maxAttempts: documentProcessingJobs.maxAttempts })
        .from(documentProcessingJobs)
        .where(
          and(
            eq(documentProcessingJobs.documentId, documentId),
            eq(documentProcessingJobs.batchId!, batchId)
          )
        )
        .limit(1);

      const canRetry = job && job.attemptCount < job.maxAttempts;

      await db
        .update(documents)
        .set({
          processingStatus: canRetry ? 'uploaded' : 'failed', // back to uploaded means retryable
          errorCode: errMsg.slice(0, 100),
          updatedAt: new Date(),
        } as any)
        .where(eq(documents.id, documentId));

      await db
        .update(documentProcessingJobs)
        .set({
          status: canRetry ? 'queued' : 'failed',
          errorMessage: errMsg,
          completedAt: new Date(),
          updatedAt: new Date(),
        } as any)
        .where(
          and(
            eq(documentProcessingJobs.documentId, documentId),
            eq(documentProcessingJobs.batchId!, batchId)
          )
        );

      await writeAuditLog(
        documentId,
        'processing_failed',
        'system',
        'system',
        batchId,
        undefined,
        { error: errMsg, canRetry }
      );
    }
  }

  /**
   * Retry a single failed document within a batch.
   * Idempotent — safe to call multiple times.
   */
  async retryDocument(documentId: string, userId: string): Promise<void> {
    const [doc] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.userId, userId)))
      .limit(1);

    if (!doc) throw new Error('Document not found');

    await db
      .update(documents)
      .set({ processingStatus: 'uploaded', errorCode: null, updatedAt: new Date() } as any)
      .where(eq(documents.id, documentId));

    await db
      .update(documentProcessingJobs)
      .set({ status: 'queued', updatedAt: new Date() } as any)
      .where(eq(documentProcessingJobs.documentId, documentId));

    await writeAuditLog(documentId, 'retry_queued', 'user', userId, doc.batchId ?? undefined);

    // Trigger processing asynchronously
    setImmediate(async () => {
      await this.processSingleDocument(documentId, doc.batchId ?? '', userId);
      if (doc.batchId) await refreshBatchCounters(doc.batchId);
    });
  }

  /**
   * Get batch with all document statuses.
   */
  async getBatchStatus(batchId: string, userId: string): Promise<BatchStatus_Detail | null> {
    const [batch] = await db
      .select()
      .from(uploadBatches)
      .where(and(eq(uploadBatches.id, batchId), eq(uploadBatches.userId, userId)))
      .limit(1);

    if (!batch) return null;

    const docs = await db
      .select({
        id: documents.id,
        fileName: documents.fileName,
        mimeType: documents.mimeType,
        fileSize: documents.fileSize,
        processingStatus: documents.processingStatus,
        reviewStatus: documents.reviewStatus,
        isDuplicate: documents.isDuplicate,
        aiConfidence: documents.aiConfidence,
        aiCategory: documents.aiCategory,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .where(eq(documents.batchId!, batchId));

    const summary = {
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      needsReview: 0,
      duplicates: 0,
    };

    for (const d of docs) {
      const s = d.processingStatus as string | null;
      if (s === 'queued' || s === 'uploaded') summary.queued++;
      else if (s === 'processing' || s === 'ocr_in_progress' || s === 'extracting' || s === 'classifying') summary.processing++;
      else if (s === 'completed' || s === 'duplicate_skipped') summary.completed++;
      else if (s === 'failed') summary.failed++;
      else if (s === 'needs_review') summary.needsReview++;
      if (d.isDuplicate) summary.duplicates++;
    }

    return { batch, documents: docs, summary };
  }

  /**
   * List all batches for a user (paginated).
   */
  async listBatches(
    userId: string,
    limit = 20,
    offset = 0
  ): Promise<UploadBatch[]> {
    return db
      .select()
      .from(uploadBatches)
      .where(eq(uploadBatches.userId, userId))
      .orderBy(sqll`${uploadBatches.createdAt} DESC`)
      .limit(limit)
      .offset(offset);
  }

  /**
   * Bulk assign a case to all documents in a batch.
   */
  async bulkAssignCase(batchId: string, caseId: string, userId: string): Promise<void> {
    await db
      .update(documents)
      .set({ caseId, updatedAt: new Date() } as any)
      .where(and(eq(documents.batchId!, batchId), eq(documents.userId, userId)));

    await db
      .update(uploadBatches)
      .set({ caseId, updatedAt: new Date() })
      .where(and(eq(uploadBatches.id, batchId), eq(uploadBatches.userId, userId)));

    // Log per-doc (simplified: log once at batch level via batchId notes)
    console.log(`[BatchIngestion] Batch ${batchId} assigned to case ${caseId}`);
  }

  /**
   * Approve all AI-processed documents in a batch (bulk approval).
   */
  async bulkApprove(batchId: string, userId: string, actorId: string): Promise<number> {
    const toApprove = await db
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.batchId!, batchId),
          eq(documents.userId, userId),
          // @ts-ignore - reviewStatus is runtime field added via migration
          eq((documents as any).reviewStatus, 'ai_processed')
        )
      );

    if (toApprove.length === 0) return 0;

    const ids = toApprove.map((d: { id: string }) => d.id);
    await db
      .update(documents)
      .set({ reviewStatus: 'approved', updatedAt: new Date() } as any)
      .where(inArray(documents.id, ids));

    // Audit each doc
    await Promise.all(
      ids.map((docId: string) =>
        writeAuditLog(docId, 'approved', 'user', actorId, batchId, { reviewStatus: 'ai_processed' }, { reviewStatus: 'approved' })
      )
    );

    return ids.length;
  }

  /**
   * Get the audit trail for a document.
   */
  async getDocumentAuditLog(documentId: string, userId: string): Promise<typeof documentAuditLog.$inferSelect[]> {
    // Verify ownership first
    const [doc] = await db
      .select({ userId: documents.userId })
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    if (!doc || doc.userId !== userId) return [];

    return db
      .select()
      .from(documentAuditLog)
      .where(eq(documentAuditLog.documentId, documentId))
      .orderBy(sqll`${documentAuditLog.createdAt} ASC`);
  }
}

export const batchIngestionService = new BatchIngestionService();
