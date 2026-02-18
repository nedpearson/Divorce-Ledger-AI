import { describe, it, expect } from 'vitest';
import { 
  compareDate, 
  compareAmount, 
  compareEntity,
  evaluateDocument,
  aggregateResults,
  calculateFalseFinalizationRate,
  generateReport,
  formatReportSummary,
} from '../golden-set/evaluator';
import { GOLDEN_SET_DOCUMENTS } from '../golden-set/fixtures';
import { createMockExtraction } from '../golden-set/ci-validate';

describe('Golden Set Comparators', () => {
  describe('compareDate', () => {
    it('should match exact dates', () => {
      expect(compareDate('2024-01-15', '2024-01-15')).toBe(true);
    });

    it('should match dates with different separators', () => {
      expect(compareDate('2024-01-15', '2024/01/15')).toBe(true);
    });

    it('should reject different dates', () => {
      expect(compareDate('2024-01-15', '2024-01-16')).toBe(false);
    });

    it('should handle undefined actual', () => {
      expect(compareDate('2024-01-15', undefined)).toBe(false);
    });
  });

  describe('compareAmount', () => {
    it('should match exact amounts', () => {
      expect(compareAmount(100.00, 100.00)).toBe(true);
    });

    it('should match amounts within tolerance', () => {
      expect(compareAmount(100.00, 100.50)).toBe(true);
      expect(compareAmount(100.00, 101.00)).toBe(true);
    });

    it('should reject amounts outside tolerance', () => {
      expect(compareAmount(100.00, 110.00)).toBe(false);
    });

    it('should handle undefined actual', () => {
      expect(compareAmount(100.00, undefined)).toBe(false);
    });

    it('should handle zero amounts', () => {
      expect(compareAmount(0, 0)).toBe(true);
    });
  });

  describe('compareEntity', () => {
    it('should match exact names', () => {
      expect(compareEntity('Chase Bank', 'Chase Bank')).toBe(true);
    });

    it('should match case-insensitive', () => {
      expect(compareEntity('Chase Bank', 'chase bank')).toBe(true);
    });

    it('should match partial names', () => {
      expect(compareEntity('Chase', 'Chase Bank')).toBe(true);
      expect(compareEntity('Chase Bank', 'Chase')).toBe(true);
    });

    it('should handle undefined actual', () => {
      expect(compareEntity('Chase', undefined)).toBe(false);
    });
  });
});

describe('Golden Set Fixtures', () => {
  it('should have at least 10 documents', () => {
    expect(GOLDEN_SET_DOCUMENTS.length).toBeGreaterThanOrEqual(10);
  });

  it('should have unique IDs', () => {
    const ids = GOLDEN_SET_DOCUMENTS.map(d => d.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should have valid categories', () => {
    for (const doc of GOLDEN_SET_DOCUMENTS) {
      expect(doc.category).toBeTruthy();
      expect(typeof doc.category).toBe('string');
    }
  });

  it('should have expected extractions', () => {
    for (const doc of GOLDEN_SET_DOCUMENTS) {
      expect(doc.expectedExtraction).toBeDefined();
    }
  });

  it('should have some documents requiring review', () => {
    const requireReview = GOLDEN_SET_DOCUMENTS.filter(d => !d.shouldAutoFinalize);
    expect(requireReview.length).toBeGreaterThan(0);
  });
});

describe('Document Evaluation', () => {
  it('should evaluate a document correctly', () => {
    const golden = GOLDEN_SET_DOCUMENTS[0];
    const mockExtraction = createMockExtraction(golden);
    const result = evaluateDocument(golden, mockExtraction);

    expect(result.documentId).toBe(golden.id);
    expect(result.documentName).toBe(golden.name);
    expect(result.metrics).toBeDefined();
    expect(result.metrics.categoryAccuracy).toBe(true);
  });

  it('should detect category mismatch', () => {
    const golden = GOLDEN_SET_DOCUMENTS[0];
    const mockExtraction = createMockExtraction(golden);
    mockExtraction.suggested_category = 'wrong_category';
    
    const result = evaluateDocument(golden, mockExtraction);
    
    expect(result.metrics.categoryAccuracy).toBe(false);
    expect(result.errors.some(e => e.includes('Category mismatch'))).toBe(true);
  });

  it('should detect false finalization', () => {
    const golden = GOLDEN_SET_DOCUMENTS.find(d => !d.shouldAutoFinalize)!;
    const mockExtraction = createMockExtraction(golden);
    mockExtraction.needs_user_review = false;
    
    const result = evaluateDocument(golden, mockExtraction);
    
    expect(result.metrics.falseFinalization).toBe(true);
  });
});

describe('Report Generation', () => {
  it('should generate a valid report', () => {
    const results = GOLDEN_SET_DOCUMENTS.slice(0, 3).map(golden => {
      const mockExtraction = createMockExtraction(golden);
      return evaluateDocument(golden, mockExtraction);
    });

    const report = generateReport(results);

    expect(report.timestamp).toBeTruthy();
    expect(report.totalDocuments).toBe(3);
    expect(report.metrics).toBeDefined();
    expect(report.metrics.dateAccuracy).toBeGreaterThanOrEqual(0);
    expect(report.metrics.amountAccuracy).toBeGreaterThanOrEqual(0);
    expect(report.metrics.categoryAccuracy).toBeGreaterThanOrEqual(0);
  });

  it('should calculate false finalization rate', () => {
    const results = GOLDEN_SET_DOCUMENTS.map(golden => {
      const mockExtraction = createMockExtraction(golden);
      return evaluateDocument(golden, mockExtraction);
    });

    const rate = calculateFalseFinalizationRate(results);
    expect(rate).toBeGreaterThanOrEqual(0);
    expect(rate).toBeLessThanOrEqual(1);
  });

  it('should format report summary', () => {
    const results = GOLDEN_SET_DOCUMENTS.slice(0, 3).map(golden => {
      const mockExtraction = createMockExtraction(golden);
      return evaluateDocument(golden, mockExtraction);
    });

    const report = generateReport(results);
    const summary = formatReportSummary(report);

    expect(summary).toContain('GOLDEN SET EVALUATION REPORT');
    expect(summary).toContain('Date Accuracy');
    expect(summary).toContain('Amount Accuracy');
    expect(summary).toContain('Category Accuracy');
    expect(summary).toContain('False Finalization Rate');
  });
});

describe('Aggregate Metrics', () => {
  it('should aggregate results correctly', () => {
    const results = GOLDEN_SET_DOCUMENTS.slice(0, 5).map(golden => {
      const mockExtraction = createMockExtraction(golden);
      return evaluateDocument(golden, mockExtraction);
    });

    const aggregate = aggregateResults(results);

    expect(aggregate.dateAccuracy).toBeGreaterThanOrEqual(0);
    expect(aggregate.dateAccuracy).toBeLessThanOrEqual(1);
    expect(aggregate.amountAccuracy).toBeGreaterThanOrEqual(0);
    expect(aggregate.categoryAccuracy).toBeGreaterThanOrEqual(0);
  });
});
