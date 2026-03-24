import { DocumentAnalysisClient, AzureKeyCredential } from "@azure/ai-form-recognizer";
import { createLogger } from '../../../lib/logger';

const logger = createLogger('AzureDocumentIntelligenceProvider');

export interface DocumentExtractionResult {
  text: string;
  pages: number;
  tables: any[];
  kvPairs: Record<string, string>;
  isHandwritten: boolean;
}

/**
 * AzureDocumentIntelligenceProvider
 * 
 * Microsoft's v4.0 REST Client abstraction allowing deep layout-aware OCR 
 * and Form Recognition natively replacing the older PyMuPDF Python logic. 
 */
export class AzureDocumentIntelligenceProvider {
  private client: DocumentAnalysisClient | null = null;

  constructor() {
    const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
    const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;

    if (endpoint && key) {
      this.client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(key));
      logger.info('Azure Document Intelligence natively initialized');
    } else {
      logger.warn('Azure Document Intelligence credentials missing. Fallback mock OCR enabled.');
    }
  }

  async analyzeDocumentBuffer(buffer: Buffer, mimeType: string): Promise<DocumentExtractionResult> {
    if (!this.client) {
      // Graceful local dev mocking
      return {
        text: "MOCK_EXTRACTION: Azure credentials not configured. Please set AZURE_DOCUMENT_INTELLIGENCE_KEY.",
        pages: 1,
        tables: [],
        kvPairs: {},
        isHandwritten: false
      };
    }

    try {
      const poller = await this.client.beginAnalyzeDocument("prebuilt-layout", buffer, {
        onProgress: (state) => logger.debug(`Analysis progress: ${state.status}`)
      });

      const { content, pages, tables, keyValuePairs } = await poller.pollUntilDone();

      const kvpRecord: Record<string, string> = {};
      keyValuePairs?.forEach((pair) => {
        if (pair.key && pair.value) {
          kvpRecord[pair.key.content] = pair.value.content;
        }
      });

      return {
        text: content,
        pages: pages?.length || 1,
        tables: tables || [],
        kvPairs: kvpRecord,
        isHandwritten: false
      };
    } catch (e: any) {
      logger.error('Azure Document Intelligence pipeline failure', { error: e.message });
      throw new Error(`Document extraction failed: ${e.message}`);
    }
  }
}

export const azureDocumentIntelligenceProvider = new AzureDocumentIntelligenceProvider();
