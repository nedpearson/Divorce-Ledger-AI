import {
  databases,
  DATABASE_ID,
  COLLECTIONS,
  FILE_STATUS,
  ID,
  Query,
  Permission,
  Role,
  initializeAppwrite,
} from './client';
import {
  AppwriteFile,
  getFile,
  getFileBuffer,
  updateFile,
  transitionFileStatus,
  getQueuedFiles,
  computeInputHash,
} from './fileService';
import { analyzeDocumentImage } from '../ai-capture.service';
import crypto from 'crypto';
import {
  checkIdempotency,
  createIdempotencyRecord,
  updateIdempotencyRecord,
  generateIdempotencyKey,
  generateRetryIdempotencyKey,
  checkFileGuardrails,
  checkProcessingGuardrails,
  registerProcessing,
  unregisterProcessing,
  incrementUsage,
  withRetry,
  DEFAULT_RETRY_POLICY,
  DEFAULT_LIMITS,
  cleanupStaleProcessings,
} from './processingGuardrails';
import {
  runTwoPassPipeline,
  MODEL_VERSION as PIPELINE_MODEL_VERSION,
  MODEL_PROVIDER as PIPELINE_MODEL_PROVIDER,
  getPromptVersionHash,
  computeTextHash,
} from './extractionPipeline';
import {
  NormalizedAnalysisOutput as NewNormalizedOutput,
  parseLegacyNormalizedOutput,
} from './extractionTypes';
import {
  analyzeImageQuality,
  formatQualityFeedback,
  ImageQualityScore,
} from './imageQualityAnalyzer';
import { analyzePdfType, extractTextFromDigitalPdf, PdfAnalysisResult } from './pdfAnalyzer';

export interface LegacyNormalizedAnalysisOutput {
  summary: string;
  keywords: string[];
  suggested_category: string;
  confidence: number;
  extracted_fields: Record<string, string | number | boolean | null>;
  warnings: string[];
  model: string;
  model_version: string;
  analysis_run_id: string;
}

export type NormalizedAnalysisOutput = NewNormalizedOutput | LegacyNormalizedAnalysisOutput;

export interface AnalysisRun {
  $id: string;
  fileId: string;
  userId: string;
  runType: 'ocr' | 'vision' | 'categorization';
  modelProvider: string;
  modelVersion: string;
  promptVersionHash: string;
  inputHash: string;
  ocrTextHash?: string;
  rawOutput: string;
  normalizedOutput: string;
  suggestedCategory?: string;
  confidence?: number;
  status: 'success' | 'failed' | 'timeout';
  errorMessage?: string;
  latencyMs?: number;
  requestTokens?: number;
  responseTokens?: number;
  estimatedCost?: number;
  $createdAt: string;
}

export interface CreateAnalysisRunInput {
  fileId: string;
  userId: string;
  runType: 'ocr' | 'vision' | 'categorization';
  modelProvider: string;
  modelVersion: string;
  promptVersionHash: string;
  inputHash: string;
  ocrTextHash?: string;
  rawOutput: string;
  normalizedOutput: string;
  suggestedCategory?: string;
  confidence?: number;
  status: 'success' | 'failed' | 'timeout';
  errorMessage?: string;
  latencyMs?: number;
  requestTokens?: number;
  responseTokens?: number;
  estimatedCost?: number;
}

export async function createAnalysisRun(input: CreateAnalysisRunInput): Promise<AnalysisRun> {
  initializeAppwrite();

  const doc = await databases.createDocument(
    DATABASE_ID,
    COLLECTIONS.ANALYSIS_RUNS,
    ID.unique(),
    input,
    [Permission.read(Role.user(input.userId))]
  );

  return doc as unknown as AnalysisRun;
}

export async function createAnalysisRunWithId(
  id: string,
  input: CreateAnalysisRunInput
): Promise<AnalysisRun> {
  initializeAppwrite();

  const doc = await databases.createDocument(DATABASE_ID, COLLECTIONS.ANALYSIS_RUNS, id, input, [
    Permission.read(Role.user(input.userId)),
  ]);

  return doc as unknown as AnalysisRun;
}

export async function getAnalysisRunsForFile(fileId: string): Promise<AnalysisRun[]> {
  initializeAppwrite();

  const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.ANALYSIS_RUNS, [
    Query.equal('fileId', fileId),
    Query.orderDesc('$createdAt'),
  ]);

  return result.documents as unknown as AnalysisRun[];
}

