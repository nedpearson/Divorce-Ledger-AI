/**
 * LLM Provider Abstraction Layer
 *
 * Supports multiple LLM providers for document analysis:
 * - Claude 3.5 Sonnet (recommended for financial documents)
 * - GPT-4o (excellent for vision and OCR)
 * - Gemini 2.0 Flash (cost-effective fallback)
 */

import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { createLogger } from '../../lib/logger';

const logger = createLogger('LLMProvider');

export type LLMProvider = 'claude' | 'openai' | 'gemini';

export interface LLMResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface LLMMessage {
  text?: string;
  imageBase64?: string;
  mimeType?: string;
}

// Model configurations
export const MODEL_CONFIGS = {
  claude: {
    model: 'claude-3-5-sonnet-20241022',
    provider: 'claude' as LLMProvider,
    maxTokens: 8192,
    supportsVision: true,
    costPer1MInput: 3.0,
    costPer1MOutput: 15.0,
    description: 'Best for structured financial data extraction and complex reasoning',
  },
  'gpt-4o': {
    model: 'gpt-4o',
    provider: 'openai' as LLMProvider,
    maxTokens: 4096,
    supportsVision: true,
    costPer1MInput: 2.5,
    costPer1MOutput: 10.0,
    description: 'Excellent for vision and OCR tasks',
  },
  'gpt-4o-mini': {
    model: 'gpt-4o-mini',
    provider: 'openai' as LLMProvider,
    maxTokens: 4096,
    supportsVision: true,
    costPer1MInput: 0.15,
    costPer1MOutput: 0.6,
    description: 'Cost-effective OpenAI option',
  },
  'gemini-2.0-flash': {
    model: 'gemini-2.0-flash',
    provider: 'gemini' as LLMProvider,
    maxTokens: 8192,
    supportsVision: true,
    costPer1MInput: 0.01,
    costPer1MOutput: 0.04,
    description: 'Fast and cost-effective for high-volume processing',
  },
  'gemini-1.5-flash': {
    model: 'gemini-1.5-flash',
    provider: 'gemini' as LLMProvider,
    maxTokens: 8192,
    supportsVision: true,
    costPer1MInput: 0.075,
    costPer1MOutput: 0.3,
    description: 'Previous generation Gemini model',
  },
} as const;

export type ModelName = keyof typeof MODEL_CONFIGS;

// Singleton instances
let claudeClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;
let geminiClient: GoogleGenAI | null = null;

function getClaudeClient(): Anthropic {
  if (!claudeClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'Anthropic API key not configured. Set ANTHROPIC_API_KEY or AI_INTEGRATIONS_ANTHROPIC_API_KEY environment variable.'
      );
    }
    claudeClient = new Anthropic({ apiKey });
    logger.info('Claude client initialized');
  }
  return claudeClient;
}

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    if (!apiKey) {
      throw new Error(
        'OpenAI API key not configured. Set OPENAI_API_KEY or AI_INTEGRATIONS_OPENAI_API_KEY environment variable.'
      );
    }
    openaiClient = new OpenAI({
      apiKey,
      ...(baseURL && { baseURL }),
    });
    logger.info('OpenAI client initialized', { usingProxy: !!baseURL });
  }
  return openaiClient;
}

function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    if (!apiKey) {
      throw new Error(
        'Gemini API key not configured. Set GEMINI_API_KEY or AI_INTEGRATIONS_GEMINI_API_KEY environment variable.'
      );
    }
    geminiClient = baseUrl
      ? new GoogleGenAI({ apiKey, httpOptions: { baseUrl } })
      : new GoogleGenAI({ apiKey });
    logger.info('Gemini client initialized', { usingProxy: !!baseUrl });
  }
  return geminiClient;
}

/**
 * Call Claude API with vision support
 */
