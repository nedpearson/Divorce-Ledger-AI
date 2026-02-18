import {
  GoldenSetDocument,
  ExpectedExtraction,
  EvaluationResult,
  DocumentMetrics,
  AccuracyMetric,
  GoldenSetReport,
  AggregateMetrics,
  BaselineMetrics,
} from './types';
import { GOLDEN_SET_DOCUMENTS } from './fixtures';
import { getPromptVersionHash, MODEL_VERSION } from '../extractionPipeline';
import { NormalizedAnalysisOutput } from '../extractionTypes';
import fs from 'fs';
import path from 'path';

const BASELINE_FILE = path.join(__dirname, 'baseline.json');
const REPORTS_DIR = path.join(__dirname, 'reports');

const TOLERANCE = {
  AMOUNT_PERCENT: 0.01,
  DATE_EXACT: true,
};

export function compareDate(expected: string, actual: string | undefined): boolean {
  if (!actual) return false;
  const normalizedExpected = expected.replace(/\//g, '-').substring(0, 10);
  const normalizedActual = actual.replace(/\//g, '-').substring(0, 10);
  return normalizedExpected === normalizedActual;
}

export function compareAmount(expected: number, actual: number | undefined, tolerance = TOLERANCE.AMOUNT_PERCENT): boolean {
  if (actual === undefined || actual === null) return false;
  if (expected === 0 && actual === 0) return true;
  const diff = Math.abs(expected - actual);
  const percentDiff = diff / Math.abs(expected);
  return percentDiff <= tolerance;
}

export function compareEntity(expectedName: string, actualName: string | undefined): boolean {
  if (!actualName) return false;
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalize(expectedName).includes(normalize(actualName)) || 
         normalize(actualName).includes(normalize(expectedName));
}

export function evaluateDocument(
  golden: GoldenSetDocument,
  extracted: NormalizedAnalysisOutput
): EvaluationResult {
  const errors: string[] = [];
  const expected = golden.expectedExtraction;

  const dateMetric = evaluateDates(expected, extracted, errors);
  const amountMetric = evaluateAmounts(expected, extracted, errors);
  const entityMetric = evaluateEntities(expected, extracted, errors);
  const lineItemMetric = evaluateLineItems(expected, extracted, errors);

  const categoryMatch = extracted.suggested_category?.toLowerCase() === golden.category.toLowerCase();
  if (!categoryMatch) {
    errors.push(`Category mismatch: expected "${golden.category}", got "${extracted.suggested_category}"`);
  }

  const shouldHaveFinalized = golden.shouldAutoFinalize;
  const didFinalize = !extracted.needs_user_review;
  const correctlyFinalized = shouldHaveFinalized === didFinalize;
  const falseFinalization = !shouldHaveFinalized && didFinalize;

  if (falseFinalization) {
    errors.push(`False finalization: document should require review but was auto-finalized`);
  }

  const metrics: DocumentMetrics = {
    dateAccuracy: dateMetric,
    amountAccuracy: amountMetric,
    categoryAccuracy: categoryMatch,
    entityAccuracy: entityMetric,
    lineItemAccuracy: lineItemMetric,
    correctlyFinalized,
    falseFinalization,
  };

  const overallSuccess = 
    dateMetric.accuracy >= 0.8 &&
    amountMetric.accuracy >= 0.9 &&
    categoryMatch &&
    !falseFinalization;

  return {
    documentId: golden.id,
    documentName: golden.name,
    success: overallSuccess,
    metrics,
    errors,
  };
}

function evaluateDates(
  expected: ExpectedExtraction,
  extracted: NormalizedAnalysisOutput,
  errors: string[]
): AccuracyMetric {
  if (!expected.dates || expected.dates.length === 0) {
    return { total: 0, correct: 0, accuracy: 1 };
  }

  let correct = 0;
  const extractedFields = extracted.extracted;
  const dateFields = [
    extractedFields.document_date,
    extractedFields.transaction_date,
    extractedFields.statement_period_start,
    extractedFields.statement_period_end,
  ].filter(Boolean) as string[];

  for (const expDate of expected.dates) {
    const found = dateFields.some(d => compareDate(expDate.value, d));
    if (found) {
      correct++;
    } else {
      errors.push(`Date not found: ${expDate.field} = ${expDate.value}`);
    }
  }

  return {
    total: expected.dates.length,
    correct,
    accuracy: expected.dates.length > 0 ? correct / expected.dates.length : 1,
  };
}

function evaluateAmounts(
  expected: ExpectedExtraction,
  extracted: NormalizedAnalysisOutput,
  errors: string[]
): AccuracyMetric {
  if (!expected.amounts || expected.amounts.length === 0) {
    return { total: 0, correct: 0, accuracy: 1 };
  }

  let correct = 0;
  const extractedFields = extracted.extracted;
  const amountFields = [
    extractedFields.total_amount?.value,
    extractedFields.subtotal?.value,
    extractedFields.tax_amount?.value,
    extractedFields.tip_amount?.value,
    extractedFields.shipping_amount?.value,
    extractedFields.discount_amount?.value,
    extractedFields.balance_due?.value,
    extractedFields.previous_balance?.value,
    extractedFields.new_balance?.value,
  ].filter((v): v is number => v !== null && v !== undefined);

  for (const expAmount of expected.amounts) {
    const found = amountFields.some(a => compareAmount(expAmount.value, a));
    if (found) {
      correct++;
    } else {
      errors.push(`Amount not found: ${expAmount.field} = ${expAmount.value} ${expAmount.currency}`);
    }
  }

  return {
    total: expected.amounts.length,
    correct,
    accuracy: expected.amounts.length > 0 ? correct / expected.amounts.length : 1,
  };
}

function evaluateEntities(
  expected: ExpectedExtraction,
  extracted: NormalizedAnalysisOutput,
  errors: string[]
): AccuracyMetric {
  if (!expected.entities || expected.entities.length === 0) {
    return { total: 0, correct: 0, accuracy: 1 };
  }

  let correct = 0;
  const extractedFields = extracted.extracted;
  const entityFields = [
    extractedFields.vendor_name,
    extractedFields.payee,
    extractedFields.payer,
  ].filter((v): v is string => v !== null && v !== undefined);

  for (const expEntity of expected.entities) {
    const found = entityFields.some(e => compareEntity(expEntity.name, e));
    if (found) {
      correct++;
    } else {
      errors.push(`Entity not found: ${expEntity.field} = ${expEntity.name}`);
    }
  }

  return {
    total: expected.entities.length,
    correct,
    accuracy: expected.entities.length > 0 ? correct / expected.entities.length : 1,
  };
}

function evaluateLineItems(
  expected: ExpectedExtraction,
  extracted: NormalizedAnalysisOutput,
  errors: string[]
): AccuracyMetric {
  if (!expected.lineItems || expected.lineItems.length === 0) {
    return { total: 0, correct: 0, accuracy: 1 };
  }

  let correct = 0;
  const extractedItems = extracted.extracted?.line_items || [];

  for (const expItem of expected.lineItems) {
    const found = extractedItems.some((item) => {
      const lineTotal = item.line_total?.value;
      const unitPrice = item.unit_price?.value;
      return compareAmount(expItem.amount, lineTotal) || compareAmount(expItem.amount, unitPrice);
    });
    if (found) {
      correct++;
    } else {
      errors.push(`Line item not found: ${expItem.description} = ${expItem.amount}`);
    }
  }

  return {
    total: expected.lineItems.length,
    correct,
    accuracy: expected.lineItems.length > 0 ? correct / expected.lineItems.length : 1,
  };
}

export function aggregateResults(results: EvaluationResult[]): AggregateMetrics {
  const aggregate = (accessor: (r: EvaluationResult) => AccuracyMetric) => {
    let totalItems = 0;
    let correctItems = 0;
    for (const r of results) {
      const metric = accessor(r);
      totalItems += metric.total;
      correctItems += metric.correct;
    }
    return totalItems > 0 ? correctItems / totalItems : 1;
  };

  const categoryCorrect = results.filter(r => r.metrics.categoryAccuracy).length;

  return {
    dateAccuracy: aggregate(r => r.metrics.dateAccuracy),
    amountAccuracy: aggregate(r => r.metrics.amountAccuracy),
    categoryAccuracy: results.length > 0 ? categoryCorrect / results.length : 1,
    entityAccuracy: aggregate(r => r.metrics.entityAccuracy),
    lineItemAccuracy: aggregate(r => r.metrics.lineItemAccuracy),
  };
}

export function calculateFalseFinalizationRate(results: EvaluationResult[]): number {
  const shouldNotFinalize = results.filter(r => {
    const golden = GOLDEN_SET_DOCUMENTS.find(g => g.id === r.documentId);
    return golden && !golden.shouldAutoFinalize;
  });
  
  if (shouldNotFinalize.length === 0) return 0;
  
  const falselyFinalized = shouldNotFinalize.filter(r => r.metrics.falseFinalization);
  return falselyFinalized.length / shouldNotFinalize.length;
}

export function generateReport(results: EvaluationResult[]): GoldenSetReport {
  const aggregateMetrics = aggregateResults(results);
  const falseFinalizationRate = calculateFalseFinalizationRate(results);
  const passedDocuments = results.filter(r => r.success).length;

  const baseline = loadBaseline();
  let regressionStatus: 'pass' | 'fail' | 'baseline' = 'baseline';

  if (baseline) {
    const hasRegression = 
      aggregateMetrics.dateAccuracy < baseline.dateAccuracy - 0.02 ||
      aggregateMetrics.amountAccuracy < baseline.amountAccuracy - 0.02 ||
      aggregateMetrics.categoryAccuracy < baseline.categoryAccuracy - 0.02 ||
      falseFinalizationRate > baseline.falseFinalizationRate + 0.01;

    regressionStatus = hasRegression ? 'fail' : 'pass';
  }

  return {
    timestamp: new Date().toISOString(),
    modelVersion: MODEL_VERSION,
    promptVersionHash: getPromptVersionHash(),
    totalDocuments: results.length,
    passedDocuments,
    overallAccuracy: results.length > 0 ? passedDocuments / results.length : 0,
    metrics: aggregateMetrics,
    falseFinalizationRate,
    results,
    regressionStatus,
  };
}

export function loadBaseline(): BaselineMetrics | null {
  try {
    if (fs.existsSync(BASELINE_FILE)) {
      const data = fs.readFileSync(BASELINE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[GoldenSet] Failed to load baseline:', error);
  }
  return null;
}

export function saveBaseline(report: GoldenSetReport): void {
  const baseline: BaselineMetrics = {
    version: report.promptVersionHash,
    timestamp: report.timestamp,
    dateAccuracy: report.metrics.dateAccuracy,
    amountAccuracy: report.metrics.amountAccuracy,
    categoryAccuracy: report.metrics.categoryAccuracy,
    entityAccuracy: report.metrics.entityAccuracy,
    lineItemAccuracy: report.metrics.lineItemAccuracy,
    falseFinalizationRate: report.falseFinalizationRate,
  };

  fs.writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2));
  console.log('[GoldenSet] Baseline saved:', BASELINE_FILE);
}

export function saveReport(report: GoldenSetReport): string {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const filename = `report_${report.timestamp.replace(/[:.]/g, '-')}.json`;
  const filepath = path.join(REPORTS_DIR, filename);
  
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
  console.log('[GoldenSet] Report saved:', filepath);
  
  return filepath;
}

export function formatReportSummary(report: GoldenSetReport): string {
  const lines = [
    '═══════════════════════════════════════════════════════════════',
    '                    GOLDEN SET EVALUATION REPORT                ',
    '═══════════════════════════════════════════════════════════════',
    '',
    `Timestamp:        ${report.timestamp}`,
    `Model Version:    ${report.modelVersion}`,
    `Prompt Hash:      ${report.promptVersionHash}`,
    '',
    '───────────────────────────────────────────────────────────────',
    '                         SUMMARY                                ',
    '───────────────────────────────────────────────────────────────',
    `Documents Tested: ${report.totalDocuments}`,
    `Documents Passed: ${report.passedDocuments}`,
    `Overall Accuracy: ${(report.overallAccuracy * 100).toFixed(1)}%`,
    '',
    '───────────────────────────────────────────────────────────────',
    '                      FIELD ACCURACY                            ',
    '───────────────────────────────────────────────────────────────',
    `Date Accuracy:      ${(report.metrics.dateAccuracy * 100).toFixed(1)}%`,
    `Amount Accuracy:    ${(report.metrics.amountAccuracy * 100).toFixed(1)}%`,
    `Category Accuracy:  ${(report.metrics.categoryAccuracy * 100).toFixed(1)}%`,
    `Entity Accuracy:    ${(report.metrics.entityAccuracy * 100).toFixed(1)}%`,
    `Line Item Accuracy: ${(report.metrics.lineItemAccuracy * 100).toFixed(1)}%`,
    '',
    '───────────────────────────────────────────────────────────────',
    '                    FINALIZATION GATE                           ',
    '───────────────────────────────────────────────────────────────',
    `False Finalization Rate: ${(report.falseFinalizationRate * 100).toFixed(2)}%`,
    '',
    '───────────────────────────────────────────────────────────────',
    '                   REGRESSION STATUS                            ',
    '───────────────────────────────────────────────────────────────',
    `Status: ${report.regressionStatus.toUpperCase()}`,
    '',
    '═══════════════════════════════════════════════════════════════',
  ];

  if (report.regressionStatus === 'fail') {
    lines.push('');
    lines.push('⚠️  REGRESSION DETECTED - Changes should not be merged');
    lines.push('');
  }

  return lines.join('\n');
}