export async function getAnalysisRun(runId: string): Promise<AnalysisRun | null> {
  initializeAppwrite();
  try {
    const doc = await databases.getDocument(DATABASE_ID, COLLECTIONS.ANALYSIS_RUNS, runId);
    return doc as unknown as AnalysisRun;
  } catch {
    return null;
  }
}

export interface FinalizeDocumentInput {
  fileId: string;
  userId: string;
  analysisRunId: string;
  finalizedCategory: string;
  finalizedFields?: string;
}

export async function finalizeDocument(
  input: FinalizeDocumentInput
): Promise<{ success: boolean; error?: string }> {
  initializeAppwrite();

  const file = await getFile(input.fileId);
  if (!file) {
    return { success: false, error: 'File not found' };
  }

  if (file.userId !== input.userId) {
    return { success: false, error: 'Unauthorized' };
  }

  const analysisRun = await getAnalysisRun(input.analysisRunId);
  if (!analysisRun) {
    return { success: false, error: 'Analysis run not found' };
  }

  if (analysisRun.fileId !== input.fileId) {
    return { success: false, error: 'Analysis run does not belong to this file' };
  }

  await updateFile(input.fileId, {
    status: FILE_STATUS.FINALIZED,
    category: input.finalizedCategory,
    finalizedCategory: input.finalizedCategory,
    finalizedFields: input.finalizedFields || file.extractedFields,
    finalizedBy: input.userId,
    finalizedAt: new Date().toISOString(),
    finalizedFromAnalysisRunId: input.analysisRunId,
  });

  console.log(
    `[Appwrite Finalize] File ${input.fileId} finalized by user ${input.userId} from analysis run ${input.analysisRunId}`
  );

  return { success: true };
}

const CATEGORY_MAP: Record<string, string> = {
  bank_statement: 'financial',
  tax_return: 'financial',
  pay_stub: 'financial',
  invoice: 'financial',
  receipt: 'receipt',
  court_order: 'legal',
  contract: 'legal',
  agreement: 'legal',
  medical_record: 'medical',
  insurance: 'medical',
  deed: 'property',
  appraisal: 'property',
  mortgage: 'property',
  email: 'correspondence',
  letter: 'correspondence',
  photo: 'evidence',
  screenshot: 'evidence',
};

function inferCategory(
  text: string,
  aiCategory?: string
): { category: string; confidence: number } {
  if (aiCategory && CATEGORY_MAP[aiCategory.toLowerCase()]) {
    return { category: CATEGORY_MAP[aiCategory.toLowerCase()], confidence: 0.9 };
  }

  const lowerText = text.toLowerCase();

  if (
    lowerText.includes('bank') ||
    lowerText.includes('statement') ||
    lowerText.includes('account balance')
  ) {
    return { category: 'financial', confidence: 0.8 };
  }
  if (
    lowerText.includes('tax') ||
    lowerText.includes('irs') ||
    lowerText.includes('w-2') ||
    lowerText.includes('1099')
  ) {
    return { category: 'financial', confidence: 0.85 };
  }
  if (lowerText.includes('court') || lowerText.includes('order') || lowerText.includes('judge')) {
    return { category: 'legal', confidence: 0.8 };
  }
  if (lowerText.includes('receipt') || lowerText.includes('total') || lowerText.includes('paid')) {
    return { category: 'receipt', confidence: 0.7 };
  }
  if (
    lowerText.includes('medical') ||
    lowerText.includes('doctor') ||
    lowerText.includes('patient')
  ) {
    return { category: 'medical', confidence: 0.75 };
  }
  if (
    lowerText.includes('property') ||
    lowerText.includes('deed') ||
    lowerText.includes('mortgage')
  ) {
    return { category: 'property', confidence: 0.75 };
  }

  return { category: 'other', confidence: 0.5 };
}

function detectFileType(mimeType: string): 'pdf' | 'image' | 'spreadsheet' | 'document' | 'other' {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv')
    return 'spreadsheet';
  if (mimeType.includes('document') || mimeType.includes('msword') || mimeType === 'text/plain')
    return 'document';
  return 'other';
}

