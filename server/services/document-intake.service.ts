import OpenAI from 'openai';
import { z } from 'zod';
import type { DocumentCategory } from '@shared/schema';

let _openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!_openaiClient) {
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured for document intake');
    }
    _openaiClient = new OpenAI({
      apiKey,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return _openaiClient;
}

const openai = { get: () => getOpenAIClient() };

// ==================== CANONICAL ZOD SCHEMAS (Single Source of Truth) ====================

export const sourceTraceSchema = z.object({
  field: z.string(),
  evidence_snippet: z.string(),
  approx_page: z.number(),
  comment: z.string(),
});

export const ledgerActionSchema = z.object({
  action_type: z.enum(['ADD_TRANSACTION', 'UPDATE_TRANSACTION', 'NO_LEDGER_ACTION']),
  reason: z.string(),
  transaction: z.object({
    suggested_date: z.string().nullable(),
    suggested_amount: z.number().nullable(),
    suggested_currency: z.string(),
    suggested_category: z.string(),
    suggested_sub_category: z.string(),
    suggested_account: z.string().nullable(),
    suggested_counterparty: z.string().nullable(),
    notes_for_user: z.string(),
  }),
});

export const documentIntakeResultSchema = z.object({
  doc_type: z.string(),
  doc_language: z.string(),
  summary: z.string(),
  parties: z.object({
    payer_name: z.string().nullable(),
    payee_name: z.string().nullable(),
    issuer_name: z.string().nullable(),
    account_holder: z.string().nullable(),
    other_parties: z.array(z.object({ role: z.string(), name: z.string() })),
  }),
  amounts: z.object({
    currency: z.string(),
    total_amount_original: z.string().nullable(),
    total_amount_normalized: z.number().nullable(),
    subtotal_original: z.string().nullable(),
    subtotal_normalized: z.number().nullable(),
    tax_original: z.string().nullable(),
    tax_normalized: z.number().nullable(),
    fees_original: z.string().nullable(),
    fees_normalized: z.number().nullable(),
    interest_original: z.string().nullable(),
    interest_normalized: z.number().nullable(),
    payment_amount_original: z.string().nullable(),
    payment_amount_normalized: z.number().nullable(),
    balance_before_original: z.string().nullable(),
    balance_before_normalized: z.number().nullable(),
    balance_after_original: z.string().nullable(),
    balance_after_normalized: z.number().nullable(),
  }),
  dates: z.object({
    document_date_original: z.string().nullable(),
    document_date_normalized: z.string().nullable(),
    service_period_start_original: z.string().nullable(),
    service_period_start_normalized: z.string().nullable(),
    service_period_end_original: z.string().nullable(),
    service_period_end_normalized: z.string().nullable(),
    due_date_original: z.string().nullable(),
    due_date_normalized: z.string().nullable(),
    transaction_dates: z.array(
      z.object({
        label: z.string(),
        original: z.string(),
        normalized: z.string().nullable(),
      })
    ),
  }),
  accounts: z.object({
    account_number_masked: z.string().nullable(),
    routing_number_masked: z.string().nullable(),
    iban_or_other: z.string().nullable(),
    loan_or_mortgage_id_masked: z.string().nullable(),
    card_last4: z.string().nullable(),
  }),
  line_items: z.array(
    z.object({
      description_original: z.string(),
      description_normalized: z.string(),
      quantity: z.number().nullable(),
      unit_price_original: z.string().nullable(),
      unit_price_normalized: z.number().nullable(),
      line_total_original: z.string().nullable(),
      line_total_normalized: z.number().nullable(),
      vendor_or_payee_guess: z.string().nullable(),
      tags: z.array(z.string()),
    })
  ),
  classifications: z.object({
    primary_category: z.string(),
    sub_category: z.string(),
    is_recurring: z.boolean().nullable(),
    is_personal: z.boolean().nullable(),
    is_business: z.boolean().nullable(),
    is_child_related: z.boolean().nullable(),
    is_spousal_support_related: z.boolean().nullable(),
  }),
  ledger_actions_proposed: z.array(ledgerActionSchema),
  source_trace: z.array(sourceTraceSchema),
  confidence: z.object({
    overall: z.number(),
    per_field: z.record(z.string(), z.number()),
  }),
  approval_request: z.object({
    ui_language: z.string(),
    message_to_user: z.string(),
    questions_for_user: z.array(z.string()),
    fields_user_should_review: z.array(z.string()),
  }),
  errors_or_warnings: z.array(z.string()),
});

// Derive TypeScript type from canonical Zod schema (single source of truth)
export type DocumentIntakeResultFromSchema = z.infer<typeof documentIntakeResultSchema>;
export type LedgerActionFromSchema = z.infer<typeof ledgerActionSchema>;
export type SourceTraceFromSchema = z.infer<typeof sourceTraceSchema>;

// Validate and enforce source_trace for ALL normalized fields (strict mode)
// Per specification: Every numeric, date, and classification field MUST be traceable
export function validateSourceTraceCompleteness(result: DocumentIntakeResult): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const traceFields = new Set(result.source_trace.map((st) => st.field));

  // Helper to check if a field has EXACT trace match (no parent shortcuts)
  const hasExactTrace = (fieldPath: string): boolean => {
    return traceFields.has(fieldPath);
  };

  // Check all amounts normalized fields - REQUIRED
  const amountFields: Array<{ path: string; value: number | null }> = [
    { path: 'amounts.total_amount_normalized', value: result.amounts.total_amount_normalized },
    { path: 'amounts.subtotal_normalized', value: result.amounts.subtotal_normalized },
    { path: 'amounts.tax_normalized', value: result.amounts.tax_normalized },
    { path: 'amounts.fees_normalized', value: result.amounts.fees_normalized },
    { path: 'amounts.interest_normalized', value: result.amounts.interest_normalized },
    { path: 'amounts.payment_amount_normalized', value: result.amounts.payment_amount_normalized },
    { path: 'amounts.balance_before_normalized', value: result.amounts.balance_before_normalized },
    { path: 'amounts.balance_after_normalized', value: result.amounts.balance_after_normalized },
  ];

  for (const { path, value } of amountFields) {
    if (value !== null && !hasExactTrace(path)) {
      errors.push(`TRACEABILITY VIOLATION: Missing source_trace for '${path}' with value ${value}`);
    }
  }

  // Check line_items numeric fields - REQUIRED with exact index paths
  result.line_items.forEach((item, idx) => {
    const quantityPath = `line_items[${idx}].quantity`;
    const unitPricePath = `line_items[${idx}].unit_price_normalized`;
    const lineTotalPath = `line_items[${idx}].line_total_normalized`;

    if (item.quantity !== null && !hasExactTrace(quantityPath)) {
      errors.push(
        `TRACEABILITY VIOLATION: Missing source_trace for '${quantityPath}' with value ${item.quantity}`
      );
    }
    if (item.unit_price_normalized !== null && !hasExactTrace(unitPricePath)) {
      errors.push(
        `TRACEABILITY VIOLATION: Missing source_trace for '${unitPricePath}' with value ${item.unit_price_normalized}`
      );
    }
    if (item.line_total_normalized !== null && !hasExactTrace(lineTotalPath)) {
      errors.push(
        `TRACEABILITY VIOLATION: Missing source_trace for '${lineTotalPath}' with value ${item.line_total_normalized}`
      );
    }
  });

  // Check dates normalized fields - REQUIRED
  const dateFields: Array<{ path: string; value: string | null }> = [
    { path: 'dates.document_date_normalized', value: result.dates.document_date_normalized },
    {
      path: 'dates.service_period_start_normalized',
      value: result.dates.service_period_start_normalized,
    },
    {
      path: 'dates.service_period_end_normalized',
      value: result.dates.service_period_end_normalized,
    },
    { path: 'dates.due_date_normalized', value: result.dates.due_date_normalized },
  ];

  for (const { path, value } of dateFields) {
    if (value !== null && !hasExactTrace(path)) {
      errors.push(`TRACEABILITY VIOLATION: Missing source_trace for '${path}' with value ${value}`);
    }
  }

  // Check transaction_dates normalized fields - REQUIRED (handle missing/empty array)
  const transactionDates = result.dates?.transaction_dates ?? [];
  transactionDates.forEach((txDate, idx) => {
    const txDatePath = `dates.transaction_dates[${idx}].normalized`;
    if (txDate.normalized !== null && !hasExactTrace(txDatePath)) {
      errors.push(
        `TRACEABILITY VIOLATION: Missing source_trace for '${txDatePath}' with value ${txDate.normalized}`
      );
    }
  });

  // Check doc_type - REQUIRED (separate from classifications)
  if (!hasExactTrace('doc_type')) {
    errors.push(
      `TRACEABILITY VIOLATION: Missing source_trace for 'doc_type' with value ${result.doc_type}`
    );
  }

  // Check all classification fields - REQUIRED
  if (!hasExactTrace('classifications.primary_category')) {
    errors.push(
      `TRACEABILITY VIOLATION: Missing source_trace for 'classifications.primary_category' with value ${result.classifications.primary_category}`
    );
  }
  if (!hasExactTrace('classifications.sub_category')) {
    errors.push(
      `TRACEABILITY VIOLATION: Missing source_trace for 'classifications.sub_category' with value ${result.classifications.sub_category}`
    );
  }

  // Check classification boolean flags when non-null - REQUIRED
  const classificationBooleans: Array<{ path: string; value: boolean | null }> = [
    { path: 'classifications.is_recurring', value: result.classifications.is_recurring },
    { path: 'classifications.is_personal', value: result.classifications.is_personal },
    { path: 'classifications.is_business', value: result.classifications.is_business },
    { path: 'classifications.is_child_related', value: result.classifications.is_child_related },
    {
      path: 'classifications.is_spousal_support_related',
      value: result.classifications.is_spousal_support_related,
    },
  ];

  for (const { path, value } of classificationBooleans) {
    if (value !== null && !hasExactTrace(path)) {
      errors.push(`TRACEABILITY VIOLATION: Missing source_trace for '${path}' with value ${value}`);
    }
  }

  // Verify ledger_actions reference valid amounts - WARNING only
  result.ledger_actions_proposed.forEach((action, idx) => {
    if (action.action_type === 'ADD_TRANSACTION' && action.transaction.suggested_amount !== null) {
      const allAmounts = [
        result.amounts.total_amount_normalized,
        result.amounts.subtotal_normalized,
        result.amounts.payment_amount_normalized,
        ...result.line_items.map((li) => li.line_total_normalized),
      ].filter((a) => a !== null) as number[];

      const matches = allAmounts.some(
        (a) => Math.abs(a - action.transaction.suggested_amount!) < 0.01
      );
      if (!matches && allAmounts.length > 0) {
        warnings.push(
          `Ledger action[${idx}] proposes amount ${action.transaction.suggested_amount} not found in extracted amounts`
        );
      }
    }
  });

  return { valid: errors.length === 0, errors, warnings };
}

