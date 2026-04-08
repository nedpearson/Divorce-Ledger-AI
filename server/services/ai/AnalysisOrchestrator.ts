import { documentRepository } from '../storage/documentRepository';
import { azureDocumentIntelligenceProvider } from './providers/AzureDocumentIntelligenceProvider';
import { visionReasoningProvider } from './providers/VisionReasoningProvider';
import { documentClassificationService } from './core/DocumentClassificationService';
import { fieldMappingService } from './core/FieldMappingService';
import { confidenceScoringService } from './core/ConfidenceScoringService';
import { approvalWorkflowService } from './workflow/ApprovalWorkflowService';
import { fileStorageService } from '../storage/fileStorageService';
import { createLogger } from '../../lib/logger';

const logger = createLogger('AnalysisOrchestrator');

// ─── Local fallback classifier (no AI keys needed) ──────────────────────────
function localFallbackClassify(doc: {
  fileName: string;
  fileType: string;
  title?: string | null;
  description?: string | null;
  category?: string | null;
}): { category: string; summary: string; confidence: number } {
  const name = (doc.fileName || doc.title || '').toLowerCase();
  const type = (doc.fileType || '').toLowerCase();
  const desc = (doc.description || '').toLowerCase();
  const combined = `${name} ${desc}`;

  // Financial
  if (/bank|statement|account|transaction/.test(combined)) {
    return { category: 'bank_statement', summary: `Bank statement: ${doc.fileName}`, confidence: 0.82 };
  }
  if (/tax|w-?2|1099|irs|return/.test(combined)) {
    return { category: 'tax_return', summary: `Tax document: ${doc.fileName}`, confidence: 0.85 };
  }
  if (/pay ?stub|payroll|salary|wage|earnings/.test(combined)) {
    return { category: 'paystub', summary: `Payroll record: ${doc.fileName}`, confidence: 0.83 };
  }
  if (/receipt|expense|invoice|bill/.test(combined)) {
    return { category: 'receipt', summary: `Expense receipt: ${doc.fileName}`, confidence: 0.80 };
  }
  if (/mortgage|loan|debt|credit/.test(combined)) {
    return { category: 'financial_statement', summary: `Financial obligation record: ${doc.fileName}`, confidence: 0.78 };
  }
  // Legal
  if (/consent|judgment|order|court|decree|petition/.test(combined)) {
    return { category: 'legal_document', summary: `Legal court document: ${doc.fileName}`, confidence: 0.87 };
  }
  if (/custody|parenting|visitation|child/.test(combined)) {
    return { category: 'custody_document', summary: `Custody-related document: ${doc.fileName}`, confidence: 0.85 };
  }
  if (/property|deed|title|real estate/.test(combined)) {
    return { category: 'property_document', summary: `Property document: ${doc.fileName}`, confidence: 0.84 };
  }
  // Media type fallbacks
  if (type.includes('image')) {
    return { category: 'evidence', summary: `Image evidence: ${doc.fileName}`, confidence: 0.60 };
  }
  if (type.includes('pdf')) {
    return { category: 'legal_document', summary: `PDF document: ${doc.fileName}`, confidence: 0.55 };
  }

  return { category: doc.category || 'other', summary: `Document: ${doc.fileName}`, confidence: 0.50 };
}

/**
 * AnalysisOrchestrator
 *
 * Pipeline utilizing AI microservices with graceful degradation to a local
 * fallback classifier when AI credentials are unavailable.
 */
export class AnalysisOrchestrator {

  async processDocument(documentId: string): Promise<boolean> {
    logger.info(`Orchestration starting for document: ${documentId}`);

    try {
      // 1. Queue Lock
      await documentRepository.updateDocument(documentId, { status: 'analyzing' });

      // 2. Metadata Fetch
      const doc = await documentRepository.getDocument(documentId);
      if (!doc) throw new Error(`Document ${documentId} not found`);

      logger.info(`Initiating extraction phase: ${doc.fileType}`);

      let analysisSucceeded = false;

      // 3. Try full AI pipeline first
      try {
        let extractionRaw;
        if (doc.fileType.includes('image') && !doc.fileType.includes('pdf')) {
          const visionText = await visionReasoningProvider.processVisualEvidence(doc.storageFileId, doc.fileType);
          extractionRaw = { text: visionText, pages: 1, tables: [], kvPairs: {}, isHandwritten: false };
        } else {
          const buffer = await fileStorageService.getFileBuffer(doc.storageFileId);
          extractionRaw = await azureDocumentIntelligenceProvider.analyzeDocumentBuffer(buffer, doc.fileType);
        }

        // Check if extraction returned real content (not mock placeholder)
        const isMockResult = extractionRaw.text.startsWith('MOCK_EXTRACTION');
        if (isMockResult) {
          logger.warn(`Mock extraction detected for ${documentId} — falling back to local classifier`);
        } else {
          const categoryHint = await documentClassificationService.classify(extractionRaw);
          const mappedFields = await fieldMappingService.extractFields(documentId, extractionRaw);
          const confidence = confidenceScoringService.assessConfidence(extractionRaw, mappedFields);
          await approvalWorkflowService.routeDocument(documentId, mappedFields, confidence);
          logger.info(`Full AI pipeline resolved for ${documentId} (confidence: ${confidence.score})`);
          analysisSucceeded = true;
        }
      } catch (aiError: any) {
        logger.warn(`AI pipeline unavailable for ${documentId}: ${aiError.message} — using local classifier`);
      }

      // 4. Local fallback when AI is unavailable / returns mock
      if (!analysisSucceeded) {
        const local = localFallbackClassify(doc);
        await documentRepository.updateDocument(documentId, {
          status: 'suggested',
          category: local.category,
          suggestedCategory: local.category,
          aiSummary: local.summary,
          aiConfidence: local.confidence,
          description: `Auto-classified locally (no AI credentials configured). Category: ${local.category}`,
        });
        logger.info(`Local fallback classification complete for ${documentId}: ${local.category} (${local.confidence})`);
      }

      return true;

    } catch (error: any) {
      logger.error(`Orchestration pipeline failed for ${documentId}`, { error });
      await documentRepository.updateDocument(documentId, {
        status: 'error',
        errorMessage: error.message || 'Unknown pipeline failure'
      });
      return false;
    }
  }
}

export const analysisOrchestrator = new AnalysisOrchestrator();
