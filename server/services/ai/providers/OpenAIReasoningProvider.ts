import OpenAI from 'openai';
import { createLogger } from '../../../lib/logger';

const logger = createLogger('OpenAIReasoningProvider');

/**
 * OpenAIReasoningProvider
 * 
 * Supports standard OpenAI configuration (with fallback) as well as explicitly 
 * bound Azure OpenAI environments depending on ENV setups. Used as the 
 * cognitive brain replacing primitive regex matchers.
 */
export class OpenAIReasoningProvider {
  private openai: OpenAI;
  private isAzure: boolean;
  private defaultModel: string;

  constructor() {
    const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const azureKey = process.env.AZURE_OPENAI_API_KEY;
    const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';
    const azureApiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview';
    
    const standardKey = process.env.OPENAI_API_KEY;

    if (azureEndpoint && azureKey && !azureEndpoint.includes('YOUR-')) {
      this.isAzure = true;
      this.defaultModel = azureDeployment;
      this.openai = new OpenAI({
        apiKey: azureKey,
        baseURL: `${azureEndpoint}/openai/deployments/${azureDeployment}`,
        defaultQuery: { 'api-version': azureApiVersion },
        defaultHeaders: { 'api-key': azureKey }
      });
      logger.info('Azure OpenAI natively initialized');
    } else {
      this.isAzure = false;
      this.defaultModel = 'gpt-4o-mini';
      this.openai = new OpenAI({ apiKey: standardKey || 'dummy_missing_key' });
      
      if (!standardKey) {
        logger.warn('No OpenAI or Azure credentials found. Cognitive features disabled.');
      } else {
        logger.info('Standard OpenAI natively initialized');
      }
    }
  }

  async runStructuredReasoning<T>(systemPrompt: string, userContent: string, jsonSchemaDefinition: any): Promise<T> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: this.defaultModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        response_format: {
          type: "json_schema",
          json_schema: jsonSchemaDefinition
        },
        temperature: 0.1
      });

      const rawContent = completion.choices[0].message.content;
      if (!rawContent) throw new Error("Null structured response generated");

      return JSON.parse(rawContent) as T;
    } catch (e: any) {
      logger.error('Cognitive extraction failed', { error: e.message });
      throw new Error(`AI Reasoning Failed: ${e.message}`);
    }
  }

  async runVisionReasoning<T>(systemPrompt: string, base64Uri: string, jsonSchemaDefinition: any): Promise<T> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: this.defaultModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { 
            role: 'user', 
            content: [
              { type: 'text', text: 'Analyze this evidence carefully adhering to the JSON schema:' },
              { type: 'image_url', image_url: { url: base64Uri, detail: 'high' } }
            ]
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: jsonSchemaDefinition
        },
        temperature: 0.1
      });

      const rawContent = completion.choices[0].message?.content;
      if (!rawContent) throw new Error("Null structured response generated from multimodal payload");

      return JSON.parse(rawContent) as T;
    } catch (e: any) {
      logger.error('Vision extraction failed', { error: e.message });
      throw new Error(`Vision Reasoning Failed: ${e.message}`);
    }
  }

  getProviderIdentifier() {
    return this.isAzure ? `Azure ${this.defaultModel}` : `Standard ${this.defaultModel}`;
  }
}

export const openAIReasoningProvider = new OpenAIReasoningProvider();