// Export types derived from Zod schemas (single source of truth - no manual interfaces)
export type LedgerAction = LedgerActionFromSchema;
export type SourceTrace = SourceTraceFromSchema;
export type DocumentIntakeResult = DocumentIntakeResultFromSchema;

const DOCUMENT_INTAKE_PROMPT = `You are the Document Intake & Auto-Categorization Engine for a financial and legal evidence system.

Your job is:

1. Take any uploaded document or photo (after OCR) and:
   - Identify its document type.
   - Extract all relevant financial and legal fields.
   - Propose the correct category and ledger impact.
   - ALWAYS present the proposal for human approval before anything is finalized.

2. Guarantee that every number, date, and classification in the structured output can be traced back to the uploaded document or image.

3. Support multilingual documents (for example English or Spanish) but keep all numeric values and original document text unchanged.

DOCUMENT TYPE CLASSIFICATION:
- "bank_statement"
- "credit_card_statement"
- "check_image"
- "deposit_slip"
- "invoice"
- "receipt"
- "utility_bill"
- "loan_mortgage_statement"
- "paystub"
- "tax_document"
- "court_order"
- "legal_motion_or_filing"
- "escrow_closing_statement"
- "insurance_policy_or_bill"
- "contract_or_agreement"
- "other_financial"
- "other_legal"
- "unknown"

Choose the most specific type that fits the text.

BEHAVIORAL RULES:
1. NEVER silently commit anything. Your role is to *propose* ledger actions and classifications and explicitly request user approval via the approval_request block.
2. Every numeric field and classification must be backed by at least one source_trace entry so a human can see where it came from in the document.
3. If something is not clearly present in the document, set the corresponding normalized field to null and explain why in errors_or_warnings. Do NOT invent or guess specific amounts or dates.
4. If the document is ambiguous or partially unreadable, focus on what you can confidently extract and be explicit about your uncertainty via the confidence and errors_or_warnings sections.
5. Your response MUST be valid JSON.`;

