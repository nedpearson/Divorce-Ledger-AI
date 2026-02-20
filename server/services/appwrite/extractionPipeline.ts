import {
  ExtractionOutput,
  VerificationReport,
  NormalizedAnalysisOutput,
  ExtractedFields,
  DocType,
  CategoryCandidate,
  CONFIDENCE_THRESHOLD,
  REQUIRED_FIELDS_BY_DOC_TYPE,
  parseExtractionOutput,
  parseVerificationReport,
  getFieldsMissingEvidence,
  CRITICAL_FIELDS_REQUIRING_EVIDENCE,
} from './extractionTypes';

const CATEGORY_CONFIDENCE_THRESHOLD = 0.90;
import {
  callLLM,
  estimateLLMCost,
  getConfiguredModel,
  getModelInfo,
  type ModelName,
} from './llmProvider';
import crypto from 'crypto';

// Get the configured model (defaults to Claude 3.5 Sonnet)
const CONFIGURED_MODEL = getConfiguredModel();
const MODEL_INFO = getModelInfo(CONFIGURED_MODEL);
const MODEL_VERSION = MODEL_INFO.model;
const MODEL_PROVIDER = MODEL_INFO.provider;
const PROMPT_VERSION = 'v2.1.0'; // Bumped version for multi-provider support

console.log(`[Document Analysis] Using ${CONFIGURED_MODEL} (${MODEL_VERSION})`);

const EXTRACTION_PROMPT = `You are a forensic financial document analyzer. Extract structured data from the provided document.

EXTRACTION TARGETS (attempt for every file):
- dates: document_date, transaction_date, statement_period_start, statement_period_end (format: YYYY-MM-DD)
- money: total_amount, subtotal, tax_amount, tip_amount, shipping_amount, discount_amount, balance_due, previous_balance, new_balance
- entities: vendor_name, payee, payer, account_last4, invoice_number, order_number, check_number
- line items (when present): [{description, quantity, unit_price, line_total}]
- payment_method: cash/credit/debit/ACH/check/transfer/unknown
- location: merchant_city, merchant_state (if present)
- currency: ISO code (default USD)

OUTPUT MUST BE STRICT JSON, NO MARKDOWN. Use this exact schema:

{
  "doc_type": "receipt|invoice|bank_statement|credit_card_statement|paystub|court_filing|photo_evidence|other",
  "suggested_category": "string describing the document category",
  "ledger_bucket": "INCOME|EXPENSE|ASSET|LIABILITY|UNKNOWN",
  "finance_category": "internal category (e.g., 'utilities', 'salary_wages', 'mortgage', 'bank_account')",
  "confidence": 0.0 to 1.0,
  "summary": "brief summary of the document",
  "keywords": ["relevant", "keywords"],
  "extracted": {
    "vendor_name": "string or null",
    "payee": "string or null",
    "payer": "string or null",
    "document_date": "YYYY-MM-DD or null",
    "transaction_date": "YYYY-MM-DD or null",
    "statement_period_start": "YYYY-MM-DD or null",
    "statement_period_end": "YYYY-MM-DD or null",
    "total_amount": {"value": 0.0, "currency": "USD"} or null,
    "subtotal": {"value": 0.0, "currency": "USD"} or null,
    "tax_amount": {"value": 0.0, "currency": "USD"} or null,
    "tip_amount": {"value": 0.0, "currency": "USD"} or null,
    "shipping_amount": {"value": 0.0, "currency": "USD"} or null,
    "discount_amount": {"value": 0.0, "currency": "USD"} or null,
    "balance_due": {"value": 0.0, "currency": "USD"} or null,
    "previous_balance": {"value": 0.0, "currency": "USD"} or null,
    "new_balance": {"value": 0.0, "currency": "USD"} or null,
    "account_last4": "string or null",
    "invoice_number": "string or null",
    "order_number": "string or null",
    "check_number": "string or null",
    "payment_method": "cash|credit|debit|ACH|check|transfer|unknown",
    "merchant_city": "string or null",
    "merchant_state": "string or null",
    "line_items": [{"description": "string", "quantity": 0.0, "unit_price": {"value": 0.0, "currency": "USD"}, "line_total": {"value": 0.0, "currency": "USD"}}]
  },
  "evidence": {
    "source_file_id": "PROVIDED_FILE_ID",
    "page_count": 1,
    "ocr_used": true,
    "image_quality": {"blur": 0.0, "glare": 0.0, "crop_issue": 0.0}
  },
  "warnings": ["any issues or uncertainties"],
  "needs_user_review": true,
  "category_candidates": [
    {"category": "primary category", "score": 0.95},
    {"category": "alternative category 1", "score": 0.7},
    {"category": "alternative category 2", "score": 0.5}
  ]
}

CATEGORIZATION POLICY:
- ALWAYS return top 3 category candidates with confidence scores
- Categories should be from: Financial/Bank Statement, Financial/Credit Card, Financial/Invoice, Financial/Receipt, Financial/Paystub, Legal/Court Filing, Legal/Agreement, Property/Deed, Property/Appraisal, Medical/Bill, Medical/Record, Evidence/Photo, Evidence/Communication, Other
- suggested_category should be the highest-scoring candidate
- If top category score < 0.90 OR second category score > 0.70, document needs category review

IMPORTANT:
- All money values must be numeric, not strings. Never store "$1,234.56" - store {"value": 1234.56, "currency": "USD"}
- Set needs_user_review=true if confidence < 0.85 or any critical field is uncertain
- Include warnings for any extracted values you're unsure about
- Return ONLY the JSON object, no markdown code blocks or explanations`;

