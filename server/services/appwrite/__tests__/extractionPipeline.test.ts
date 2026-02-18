import { describe, it, expect } from 'vitest';
import {
  MoneyValueSchema,
  LineItemSchema,
  ExtractedFieldsSchema,
  ExtractionOutputSchema,
  VerificationReportSchema,
  DocTypeSchema,
  CategoryCandidateSchema,
  CONFIDENCE_THRESHOLD,
  REQUIRED_FIELDS_BY_DOC_TYPE,
  parseExtractionOutput,
  parseVerificationReport,
  parseLegacyNormalizedOutput,
  EvidencePointerSchema,
  FieldVerificationSchema,
  hasValidEvidence,
  getFieldsMissingEvidence,
  CRITICAL_FIELDS_REQUIRING_EVIDENCE,
  DATE_FIELDS,
  MONEY_FIELDS,
} from '../extractionTypes';

const CATEGORY_CONFIDENCE_THRESHOLD = 0.90;

describe('Extraction Types - Zod Schemas', () => {
  describe('MoneyValueSchema', () => {
    it('parses valid money value', () => {
      const result = MoneyValueSchema.parse({ value: 123.45, currency: 'USD' });
      expect(result.value).toBe(123.45);
      expect(result.currency).toBe('USD');
    });

    it('defaults currency to USD', () => {
      const result = MoneyValueSchema.parse({ value: 100 });
      expect(result.currency).toBe('USD');
    });

    it('rejects invalid money value', () => {
      expect(() => MoneyValueSchema.parse({ value: 'not a number' })).toThrow();
    });
  });

  describe('LineItemSchema', () => {
    it('parses valid line item with all fields', () => {
      const result = LineItemSchema.parse({
        description: 'Widget',
        quantity: 2,
        unit_price: { value: 10.00, currency: 'USD' },
        line_total: { value: 20.00, currency: 'USD' },
      });
      expect(result.description).toBe('Widget');
      expect(result.quantity).toBe(2);
      expect(result.line_total?.value).toBe(20.00);
    });

    it('parses line item with only description', () => {
      const result = LineItemSchema.parse({ description: 'Service fee' });
      expect(result.description).toBe('Service fee');
      expect(result.quantity).toBeUndefined();
    });
  });

  describe('DocTypeSchema', () => {
    it('accepts valid doc types', () => {
      const validTypes = ['receipt', 'invoice', 'bank_statement', 'credit_card_statement', 'paystub', 'court_filing', 'photo_evidence', 'other'];
      validTypes.forEach(type => {
        expect(DocTypeSchema.parse(type)).toBe(type);
      });
    });

    it('rejects invalid doc type', () => {
      expect(() => DocTypeSchema.parse('invalid_type')).toThrow();
    });
  });

  describe('ExtractedFieldsSchema', () => {
    it('parses with defaults for empty object', () => {
      const result = ExtractedFieldsSchema.parse({});
      expect(result.vendor_name).toBeNull();
      expect(result.total_amount).toBeNull();
      expect(result.payment_method).toBe('unknown');
      expect(result.line_items).toEqual([]);
    });

    it('parses complete extracted fields', () => {
      const result = ExtractedFieldsSchema.parse({
        vendor_name: 'Acme Corp',
        total_amount: { value: 250.00, currency: 'USD' },
        document_date: '2025-01-15',
        payment_method: 'credit',
        line_items: [
          { description: 'Item A', quantity: 1, line_total: { value: 100.00 } },
          { description: 'Item B', quantity: 2, line_total: { value: 150.00 } },
        ],
      });
      expect(result.vendor_name).toBe('Acme Corp');
      expect(result.total_amount?.value).toBe(250.00);
      expect(result.line_items.length).toBe(2);
    });
  });

  describe('ExtractionOutputSchema', () => {
    it('parses valid extraction output', () => {
      const result = ExtractionOutputSchema.parse({
        doc_type: 'receipt',
        suggested_category: 'Retail Purchase',
        confidence: 0.92,
        summary: 'Receipt from grocery store',
        keywords: ['grocery', 'food'],
        extracted: {
          vendor_name: 'Whole Foods',
          total_amount: { value: 87.50 },
        },
        evidence: {
          source_file_id: 'file123',
          page_count: 1,
          ocr_used: true,
          image_quality: { blur: 0.1, glare: 0.05, crop_issue: 0 },
        },
        warnings: [],
        needs_user_review: false,
      });
      expect(result.doc_type).toBe('receipt');
      expect(result.confidence).toBe(0.92);
    });
  });

  describe('VerificationReportSchema', () => {
    it('parses valid verification report', () => {
      const result = VerificationReportSchema.parse({
        verified: {
          document_date: { ok: true, reason: 'Matches source' },
          total_amount: { ok: true, reason: 'Amount verified' },
        },
        overall_ok: true,
        confidence_adjustment: 0.05,
        must_review: false,
      });
      expect(result.overall_ok).toBe(true);
      expect(result.confidence_adjustment).toBe(0.05);
    });

    it('clamps confidence_adjustment to valid range', () => {
      expect(() => VerificationReportSchema.parse({
        verified: {},
        overall_ok: true,
        confidence_adjustment: 0.5,
        must_review: false,
      })).toThrow();
    });
  });
});

