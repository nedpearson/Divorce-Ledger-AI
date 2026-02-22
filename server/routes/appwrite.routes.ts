import { Router, Request, Response } from 'express';
import multer from 'multer';
import { storage } from '../storage';

interface MulterRequest extends Request {
  file?: Express.Multer.File;
  session?: any;
}
import { 
  isAppwriteConfigured, 
  initializeAppwrite,
  COLLECTIONS,
  FILE_STATUS 
} from '../services/appwrite/client';

// Controlled category-to-type mapping for financial posting
// ONLY exact matches - no heuristics to avoid misclassification
const INCOME_CATEGORY_MAP: Record<string, boolean> = {
  // Paystubs and salary
  'paystub': true,
  'pay_stub': true,
  'financial/paystub': true,
  
  // Direct income types
  'salary': true,
  'wages': true,
  'bonus': true,
  'commission': true,
  
  // Investment income
  'dividend': true,
  'interest_income': true,
  'capital_gains': true,
  
  // Other income
  'rental_income': true,
  'royalty': true,
  'pension': true,
  'social_security': true,
  
  // Family law specific
  'child_support_received': true,
  'alimony_received': true,
  'spousal_support_received': true,
  
  // Refunds (credit back)
  'refund': true,
  'reimbursement_received': true,
  'deposit': true,
};

// Strict matching - no substring matching to avoid misclassification
function isIncomeCategory(category: string): boolean {
  const normalized = category.toLowerCase().trim().replace(/[\s-]/g, '_');
  return INCOME_CATEGORY_MAP[normalized] === true;
}

interface ExtractedFinancialData {
  total_amount?: { value: number; currency: string } | null;
  vendor_name?: string | null;
  payee?: string | null;
  payer?: string | null;
  document_date?: string | null;
  transaction_date?: string | null;
  summary?: string | null;
}
import { setupAppwrite, checkAppwriteHealth } from '../services/appwrite/setup';
import {
  uploadFile,
  getFile,
  listFiles,
  updateFile,
  deleteFile,
  getFileUrl,
} from '../services/appwrite/fileService';
import {
  analyzeFile,
  getAnalysisRunsForFile,
  processQueue,
  startQueueProcessor,
  reanalyzeFile,
} from '../services/appwrite/analysisService';
import {
  getGuardrailStats,
  checkFileGuardrails,
  DEFAULT_LIMITS,
} from '../services/appwrite/processingGuardrails';
import { runSelftest, formatSelftestReport } from '../services/appwrite/selftest';
import {
  databases,
  DATABASE_ID,
  Query,
  ID,
  Permission,
  Role
} from '../services/appwrite/client';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function getAuthenticatedUserId(req: MulterRequest): string | null {
  return req.session?.userId || null;
}

function getUserIdOrThrow(req: MulterRequest): { userId: string; error?: string } {
  const sessionUserId = getAuthenticatedUserId(req);
  if (sessionUserId) {
    return { userId: sessionUserId };
  }
  
  if (process.env.NODE_ENV === 'development') {
    const headerUserId = req.headers['x-user-id'] as string;
    if (headerUserId) {
      return { userId: headerUserId };
    }
    return { userId: 'demo-user' };
  }
  
  return { userId: '', error: 'Authentication required' };
}

async function authorizeFileAccess(req: MulterRequest, fileId: string): Promise<{ authorized: boolean; file: any; userId: string; error?: string }> {
  const { userId, error } = getUserIdOrThrow(req);
  
  if (error) {
    return { authorized: false, file: null, userId: '', error };
  }
  
  const file = await getFile(fileId);
  
  if (!file) {
    return { authorized: false, file: null, userId, error: 'File not found' };
  }
  
  if (file.userId !== userId) {
    return { authorized: false, file: null, userId, error: 'Access denied' };
  }
  
  return { authorized: true, file, userId };
}

router.get('/status', async (req: Request, res: Response) => {
  const configured = isAppwriteConfigured();
  if (!configured) {
    return res.json({ 
      configured: false, 
      message: 'Appwrite not configured. Please set APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, and APPWRITE_API_KEY' 
    });
  }

  const health = await checkAppwriteHealth();
  res.json({ 
    configured: true, 
    ...health 
  });
});

