import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('sharp', () => {
  const createMockSharp = () => ({
    greyscale: vi.fn().mockReturnThis(),
    resize: vi.fn().mockReturnThis(),
    convolve: vi.fn().mockReturnThis(),
    raw: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockImplementation(({ resolveWithObject }) => {
      if (resolveWithObject) {
        return Promise.resolve({
          data: Buffer.from(Array(1000).fill(128)),
          info: { width: 100, height: 100, channels: 3 },
        });
      }
      return Promise.resolve(Buffer.from(Array(1000).fill(128)));
    }),
    metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
  });

  return {
    default: vi.fn().mockImplementation(() => createMockSharp()),
  };
});

import {
  analyzeImageQuality,
  formatQualityFeedback,
  ImageQualityScore,
} from '../imageQualityAnalyzer';
import { analyzePdfType, PdfAnalysisResult } from '../pdfAnalyzer';

describe('Image Quality Analyzer', () => {
  describe('analyzeImageQuality', () => {
    it('should return quality scores for an image buffer', async () => {
      const testBuffer = Buffer.from('fake image data');
      const result = await analyzeImageQuality(testBuffer);

      expect(result).toHaveProperty('overall');
      expect(result).toHaveProperty('blur');
      expect(result).toHaveProperty('glare');
      expect(result).toHaveProperty('lowLight');
      expect(result).toHaveProperty('crop');
      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('suggestions');
      expect(result).toHaveProperty('isPoorQuality');

      expect(typeof result.overall).toBe('number');
      expect(result.overall).toBeGreaterThanOrEqual(0);
      expect(result.overall).toBeLessThanOrEqual(1);
    });

    it('should return arrays for issues and suggestions', async () => {
      const testBuffer = Buffer.from('fake image data');
      const result = await analyzeImageQuality(testBuffer);

      expect(Array.isArray(result.issues)).toBe(true);
      expect(Array.isArray(result.suggestions)).toBe(true);
    });
  });

  describe('formatQualityFeedback', () => {
    it('should return empty string for good quality', () => {
      const goodQuality: ImageQualityScore = {
        overall: 0.85,
        blur: 0.9,
        glare: 0.8,
        lowLight: 0.85,
        crop: 0.9,
        issues: [],
        suggestions: [],
        isPoorQuality: false,
      };

      expect(formatQualityFeedback(goodQuality)).toBe('');
    });

    it('should return formatted feedback for poor quality', () => {
      const poorQuality: ImageQualityScore = {
        overall: 0.35,
        blur: 0.3,
        glare: 0.4,
        lowLight: 0.5,
        crop: 0.3,
        issues: ['Image appears blurry', 'Document may be cropped'],
        suggestions: ['Hold camera steady', 'Fill frame with document'],
        isPoorQuality: true,
      };

      const feedback = formatQualityFeedback(poorQuality);
      expect(feedback).toContain('Image quality issues detected');
      expect(feedback).toContain('Image appears blurry');
      expect(feedback).toContain('Suggestions');
    });
  });
});

describe('PDF Analyzer', () => {
  describe('analyzePdfType', () => {
    it('should detect digital-native PDF with font objects', async () => {
      const digitalPdfData = Buffer.from(`
        %PDF-1.4
        /Type /Page
        /Font /F1
        /Text something
        BT (Hello) Tj
      `);

      const result = await analyzePdfType(digitalPdfData);

      expect(result.isScanned).toBe(false);
      expect(result.type).toBe('digital-native');
      expect(result.hasText).toBe(true);
      expect(result.needsOcr).toBe(false);
    });

    it('should detect scanned PDF with only image objects', async () => {
      const scannedPdfData = Buffer.from(`
        %PDF-1.4
        /Type /Page
        /XObject /Image
        /Image stream
      `);

      const result = await analyzePdfType(scannedPdfData);

      expect(result.isScanned).toBe(true);
      expect(result.type).toBe('scanned');
      expect(result.hasText).toBe(false);
      expect(result.needsOcr).toBe(true);
    });

    it('should detect mixed PDF with both fonts and images', async () => {
      const mixedPdfData = Buffer.from(`
        %PDF-1.4
        /Type /Page
        /Font /F1
        /Text something
        BT (Hello) Tj
        /XObject /Image
        /Image stream
      `);

      const result = await analyzePdfType(mixedPdfData);

      expect(result.type).toBe('mixed');
      expect(result.needsOcr).toBe(false);
    });

    it('should return unknown for unrecognizable PDF', async () => {
      const unknownPdfData = Buffer.from('%PDF-1.4\n/Type /Page\n');

      const result = await analyzePdfType(unknownPdfData);

      expect(result.type).toBe('unknown');
      expect(result.needsOcr).toBe(true);
    });

    it('should include confidence scores', async () => {
      const pdfData = Buffer.from(`
        %PDF-1.4
        /Type /Page
        /Font /F1
      `);

      const result = await analyzePdfType(pdfData);

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });
});

describe('Quality Gate Integration', () => {
  it('should set isPoorQuality when blur score is low', async () => {
    const testBuffer = Buffer.from('test');
    const result = await analyzeImageQuality(testBuffer);

    expect(typeof result.isPoorQuality).toBe('boolean');
  });

  it('should include suggestions for poor quality images', async () => {
    const poorQuality: ImageQualityScore = {
      overall: 0.3,
      blur: 0.2,
      glare: 0.8,
      lowLight: 0.7,
      crop: 0.9,
      issues: ['Image appears blurry'],
      suggestions: ['Hold camera steady or use a tripod'],
      isPoorQuality: true,
    };

    expect(poorQuality.suggestions.length).toBeGreaterThan(0);
    expect(poorQuality.suggestions[0]).toContain('camera');
  });

  it('should recommend retake for poor quality', () => {
    const poorQuality: ImageQualityScore = {
      overall: 0.25,
      blur: 0.2,
      glare: 0.3,
      lowLight: 0.4,
      crop: 0.3,
      issues: ['Image appears blurry', 'Image has glare'],
      suggestions: ['Hold camera steady', 'Reduce glare'],
      isPoorQuality: true,
    };

    const feedback = formatQualityFeedback(poorQuality);
    expect(feedback).toContain('Suggestions');
  });
});