async function callClaude(
  prompt: string,
  message: LLMMessage,
  modelName: string = 'claude-3-5-sonnet-20241022',
  maxTokens: number = 8192
): Promise<LLMResponse> {
  const client = getClaudeClient();

  const content: Anthropic.MessageParam['content'] = [];

  if (message.imageBase64 && message.mimeType) {
    // Claude supports images but not PDFs as base64
    // PDFs should be converted to images before being passed here
    if (message.mimeType.includes('pdf')) {
      // Skip PDF - it should be converted to image or text extracted beforehand
      logger.warn('PDF passed to Claude as image - this may not work', {
        mimeType: message.mimeType,
      });
    } else {
      // Add image for vision analysis
      const validMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      const mimeType = validMimeTypes.includes(message.mimeType)
        ? (message.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp')
        : 'image/jpeg'; // default fallback

      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mimeType,
          data: message.imageBase64,
        },
      });
    }
  }

  if (message.text) {
    content.push({
      type: 'text',
      text: message.text,
    });
  }

  const response = await client.messages.create({
    model: modelName,
    max_tokens: maxTokens,
    system: prompt,
    messages: [
      {
        role: 'user',
        content,
      },
    ],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  return {
    text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

/**
 * Call OpenAI API with vision support
 */
async function callOpenAI(
  prompt: string,
  message: LLMMessage,
  modelName: string = 'gpt-4o',
  maxTokens: number = 4096
): Promise<LLMResponse> {
  const client = getOpenAIClient();

  const content: OpenAI.Chat.ChatCompletionContentPart[] = [];

  if (message.imageBase64 && message.mimeType) {
    content.push({
      type: 'image_url',
      image_url: {
        url: `data:${message.mimeType};base64,${message.imageBase64}`,
      },
    });
  }

  if (message.text) {
    content.push({
      type: 'text',
      text: message.text,
    });
  }

  const response = await client.chat.completions.create({
    model: modelName,
    max_tokens: maxTokens,
    messages: [
      {
        role: 'system',
        content: prompt,
      },
      {
        role: 'user',
        content,
      },
    ],
  });

  return {
    text: response.choices[0]?.message?.content || '',
    inputTokens: response.usage?.prompt_tokens || 0,
    outputTokens: response.usage?.completion_tokens || 0,
  };
}

/**
 * Call Gemini API with vision support
 */
async function callGemini(
  prompt: string,
  message: LLMMessage,
  modelName: string = 'gemini-2.0-flash'
): Promise<LLMResponse> {
  const client = getGeminiClient();

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  if (message.imageBase64 && message.mimeType) {
    parts.push({
      inlineData: {
        mimeType: message.mimeType,
        data: message.imageBase64,
      },
    });
  }

  const textContent = [prompt, message.text].filter(Boolean).join('\n\n');
  parts.push({ text: textContent });

  const response = await client.models.generateContent({
    model: modelName,
    contents: [{ role: 'user', parts }],
  });

  return {
    text: response.text || '',
    inputTokens: response.usageMetadata?.promptTokenCount || 0,
    outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
  };
}

/**
 * Universal LLM call function - automatically routes to the correct provider
 */
export async function callLLM(
  prompt: string,
  message: LLMMessage,
  modelName: ModelName = 'claude'
): Promise<LLMResponse> {
  const config = MODEL_CONFIGS[modelName];

  try {
    switch (config.provider) {
      case 'claude':
        return await callClaude(prompt, message, config.model, config.maxTokens);
      case 'openai':
        return await callOpenAI(prompt, message, config.model, config.maxTokens);
      case 'gemini':
        return await callGemini(prompt, message, config.model);
      default:
        throw new Error(`Unknown provider: ${config.provider}`);
    }
  } catch (error) {
    logger.error('LLM call failed', { modelName, error });
    throw error;
  }
}

/**
 * Estimate cost for a given model and token usage
 */
export function estimateLLMCost(
  modelName: ModelName,
  inputTokens: number,
  outputTokens: number
): number {
  const config = MODEL_CONFIGS[modelName];
  const inputCost = (inputTokens / 1_000_000) * config.costPer1MInput;
  const outputCost = (outputTokens / 1_000_000) * config.costPer1MOutput;
  return inputCost + outputCost;
}

/**
 * Get the configured model from environment variable
 */
export function getConfiguredModel(): ModelName {
  const envModel = process.env.DOCUMENT_ANALYSIS_MODEL as ModelName | undefined;

  // Validate that the model exists in our config
  if (envModel && envModel in MODEL_CONFIGS) {
    return envModel;
  }

  // Default to Claude 3.5 Sonnet for best accuracy
  return 'claude';
}

/**
 * Get model information
 */
export function getModelInfo(modelName: ModelName) {
  return MODEL_CONFIGS[modelName];
}
