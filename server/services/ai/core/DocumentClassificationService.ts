import { createLogger } from '../../../lib/logger';
import { DocumentExtractionResult } from '../providers/AzureDocumentIntelligenceProvider';

const logger = createLogger('DocumentClassificationService');

export const CANONICAL_CATEGORIES = [
  'financial_statement', 'tax_return', 'paystub', 'bank_statement',
  'receipt', 'legal_pleading', 'discovery_evidence', 'communication',
  'property_damage', 'appraisal', 'other'
] as const;

export type DocumentCategory = typeof CANONICAL_CATEGORIES[number];

/**
 * DocumentClassificationService
 * 
 * Purely responsible for determining mathematical Ontology and Category
 * assignments based on OCR textual hints before heavy GPT extraction runs.
 */
export class DocumentClassificationService {
  async classify(extraction: DocumentExtractionResult): Promise<DocumentCategory> {
    logger.debug('Classifying document based on raw layout data');
    // Pre-processing heuristics could go here to save GPT calls, 
    // or we can defer entirely to OpenAI for semantic classification.
    // For now, returning a baseline 'other' allows FieldMappingService to do the heavy lifting.
    return 'other';
  }
}

export const documentClassificationService = new DocumentClassificationService();