const VERIFICATION_PROMPT = `You are a verification agent. Your job is to verify the accuracy of extracted data against the original document text.

You will receive:
1. The extracted JSON data from Pass A
2. The raw OCR/document text

For each critical field, verify it matches the source text and provide:
1. Verification status (ok: true/false)
2. Reason for the assessment
3. EVIDENCE POINTER - the exact line/region from the source text where the value was found

CRITICAL: For ALL date and money fields, you MUST provide evidence pointers with:
- line_number: approximate line number in source text (1-indexed)
- line_text: the exact text from that line containing the value
- raw_value: the raw string as it appears in the source (e.g., "$1,234.56", "June 15, 2024")

If you cannot find evidence for a field in the source text, set ok=false and leave evidence empty.

Return STRICT JSON with this exact schema:

{
  "verified": {
    "document_date": {
      "ok": true/false,
      "reason": "explanation",
      "evidence": {"line_number": 5, "line_text": "Date: 2024-06-15", "raw_value": "2024-06-15"}
    },
    "transaction_date": {
      "ok": true/false,
      "reason": "explanation",
      "evidence": {"line_number": 8, "line_text": "Transaction Date: 12/18/2024", "raw_value": "12/18/2024"}
    },
    "total_amount": {
      "ok": true/false,
      "reason": "explanation",
      "evidence": {"line_number": 15, "line_text": "Total Due: $401.07", "raw_value": "$401.07"}
    },
    "subtotal": {
      "ok": true/false,
      "reason": "explanation",
      "evidence": {"line_number": 12, "line_text": "Subtotal: $370.50", "raw_value": "$370.50"}
    },
    "tax_amount": {
      "ok": true/false,
      "reason": "explanation", 
      "evidence": {"line_number": 14, "line_text": "Tax (8.25%): $30.57", "raw_value": "$30.57"}
    },
    "vendor_name": {"ok": true/false, "reason": "explanation"},
    "line_items_sum": {"ok": true/false, "reason": "explanation if line items exist"}
  },
  "overall_ok": true/false,
  "confidence_adjustment": -0.2 to +0.2,
  "must_review": true/false,
  "fields_missing_evidence": ["list of field names where evidence could not be found"]
}

DATE FIELDS REQUIRING EVIDENCE: document_date, transaction_date, statement_period_start, statement_period_end
MONEY FIELDS REQUIRING EVIDENCE: total_amount, subtotal, tax_amount, tip_amount, shipping_amount, discount_amount, balance_due, previous_balance, new_balance

VERIFICATION RULES:
1. Check that dates found in source text match extracted dates - MUST provide evidence pointer
2. Check that monetary amounts match (within rounding tolerance of $0.01) - MUST provide evidence pointer
3. Check that vendor/payee names are correctly identified
4. If line_items exist, verify sum(line_total) approximately equals subtotal/total
5. Flag any discrepancies with ok=false and clear reason

Set must_review=true if:
- Any critical field verification failed
- Any date/money field is missing evidence pointer
- Confidence adjustment is negative
- Source text is unclear or ambiguous

Return ONLY the JSON object, no markdown code blocks.`;

