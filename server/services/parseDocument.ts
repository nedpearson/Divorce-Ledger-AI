import { z } from 'zod';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';

// ============================================================================
// CANONICAL SCHEMAS - Single Source of Truth
// ============================================================================

export const ParseStatus = z.enum(['success', 'no_data', 'layout_not_supported', 'low_confidence']);
export type ParseStatus = z.infer<typeof ParseStatus>;

export const DocType = z.enum([
  'UTILITY_BILL',
  'BANK_STATEMENT',
  'CREDIT_CARD_STATEMENT',
  'MORTGAGE_STATEMENT',
  'LOAN_STATEMENT',
  'PAY_STUB',
  'GENERIC_FINANCIAL_EXPENSE',
  'GENERIC_FINANCIAL_INCOME',
  'PROPERTY_TAX',
  'INSURANCE_POLICY',
  'NON_FINANCIAL',
  'LEGAL_DOCUMENT',
  'COURT_ORDER',
]);
export type DocType = z.infer<typeof DocType>;

export const Language = z.enum(['en', 'es', 'other']);
export type Language = z.infer<typeof Language>;

export const LineItemSchema = z.object({
  label: z.string(),
  category_hint: z.string().nullable(),
  amount: z.number(),
  amount_text: z.string(),
  is_credit_or_refund: z.boolean(),
  is_recurring_guess: z.boolean(),
  page_number: z.number().nullable(),
  surrounding_text_snippet: z.string().nullable(),
});
export type LineItem = z.infer<typeof LineItemSchema>;

export const LegalObligationSchema = z.object({
  rule_type: z.enum(['percentage_split', 'fixed_amount', 'event_trigger', 'unknown']),
  category: z.string().nullable(),
  party_a_role: z.string().nullable(),
  party_b_role: z.string().nullable(),
  party_a_percentage: z.number().nullable(),
  party_b_percentage: z.number().nullable(),
  fixed_amount: z.number().nullable(),
  effective_start_date: z.string().nullable(),
  effective_end_date: z.string().nullable(),
  explanation: z.string().nullable(),
});
export type LegalObligation = z.infer<typeof LegalObligationSchema>;

export const ExpenseDocumentSchema = z.object({
  parse_status: ParseStatus,
  language: Language,
  doc_type: DocType,
  vendor_name: z.string().nullable(),
  account_number: z.string().nullable(),
  billing_period_start: z.string().nullable(),
  billing_period_end: z.string().nullable(),
  statement_date: z.string().nullable(),
  due_date: z.string().nullable(),
  currency: z.string().nullable().catch('USD'),
  total_amount_due: z.number().nullable(),
  total_amount_text: z.string().nullable(),
  customer_name: z.string().nullable(),
  service_address: z.string().nullable(),
  mailing_address: z.string().nullable(),
  line_items: z.array(LineItemSchema),
  legal_obligations: z.array(LegalObligationSchema).optional().default([]),
  notes: z.array(z.string()),
});
export type ExpenseDocument = z.infer<typeof ExpenseDocumentSchema>;

// ============================================================================
// LLM PROVIDER INTERFACE - Swappable
// ============================================================================

export interface LLMProvider {
  name: string;
  parseDocument(
    extractedText: string,
    docTypeHint?: DocType | null,
    imageBase64?: string,
    imageMimeType?: string
  ): Promise<{ result: ExpenseDocument; usage: TokenUsage }>;
}

export interface TokenUsage {
  requestTokens: number;
  responseTokens: number;
}

// ============================================================================
// SYSTEM PROMPT - Forensic Financial Parser
// ============================================================================