describe('Extraction Types - Parse Functions', () => {
  describe('parseExtractionOutput', () => {
    it('returns null for invalid input', () => {
      expect(parseExtractionOutput(null)).toBeNull();
      expect(parseExtractionOutput({})).toBeNull();
      expect(parseExtractionOutput({ doc_type: 'invalid' })).toBeNull();
    });

    it('parses valid extraction output', () => {
      const valid = {
        doc_type: 'invoice',
        suggested_category: 'Bill',
        confidence: 0.88,
        summary: 'Invoice from vendor',
        extracted: {},
        evidence: { source_file_id: 'abc' },
        warnings: [],
        needs_user_review: true,
      };
      const result = parseExtractionOutput(valid);
      expect(result).not.toBeNull();
      expect(result?.doc_type).toBe('invoice');
    });
  });

  describe('parseVerificationReport', () => {
    it('returns null for invalid input', () => {
      expect(parseVerificationReport(null)).toBeNull();
      expect(parseVerificationReport({})).toBeNull();
    });

    it('parses valid verification report', () => {
      const valid = {
        verified: { test: { ok: true, reason: 'OK' } },
        overall_ok: true,
        confidence_adjustment: 0,
        must_review: false,
      };
      const result = parseVerificationReport(valid);
      expect(result).not.toBeNull();
      expect(result?.overall_ok).toBe(true);
    });
  });

  describe('parseLegacyNormalizedOutput', () => {
    it('returns empty object for null/undefined', () => {
      expect(parseLegacyNormalizedOutput(null)).toEqual({});
      expect(parseLegacyNormalizedOutput(undefined)).toEqual({});
    });

    it('extracts fields from legacy format', () => {
      const legacy = {
        category: 'Financial',
        confidence: 0.75,
        extractedText: 'Some extracted text content',
        warnings: ['Low confidence'],
      };
      const result = parseLegacyNormalizedOutput(legacy);
      expect(result.suggested_category).toBe('Financial');
      expect(result.confidence).toBe(0.75);
      expect(result.summary).toBe('Some extracted text content');
      expect(result.warnings).toEqual(['Low confidence']);
    });

    it('defaults doc_type to other for invalid values', () => {
      const legacy = { doc_type: 'invalid_type' };
      const result = parseLegacyNormalizedOutput(legacy);
      expect(result.doc_type).toBe('other');
    });
  });
});