interface PassResult {
  success: boolean;
  data: unknown;
  inputTokens: number;
  outputTokens: number;
  rawOutput: string;
  error?: string;
}

export async function runExtractionPass(
  content: string,
  fileId: string,
  isImage: boolean,
  mimeType?: string,
  imageBase64?: string
): Promise<PassResult> {
  const startTime = Date.now();
  
  try {
    const messageText = isImage && imageBase64
      ? `${EXTRACTION_PROMPT}\n\nFile ID for evidence.source_file_id: ${fileId}\n\nAnalyze this image and extract all financial data.`
      : `${EXTRACTION_PROMPT}\n\nFile ID for evidence.source_file_id: ${fileId}\n\nDocument text to analyze:\n\n${content}`;

    const response = await callLLM(
      EXTRACTION_PROMPT,
      {
        text: messageText,
        ...(isImage && imageBase64 && mimeType && { imageBase64, mimeType }),
      },
      CONFIGURED_MODEL
    );

    const rawOutput = response.text;
    const inputTokens = response.inputTokens;
    const outputTokens = response.outputTokens;

    const cleanedOutput = rawOutput
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleanedOutput);
    } catch {
      return {
        success: false,
        data: null,
        inputTokens,
        outputTokens,
        rawOutput,
        error: 'Failed to parse extraction JSON output',
      };
    }

    const extraction = parseExtractionOutput(parsed);
    if (!extraction) {
      return {
        success: false,
        data: parsed,
        inputTokens,
        outputTokens,
        rawOutput,
        error: 'Extraction output failed schema validation',
      };
    }

    return {
      success: true,
      data: extraction,
      inputTokens,
      outputTokens,
      rawOutput,
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      inputTokens: 0,
      outputTokens: 0,
      rawOutput: '',
      error: error instanceof Error ? error.message : 'Unknown extraction error',
    };
  }
}

export async function runVerificationPass(
  extraction: ExtractionOutput,
  sourceText: string
): Promise<PassResult> {
  try {
    const prompt = `${VERIFICATION_PROMPT}

EXTRACTED DATA (Pass A output):
${JSON.stringify(extraction, null, 2)}

SOURCE TEXT:
${sourceText}

Verify the extraction accuracy and return your assessment.`;

    const response = await callLLM(
      VERIFICATION_PROMPT,
      { text: prompt },
      CONFIGURED_MODEL
    );

    const rawOutput = response.text;
    const inputTokens = response.inputTokens;
    const outputTokens = response.outputTokens;

    const cleanedOutput = rawOutput
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleanedOutput);
    } catch {
      return {
        success: false,
        data: null,
        inputTokens,
        outputTokens,
        rawOutput,
        error: 'Failed to parse verification JSON output',
      };
    }

    const verification = parseVerificationReport(parsed);
    if (!verification) {
      return {
        success: false,
        data: parsed,
        inputTokens,
        outputTokens,
        rawOutput,
        error: 'Verification output failed schema validation',
      };
    }

    return {
      success: true,
      data: verification,
      inputTokens,
      outputTokens,
      rawOutput,
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      inputTokens: 0,
      outputTokens: 0,
      rawOutput: '',
      error: error instanceof Error ? error.message : 'Unknown verification error',
    };
  }
}