export async function analyzeDocumentWithIntake(
  rawText: string,
  fileName: string,
  mimeType: string,
  languageHint: string = 'en',
  uiLanguage: string = 'en',
  existingContext?: {
    known_accounts?: string[];
    known_vendors?: string[];
    known_categories?: string[];
    user_profile?: {
      jurisdiction?: string;
      currency?: string;
    };
  }
): Promise<DocumentIntakeResult> {
  const inputPayload = {
    raw_text: rawText,
    file_name: fileName,
    mime_type: mimeType,
    language_hint: languageHint,
    ui_language: uiLanguage,
    existing_context: existingContext || {
      known_accounts: [],
      known_vendors: [],
      known_categories: [
        'Housing',
        'Transportation',
        'Utilities',
        'Food',
        'Insurance',
        'Child Support',
        'Alimony',
        'Legal Fees',
        'Income',
        'Debt Payment',
        'Tax',
        'Other',
      ],
      user_profile: {
        jurisdiction: 'US',
        currency: 'USD',
      },
    },
  };

  const prompt = `${DOCUMENT_INTAKE_PROMPT}

INPUT:
${JSON.stringify(inputPayload, null, 2)}

Respond with a complete JSON object following the structured output schema. Include doc_type, summary, parties, amounts, dates, accounts, line_items, classifications, ledger_actions_proposed, source_trace, confidence, approval_request, and errors_or_warnings.`;

  try {
    const response = await openai.get().chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content || '{}';
    const rawResult = JSON.parse(content);

    // Construct the result with defaults for missing fields
    const result: DocumentIntakeResult = {
      doc_type: rawResult.doc_type || 'unknown',
      doc_language: rawResult.doc_language || languageHint,
      summary: rawResult.summary || 'Document analysis in progress',
      parties: rawResult.parties || {
        payer_name: null,
        payee_name: null,
        issuer_name: null,
        account_holder: null,
        other_parties: [],
      },
      amounts: rawResult.amounts || {
        currency: 'USD',
        total_amount_original: null,
        total_amount_normalized: null,
        subtotal_original: null,
        subtotal_normalized: null,
        tax_original: null,
        tax_normalized: null,
        fees_original: null,
        fees_normalized: null,
        interest_original: null,
        interest_normalized: null,
        payment_amount_original: null,
        payment_amount_normalized: null,
        balance_before_original: null,
        balance_before_normalized: null,
        balance_after_original: null,
        balance_after_normalized: null,
      },
      dates: rawResult.dates || {
        document_date_original: null,
        document_date_normalized: null,
        service_period_start_original: null,
        service_period_start_normalized: null,
        service_period_end_original: null,
        service_period_end_normalized: null,
        due_date_original: null,
        due_date_normalized: null,
        transaction_dates: [],
      },
      accounts: rawResult.accounts || {
        account_number_masked: null,
        routing_number_masked: null,
        iban_or_other: null,
        loan_or_mortgage_id_masked: null,
        card_last4: null,
      },
      line_items: rawResult.line_items || [],
      classifications: rawResult.classifications || {
        primary_category: 'Other',
        sub_category: 'Unknown',
        is_recurring: null,
        is_personal: null,
        is_business: null,
        is_child_related: null,
        is_spousal_support_related: null,
      },
      ledger_actions_proposed: rawResult.ledger_actions_proposed || [],
      source_trace: rawResult.source_trace || [],
      confidence: rawResult.confidence || {
        overall: 0.5,
        per_field: {},
      },
      approval_request: rawResult.approval_request || {
        ui_language: uiLanguage,
        message_to_user: 'Please review the extracted information.',
        questions_for_user: [],
        fields_user_should_review: [],
      },
      errors_or_warnings: rawResult.errors_or_warnings || [],
    };

    // Validate result against canonical schema immediately after LLM response
    const schemaValidation = documentIntakeResultSchema.safeParse(result);
    if (!schemaValidation.success) {
      console.warn('LLM response schema validation failed:', schemaValidation.error.errors);
      // Add schema errors to the result's errors_or_warnings
      result.errors_or_warnings = [
        ...result.errors_or_warnings,
        ...schemaValidation.error.errors.map(
          (e) => `Schema violation: ${e.path.join('.')} - ${e.message}`
        ),
      ];
    }

    // Run strict traceability validation
    const traceValidation = validateSourceTraceCompleteness(result);
    if (!traceValidation.valid) {
      console.warn('Traceability validation failed:', traceValidation.errors);
      result.errors_or_warnings = [...result.errors_or_warnings, ...traceValidation.errors];
    }
    if (traceValidation.warnings.length > 0) {
      result.errors_or_warnings = [...result.errors_or_warnings, ...traceValidation.warnings];
    }

    return result;
  } catch (error) {
    console.error('Document intake analysis failed:', error);
    return {
      doc_type: 'unknown',
      doc_language: languageHint,
      summary: 'Analysis failed - please review manually',
      parties: {
        payer_name: null,
        payee_name: null,
        issuer_name: null,
        account_holder: null,
        other_parties: [],
      },
      amounts: {
        currency: 'USD',
        total_amount_original: null,
        total_amount_normalized: null,
        subtotal_original: null,
        subtotal_normalized: null,
        tax_original: null,
        tax_normalized: null,
        fees_original: null,
        fees_normalized: null,
        interest_original: null,
        interest_normalized: null,
        payment_amount_original: null,
        payment_amount_normalized: null,
        balance_before_original: null,
        balance_before_normalized: null,
        balance_after_original: null,
        balance_after_normalized: null,
      },
      dates: {
        document_date_original: null,
        document_date_normalized: null,
        service_period_start_original: null,
        service_period_start_normalized: null,
        service_period_end_original: null,
        service_period_end_normalized: null,
        due_date_original: null,
        due_date_normalized: null,
        transaction_dates: [],
      },
      accounts: {
        account_number_masked: null,
        routing_number_masked: null,
        iban_or_other: null,
        loan_or_mortgage_id_masked: null,
        card_last4: null,
      },
      line_items: [],
      classifications: {
        primary_category: 'Other',
        sub_category: 'Unknown',
        is_recurring: null,
        is_personal: null,
        is_business: null,
        is_child_related: null,
        is_spousal_support_related: null,
      },
      ledger_actions_proposed: [],
      source_trace: [],
      confidence: {
        overall: 0,
        per_field: {},
      },
      approval_request: {
        ui_language: uiLanguage,
        message_to_user: 'Analysis failed. Please review and enter information manually.',
        questions_for_user: [],
        fields_user_should_review: [],
      },
      errors_or_warnings: [
        'Analysis failed due to an error. Please try again or enter information manually.',
      ],
    };
  }
}

