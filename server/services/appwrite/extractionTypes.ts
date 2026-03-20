import { z } from 'zod';
import { CORE_LEDGER_BUCKETS, type CoreLedgerBucket } from '@shared/schema';

export const LedgerBucketSchema = z.enum(CORE_LEDGER_BUCKETS);

export const MoneyValueSchema = z.object({
  value: z.number(),
  currency: z.string().default('USD'),
});

export type MoneyValue = z.infer<typeof MoneyValueSchema>;

export const LineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().optional(),
  unit_price: MoneyValueSchema.optional(),
  line_total: MoneyValueSchema.optional(),
});

export type LineItem = z.infer<typeof LineItemSchema>;

export const ImageQualitySchema = z.object({
  blur: z.number().min(0).max(1).default(0),
  glare: z.number().min(0).max(1).default(0),
  crop_issue: z.number().min(0).max(1).default(0),
});

export type ImageQuality = z.infer<typeof ImageQualitySchema>;

export const DocTypeSchema = z.enum([
  'receipt',
  'invoice',
  'bank_statement',
  'credit_card_statement',
  'paystub',
  'court_filing',
  'photo_evidence',
  'other',
]);

export type DocType = z.infer<typeof DocTypeSchema>;

export const ExtractedFieldsSchema = z.object({
  vendor_name: z.string().nullable().default(null),
  payee: z.string().nullable().default(null),
  payer: z.string().nullable().default(null),
  document_date: z.string().nullable().default(null),
  transaction_date: z.string().nullable().default(null),
  statement_period_start: z.string().nullable().default(null),
  statement_period_end: z.string().nullable().default(null),
  total_amount: MoneyValueSchema.nullable().default(null),
  subtotal: MoneyValueSchema.nullable().default(null),
  tax_amount: MoneyValueSchema.nullable().default(null),
  tip_amount: MoneyValueSchema.nullable().default(null),
  shipping_amount: MoneyValueSchema.nullable().default(null),
  discount_amount: MoneyValueSchema.nullable().default(null),
  balance_due: MoneyValueSchema.nullable().default(null),
  previous_balance: MoneyValueSchema.nullable().default(null),
  new_balance: MoneyValueSchema.nullable().default(null),
  account_last4: z.string().nullable().default(null),
  invoice_number: z.string().nullable().default(null),
  order_number: z.string().nullable().default(null),
  check_number: z.string().nullable().default(null),
  payment_method: z
    .enum(['cash', 'credit', 'debit', 'ACH', 'check', 'transfer', 'unknown'])
    .default('unknown'),
  merchant_city: z.string().nullable().default(null),
  merchant_state: z.string().nullable().default(null),
  line_items: z.array(LineItemSchema).default([]),
});

export type ExtractedFields = z.infer<typeof ExtractedFieldsSchema>;

export const EvidenceSchema = z.object({
  source_file_id: z.string(),
  page_count: z.number().default(1),
  ocr_used: z.boolean().default(false),
  image_quality: ImageQualitySchema.default({ blur: 0, glare: 0, crop_issue: 0 }),
});

export type Evidence = z.infer<typeof EvidenceSchema>;

export const CategoryCandidateSchema = z.object({
  category: z.string(),
  score: z.number().min(0).max(1),
});

export type CategoryCandidate = z.infer<typeof CategoryCandidateSchema>;

export const ExtractionOutputSchema = z.object({
  doc_type: DocTypeSchema,
  suggested_category: z.string(),
  ledger_bucket: LedgerBucketSchema.default('UNKNOWN'),
  finance_category: z.string().optional(),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  keywords: z.array(z.string()).default([]),
  extracted: ExtractedFieldsSchema,
  evidence: EvidenceSchema,
  warnings: z.array(z.string()).default([]),
  needs_user_review: z.boolean().default(true),
  category_candidates: z.array(CategoryCandidateSchema).default([]),
});

export type ExtractionOutput = z.infer<typeof ExtractionOutputSchema>;

export const EvidencePointerSchema = z.object({
  line_number: z.number().optional(),
  line_text: z.string().optional(),
  region: z.string().optional(),
  page: z.number().optional(),
  raw_value: z.string().optional(),
});

export type EvidencePointer = z.infer<typeof EvidencePointerSchema>;

export const FieldVerificationSchema = z.object({
  ok: z.boolean(),
  reason: z.string(),
  evidence: EvidencePointerSchema.optional(),
});

export type FieldVerification = z.infer<typeof FieldVerificationSchema>;

export const DATE_FIELDS = [
  'document_date',
  'transaction_date',
  'statement_period_start',
  'statement_period_end',
] as const;

export const MONEY_FIELDS = [
  'total_amount',
  'subtotal',
  'tax_amount',
  'tip_amount',
  'shipping_amount',
  'discount_amount',
  'balance_due',
  'previous_balance',
  'new_balance',
] as const;

export const CRITICAL_FIELDS_REQUIRING_EVIDENCE = [...DATE_FIELDS, ...MONEY_FIELDS] as const;

export type CriticalField = (typeof CRITICAL_FIELDS_REQUIRING_EVIDENCE)[number];