const SYSTEM_PROMPT = `You are a meticulous forensic financial document parser for a divorce and family-law SaaS named "Divorce Ledger".

Your job:
- Read a single financial document (utility bill, bank/credit card statement, pay stub, loan/mortgage statement, receipt, or generic financial record).
- Extract ONLY verifiable information that appears in the document.
- Output STRICT JSON that matches the provided TypeScript schema exactly.
- If something is ambiguous or not visible, set the field to null and use the appropriate parse_status.

Never invent numbers, dates, or parties. Never guess missing data. Be conservative.

The document may be in English or Spanish. Field NAMES must always be English, but you may echo vendor names, labels, and addresses in their original language.

CRITICAL RULES:
1. All dates must be YYYY-MM-DD format
2. All amounts must be numeric (no currency symbols in the number field)
3. Store original amount text in amount_text (e.g., "$1,234.56" or "1.234,56 €")
4. If you cannot confidently extract data, set parse_status to "low_confidence" or "no_data"
5. For European/Spanish number formats (1.234,56), convert to standard numeric (1234.56)
6. If the document is a court order, agreement, or contains language explicitly splitting responsibility (e.g. "Husband pays 50%"), fill out the \`legal_obligations\` array with precise splits and effective dates.`;

const getSchemaForPrompt = () => `
type ExpenseDocument = {
  parse_status: 'success' | 'no_data' | 'layout_not_supported' | 'low_confidence';
  language: 'en' | 'es' | 'other';
  doc_type: 
    | 'UTILITY_BILL'
    | 'BANK_STATEMENT'
    | 'CREDIT_CARD_STATEMENT'
    | 'MORTGAGE_STATEMENT'
    | 'LOAN_STATEMENT'
    | 'GENERIC_FINANCIAL_EXPENSE'
    | 'GENERIC_FINANCIAL_INCOME'
    | 'PAY_STUB'
    | 'PROPERTY_TAX'
    | 'INSURANCE_POLICY'
    | 'NON_FINANCIAL'
    | 'LEGAL_DOCUMENT'
    | 'COURT_ORDER';

  vendor_name: string | null;        // Company name (e.g., "Pacific Gas & Electric")
  account_number: string | null;     // Account or customer number
  billing_period_start: string | null;   // YYYY-MM-DD
  billing_period_end: string | null;     // YYYY-MM-DD
  statement_date: string | null;         // YYYY-MM-DD
  due_date: string | null;               // YYYY-MM-DD

  currency: string;                      // e.g. "USD", "EUR", "MXN"
  total_amount_due: number | null;       // numeric, no currency symbol
  total_amount_text: string | null;      // exact text as printed

  customer_name: string | null;          // Name on the account
  service_address: string | null;        // Where service is provided
  mailing_address: string | null;        // Where bills are sent

  line_items: {
    label: string;                       // Description of the charge
    category_hint: string | null;        // e.g. "electricity", "water", "interest", "principal"
    amount: number;                      // Numeric value (positive for charges, negative for credits)
    amount_text: string;                 // Original string, e.g. "1.234,56" or "$123.45"
    is_credit_or_refund: boolean;        // True if this reduces the total
    is_recurring_guess: boolean;         // True if likely a recurring charge
    page_number: number | null;          // Which page this was found on
    surrounding_text_snippet: string | null; // ~50 chars around the number for audit
  }[];

  legal_obligations: {
    rule_type: 'percentage_split' | 'fixed_amount' | 'event_trigger' | 'unknown';
    category: string | null;             // e.g., 'uninsured_medical', 'extracurricular' 
    party_a_role: string | null;         // e.g., 'Husband', 'Plaintiff'
    party_b_role: string | null;         // e.g., 'Wife', 'Defendant'
    party_a_percentage: number | null;   // e.g. 60
    party_b_percentage: number | null;   // e.g. 40
    fixed_amount: number | null;         // if not a percentage
    effective_start_date: string | null; // YYYY-MM-DD
    effective_end_date: string | null;   // YYYY-MM-DD
    explanation: string | null;          // AI reasoning
  }[];

  notes: string[];                       // Brief comments or caveats for human reviewer
};`;