function runValidationGate(
  extraction: ExtractionOutput,
  verification: VerificationReport | null
): { needsReview: boolean; warnings: string[]; adjustedConfidence: number; fieldsMissingEvidence: string[] } {
  const warnings: string[] = [...extraction.warnings];
  let adjustedConfidence = extraction.confidence;
  let fieldsMissingEvidence: string[] = [];

  if (verification) {
    adjustedConfidence += verification.confidence_adjustment;
    adjustedConfidence = Math.max(0, Math.min(1, adjustedConfidence));
    
    if (verification.must_review) {
      warnings.push('Verification pass flagged for manual review');
    }
    
    for (const [field, result] of Object.entries(verification.verified)) {
      if (!result.ok) {
        warnings.push(`Verification failed for ${field}: ${result.reason}`);
      }
    }
    
    fieldsMissingEvidence = getFieldsMissingEvidence(
      verification.verified,
      extraction.extracted as ExtractedFields
    );
    
    if (verification.fields_missing_evidence && verification.fields_missing_evidence.length > 0) {
      for (const field of verification.fields_missing_evidence) {
        if (!fieldsMissingEvidence.includes(field)) {
          fieldsMissingEvidence.push(field);
        }
      }
    }
    
    for (const field of fieldsMissingEvidence) {
      warnings.push(`Field '${field}' is unverified - no evidence pointer found in source text`);
    }
  }

  if (adjustedConfidence < CONFIDENCE_THRESHOLD) {
    warnings.push(`Confidence ${adjustedConfidence.toFixed(2)} below threshold ${CONFIDENCE_THRESHOLD}`);
  }

  const docType = extraction.doc_type as DocType;
  const requiredFields = REQUIRED_FIELDS_BY_DOC_TYPE[docType] || [];
  const extracted = extraction.extracted as ExtractedFields;
  
  for (const field of requiredFields) {
    const value = extracted[field];
    if (value === null || value === undefined) {
      warnings.push(`Required field '${field}' missing for doc_type '${docType}'`);
    }
  }

  if (extracted.line_items && extracted.line_items.length > 0) {
    const lineTotal = extracted.line_items.reduce((sum, item) => {
      return sum + (item.line_total?.value || 0);
    }, 0);
    
    const subtotal = extracted.subtotal?.value || extracted.total_amount?.value;
    if (subtotal && Math.abs(lineTotal - subtotal) > 0.02 * subtotal) {
      warnings.push(`Line items sum (${lineTotal.toFixed(2)}) differs from subtotal/total (${subtotal.toFixed(2)}) by more than 2%`);
    }
  }

  const total = extracted.total_amount?.value || 0;
  const tax = extracted.tax_amount?.value || 0;
  const tip = extracted.tip_amount?.value || 0;
  const shipping = extracted.shipping_amount?.value || 0;
  
  if (total > 0 && (tax + tip + shipping) > total) {
    warnings.push('Tax/tip/shipping sum exceeds total amount');
  }

  const periodStart = extracted.statement_period_start;
  const periodEnd = extracted.statement_period_end;
  if (periodStart && periodEnd && periodStart > periodEnd) {
    warnings.push('Statement period start is after end date');
  }

  const transactionDate = extracted.transaction_date;
  if (transactionDate && periodStart && periodEnd) {
    if (transactionDate < periodStart || transactionDate > periodEnd) {
      warnings.push('Transaction date falls outside statement period');
    }
  }

  const needsReview = 
    adjustedConfidence < CONFIDENCE_THRESHOLD ||
    (verification && !verification.overall_ok) ||
    (verification && verification.must_review) ||
    requiredFields.some(f => extracted[f] === null || extracted[f] === undefined) ||
    fieldsMissingEvidence.length > 0;

  return { needsReview, warnings, adjustedConfidence, fieldsMissingEvidence };
}