export function mapDocTypeToCategory(docType: string): DocumentCategory {
  const mapping: Record<string, DocumentCategory> = {
    bank_statement: 'bank_statement',
    credit_card_statement: 'debt_statement',
    check_image: 'financial_statement',
    deposit_slip: 'financial_statement',
    invoice: 'financial_statement',
    receipt: 'financial_statement',
    utility_bill: 'financial_statement',
    loan_mortgage_statement: 'debt_statement',
    paystub: 'employment_record',
    tax_document: 'tax_return',
    court_order: 'court_order',
    legal_motion_or_filing: 'legal_filing',
    escrow_closing_statement: 'property_deed',
    insurance_policy_or_bill: 'insurance_document',
    contract_or_agreement: 'legal_filing',
    other_financial: 'financial_statement',
    other_legal: 'legal_filing',
    unknown: 'other',
  };
  return mapping[docType] || 'other';
}

import { LedgerBucket } from '@shared/schema';

export function mapCategoryToRecordType(
  category: string
): 'income' | 'expense' | 'asset' | 'debt' | 'unknown' {
  const ledgerBucket = mapCategoryToLedgerBucket(category);
  return mapLedgerBucketToRecordType(ledgerBucket);
}

export function mapCategoryToLedgerBucket(category: string): LedgerBucket {
  const categoryLower = category.toLowerCase();

  // INCOME bucket
  if (
    [
      'income',
      'salary',
      'wages',
      'payroll',
      'earnings',
      'bonus',
      'commission',
      'rental income',
      'refund',
      'reimbursement',
      'sales',
    ].some((k) => categoryLower.includes(k))
  ) {
    return 'INCOME';
  }

  // COGS bucket (Cost of Goods Sold)
  if (
    ['cost of goods', 'cogs', 'materials', 'inventory cost', 'manufacturing'].some((k) =>
      categoryLower.includes(k)
    )
  ) {
    return 'COGS';
  }

  // TAX bucket
  if (
    ['tax', 'income tax', 'sales tax', 'property tax', 'payroll tax', 'irs', 'taxes'].some((k) =>
      categoryLower.includes(k)
    )
  ) {
    return 'TAX';
  }

  // OWNER_EQUITY bucket
  if (
    [
      "owner's equity",
      'owner equity',
      'retained earnings',
      "owner's draw",
      'owner draw',
      'owner contribution',
    ].some((k) => categoryLower.includes(k))
  ) {
    return 'OWNER_EQUITY';
  }

  // TRANSFER bucket
  if (
    ['transfer', 'internal transfer', 'account transfer'].some((k) => categoryLower.includes(k))
  ) {
    return 'TRANSFER';
  }

  // EXPENSE bucket (most common default for costs)
  if (
    [
      'housing',
      'utilities',
      'transportation',
      'food',
      'insurance',
      'legal fees',
      'childcare',
      'education',
      'entertainment',
      'rent',
      'mortgage payment',
      'advertising',
      'marketing',
      'office',
      'travel',
      'meals',
      'subscriptions',
      'software',
      'repairs',
      'maintenance',
      'shipping',
      'telephone',
      'internet',
      'healthcare',
      'medical',
    ].some((k) => categoryLower.includes(k))
  ) {
    return 'EXPENSE';
  }

  // ASSET bucket
  if (
    [
      'real estate',
      'property',
      'investment',
      'savings',
      'bank account',
      'vehicle',
      'jewelry',
      'art',
      'equipment',
      'accounts receivable',
    ].some((k) => categoryLower.includes(k))
  ) {
    return 'ASSET';
  }

  // LIABILITY bucket (replaces old "debt")
  if (
    ['debt', 'loan', 'credit card', 'mortgage', 'owed', 'accounts payable', 'liability'].some((k) =>
      categoryLower.includes(k)
    )
  ) {
    return 'LIABILITY';
  }

  return 'UNKNOWN';
}

export function mapLedgerBucketToRecordType(
  bucket: LedgerBucket
): 'income' | 'expense' | 'asset' | 'debt' | 'unknown' {
  switch (bucket) {
    case 'INCOME':
      return 'income';
    case 'EXPENSE':
    case 'COGS':
    case 'TAX':
      return 'expense';
    case 'ASSET':
    case 'OWNER_EQUITY':
      return 'asset';
    case 'LIABILITY':
      return 'debt';
    case 'TRANSFER':
      return 'expense'; // Transfers appear as expenses in single-entry view
    default:
      return 'unknown';
  }
}