const EXAMPLE_OUTPUT = `
EXAMPLE OUTPUT for a utility bill:
{
  "parse_status": "success",
  "language": "en",
  "doc_type": "UTILITY_BILL",
  "vendor_name": "Pacific Gas & Electric",
  "account_number": "1234567890",
  "billing_period_start": "2024-01-01",
  "billing_period_end": "2024-01-31",
  "statement_date": "2024-02-05",
  "due_date": "2024-02-20",
  "currency": "USD",
  "total_amount_due": 157.42,
  "total_amount_text": "$157.42",
  "customer_name": "John Smith",
  "service_address": "123 Main St, San Francisco, CA 94102",
  "mailing_address": "123 Main St, San Francisco, CA 94102",
  "line_items": [
    {
      "label": "Electric Charges",
      "category_hint": "electricity",
      "amount": 125.00,
      "amount_text": "$125.00",
      "is_credit_or_refund": false,
      "is_recurring_guess": true,
      "page_number": 1,
      "surrounding_text_snippet": "Electric Charges...........$125.00"
    },
    {
      "label": "Gas Charges",
      "category_hint": "gas",
      "amount": 32.42,
      "amount_text": "$32.42",
      "is_credit_or_refund": false,
      "is_recurring_guess": true,
      "page_number": 1,
      "surrounding_text_snippet": "Gas Charges................$32.42"
    }
  ],
  "notes": ["Bill appears to be a standard monthly utility statement"]
}`;

// ============================================================================
// OPENAI PROVIDER
// ============================================================================