describe('Extraction Types - Constants', () => {
  describe('CONFIDENCE_THRESHOLD', () => {
    it('is set to 0.85', () => {
      expect(CONFIDENCE_THRESHOLD).toBe(0.85);
    });
  });

  describe('REQUIRED_FIELDS_BY_DOC_TYPE', () => {
    it('defines required fields for receipt', () => {
      expect(REQUIRED_FIELDS_BY_DOC_TYPE.receipt).toContain('vendor_name');
      expect(REQUIRED_FIELDS_BY_DOC_TYPE.receipt).toContain('total_amount');
      expect(REQUIRED_FIELDS_BY_DOC_TYPE.receipt).toContain('transaction_date');
    });

    it('defines required fields for invoice', () => {
      expect(REQUIRED_FIELDS_BY_DOC_TYPE.invoice).toContain('vendor_name');
      expect(REQUIRED_FIELDS_BY_DOC_TYPE.invoice).toContain('invoice_number');
    });

    it('defines required fields for bank_statement', () => {
      expect(REQUIRED_FIELDS_BY_DOC_TYPE.bank_statement).toContain('statement_period_start');
      expect(REQUIRED_FIELDS_BY_DOC_TYPE.bank_statement).toContain('account_last4');
    });

    it('has empty requirements for photo_evidence', () => {
      expect(REQUIRED_FIELDS_BY_DOC_TYPE.photo_evidence).toEqual([]);
    });
  });
});

