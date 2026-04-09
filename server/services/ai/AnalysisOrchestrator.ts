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
}): { category: string; summary: string; confidence: number; extractedAmount?: number } {
  const name = (doc.fileName || doc.title || '').toLowerCase();
  const type = (doc.fileType || '').toLowerCase();
  const desc = (doc.description || '').toLowerCase();
  const combined = `${name} ${desc}`;

  // ─── Utility / Energy Bills (check BEFORE generic 'bill' pattern) ────────
  if (/entergy|utility|electric|gas bill|water bill|power bill|duke energy|pg&e|con.?ed|nv energy|xcel|dominion|centerpoint|south?ern company/.test(combined)) {
    // Try to extract a dollar amount from the filename e.g. "Entergy_Sep_2025"
    const monthMatch = name.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[_\s-]?(\d{4})/i);
    const monthLabel = monthMatch ? `${monthMatch[1]} ${monthMatch[2]}` : '';
    return { category: 'utility_bill', summary: `Utility bill${monthLabel ? ' — ' + monthLabel : ''}: ${doc.fileName}`, confidence: 0.90 };
  }

  // ─── Financial ──────────────────────────────────────────────────────────
  if (/bank|statement|account|transaction|checking|savings/.test(combined)) {
    return { category: 'bank_statement', summary: `Bank statement: ${doc.fileName}`, confidence: 0.82 };
  }
  if (/tax|w-?2|1099|irs|return/.test(combined)) {
    return { category: 'tax_return', summary: `Tax document: ${doc.fileName}`, confidence: 0.85 };
  }
  if (/pay.?stub|payroll|salary|wage|earnings|direct.?deposit/.test(combined)) {
    return { category: 'paystub', summary: `Payroll record: ${doc.fileName}`, confidence: 0.83 };
  }
  if (/receipt|expense|invoice/.test(combined)) {
    return { category: 'receipt', summary: `Expense receipt: ${doc.fileName}`, confidence: 0.80 };
  }
  if (/mortgage|loan|debt|credit|heloc/.test(combined)) {
    return { category: 'financial_statement', summary: `Financial obligation record: ${doc.fileName}`, confidence: 0.78 };
  }
  if (/insurance|premium|policy/.test(combined)) {
    return { category: 'insurance', summary: `Insurance document: ${doc.fileName}`, confidence: 0.79 };
  }

  // ─── Legal ──────────────────────────────────────────────────────────────
  if (/consent|judgment|order|court|decree|petition|motion|affidavit/.test(combined)) {
    return { category: 'legal_document', summary: `Legal court document: ${doc.fileName}`, confidence: 0.87 };
  }
  if (/custody|parenting|visitation|child support/.test(combined)) {
    return { category: 'custody_document', summary: `Custody-related document: ${doc.fileName}`, confidence: 0.85 };
  }
  if (/property|deed|title|real estate|appraisal/.test(combined)) {
    return { category: 'property_document', summary: `Property document: ${doc.fileName}`, confidence: 0.84 };
  }

  // ─── Media type fallbacks ─────────────────────────────────────────────
  if (type.includes('image')) {
    return { category: 'evidence', summary: `Image evidence: ${doc.fileName}`, confidence: 0.60 };
  }
  if (type.includes('pdf')) {
    // Generic PDF — don't assume legal, use category hint or 'other'
    return { category: doc.category && doc.category !== 'other' ? doc.category : 'financial_document', summary: `Document: ${doc.fileName}`, confidence: 0.50 };
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

      // 3. Fast path: text-only captures (no real file binary)
      // These come from the Home quick-capture form — no file attached, just title/description
      const isTextOnlyDoc = !doc.fileSize || doc.fileSize === 0 || doc.fileHash === 'unknown-hash';
      if (isTextOnlyDoc) {
        logger.info(`Text-only document detected for ${documentId} — using local classifier directly`);
        const local = localFallbackClassify(doc);
        await documentRepository.updateDocument(documentId, {
          status: 'suggested',
          category: local.category,
          suggestedCategory: local.category,
          aiSummary: local.summary,
          aiConfidence: local.confidence,
          description: doc.description || `Auto-classified: ${local.category}`,
        });
        logger.info(`Local classification complete for ${documentId}: ${local.category}`);
        return true;
      }

      // 4. Try full AI pipeline for real file uploads
      try {
        let extractionRaw;
        if (doc.fileType && doc.fileType.includes('image') && !doc.fileType.includes('pdf')) {
          const visionText = await visionReasoningProvider.processVisualEvidence(doc.storageFileId, doc.fileType);
          extractionRaw = { text: visionText, pages: 1, tables: [], kvPairs: {}, isHandwritten: false };
        } else {
          const buffer = await fileStorageService.getFileBuffer(doc.storageFileId);
          extractionRaw = await azureDocumentIntelligenceProvider.analyzeDocumentBuffer(buffer, doc.fileType || 'application/pdf');
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