function extractKeywords(text: string): string[] {
  const keywords: string[] = [];
  const lowerText = text.toLowerCase();

  const financialTerms = [
    'bank',
    'account',
    'balance',
    'statement',
    'tax',
    'income',
    'expense',
    'payment',
    'deposit',
    'withdrawal',
    'credit',
    'debit',
  ];
  const legalTerms = [
    'court',
    'order',
    'judge',
    'attorney',
    'custody',
    'divorce',
    'settlement',
    'agreement',
    'legal',
    'motion',
    'hearing',
  ];
  const propertyTerms = [
    'property',
    'deed',
    'mortgage',
    'appraisal',
    'asset',
    'home',
    'real estate',
    'vehicle',
    'title',
  ];
  const medicalTerms = [
    'medical',
    'doctor',
    'patient',
    'hospital',
    'insurance',
    'prescription',
    'diagnosis',
    'treatment',
  ];

  [...financialTerms, ...legalTerms, ...propertyTerms, ...medicalTerms].forEach((term) => {
    if (lowerText.includes(term) && !keywords.includes(term)) {
      keywords.push(term);
    }
  });

  return keywords.slice(0, 10);
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateCost(inputTokens: number, outputTokens: number, model: string): number {
  // Legacy function - use estimateLLMCost from llmProvider instead
  // Kept for backward compatibility
  const rates: Record<string, { input: number; output: number }> = {
    'gemini-2.0-flash': { input: 0.00001, output: 0.00004 },
    'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-4o': { input: 0.0025, output: 0.01 },
    'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
  };
  const rate = rates[model] || rates['gemini-2.0-flash'];
  return inputTokens * rate.input + outputTokens * rate.output;
}

interface BuildNormalizedOutputParams {
  extractedText: string;
  aiCategory: string;
  confidence: number;
  model: string;
  modelVersion: string;
  analysisRunId: string;
  financialData?: any;
  warnings?: string[];
}

function buildNormalizedOutput(params: BuildNormalizedOutputParams): NormalizedAnalysisOutput {
  const {
    extractedText,
    aiCategory,
    confidence,
    model,
    modelVersion,
    analysisRunId,
    financialData,
    warnings = [],
  } = params;

  const summary =
    extractedText.length > 500 ? extractedText.substring(0, 497) + '...' : extractedText;

  const keywords = extractKeywords(extractedText);

  const extracted_fields: Record<string, string | number | boolean | null> = {};

  if (financialData) {
    if (financialData.amount) extracted_fields.amount = financialData.amount;
    if (financialData.vendor) extracted_fields.vendor = financialData.vendor;
    if (financialData.date) extracted_fields.date = financialData.date;
    if (financialData.type) extracted_fields.transaction_type = financialData.type;
  }

  return {
    summary,
    keywords,
    suggested_category: aiCategory,
    confidence,
    extracted_fields,
    warnings,
    model,
    model_version: modelVersion,
    analysis_run_id: analysisRunId,
  };
}

export interface AnalyzeFileOptions {
  isRetry?: boolean;
  retryNumber?: number;
  forceNew?: boolean;
}

export async function analyzeFile(
  fileId: string,
  options: AnalyzeFileOptions = {}
): Promise<{ success: boolean; error?: string; analysisRunId?: string }> {
  initializeAppwrite();

  const file = await getFile(fileId);
  if (!file) {
    return { success: false, error: 'File not found' };
  }

  const idempotencyKey = options.isRetry
    ? generateRetryIdempotencyKey(fileId, file.userId, options.retryNumber || 1)
    : generateIdempotencyKey(fileId, file.userId);

  if (!options.forceNew) {
    const existingRecord = await checkIdempotency(idempotencyKey);
    if (existingRecord) {
      if (existingRecord.status === 'processing') {
        return { success: false, error: 'Analysis already in progress' };
      }
      if (existingRecord.status === 'completed' && existingRecord.analysisRunId) {
        return { success: true, analysisRunId: existingRecord.analysisRunId };
      }
    }
  }

  const fileGuardrails = await checkFileGuardrails(file.fileSize, file.fileType);
  if (!fileGuardrails.allowed) {
    return { success: false, error: fileGuardrails.reason };
  }

  const processingGuardrails = await checkProcessingGuardrails(
    file.userId,
    file.retryCount || 0,
    DEFAULT_LIMITS,
    { skipRetryLimit: options.forceNew }
  );
  if (!processingGuardrails.allowed) {
    return { success: false, error: processingGuardrails.reason };
  }

  // Idempotency is optional - if collection doesn't exist, continue without it
  const idempotencyRecord = await createIdempotencyRecord(idempotencyKey, fileId, file.userId);
  // Note: idempotencyRecord can be null if collection doesn't exist

  const processingId = registerProcessing(fileId);
  const startTime = Date.now();

  try {
    await transitionFileStatus(fileId, FILE_STATUS.UPLOADED, FILE_STATUS.EXTRACTING);

    const fileBuffer = await getFileBuffer(file.storageFileId);
    const base64Data = fileBuffer.toString('base64');
    const inputHash = computeInputHash(base64Data.substring(0, 10000));

    await transitionFileStatus(fileId, FILE_STATUS.EXTRACTING, FILE_STATUS.ANALYZING);

    const fileType = detectFileType(file.fileType);
    const isImage = fileType === 'image';
    const isPdf = fileType === 'pdf';
    const analysisRunId = ID.unique();

    let imageQuality: ImageQualityScore | undefined;
    let pdfAnalysis: PdfAnalysisResult | undefined;
    let qualityWarnings: string[] = [];

    if (isImage) {
      imageQuality = await analyzeImageQuality(fileBuffer);
      if (imageQuality.isPoorQuality) {
        qualityWarnings = [
          ...imageQuality.issues,
          'Retake photo: ' + imageQuality.suggestions.join(', '),
        ];
        console.log(
          `[Appwrite Analysis] Image quality issues detected for ${fileId}:`,
          imageQuality.issues
        );
      }
    }

    if (isPdf) {
      pdfAnalysis = await analyzePdfType(fileBuffer);
      console.log(
        `[Appwrite Analysis] PDF ${fileId} type: ${pdfAnalysis.type}, needsOcr: ${pdfAnalysis.needsOcr}`
      );
    }

    let contentForPipeline = '';
    let imageBase64: string | undefined;
    let mimeType: string | undefined;
    let useVisionModel = false;

    if (isImage) {
      imageBase64 = base64Data;
      mimeType = file.fileType;
      contentForPipeline = `[Image: ${file.fileName}]`;
      useVisionModel = true;
    } else if (isPdf) {
      if (pdfAnalysis && !pdfAnalysis.needsOcr && pdfAnalysis.type === 'digital-native') {
        const extractedText = await extractTextFromDigitalPdf(fileBuffer);
        if (extractedText && extractedText.length > 100) {
          contentForPipeline = extractedText.substring(0, 50000);
          useVisionModel = false;
          console.log(
            `[Appwrite Analysis] Using extracted text for digital PDF ${fileId} (${extractedText.length} chars)`
          );
        } else {
          imageBase64 = base64Data;
          mimeType = file.fileType;
          contentForPipeline = `[PDF: ${file.fileName}]`;
          useVisionModel = true;
        }
      } else {
        imageBase64 = base64Data;
        mimeType = file.fileType;
        contentForPipeline = `[PDF: ${file.fileName}]`;
        useVisionModel = true;
      }
    } else if (fileType === 'spreadsheet') {
      contentForPipeline = `[Spreadsheet: ${file.fileName}] - Limited extraction available. Consider exporting as PDF for better analysis.`;
    } else if (fileType === 'document') {
      try {
        const textBuffer = Buffer.from(base64Data, 'base64');
        contentForPipeline = textBuffer.toString('utf-8').substring(0, 50000);
        if (!contentForPipeline || contentForPipeline.length < 10) {
          contentForPipeline = `[Document: ${file.fileName}] - Text extraction limited.`;
        }
      } catch {
        contentForPipeline = `[Document: ${file.fileName}] - Binary document, text extraction not available.`;
      }
    } else {
      contentForPipeline = `[File: ${file.fileName}] - Unsupported file type (${file.fileType}). Manual review recommended.`;
    }

    const pipelineResult = await runTwoPassPipeline(
      contentForPipeline,
      fileId,
      analysisRunId,
      useVisionModel,
      mimeType,
      imageBase64
    );

    const latencyMs = Date.now() - startTime;

    if (!pipelineResult.success || !pipelineResult.normalizedOutput) {
      const errorMessage = pipelineResult.errors.join('; ') || 'Two-pass pipeline failed';

      await updateFile(fileId, {
        status: FILE_STATUS.ERROR,
        errorMessage,
        retryCount: (file.retryCount || 0) + 1,
      });

      if (idempotencyRecord) {
        await updateIdempotencyRecord(idempotencyRecord.$id, 'failed');
      }
      unregisterProcessing(processingId);

      return { success: false, error: errorMessage };
    }

    const normalizedOutput = pipelineResult.normalizedOutput;

    if (qualityWarnings.length > 0) {
      normalizedOutput.warnings = [...normalizedOutput.warnings, ...qualityWarnings];
      normalizedOutput.needs_user_review = true;
    }

    if (imageQuality?.isPoorQuality) {
      normalizedOutput.needs_user_review = true;
    }

    const ocrTextHash = useVisionModel
      ? undefined
      : contentForPipeline
        ? computeTextHash(contentForPipeline)
        : undefined;

    const analysisRun = await createAnalysisRunWithId(analysisRunId, {
      fileId,
      userId: file.userId,
      runType: useVisionModel ? 'vision' : 'ocr',
      modelProvider: PIPELINE_MODEL_PROVIDER,
      modelVersion: PIPELINE_MODEL_VERSION,
      promptVersionHash: getPromptVersionHash(),
      inputHash,
      ocrTextHash,
      rawOutput: JSON.stringify({
        extraction: pipelineResult.extractionPass.rawOutput,
        verification: pipelineResult.verificationPass?.rawOutput,
      }),
      normalizedOutput: JSON.stringify(normalizedOutput),
      suggestedCategory: normalizedOutput.suggested_category,
      confidence: normalizedOutput.confidence,
      status: 'success',
      latencyMs,
      requestTokens: pipelineResult.totalInputTokens,
      responseTokens: pipelineResult.totalOutputTokens,
      estimatedCost: pipelineResult.totalEstimatedCost,
    });

    await incrementUsage(file.userId, pipelineResult.totalEstimatedCost);

    const finalStatus = normalizedOutput.needs_user_review
      ? FILE_STATUS.SUGGESTED
      : FILE_STATUS.FINALIZED;

    await updateFile(fileId, {
      status: finalStatus,
      suggestedCategory: normalizedOutput.suggested_category,
      extractedText: normalizedOutput.summary.substring(0, 50000),
      extractedFields: JSON.stringify(normalizedOutput.extracted),
      aiSummary: normalizedOutput.summary.substring(0, 2000),
      aiConfidence: normalizedOutput.confidence,
      latestAnalysisRunId: analysisRun.$id,
      analyzedAt: new Date().toISOString(),
    });

    if (idempotencyRecord) {
      await updateIdempotencyRecord(idempotencyRecord.$id, 'completed', analysisRun.$id);
    }
    unregisterProcessing(processingId);

    const reviewStatus = normalizedOutput.needs_user_review ? ' [NEEDS REVIEW]' : ' [FINALIZED]';
    console.log(
      `[Appwrite Analysis] File ${fileId} analyzed: ${normalizedOutput.suggested_category} (${(normalizedOutput.confidence * 100).toFixed(0)}%), ${latencyMs}ms, $${pipelineResult.totalEstimatedCost.toFixed(6)}${reviewStatus}`
    );

    return { success: true, analysisRunId: analysisRun.$id };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';

    await updateFile(fileId, {
      status: FILE_STATUS.ERROR,
      errorMessage: errorMsg,
      retryCount: (file.retryCount || 0) + 1,
    });

    if (idempotencyRecord) {
      await updateIdempotencyRecord(idempotencyRecord.$id, 'failed');
    }
    unregisterProcessing(processingId);

    return { success: false, error: errorMsg };
  }
}

let processingQueue = false;

export async function processQueue(): Promise<{
  processed: number;
  errors: number;
  skipped: number;
}> {
  if (processingQueue) {
    return { processed: 0, errors: 0, skipped: 0 };
  }

  processingQueue = true;
  let processed = 0;
  let errors = 0;
  let skipped = 0;

  try {
    cleanupStaleProcessings();

    const queuedFiles = await getQueuedFiles(DEFAULT_LIMITS.maxConcurrentProcessings);

    for (const file of queuedFiles) {
      const guardrails = await checkProcessingGuardrails(file.userId, file.retryCount || 0);
      if (!guardrails.allowed) {
        console.log(`[Appwrite Analysis] Skipping ${file.$id}: ${guardrails.reason}`);
        skipped++;
        continue;
      }

      try {
        const result = await withRetry(
          () => analyzeFile(file.$id),
          DEFAULT_RETRY_POLICY,
          (attempt, error, delay) => {
            console.log(
              `[Appwrite Analysis] Retry ${attempt} for ${file.$id} after ${delay}ms: ${error.message}`
            );
          }
        );

        if (result.success) {
          processed++;
        } else {
          console.error(`[Appwrite Analysis] File ${file.$id} analysis failed: ${result.error}`);
          errors++;

          // Mark file as ERROR if it has exceeded retry limit to prevent endless retries
          const currentRetryCount = file.retryCount || 0;
          if (currentRetryCount >= DEFAULT_LIMITS.maxRetries) {
            console.error(
              `[Appwrite Analysis] File ${file.$id} exceeded max retries (${currentRetryCount}/${DEFAULT_LIMITS.maxRetries}), marking as ERROR`
            );
            try {
              await updateFile(file.$id, {
                status: FILE_STATUS.ERROR,
                errorMessage: result.error || 'Max retries exceeded',
                retryCount: currentRetryCount + 1,
              });
            } catch (updateErr) {
              console.error(`[Appwrite Analysis] Failed to mark ${file.$id} as ERROR:`, updateErr);
            }
          }
        }
      } catch (retryError) {
        console.error(`[Appwrite Analysis] All retries failed for ${file.$id}:`, retryError);
        errors++;

        // Mark file as ERROR after all retries exhausted
        try {
          await updateFile(file.$id, {
            status: FILE_STATUS.ERROR,
            errorMessage:
              retryError instanceof Error ? retryError.message : 'Unknown error after retries',
            retryCount: (file.retryCount || 0) + 1,
          });
        } catch (updateErr) {
          console.error(
            `[Appwrite Analysis] Failed to mark ${file.$id} as ERROR after retries:`,
            updateErr
          );
        }
      }
    }
  } finally {
    processingQueue = false;
  }

  return { processed, errors, skipped };
}

export async function reanalyzeFile(
  fileId: string,
  userId: string
): Promise<{ success: boolean; error?: string; analysisRunId?: string }> {
  const file = await getFile(fileId);
  if (!file) {
    return { success: false, error: 'File not found' };
  }

  if (file.userId !== userId) {
    return { success: false, error: 'Unauthorized' };
  }

  await updateFile(fileId, {
    status: FILE_STATUS.UPLOADED,
    errorMessage: undefined,
  });

  return analyzeFile(fileId, {
    forceNew: true,
    isRetry: true,
    retryNumber: (file.retryCount || 0) + 1,
  });
}

let queueInterval: NodeJS.Timeout | null = null;

export function startQueueProcessor(intervalMs: number = 10000) {
  if (queueInterval) {
    return;
  }

  console.log(`[Appwrite Analysis] Starting queue processor (interval: ${intervalMs}ms)`);

  queueInterval = setInterval(async () => {
    const result = await processQueue();
    if (result.processed > 0 || result.errors > 0 || result.skipped > 0) {
      console.log(
        `[Appwrite Analysis] Queue: ${result.processed} success, ${result.errors} errors, ${result.skipped} skipped`
      );
    }
  }, intervalMs);
}

export function stopQueueProcessor() {
  if (queueInterval) {
    clearInterval(queueInterval);
    queueInterval = null;
    console.log('[Appwrite Analysis] Queue processor stopped');
  }
}

export async function backfillUncategorizedDocuments(userId: string): Promise<{
  total: number;
  processed: number;
  errors: number;
  results: Array<{ fileId: string; success: boolean; error?: string }>;
}> {
  initializeAppwrite();

  const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.FILES, [
    Query.equal('userId', userId),
    Query.or([
      Query.isNull('category'),
      Query.equal('category', ''),
      Query.equal('status', FILE_STATUS.ERROR),
    ]),
    Query.limit(100),
  ]);

  const files = result.documents as unknown as AppwriteFile[];
  const results: Array<{ fileId: string; success: boolean; error?: string }> = [];
  let processed = 0;
  let errors = 0;

  console.log(
    `[Appwrite Backfill] Found ${files.length} uncategorized documents for user ${userId}`
  );

  for (const file of files) {
    try {
      await updateFile(file.$id, {
        status: FILE_STATUS.UPLOADED,
        errorMessage: undefined,
        retryCount: 0,
      });

      const analyzeResult = await analyzeFile(file.$id, { forceNew: true });

      if (analyzeResult.success) {
        processed++;
        results.push({ fileId: file.$id, success: true });
      } else {
        errors++;
        results.push({ fileId: file.$id, success: false, error: analyzeResult.error });
      }
    } catch (err) {
      errors++;
      results.push({
        fileId: file.$id,
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  console.log(
    `[Appwrite Backfill] Completed: ${processed} processed, ${errors} errors out of ${files.length} total`
  );

  return { total: files.length, processed, errors, results };
}

export async function getUncategorizedCount(userId: string): Promise<number> {
  initializeAppwrite();

  const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.FILES, [
    Query.equal('userId', userId),
    Query.or([Query.isNull('category'), Query.equal('category', '')]),
    Query.limit(1),
  ]);

  return result.total;
}