describe('Validation Gate Logic', () => {
  describe('Confidence threshold checks', () => {
    it('flags documents below 0.85 confidence for review', () => {
      const lowConfidence = 0.80;
      expect(lowConfidence < CONFIDENCE_THRESHOLD).toBe(true);
    });

    it('allows documents at or above 0.85 confidence', () => {
      const highConfidence = 0.90;
      expect(highConfidence >= CONFIDENCE_THRESHOLD).toBe(true);
    });
  });

  describe('Money sanity checks', () => {
    it('detects when line items sum differs from total', () => {
      const lineItems = [
        { description: 'Item 1', line_total: { value: 50.00, currency: 'USD' } },
        { description: 'Item 2', line_total: { value: 30.00, currency: 'USD' } },
      ];
      const lineTotal = lineItems.reduce((sum, item) => sum + (item.line_total?.value || 0), 0);
      const claimedTotal = 100.00;
      const tolerance = 0.02 * claimedTotal;
      
      expect(Math.abs(lineTotal - claimedTotal)).toBe(20);
      expect(Math.abs(lineTotal - claimedTotal) > tolerance).toBe(true);
    });

    it('passes when line items sum matches total within tolerance', () => {
      const lineItems = [
        { description: 'Item 1', line_total: { value: 50.00, currency: 'USD' } },
        { description: 'Item 2', line_total: { value: 49.50, currency: 'USD' } },
      ];
      const lineTotal = lineItems.reduce((sum, item) => sum + (item.line_total?.value || 0), 0);
      const claimedTotal = 100.00;
      const tolerance = 0.02 * claimedTotal;
      
      expect(Math.abs(lineTotal - claimedTotal) <= tolerance).toBe(true);
    });

    it('detects when taxes exceed total', () => {
      const total = 100.00;
      const tax = 120.00;
      expect(tax > total).toBe(true);
    });
  });

  describe('Date sanity checks', () => {
    it('detects when period start is after end', () => {
      const periodStart = '2025-01-31';
      const periodEnd = '2025-01-01';
      expect(periodStart > periodEnd).toBe(true);
    });

    it('detects transaction outside statement period', () => {
      const periodStart = '2025-01-01';
      const periodEnd = '2025-01-31';
      const transactionDate = '2025-02-15';
      expect(transactionDate < periodStart || transactionDate > periodEnd).toBe(true);
    });

    it('accepts transaction within statement period', () => {
      const periodStart = '2025-01-01';
      const periodEnd = '2025-01-31';
      const transactionDate = '2025-01-15';
      expect(transactionDate >= periodStart && transactionDate <= periodEnd).toBe(true);
    });
  });

  describe('Required field checks', () => {
    it('identifies missing required fields for receipt', () => {
      const extracted = ExtractedFieldsSchema.parse({
        vendor_name: 'Store',
      });
      const required = REQUIRED_FIELDS_BY_DOC_TYPE.receipt;
      const missing = required.filter(field => extracted[field] === null || extracted[field] === undefined);
      
      expect(missing).toContain('total_amount');
      expect(missing).toContain('transaction_date');
      expect(missing).not.toContain('vendor_name');
    });

    it('passes when all required fields present', () => {
      const extracted = ExtractedFieldsSchema.parse({
        vendor_name: 'Store',
        total_amount: { value: 50.00 },
        transaction_date: '2025-01-15',
      });
      const required = REQUIRED_FIELDS_BY_DOC_TYPE.receipt;
      const missing = required.filter(field => extracted[field] === null || extracted[field] === undefined);
      
      expect(missing.length).toBe(0);
    });
  });

  describe('Category candidate checks', () => {
    it('parses valid category candidate', () => {
      const result = CategoryCandidateSchema.parse({
        category: 'Financial/Receipt',
        score: 0.95,
      });
      expect(result.category).toBe('Financial/Receipt');
      expect(result.score).toBe(0.95);
    });

    it('rejects score outside 0-1 range', () => {
      expect(() => CategoryCandidateSchema.parse({
        category: 'Test',
        score: 1.5,
      })).toThrow();
    });

    it('requires category review when top score < 0.90', () => {
      const candidates = [
        { category: 'Financial/Receipt', score: 0.85 },
        { category: 'Financial/Invoice', score: 0.60 },
      ];
      const topScore = candidates[0]?.score ?? 0;
      const categoryRequiresReview = topScore < CATEGORY_CONFIDENCE_THRESHOLD;
      
      expect(categoryRequiresReview).toBe(true);
    });

    it('requires category review when second candidate score > 0.70', () => {
      const candidates = [
        { category: 'Financial/Receipt', score: 0.92 },
        { category: 'Financial/Invoice', score: 0.75 },
      ];
      const topScore = candidates[0]?.score ?? 0;
      const secondScore = candidates[1]?.score ?? 0;
      const categoryRequiresReview = topScore < CATEGORY_CONFIDENCE_THRESHOLD || secondScore > 0.70;
      
      expect(categoryRequiresReview).toBe(true);
    });

    it('does not require review when clear winner', () => {
      const candidates = [
        { category: 'Financial/Receipt', score: 0.95 },
        { category: 'Financial/Invoice', score: 0.50 },
      ];
      const topScore = candidates[0]?.score ?? 0;
      const secondScore = candidates[1]?.score ?? 0;
      const categoryRequiresReview = topScore < CATEGORY_CONFIDENCE_THRESHOLD || secondScore > 0.70;
      
      expect(categoryRequiresReview).toBe(false);
    });

    it('includes category_candidates in extraction output', () => {
      const valid = {
        doc_type: 'receipt',
        suggested_category: 'Financial/Receipt',
        confidence: 0.95,
        summary: 'Test receipt',
        extracted: {},
        evidence: { source_file_id: 'abc' },
        warnings: [],
        needs_user_review: false,
        category_candidates: [
          { category: 'Financial/Receipt', score: 0.95 },
          { category: 'Financial/Invoice', score: 0.40 },
        ],
      };
      const result = parseExtractionOutput(valid);
      expect(result).not.toBeNull();
      expect(result?.category_candidates.length).toBe(2);
      expect(result?.category_candidates[0].category).toBe('Financial/Receipt');
    });
  });
});