export class OpenAIProvider implements LLMProvider {
  name = 'openai';
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }

  async parseDocument(
    extractedText: string,
    docTypeHint?: DocType | null,
    imageBase64?: string,
    imageMimeType?: string
  ): Promise<{ result: ExpenseDocument; usage: TokenUsage }> {
    const userPrompt = this.buildUserPrompt(extractedText, docTypeHint);
    console.log('[OpenAIProvider] Sending prompt to LLM:', userPrompt);

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];

    if (imageBase64 && imageMimeType) {
      messages.push({
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${imageMimeType};base64,${imageBase64}`,
            },
          },
          { type: 'text', text: userPrompt },
        ],
      });
    } else {
      messages.push({ role: 'user', content: userPrompt });
    }

    const response = await this.client.chat.completions.create({
      model: imageBase64 ? 'gpt-4o' : 'gpt-4o-mini',
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content || '{}';
    console.log('[OpenAIProvider] Raw LLM response:', content);
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error('[OpenAIProvider] Failed to parse JSON content:', content);
      throw e;
    }
    const validated = ExpenseDocumentSchema.parse(parsed);

    return {
      result: validated,
      usage: {
        requestTokens: response.usage?.prompt_tokens || 0,
        responseTokens: response.usage?.completion_tokens || 0,
      },
    };
  }

  private buildUserPrompt(extractedText: string, docTypeHint?: DocType | null): string {
    let prompt = `Parse the following financial document and return JSON matching this schema:\n\n${getSchemaForPrompt()}\n\n${EXAMPLE_OUTPUT}\n\n`;

    if (docTypeHint) {
      prompt += `HINT: This document has been pre-classified as: ${docTypeHint}\n\n`;
    }

    prompt += `DOCUMENT TEXT:\n---\n${extractedText}\n---\n\nRespond ONLY with valid JSON, no additional text. If this is a utility bill or receipt, please extract the total amount due and vendor name accurately.`;

    return prompt;
  }
}

// ============================================================================
// GEMINI PROVIDER
// ============================================================================

export class GeminiProvider implements LLMProvider {
  name = 'gemini';
  private client: GoogleGenAI;

  constructor() {
    this.client = new GoogleGenAI({
      apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
      httpOptions: {
        apiVersion: '',
        baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
      },
    });
  }

  async parseDocument(
    extractedText: string,
    docTypeHint?: DocType | null,
    imageBase64?: string,
    imageMimeType?: string
  ): Promise<{ result: ExpenseDocument; usage: TokenUsage }> {
    const userPrompt = this.buildUserPrompt(extractedText, docTypeHint);
    console.log('[OpenAIProvider] Sending prompt to LLM:', userPrompt);

    const parts: any[] = [];

    if (imageBase64 && imageMimeType) {
      parts.push({
        inlineData: {
          mimeType: imageMimeType,
          data: imageBase64,
        },
      });
    }

    parts.push({ text: `${SYSTEM_PROMPT}\n\n${userPrompt}` });

    const response = await this.client.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts }],
    });

    const content = response.text || '{}';
    const cleanedContent = content.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleanedContent);
    const validated = ExpenseDocumentSchema.parse(parsed);

    return {
      result: validated,
      usage: {
        requestTokens: response.usageMetadata?.promptTokenCount || 0,
        responseTokens: response.usageMetadata?.candidatesTokenCount || 0,
      },
    };
  }

  private buildUserPrompt(extractedText: string, docTypeHint?: DocType | null): string {
    let prompt = `Parse the following financial document and return JSON matching this schema:\n\n${getSchemaForPrompt()}\n\n${EXAMPLE_OUTPUT}\n\n`;

    if (docTypeHint) {
      prompt += `HINT: This document has been pre-classified as: ${docTypeHint}\n\n`;
    }

    prompt += `DOCUMENT TEXT:\n---\n${extractedText}\n---\n\nRespond ONLY with valid JSON, no additional text. If this is a utility bill or receipt, please extract the total amount due and vendor name accurately.`;

    return prompt;
  }
}

// ============================================================================
// AMOUNT NORMALIZATION HELPERS
// ============================================================================

export function normalizeAmount(amountText: string): number | null {
  if (!amountText) return null;

  let cleaned = amountText.replace(/[^0-9.,\-]/g, '');

  if (cleaned.includes(',') && cleaned.includes('.')) {
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes(',')) {
    const parts = cleaned.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      cleaned = cleaned.replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  }

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

export function normalizeDate(dateStr: string | null): string | null {
  if (!dateStr) return null;

  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return dateStr;

  const usMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const euMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (euMatch) {
    const [, day, month, year] = euMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return null;
}

export function detectCurrency(text: string): string {
  if (text.includes('€') || text.includes('EUR')) return 'EUR';
  if (text.includes('£') || text.includes('GBP')) return 'GBP';
  if (text.includes('MXN') || text.includes('MX$')) return 'MXN';
  if (text.includes('CAD') || text.includes('C$')) return 'CAD';
  return 'USD';
}

// ============================================================================
// DOCUMENT CLASSIFIER
// ============================================================================

export function classifyDocument(
  fileName: string,
  extractedText: string
): { docType: DocType; confidence: number } {
  const text = (fileName + ' ' + extractedText).toLowerCase();

  const patterns: { type: DocType; keywords: string[]; weight: number }[] = [
    {
      type: 'UTILITY_BILL',
      keywords: [
        'utility',
        'electric',
        'gas',
        'water',
        'kwh',
        'therms',
        'meter reading',
        'pge',
        'con edison',
      ],
      weight: 1,
    },
    {
      type: 'BANK_STATEMENT',
      keywords: [
        'bank statement',
        'checking',
        'savings',
        'balance',
        'deposits',
        'withdrawals',
        'bank of',
        'chase',
        'wells fargo',
      ],
      weight: 1,
    },
    {
      type: 'CREDIT_CARD_STATEMENT',
      keywords: [
        'credit card',
        'minimum payment',
        'credit limit',
        'apr',
        'visa',
        'mastercard',
        'amex',
      ],
      weight: 1,
    },
    {
      type: 'MORTGAGE_STATEMENT',
      keywords: [
        'mortgage',
        'principal',
        'escrow',
        'loan balance',
        'property address',
        'home loan',
      ],
      weight: 1,
    },
    {
      type: 'LOAN_STATEMENT',
      keywords: [
        'loan statement',
        'loan balance',
        'payment due',
        'interest rate',
        'student loan',
        'auto loan',
      ],
      weight: 1,
    },
    {
      type: 'PAY_STUB',
      keywords: [
        'pay stub',
        'paycheck',
        'gross pay',
        'net pay',
        'withholding',
        'fica',
        'federal tax',
        'earnings',
      ],
      weight: 1,
    },
    {
      type: 'PROPERTY_TAX',
      keywords: [
        'property tax',
        'assessed value',
        'tax bill',
        'parcel',
        'county tax',
        'real estate tax',
      ],
      weight: 1,
    },
    {
      type: 'INSURANCE_POLICY',
      keywords: ['insurance', 'policy', 'premium', 'coverage', 'deductible', 'beneficiary'],
      weight: 1,
    },
  ];

  let bestMatch: DocType = 'GENERIC_FINANCIAL_EXPENSE';
  let bestScore = 0;

  for (const pattern of patterns) {
    let score = 0;
    for (const keyword of pattern.keywords) {
      if (text.includes(keyword)) {
        score += pattern.weight;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = pattern.type;
    }
  }

  const confidence = Math.min(bestScore / 3, 1);

  if (confidence < 0.3) {
    if (text.includes('income') || text.includes('payment received') || text.includes('deposit')) {
      return { docType: 'GENERIC_FINANCIAL_INCOME', confidence: 0.5 };
    }
    return { docType: 'GENERIC_FINANCIAL_EXPENSE', confidence: 0.4 };
  }

  return { docType: bestMatch, confidence };
}

// ============================================================================
// MAIN PARSE FUNCTION
// ============================================================================

export interface ParseDocumentOptions {
  provider?: 'openai' | 'gemini';
  docTypeHint?: DocType | null;
  imageBase64?: string;
  imageMimeType?: string;
}

export interface ParseDocumentResult {
  document: ExpenseDocument;
  classification: { docType: DocType; confidence: number };
  usage: TokenUsage;
  latencyMs: number;
}

export async function parseFinancialDocument(
  extractedText: string,
  fileName: string,
  options: ParseDocumentOptions = {}
): Promise<ParseDocumentResult> {
  const startTime = Date.now();

  const classification = options.docTypeHint
    ? { docType: options.docTypeHint, confidence: 1 }
    : classifyDocument(fileName, extractedText);

  const provider: LLMProvider =
    options.provider === 'gemini' ? new GeminiProvider() : new OpenAIProvider();

  const { result, usage } = await provider.parseDocument(
    extractedText,
    classification.docType,
    options.imageBase64,
    options.imageMimeType
  );

  return {
    document: result,
    classification,
    usage,
    latencyMs: Date.now() - startTime,
  };
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

export function validateParseResult(doc: ExpenseDocument): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (doc.total_amount_due !== null && doc.total_amount_due < 0) {
    warnings.push('Total amount is negative - verify if this is a refund');
  }

  for (let i = 0; i < doc.line_items.length; i++) {
    const item = doc.line_items[i];
    if (item.amount === 0) {
      warnings.push(`Line item ${i + 1} has zero amount`);
    }
  }

  if (doc.billing_period_start && doc.billing_period_end) {
    const start = new Date(doc.billing_period_start);
    const end = new Date(doc.billing_period_end);
    if (start > end) {
      errors.push('Billing period start date is after end date');
    }
  }

  if (doc.doc_type !== 'NON_FINANCIAL' && doc.line_items.length === 0) {
    warnings.push('No line items extracted from financial document');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// CATEGORY MAPPING
// ============================================================================

export function mapDocTypeToFinanceCategory(docType: DocType): string {
  const mapping: Record<DocType, string> = {
    UTILITY_BILL: 'utility_bill',
    BANK_STATEMENT: 'bank_statement',
    CREDIT_CARD_STATEMENT: 'debt_statement',
    MORTGAGE_STATEMENT: 'debt_statement',
    LOAN_STATEMENT: 'debt_statement',
    PAY_STUB: 'employment_record',
    GENERIC_FINANCIAL_EXPENSE: 'financial_statement',
    GENERIC_FINANCIAL_INCOME: 'financial_statement',
    PROPERTY_TAX: 'tax_return',
    INSURANCE_POLICY: 'insurance_document',
    NON_FINANCIAL: 'other',
  };
  return mapping[docType] || 'other';
}

import {
  CoreLedgerBucket,
  mapDocTypeToInternalBucket,
  mapDocTypeToInternalCategory,
  mapCoreBucketToRecordType,
} from './financeMappings';

export function mapDocTypeToRecordType(docType: DocType): 'expense' | 'income' | 'asset' | 'debt' {
  const coreBucket = mapDocTypeToInternalBucket(docType);
  return mapCoreBucketToRecordType(coreBucket);
}

export function mapDocTypeToLedgerBucket(docType: DocType): CoreLedgerBucket {
  return mapDocTypeToInternalBucket(docType);
}

export { mapDocTypeToInternalCategory };
