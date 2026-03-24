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

/**
 * AnalysisOrchestrator
 * 
 * Deeply un-coupled pipeline utilizing explicit microservices to govern
 * extraction, taxonomy classification, field parsing, and source lineage.
 */
export class AnalysisOrchestrator {

  async processDocument(documentId: string): Promise<boolean> {
    logger.info(`Orchestration starting for document: ${documentId}`);

    try {
      // 1. Queue Lock
      await documentRepository.updateDocument(documentId, { status: 'analyzing' });

      // 2. Metadata Fetch
      const doc = await documentRepository.getDocument(documentId);
      if (!doc) throw new Error(`Document ${documentId} evaporated before analysis`);

      logger.info(`Initiating extraction phase: ${doc.fileType}`);

      // 3. Form Factor Routing (DocumentExtractionProvider logic)
      let extractionRaw;
      if (doc.fileType.includes('image') && !doc.fileType.includes('pdf')) {
        // Screenshots, Phone Photos -> Native MultiModal pipeline
        const visionText = await visionReasoningProvider.processVisualEvidence(doc.storageFileId, doc.fileType);
        extractionRaw = { text: visionText, pages: 1, tables: [], kvPairs: {}, isHandwritten: false };
      } else {
        // PDFs, Heavy Structural Forms -> Azure Form Recognizer
        const buffer = await fileStorageService.getFileBuffer(doc.storageFileId);
        extractionRaw = await azureDocumentIntelligenceProvider.analyzeDocumentBuffer(buffer, doc.fileType);
      }
      
      // 4. Cognitive Taxonomy (DocumentClassificationService)
      const categoryHint = await documentClassificationService.classify(extractionRaw);

      // 5. Schema Normalization (FieldMappingService / OpenAIReasoningProvider)
      const mappedFields = await fieldMappingService.extractFields(documentId, extractionRaw);

      // 6. Heuristic Structuring (ConfidenceScoringService)
      const confidence = confidenceScoringService.assessConfidence(extractionRaw, mappedFields);

      // 7. Auto-Post vs Human-in-Loop (ApprovalWorkflowService + SyncCoordinator + LineageService)
      await approvalWorkflowService.routeDocument(documentId, mappedFields, confidence);

      logger.info(`Orchestration perfectly resolved for ${documentId} with confidence: ${confidence.score}`);
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