describe('Evidence Pointer Validation', () => {
  describe('EvidencePointerSchema', () => {
    it('parses complete evidence pointer', () => {
      const result = EvidencePointerSchema.parse({
        line_number: 10,
        line_text: 'Total: $401.07',
        raw_value: '$401.07',
        page: 1,
        region: 'bottom-right',
      });
      expect(result.line_number).toBe(10);
      expect(result.line_text).toBe('Total: $401.07');
      expect(result.raw_value).toBe('$401.07');
    });

    it('parses partial evidence pointer', () => {
      const result = EvidencePointerSchema.parse({
        line_text: 'Date: 2024-06-15',
      });
      expect(result.line_text).toBe('Date: 2024-06-15');
      expect(result.line_number).toBeUndefined();
    });

    it('parses empty evidence pointer', () => {
      const result = EvidencePointerSchema.parse({});
      expect(result.line_number).toBeUndefined();
      expect(result.line_text).toBeUndefined();
    });
  });

  describe('FieldVerificationSchema with evidence', () => {
    it('parses verification with evidence', () => {
      const result = FieldVerificationSchema.parse({
        ok: true,
        reason: 'Amount verified in source text',
        evidence: {
          line_number: 15,
          line_text: 'Total Due: $401.07',
          raw_value: '$401.07',
        },
      });
      expect(result.ok).toBe(true);
      expect(result.evidence?.line_number).toBe(15);
      expect(result.evidence?.raw_value).toBe('$401.07');
    });

    it('parses verification without evidence', () => {
      const result = FieldVerificationSchema.parse({
        ok: false,
        reason: 'Value not found in source text',
      });
      expect(result.ok).toBe(false);
      expect(result.evidence).toBeUndefined();
    });
  });

  describe('hasValidEvidence', () => {
    it('returns true for evidence with line_text', () => {
      expect(hasValidEvidence({
        ok: true,
        reason: 'OK',
        evidence: { line_text: 'Total: $100' },
      })).toBe(true);
    });

    it('returns true for evidence with raw_value', () => {
      expect(hasValidEvidence({
        ok: true,
        reason: 'OK',
        evidence: { raw_value: '$100.00' },
      })).toBe(true);
    });

    it('returns true for evidence with line_number > 0', () => {
      expect(hasValidEvidence({
        ok: true,
        reason: 'OK',
        evidence: { line_number: 5 },
      })).toBe(true);
    });

    it('returns false for evidence with only line_number = 0', () => {
      expect(hasValidEvidence({
        ok: true,
        reason: 'OK',
        evidence: { line_number: 0 },
      })).toBe(false);
    });

    it('returns false for empty evidence', () => {
      expect(hasValidEvidence({
        ok: true,
        reason: 'OK',
        evidence: {},
      })).toBe(false);
    });

    it('returns false for undefined evidence', () => {
      expect(hasValidEvidence({
        ok: true,
        reason: 'OK',
      })).toBe(false);
    });
  });

  describe('getFieldsMissingEvidence', () => {
    it('returns empty array when all fields have evidence', () => {
      const verified = {
        document_date: { ok: true, reason: 'OK', evidence: { line_text: 'Date: 2024-06-15' } },
        total_amount: { ok: true, reason: 'OK', evidence: { raw_value: '$100.00' } },
      };
      const extracted = {
        document_date: '2024-06-15',
        total_amount: { value: 100, currency: 'USD' },
        vendor_name: null,
        payee: null,
        payer: null,
        transaction_date: null,
        statement_period_start: null,
        statement_period_end: null,
        subtotal: null,
        tax_amount: null,
        tip_amount: null,
        shipping_amount: null,
        discount_amount: null,
        balance_due: null,
        previous_balance: null,
        new_balance: null,
        account_last4: null,
        invoice_number: null,
        order_number: null,
        check_number: null,
        payment_method: 'unknown' as const,
        merchant_city: null,
        merchant_state: null,
        line_items: [],
      };
      expect(getFieldsMissingEvidence(verified, extracted)).toEqual([]);
    });

    it('returns fields without evidence pointers', () => {
      const verified = {
        document_date: { ok: true, reason: 'OK', evidence: { line_text: 'Date: 2024-06-15' } },
        total_amount: { ok: true, reason: 'Guessed from context' },
      };
      const extracted = {
        document_date: '2024-06-15',
        total_amount: { value: 100, currency: 'USD' },
        vendor_name: null,
        payee: null,
        payer: null,
        transaction_date: null,
        statement_period_start: null,
        statement_period_end: null,
        subtotal: null,
        tax_amount: null,
        tip_amount: null,
        shipping_amount: null,
        discount_amount: null,
        balance_due: null,
        previous_balance: null,
        new_balance: null,
        account_last4: null,
        invoice_number: null,
        order_number: null,
        check_number: null,
        payment_method: 'unknown' as const,
        merchant_city: null,
        merchant_state: null,
        line_items: [],
      };
      const missing = getFieldsMissingEvidence(verified, extracted);
      expect(missing).toContain('total_amount');
      expect(missing).not.toContain('document_date');
    });

    it('returns fields not in verified at all', () => {
      const verified = {
        document_date: { ok: true, reason: 'OK', evidence: { line_text: 'Date: 2024-06-15' } },
      };
      const extracted = {
        document_date: '2024-06-15',
        total_amount: { value: 100, currency: 'USD' },
        vendor_name: null,
        payee: null,
        payer: null,
        transaction_date: null,
        statement_period_start: null,
        statement_period_end: null,
        subtotal: null,
        tax_amount: null,
        tip_amount: null,
        shipping_amount: null,
        discount_amount: null,
        balance_due: null,
        previous_balance: null,
        new_balance: null,
        account_last4: null,
        invoice_number: null,
        order_number: null,
        check_number: null,
        payment_method: 'unknown' as const,
        merchant_city: null,
        merchant_state: null,
        line_items: [],
      };
      const missing = getFieldsMissingEvidence(verified, extracted);
      expect(missing).toContain('total_amount');
    });

    it('ignores null fields', () => {
      const verified = {};
      const extracted = {
        document_date: null,
        total_amount: null,
        vendor_name: null,
        payee: null,
        payer: null,
        transaction_date: null,
        statement_period_start: null,
        statement_period_end: null,
        subtotal: null,
        tax_amount: null,
        tip_amount: null,
        shipping_amount: null,
        discount_amount: null,
        balance_due: null,
        previous_balance: null,
        new_balance: null,
        account_last4: null,
        invoice_number: null,
        order_number: null,
        check_number: null,
        payment_method: 'unknown' as const,
        merchant_city: null,
        merchant_state: null,
        line_items: [],
      };
      expect(getFieldsMissingEvidence(verified, extracted)).toEqual([]);
    });
  });

  describe('Critical Fields Constants', () => {
    it('DATE_FIELDS contains expected fields', () => {
      expect(DATE_FIELDS).toContain('document_date');
      expect(DATE_FIELDS).toContain('transaction_date');
      expect(DATE_FIELDS).toContain('statement_period_start');
      expect(DATE_FIELDS).toContain('statement_period_end');
    });

    it('MONEY_FIELDS contains expected fields', () => {
      expect(MONEY_FIELDS).toContain('total_amount');
      expect(MONEY_FIELDS).toContain('subtotal');
      expect(MONEY_FIELDS).toContain('tax_amount');
      expect(MONEY_FIELDS).toContain('previous_balance');
      expect(MONEY_FIELDS).toContain('new_balance');
    });

    it('CRITICAL_FIELDS_REQUIRING_EVIDENCE combines date and money fields', () => {
      expect(CRITICAL_FIELDS_REQUIRING_EVIDENCE.length).toBe(DATE_FIELDS.length + MONEY_FIELDS.length);
      for (const field of DATE_FIELDS) {
        expect(CRITICAL_FIELDS_REQUIRING_EVIDENCE).toContain(field);
      }
      for (const field of MONEY_FIELDS) {
        expect(CRITICAL_FIELDS_REQUIRING_EVIDENCE).toContain(field);
      }
    });
  });
});