router.post('/setup', async (req: Request, res: Response) => {
  try {
    const result = await setupAppwrite();
    if (result) {
      startQueueProcessor(15000);
      res.json({ success: true, message: 'Appwrite setup completed successfully' });
    } else {
      res.status(500).json({ success: false, message: 'Appwrite setup failed' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/files/upload', upload.single('file'), async (req: MulterRequest, res: Response) => {
  try {
    const { userId, error: authError } = getUserIdOrThrow(req);
    if (authError) {
      return res.status(401).json({ error: authError });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { title, description, isConfidential, category } = req.body;

    const file = await uploadFile(
      userId,
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      {
        title: title || req.file.originalname,
        description,
        isConfidential: isConfidential === 'true',
        category,
      }
    );

    // AUTO-ANALYSIS: Immediately trigger analysis after upload
    // This ensures documents are always analyzed, not waiting for queue processor
    setImmediate(async () => {
      try {
        console.log(`[Appwrite Routes] Auto-triggering analysis for newly uploaded file ${file.$id}`);
        const result = await analyzeFile(file.$id);
        if (result.success) {
          console.log(`[Appwrite Routes] Auto-analysis completed for ${file.$id}`);
        } else {
          console.log(`[Appwrite Routes] Auto-analysis failed for ${file.$id}: ${result.error}`);
        }
      } catch (err) {
        console.error(`[Appwrite Routes] Auto-analysis error for ${file.$id}:`, err);
      }
    });

    res.json({ 
      success: true, 
      file: {
        id: file.$id,
        ownerId: file.userId,
        storageFileId: file.storageFileId,
        fileName: file.fileName,
        mimeType: file.fileType,
        size: file.fileSize,
        hash: file.fileHash,
        status: file.status,
        createdAt: file.$createdAt,
      }
    });
  } catch (error) {
    console.error('[Appwrite Routes] Upload error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/files', async (req: MulterRequest, res: Response) => {
  // Return empty results gracefully when Appwrite is not configured
  if (!isAppwriteConfigured()) {
    return res.json({ files: [], total: 0 });
  }
  try {
    const { userId, error: authError } = getUserIdOrThrow(req);
    if (authError) {
      return res.status(401).json({ error: authError });
    }

    const { status, category, limit, offset } = req.query;

    const result = await listFiles(userId, {
      status: status as any,
      category: category as string,
      limit: limit ? parseInt(limit as string) : 25,
      offset: offset ? parseInt(offset as string) : 0,
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/files/:id', async (req: MulterRequest, res: Response) => {
  try {
    const { authorized, file, userId, error } = await authorizeFileAccess(req, req.params.id);
    if (!authorized) {
      const statusCode = error === 'Authentication required' ? 401 : (error === 'File not found' ? 404 : 403);
      return res.status(statusCode).json({ error });
    }

    const analysisRuns = await getAnalysisRunsForFile(file.$id);

    res.json({ file, analysisRuns });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/files/:id/analyze', async (req: MulterRequest, res: Response) => {
  try {
    const { authorized, file, userId, error } = await authorizeFileAccess(req, req.params.id);
    if (!authorized) {
      const statusCode = error === 'Authentication required' ? 401 : (error === 'File not found' ? 404 : 403);
      return res.status(statusCode).json({ error });
    }

    if (file.status === FILE_STATUS.FINALIZED) {
      return res.status(400).json({ 
        error: 'File already finalized. Use retry endpoint to reanalyze.' 
      });
    }

    if (file.status === FILE_STATUS.ANALYZING || file.status === FILE_STATUS.EXTRACTING) {
      return res.status(409).json({ 
        error: 'Analysis already in progress',
        status: file.status
      });
    }

    const forceNew = req.body?.forceNew === true;
    
    const result = await analyzeFile(req.params.id, { forceNew });
    
    if (result.success) {
      const updatedFile = await getFile(req.params.id);
      const runs = await getAnalysisRunsForFile(req.params.id);
      const latestRun = runs[0];
      
      let normalizedOutput = null;
      if (latestRun?.normalizedOutput) {
        try {
          normalizedOutput = JSON.parse(latestRun.normalizedOutput);
        } catch {
          normalizedOutput = null;
        }
      }
      
      const needsReview = normalizedOutput?.needs_user_review ?? 
        (updatedFile?.status === FILE_STATUS.SUGGESTED) ?? true;
      
      const verification = normalizedOutput?.verification ?? {};
      const fieldsMissingEvidence = normalizedOutput?.fields_missing_evidence ?? [];
      
      res.json({ 
        success: true, 
        analysis_run_id: result.analysisRunId,
        needs_user_review: needsReview,
        confidence: latestRun?.confidence ?? normalizedOutput?.confidence ?? 0,
        suggested_category: updatedFile?.suggestedCategory ?? normalizedOutput?.suggested_category ?? 'Uncategorized',
        extracted: {
          document_date: normalizedOutput?.extracted?.document_date ?? null,
          transaction_date: normalizedOutput?.extracted?.transaction_date ?? null,
          statement_period_start: normalizedOutput?.extracted?.statement_period_start ?? null,
          statement_period_end: normalizedOutput?.extracted?.statement_period_end ?? null,
          total_amount: normalizedOutput?.extracted?.total_amount ?? null,
          subtotal: normalizedOutput?.extracted?.subtotal ?? null,
          tax_amount: normalizedOutput?.extracted?.tax_amount ?? null,
          vendor_name: normalizedOutput?.extracted?.vendor_name ?? null,
        },
        verification: {
          verified_fields: Object.entries(verification).reduce((acc, [field, v]: [string, any]) => {
            acc[field] = {
              ok: v?.ok ?? false,
              reason: v?.reason ?? '',
              evidence: v?.evidence ?? null,
            };
            return acc;
          }, {} as Record<string, { ok: boolean; reason: string; evidence: any }>),
          fields_missing_evidence: fieldsMissingEvidence,
        },
        validation: {
          ok: !needsReview && (normalizedOutput?.warnings?.length ?? 0) === 0 && fieldsMissingEvidence.length === 0,
          warnings: normalizedOutput?.warnings ?? [],
          failed_checks: fieldsMissingEvidence.map((f: string) => `Missing evidence: ${f}`),
        }
      });
    } else {
      res.status(400).json({ 
        success: false, 
        error: result.error 
      });
    }
  } catch (error) {
    console.error('[Appwrite Routes] Analyze error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/files/:id/approve', async (req: MulterRequest, res: Response) => {
  try {
    const { authorized, file, userId, error } = await authorizeFileAccess(req, req.params.id);
    if (!authorized) {
      const statusCode = error === 'Authentication required' ? 401 : (error === 'File not found' ? 404 : 403);
      return res.status(statusCode).json({ error });
    }
    
    const { category, fields, reason } = req.body;
    
    const suggestedCategory = file.suggestedCategory || '';
    const suggestedFields = file.extractedFields ? JSON.parse(file.extractedFields) : {};
    const finalizedFields = fields || suggestedFields;
    
    const categoryChanged = category !== suggestedCategory;
    const fieldChanges: Array<{ field: string; original: any; new: any }> = [];
    
    if (fields) {
      for (const key of Object.keys(fields)) {
        if (JSON.stringify(suggestedFields[key]) !== JSON.stringify(fields[key])) {
          fieldChanges.push({
            field: key,
            original: suggestedFields[key] ?? null,
            new: fields[key],
          });
        }
      }
      for (const key of Object.keys(suggestedFields)) {
        if (!(key in fields)) {
          fieldChanges.push({
            field: key,
            original: suggestedFields[key],
            new: null,
          });
        }
      }
    }
    
    initializeAppwrite();
    
    if (categoryChanged) {
      await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.USER_OVERRIDES,
        ID.unique(),
        {
          userId,
          fileId: file.$id,
          analysisRunId: file.latestAnalysisRunId || '',
          overrideType: 'category_change',
          originalValue: suggestedCategory,
          newValue: category,
          reason: reason || null,
        },
        [Permission.read(Role.user(userId))]
      );
    }
    
    if (fieldChanges.length > 0) {
      await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.USER_OVERRIDES,
        ID.unique(),
        {
          userId,
          fileId: file.$id,
          analysisRunId: file.latestAnalysisRunId || '',
          overrideType: 'field_changes',
          originalValue: JSON.stringify(suggestedFields),
          newValue: JSON.stringify(finalizedFields),
          reason: reason || null,
        },
        [Permission.read(Role.user(userId))]
      );
    }

    const updatedFile = await updateFile(req.params.id, {
      status: FILE_STATUS.FINALIZED,
      category,
      finalizedCategory: category,
      finalizedFields: JSON.stringify(finalizedFields),
      finalizedBy: userId,
      finalizedAt: new Date().toISOString(),
      finalizedFromAnalysisRunId: file.latestAnalysisRunId || '',
    });

    // Create financial entry in Postgres (approval-first guarantee)
    let financialEntryId: string | null = null;
    let financialEntryType: 'expense' | 'income' | null = null;
    let financialEntrySkipped: string | null = null;
    
    try {
      // Get user to determine environment
      const user = await storage.getUser(userId);
      const environment = user?.environment || 'demo';
      
      // Extract financial data from finalized fields
      const extractedData = finalizedFields as ExtractedFinancialData;
      
      // Validate amount - must be a positive number
      const rawAmount = extractedData.total_amount?.value;
      if (typeof rawAmount !== 'number' || !isFinite(rawAmount)) {
        financialEntrySkipped = 'invalid_amount_type';
        console.log(`[Appwrite Finalize] Skipping financial entry for ${req.params.id}: amount is not a valid number`);
      } else if (rawAmount <= 0) {
        financialEntrySkipped = 'zero_or_negative_amount';
        console.log(`[Appwrite Finalize] Skipping financial entry for ${req.params.id}: amount is zero or negative (${rawAmount})`);
      } else {
        // Convert amount from dollars to cents (integer storage)
        const amountInCents = Math.round(rawAmount * 100);
        
        // Idempotency check: verify no existing entry for this document
        const existingExpenses = await storage.getExpenses(userId, environment);
        const existingIncomes = await storage.getIncomes(userId, environment);
        
        const hasExistingExpense = existingExpenses.some(e => e.documentId === req.params.id);
        const hasExistingIncome = existingIncomes.some(i => i.documentId === req.params.id);
        
        if (hasExistingExpense || hasExistingIncome) {
          financialEntrySkipped = 'already_exists';
          console.log(`[Appwrite Finalize] Skipping financial entry for ${req.params.id}: entry already exists`);
        } else {
          // Determine expense vs income based on category
          const dateStr = extractedData.transaction_date || extractedData.document_date || new Date().toISOString().split('T')[0];
          const description = extractedData.summary || file.aiSummary || file.title || file.fileName || 'Document';
          const vendor = extractedData.vendor_name || extractedData.payee || extractedData.payer || null;
          
          if (isIncomeCategory(category)) {
            // Create income entry
            const income = await storage.createIncome({
              userId,
              source: category,
              amount: amountInCents,
              frequency: 'one-time',
              verified: true, // Approved by user
              owner: 'self',
              vendor: vendor || undefined,
              documentId: req.params.id, // Link to Appwrite document
              startDate: dateStr,
              environment,
            });
            financialEntryId = income.id;
            financialEntryType = 'income';
            console.log(`[Appwrite Finalize] Created income entry ${income.id} for document ${req.params.id}`);
          } else {
            // Create expense entry (default for non-income categories)
            const expense = await storage.createExpense({
              userId,
              category,
              description,
              amount: amountInCents,
              frequency: 'one-time',
              owner: 'self',
              vendor: vendor || undefined,
              documentId: req.params.id, // Link to Appwrite document
              startDate: dateStr,
              environment,
            });
            financialEntryId = expense.id;
            financialEntryType = 'expense';
            console.log(`[Appwrite Finalize] Created expense entry ${expense.id} for document ${req.params.id}`);
          }
        }
      }
    } catch (financialError) {
      // Log error but don't fail the finalization
      // The Appwrite file is already finalized, financial entry is secondary
      console.error(`[Appwrite Finalize] Failed to create financial entry for ${req.params.id}:`, financialError);
    }

    res.json({ 
      success: true, 
      file: {
        id: updatedFile.$id,
        status: updatedFile.status,
        category: updatedFile.category,
        finalizedCategory: updatedFile.finalizedCategory,
        finalizedFields: finalizedFields,
      },
      overrides: {
        categoryChanged,
        fieldChanges: fieldChanges.length,
      },
      financialEntry: financialEntryId ? {
        id: financialEntryId,
        type: financialEntryType,
      } : {
        skipped: true,
        reason: financialEntrySkipped || 'no_amount',
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/files/:id/retry', async (req: MulterRequest, res: Response) => {
  try {
    const { authorized, file, userId, error } = await authorizeFileAccess(req, req.params.id);
    if (!authorized) {
      const statusCode = error === 'Authentication required' ? 401 : (error === 'File not found' ? 404 : 403);
      return res.status(statusCode).json({ error });
    }

    if (file.status !== FILE_STATUS.ERROR) {
      return res.status(400).json({ error: 'File is not in error state' });
    }

    const result = await reanalyzeFile(req.params.id, userId);
    
    if (result.success) {
      res.json({ 
        success: true, 
        message: 'File reanalysis started',
        analysisRunId: result.analysisRunId 
      });
    } else {
      res.status(400).json({ 
        success: false, 
        error: result.error 
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/guardrails/stats', async (req: MulterRequest, res: Response) => {
  try {
    const { userId, error } = getUserIdOrThrow(req);
    if (error) {
      return res.status(401).json({ error });
    }

    const stats = await getGuardrailStats(userId);
    res.json({ stats });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/guardrails/limits', async (req: Request, res: Response) => {
  res.json({ limits: DEFAULT_LIMITS });
});

router.delete('/files/:id', async (req: MulterRequest, res: Response) => {
  try {
    const { authorized, file, userId, error } = await authorizeFileAccess(req, req.params.id);
    if (!authorized) {
      const statusCode = error === 'Authentication required' ? 401 : (error === 'File not found' ? 404 : 403);
      return res.status(statusCode).json({ error });
    }
    
    console.log(`[Appwrite Routes] Deleting file ${req.params.id} for user ${userId}`);
    
    // Appwrite is the backbone - delete both storage AND database record
    const deleteResult = await deleteFile(req.params.id);
    
    if (!deleteResult.success) {
      console.error(`[Appwrite Routes] Failed to delete file ${req.params.id}: ${deleteResult.error}`);
      return res.status(500).json({ 
        success: false, 
        error: deleteResult.error || 'Failed to delete file from Appwrite' 
      });
    }
    
    console.log(`[Appwrite Routes] File ${req.params.id} fully deleted from Appwrite (storage + database)`);
    res.json({ success: true, deleted: true, fileId: req.params.id });
  } catch (error) {
    console.error(`[Appwrite Routes] Delete error for ${req.params.id}:`, error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/analysis/:fileId', async (req: MulterRequest, res: Response) => {
  try {
    const { authorized, file, userId, error } = await authorizeFileAccess(req, req.params.fileId);
    if (!authorized) {
      const statusCode = error === 'Authentication required' ? 401 : (error === 'File not found' ? 404 : 403);
      return res.status(statusCode).json({ error });
    }
    
    const runs = await getAnalysisRunsForFile(req.params.fileId);
    res.json({ runs });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/categories', async (req: Request, res: Response) => {
  // In environments without Appwrite configured, return an empty category list
  if (!isAppwriteConfigured()) {
    return res.json({ categories: [] });
  }

  try {
    const initialized = initializeAppwrite();
    if (!initialized) {
      return res.status(503).json({ error: 'Appwrite is not configured or failed to initialize' });
    }

    const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.CATEGORIES, [
      Query.equal('isActive', true),
      Query.orderAsc('sortOrder'),
    ]);
    res.json({ categories: result.documents });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/queue/process', async (req: Request, res: Response) => {
  const adminSecret = req.headers['x-admin-secret'];
  if (process.env.NODE_ENV === 'production' && adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Admin authentication required' });
  }
  
  try {
    const result = await processQueue();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/backfill', async (req: MulterRequest, res: Response) => {
  try {
    const { userId, error: authError } = getUserIdOrThrow(req);
    if (authError) {
      return res.status(401).json({ error: authError });
    }
    
    const { backfillUncategorizedDocuments } = await import('../services/appwrite/analysisService');
    const result = await backfillUncategorizedDocuments(userId);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Appwrite Routes] Backfill error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/backfill/count', async (req: MulterRequest, res: Response) => {
  try {
    const { userId, error: authError } = getUserIdOrThrow(req);
    if (authError) {
      return res.status(401).json({ error: authError });
    }
    
    const { getUncategorizedCount } = await import('../services/appwrite/analysisService');
    const count = await getUncategorizedCount(userId);
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/dev/selftest', async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    const adminSecret = req.headers['x-admin-secret'];
    if (adminSecret !== process.env.ADMIN_SECRET) {
      return res.status(401).json({ error: 'Admin authentication required in production' });
    }
  }
  
  try {
    const format = req.query.format as string;
    const report = await runSelftest();
    
    if (format === 'text') {
      res.type('text/plain').send(formatSelftestReport(report));
    } else {
      res.json(report);
    }
  } catch (error) {
    res.status(500).json({ 
      error: (error as Error).message,
      stack: process.env.NODE_ENV === 'development' ? (error as Error).stack : undefined
    });
  }
});

export default router;