export interface PipelineResult {
  success: boolean;
  normalizedOutput: NormalizedAnalysisOutput | null;
  extractionPass: PassResult;
  verificationPass: PassResult | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEstimatedCost: number;
  errors: string[];
}

export async function runTwoPassPipeline(
  content: string,
  fileId: string,
  analysisRunId: string,
  isImage: boolean,
  mimeType?: string,
  imageBase64?: string
): Promise<PipelineResult> {
  const errors: string[] = [];
  
  const extractionResult = await runExtractionPass(
    content,
    fileId,
    isImage,
    mimeType,
    imageBase64
  );

  if (!extractionResult.success || !extractionResult.data) {
    return {
      success: false,
      normalizedOutput: null,
      extractionPass: extractionResult,
      verificationPass: null,
      totalInputTokens: extractionResult.inputTokens,
      totalOutputTokens: extractionResult.outputTokens,
      totalEstimatedCost: estimateLLMCost(CONFIGURED_MODEL, extractionResult.inputTokens, extractionResult.outputTokens),
      errors: [extractionResult.error || 'Extraction pass failed'],
    };
  }

  const extraction = extractionResult.data as ExtractionOutput;

  const verificationResult = await runVerificationPass(extraction, content);
  
  let verification: VerificationReport | null = null;
  if (verificationResult.success && verificationResult.data) {
    verification = verificationResult.data as VerificationReport;
  } else {
    errors.push(verificationResult.error || 'Verification pass failed - proceeding without verification');
  }

  const { needsReview, warnings, adjustedConfidence, fieldsMissingEvidence } = runValidationGate(extraction, verification);

  const totalInputTokens = extractionResult.inputTokens + verificationResult.inputTokens;
  const totalOutputTokens = extractionResult.outputTokens + verificationResult.outputTokens;
  const totalEstimatedCost = estimateLLMCost(CONFIGURED_MODEL, totalInputTokens, totalOutputTokens);

  const categoryCandidates: CategoryCandidate[] = extraction.category_candidates || [];
  const topScore = categoryCandidates[0]?.score ?? 0;
  const secondScore = categoryCandidates[1]?.score ?? 0;
  const categoryRequiresReview = topScore < CATEGORY_CONFIDENCE_THRESHOLD || secondScore > 0.70;

  const normalizedOutput: NormalizedAnalysisOutput = {
    model: MODEL_PROVIDER,
    model_version: MODEL_VERSION,
    analysis_run_id: analysisRunId,
    doc_type: extraction.doc_type,
    suggested_category: extraction.suggested_category,
    ledger_bucket: extraction.ledger_bucket || "UNKNOWN",
    finance_category: extraction.finance_category,
    confidence: adjustedConfidence,
    summary: extraction.summary,
    keywords: extraction.keywords,
    extracted: extraction.extracted,
    evidence: extraction.evidence,
    warnings,
    needs_user_review: needsReview || categoryRequiresReview,
    category_candidates: categoryCandidates,
    category_requires_review: categoryRequiresReview,
    verification: verification || undefined,
    extraction_pass_tokens: {
      input: extractionResult.inputTokens,
      output: extractionResult.outputTokens,
    },
    verification_pass_tokens: {
      input: verificationResult.inputTokens,
      output: verificationResult.outputTokens,
    },
    total_estimated_cost: totalEstimatedCost,
  };

  return {
    success: true,
    normalizedOutput,
    extractionPass: extractionResult,
    verificationPass: verificationResult,
    totalInputTokens,
    totalOutputTokens,
    totalEstimatedCost,
    errors,
  };
}

export function getPromptVersionHash(): string {
  const promptContent = EXTRACTION_PROMPT + VERIFICATION_PROMPT;
  const hash = crypto.createHash('sha256').update(promptContent).digest('hex').substring(0, 16);
  return `${PROMPT_VERSION}:${hash}`;
}

export function computeTextHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export { MODEL_VERSION, MODEL_PROVIDER, PROMPT_VERSION };
