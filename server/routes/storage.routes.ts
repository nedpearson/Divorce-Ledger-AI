import { Router, Request, Response } from 'express';
import multer from 'multer';
import { fileUploadService } from '../services/storage/fileUploadService';
import { documentRepository } from '../services/storage/documentRepository';
import { fileAccessService } from '../services/storage/fileAccessService';
import { fileStorageService } from '../services/storage/fileStorageService';
import { analysisOrchestrator } from '../services/ai/AnalysisOrchestrator';

interface MulterRequest extends Request {
  file?: Express.Multer.File;
  session?: any;
}

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Helper to reliably extract the userId out of session or headers based on env
function getUserIdOrThrow(req: MulterRequest): { userId: string; error?: string } {
  const sessionUserId = req.session?.userId;
  if (sessionUserId) return { userId: sessionUserId };

  if (process.env.NODE_ENV === 'development' || process.env.APP_MODE === 'demo') {
    const headerUserId = req.headers['x-user-id'] as string;
    if (headerUserId) return { userId: headerUserId };
    return { userId: 'a538fa83-3e26-4421-ac27-4c9271ad5848' }; // Default demo fallback
  }

  return { userId: '', error: 'Authentication required' };
}

// 1. System Health & Setup (Mocks to keep frontend happy)
router.get('/status', (req: Request, res: Response) => {
  res.json({ configured: true, status: 'ok', usingNativeStorage: true });
});

router.post('/setup', (req: Request, res: Response) => {
  res.json({ success: true, message: 'Storage setup completed successfully natively' });
});

// 2. File Upload
router.post('/files/upload', upload.single('file'), async (req: MulterRequest, res: Response) => {
  try {
    const { userId, error: authError } = getUserIdOrThrow(req);
    if (authError) return res.status(401).json({ error: authError });
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const { title, description, isConfidential, category } = req.body;

    // Route to new canonical fileUploadService 
    const savedDoc = await fileUploadService.handleUpload({
      userId,
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      title: title || req.file.originalname,
      description,
      category,
      isConfidential: isConfidential === 'true'
    });

    // Phase 5: Asynchronous AI Pipeline directly handles Azure + OpenAI structural reasoning
    setImmediate(async () => {
      try {
        await analysisOrchestrator.processDocument(savedDoc.id);
      } catch (e) {
        console.error('Core AI Orchestration failed immediately', e);
      }
    });

    res.json({
      success: true,
      file: savedDoc
    });
  } catch (error) {
    console.error('[Storage Routes] Upload error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 3. List Files (Dashboard Retrieval)
router.get('/files', async (req: MulterRequest, res: Response) => {
  try {
    const { userId, error: authError } = getUserIdOrThrow(req);
    if (authError) return res.status(401).json({ error: authError });

    // Fetch from Postgres using new repo 
    const files = await documentRepository.listDocuments(userId);
    res.json({ files, total: files.length });
  } catch (error) {
    console.error('[Storage Routes] List error:', error);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

// 4. File Retrieval (Preview & Download & Raw stream fallback)
router.get('/files/:id/view', async (req: MulterRequest, res: Response) => {
  try {
    const { userId, error: authError } = getUserIdOrThrow(req);
    if (authError) return res.status(401).json({ error: authError });

    const fileBuffer = await fileAccessService.securelyServeFile(userId, req.params.id);
    
    res.setHeader('Content-Type', fileBuffer.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${fileBuffer.fileName}"`);
    res.send(fileBuffer.buffer);
  } catch (error) {
    console.error('[Storage Routes] View error:', error);
    res.status(404).json({ error: 'File securely blocked or not found' });
  }
});

router.get('/files/:id/preview', async (req: MulterRequest, res: Response) => {
  try {
    const { userId, error: authError } = getUserIdOrThrow(req);
    if (authError) return res.status(401).json({ error: authError });

    const fileBuffer = await fileAccessService.securelyServeFile(userId, req.params.id);
    res.setHeader('Content-Type', fileBuffer.mimeType);
    res.send(fileBuffer.buffer);
  } catch (error) {
    console.error('[Storage Routes] Preview error:', error);
    res.status(404).json({ error: 'File securely blocked or not found' });
  }
});

router.get('/files/:id/download', async (req: MulterRequest, res: Response) => {
  try {
    const { userId, error: authError } = getUserIdOrThrow(req);
    if (authError) return res.status(401).json({ error: authError });

    const fileBuffer = await fileAccessService.securelyServeFile(userId, req.params.id);
    res.setHeader('Content-Type', fileBuffer.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileBuffer.fileName}"`);
    res.send(fileBuffer.buffer);
  } catch (error) {
    res.status(404).json({ error: 'File securely blocked or not found' });
  }
});

// 5. Document Actions (Approve, Analyze, Retry, Delete)
router.post('/files/:id/approve', async (req: MulterRequest, res: Response) => {
  try {
    const { userId, error: authError } = getUserIdOrThrow(req);
    if (authError) return res.status(401).json({ error: authError });

    // Ensure access
    const canAccess = await fileAccessService.canAccessDocument(userId, req.params.id);
    if (!canAccess) return res.status(403).json({ error: 'Unauthorized' });

    await documentRepository.updateDocument(req.params.id, {
      status: 'finalized',
      finalizedCategory: req.body.category
    });

    res.json({ success: true, message: 'Document finalized internally' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to approve document' });
  }
});

router.post('/files/:id/analyze', async (req: MulterRequest, res: Response) => {
  try {
    const { userId, error: authError } = getUserIdOrThrow(req);
    if (authError) return res.status(401).json({ error: authError });

    const canAccess = await fileAccessService.canAccessDocument(userId, req.params.id);
    if (!canAccess) return res.status(403).json({ error: 'Unauthorized' });

    // Explicit Azure Orchestrator triggering for Retry/Analyze 
    setImmediate(() => analysisOrchestrator.processDocument(req.params.id));

    res.json({ success: true, message: 'Reanalysis requested' });
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
});

router.post('/files/:id/retry', async (req: MulterRequest, res: Response) => {
  try {
    await documentRepository.updateDocument(req.params.id, { status: 'queued' });
    setImmediate(() => analysisOrchestrator.processDocument(req.params.id));
    res.json({ success: true, message: 'File queued for retry' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to trigger retry' });
  }
});

router.delete('/files/:id', async (req: MulterRequest, res: Response) => {
  try {
    const { userId, error: authError } = getUserIdOrThrow(req);
    if (authError) return res.status(401).json({ error: authError });

    const hasAccess = await fileAccessService.canAccessDocument(userId, req.params.id);
    if (!hasAccess) return res.status(403).json({ error: 'Unauthorized to delete' });

    const doc = await documentRepository.getDocument(req.params.id);
    if (doc && doc.storageFileId) {
      // 1. Delete blob
      await fileStorageService.deleteFile(doc.storageFileId);
      // 2. Delete metadata
      await documentRepository.deleteDocument(req.params.id);
    }

    res.json({ success: true, message: 'Recursively deleted' });
  } catch (error) {
    console.error('[Storage Routes] DELETE Error:', error);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// Static Category mocks
router.get('/categories', (req: Request, res: Response) => {
  res.json({
    categories: [
      { id: 'financial_statement', name: 'financial_statement', displayName: 'Financial Statement' },
      { id: 'tax_return', name: 'tax_return', displayName: 'Tax Return' },
      { id: 'paystub', name: 'paystub', displayName: 'Paystub' },
      { id: 'bank_statement', name: 'bank_statement', displayName: 'Bank Statement' },
      { id: 'receipt', name: 'receipt', displayName: 'Receipt' }
    ]
  });
});

export default router;
