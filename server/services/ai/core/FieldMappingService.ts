import { openAIReasoningProvider } from '../providers/OpenAIReasoningProvider';
import { DocumentExtractionResult } from '../providers/AzureDocumentIntelligenceProvider';
import { createLogger } from '../../../lib/logger';
import { CANONICAL_CATEGORIES } from './DocumentClassificationService';

const logger = createLogger('FieldMappingService');

export interface MappedFieldsResult {
  category: string;
  extractedFields: Record<string, any>;
  summary: string;
  flags: string[];
}

/**
 * FieldMappingService
 * 
 * Enforces canonical application schemas on raw unstructured data.
 * Transforms chaotic text and Azure layout tables into strict JSON bounds.
 */
export class FieldMappingService {
  async extractFields(documentId: string, extraction: DocumentExtractionResult): Promise<MappedFieldsResult> {
    const systemPrompt = `
You are a Principal Financial and Legal forensic AI logic engine. 
Extract key fields (like dates, amounts, account numbers, properties, persons involved) and return a strict JSON adhering to the provided schema.
Generate a short 1-2 sentence forensic summary of what this document proves or records.
You MUST map the document into one of these canonical categories: ${CANONICAL_CATEGORIES.join(', ')}.
`;

    const safeText = extraction.text.substring(0, 40000); 
    const userPrompt = `
Is Handwritten: ${extraction.isHandwritten}
Pages: ${extraction.pages}
KV Pairs: ${JSON.stringify(extraction.kvPairs).substring(0, 2000)}

Text:
${safeText}
`;

    const jsonSchema = {
      name: "forensic_document_extraction",
      schema: {
        type: "object",
        properties: {
          category: { type: "string", enum: CANONICAL_CATEGORIES },
          extractedFields: { 
            type: "object", 
            additionalProperties: true,
            description: "Key value pairs of core forensic data extracted"
          },
          summary: { type: "string" },
          flags: { 
            type: "array", 
            items: { type: "string" },
            description: "Anomalies like 'missing_pages', 'blurry', 'handwritten_edits_detected'"
          }
        },
        required: ["category", "extractedFields", "summary", "flags"],
        additionalProperties: false
      },
      strict: true
    };

    logger.info(`Executing field mapping constraints for ${documentId}`);
    
    return await openAIReasoningProvider.runStructuredReasoning<MappedFieldsResult>(
      systemPrompt, 
      userPrompt, 
      jsonSchema
    );
  }
}

export const fieldMappingService = new FieldMappingService();