export const VerificationReportSchema = z.object({
  verified: z.record(z.string(), FieldVerificationSchema),
  overall_ok: z.boolean(),
  confidence_adjustment: z.number().min(-0.2).max(0.2).default(0),
  must_review: z.boolean(),
  fields_missing_evidence: z.array(z.string()).default([]),
});

export type VerificationReport = z.infer<typeof VerificationReportSchema>;

export function hasValidEvidence(verification: FieldVerification): boolean {
  if (!verification.evidence) return false;
  const ev = verification.evidence;
  return !!(ev.line_text || ev.raw_value || (ev.line_number !== undefined && ev.line_number > 0));
}

export function getFieldsMissingEvidence(
  verified: Record<string, FieldVerification>,
  extractedFields: ExtractedFields
): string[] {
  const missing: string[] = [];

  for (const field of CRITICAL_FIELDS_REQUIRING_EVIDENCE) {
    const value = extractedFields[field as keyof ExtractedFields];
    if (value === null || value === undefined) continue;

    const verification = verified[field];
    if (!verification) {
      missing.push(field);
      continue;
    }

    if (!hasValidEvidence(verification)) {
      missing.push(field);
    }
  }

  return missing;
}

export const NormalizedAnalysisOutputSchema = z.object({
  model: z.string(),
  model_version: z.string(),
  analysis_run_id: z.string(),
  doc_type: DocTypeSchema,
  suggested_category: z.string(),
  ledger_bucket: LedgerBucketSchema.default('UNKNOWN'),
  finance_category: z.string().optional(),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  keywords: z.array(z.string()).default([]),
  extracted: ExtractedFieldsSchema,
  evidence: EvidenceSchema,
  warnings: z.array(z.string()).default([]),
  needs_user_review: z.boolean(),
  category_candidates: z.array(CategoryCandidateSchema).default([]),
  category_requires_review: z.boolean().default(true),
  verification: VerificationReportSchema.optional(),
  extraction_pass_tokens: z
    .object({
      input: z.number(),
      output: z.number(),
    })
    .optional(),
  verification_pass_tokens: z
    .object({
      input: z.number(),
      output: z.number(),
    })
    .optional(),
  total_estimated_cost: z.number().optional(),
});

export type NormalizedAnalysisOutput = z.infer<typeof NormalizedAnalysisOutputSchema>;

export function parseExtractionOutput(json: unknown): ExtractionOutput | null {
  try {
    return ExtractionOutputSchema.parse(json);
  } catch {
    return null;
  }
}

export function parseVerificationReport(json: unknown): VerificationReport | null {
  try {
    return VerificationReportSchema.parse(json);
  } catch {
    return null;
  }
}

export function parseLegacyNormalizedOutput(json: unknown): Partial<NormalizedAnalysisOutput> {
  if (!json || typeof json !== 'object') {
    return {};
  }

  const obj = json as Record<string, unknown>;

  return {
    model: typeof obj.model === 'string' ? obj.model : undefined,
    model_version: typeof obj.model_version === 'string' ? obj.model_version : undefined,
    analysis_run_id: typeof obj.analysis_run_id === 'string' ? obj.analysis_run_id : undefined,
    doc_type: DocTypeSchema.safeParse(obj.doc_type).success ? (obj.doc_type as DocType) : 'other',
    suggested_category:
      typeof obj.suggested_category === 'string'
        ? obj.suggested_category
        : typeof obj.category === 'string'
          ? obj.category
          : 'Uncategorized',
    confidence: typeof obj.confidence === 'number' ? obj.confidence : 0,
    summary:
      typeof obj.summary === 'string'
        ? obj.summary
        : typeof obj.extractedText === 'string'
          ? obj.extractedText
          : '',
    keywords: Array.isArray(obj.keywords)
      ? obj.keywords.filter((k): k is string => typeof k === 'string')
      : [],
    extracted: ExtractedFieldsSchema.safeParse(obj.extracted).success
      ? (obj.extracted as ExtractedFields)
      : ExtractedFieldsSchema.parse({}),
    evidence: EvidenceSchema.safeParse(obj.evidence).success
      ? (obj.evidence as Evidence)
      : undefined,
    warnings: Array.isArray(obj.warnings)
      ? obj.warnings.filter((w): w is string => typeof w === 'string')
      : [],
    needs_user_review: typeof obj.needs_user_review === 'boolean' ? obj.needs_user_review : true,
  };
}

export const CONFIDENCE_THRESHOLD = 0.85;

export const REQUIRED_FIELDS_BY_DOC_TYPE: Record<DocType, (keyof ExtractedFields)[]> = {
  receipt: ['vendor_name', 'total_amount', 'transaction_date'],
  invoice: ['vendor_name', 'total_amount', 'document_date', 'invoice_number'],
  bank_statement: ['statement_period_start', 'statement_period_end', 'account_last4'],
  credit_card_statement: [
    'statement_period_start',
    'statement_period_end',
    'account_last4',
    'balance_due',
  ],
  paystub: ['payer', 'total_amount', 'document_date'],
  court_filing: ['document_date'],
  photo_evidence: [],
  other: [],
};
