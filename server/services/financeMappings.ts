/**
 * financeMappings.ts - Central Finance Mapping Layer
 *
 * This module provides the single source of truth for mapping between:
 * 1. Internal finance model (simple, stable)
 * 2. External systems (QuickBooks, Firefly III)
 *
 * ARCHITECTURE:
 * - Internal model uses 5 core ledger buckets: INCOME, EXPENSE, ASSET, LIABILITY, UNKNOWN
 * - Extended QuickBooks-style buckets (COGS, TAX, OWNER_EQUITY, TRANSFER) are mapping targets only
 * - Mappings are applied ONLY when an integration is enabled and syncing/exporting
 */

import { CORE_LEDGER_BUCKETS, INTERNAL_FINANCE_CATEGORIES } from '@shared/schema';
import type { CoreLedgerBucket, InternalFinanceCategory } from '@shared/schema';

export { CORE_LEDGER_BUCKETS, INTERNAL_FINANCE_CATEGORIES };
export type { CoreLedgerBucket, InternalFinanceCategory };

// ============================================================================
// QUICKBOOKS MAPPING LAYER (Extended Buckets as Targets)
// ============================================================================

/**
 * QuickBooks uses extended account types beyond our internal model
 */
export const QUICKBOOKS_ACCOUNT_TYPES = [
  'Income',
  'Expense',
  'Cost of Goods Sold',
  'Other Income',
  'Other Expense',
  'Bank',
  'Accounts Receivable',
  'Other Current Asset',
  'Fixed Asset',
  'Other Asset',
  'Accounts Payable',
  'Credit Card',
  'Other Current Liability',
  'Long Term Liability',
  'Equity',
] as const;

export type QuickBooksAccountType = (typeof QUICKBOOKS_ACCOUNT_TYPES)[number];

/**
 * Maps internal ledger bucket to QuickBooks account type
 */
export function mapInternalBucketToQuickBooks(bucket: CoreLedgerBucket): QuickBooksAccountType {
  const mapping: Record<CoreLedgerBucket, QuickBooksAccountType> = {
    INCOME: 'Income',
    EXPENSE: 'Expense',
    ASSET: 'Other Current Asset',
    LIABILITY: 'Other Current Liability',
    UNKNOWN: 'Expense', // Default unknown to expense for safety
  };
  return mapping[bucket];
}

/**
 * Maps internal category to QuickBooks account name
 */
export function mapInternalCategoryToQuickBooksAccount(
  bucket: CoreLedgerBucket,
  category: string
): { accountType: QuickBooksAccountType; accountName: string } {
  const accountType = mapInternalBucketToQuickBooks(bucket);

  // Category-specific mapping overrides
  const categoryMappings: Record<string, { type: QuickBooksAccountType; name: string }> = {
    // COGS-like categories (map to QuickBooks COGS)
    materials: { type: 'Cost of Goods Sold', name: 'Materials' },
    supplies: { type: 'Cost of Goods Sold', name: 'Supplies' },

    // Tax-related
    income_tax: { type: 'Other Current Liability', name: 'Income Tax Payable' },
    property_tax: { type: 'Expense', name: 'Property Tax' },
    sales_tax: { type: 'Other Current Liability', name: 'Sales Tax Payable' },

    // Owner equity
    owners_draw: { type: 'Equity', name: "Owner's Draw" },
    retained_earnings: { type: 'Equity', name: 'Retained Earnings' },

    // Asset specifics
    bank_account: { type: 'Bank', name: 'Checking Account' },
    investment_account: { type: 'Other Asset', name: 'Investment Account' },
    real_property: { type: 'Fixed Asset', name: 'Real Estate' },
    vehicle: { type: 'Fixed Asset', name: 'Vehicles' },
    retirement_account: { type: 'Other Asset', name: 'Retirement Funds' },

    // Liability specifics
    mortgage: { type: 'Long Term Liability', name: 'Mortgage' },
    credit_card: { type: 'Credit Card', name: 'Credit Card' },
    auto_loan: { type: 'Long Term Liability', name: 'Auto Loan' },
    student_loan: { type: 'Long Term Liability', name: 'Student Loan' },
  };

  const override = categoryMappings[category.toLowerCase().replace(/[\s-]/g, '_')];
  if (override) {
    return { accountType: override.type, accountName: override.name };
  }

  // Default: use bucket type and capitalize category
  return {
    accountType,
    accountName: formatCategoryName(category),
  };
}

// ============================================================================
// FIREFLY III MAPPING LAYER
// ============================================================================

export const FIREFLY_TRANSACTION_TYPES = [
  'withdrawal',
  'deposit',
  'transfer',
  'opening-balance',
  'reconciliation',
] as const;

export type FireflyTransactionType = (typeof FIREFLY_TRANSACTION_TYPES)[number];

/**
 * Maps internal ledger bucket to Firefly transaction type
 */
export function mapInternalBucketToFirefly(bucket: CoreLedgerBucket): FireflyTransactionType {
  const mapping: Record<CoreLedgerBucket, FireflyTransactionType> = {
    INCOME: 'deposit',
    EXPENSE: 'withdrawal',
    ASSET: 'opening-balance',
    LIABILITY: 'opening-balance',
    UNKNOWN: 'withdrawal', // Default unknown to withdrawal for safety
  };
  return mapping[bucket];
}

/**
 * Maps internal category to Firefly category name
 */
export function mapInternalCategoryToFireflyCategory(
  bucket: CoreLedgerBucket,
  category: string
): string {
  // Firefly uses simpler category names
  const categoryMappings: Record<string, string> = {
    salary_wages: 'Salary',
    bonus_commission: 'Bonus',
    investment_income: 'Investment',
    rental_income: 'Rental Income',
    housing: 'Housing',
    utilities: 'Utilities',
    groceries: 'Groceries',
    transportation: 'Transportation',
    childcare: 'Childcare',
    healthcare: 'Medical',
    insurance: 'Insurance',
    legal_professional: 'Professional Services',
    entertainment: 'Entertainment',
    subscriptions: 'Subscriptions',
    child_support_paid: 'Child Support',
    alimony_paid: 'Alimony',
  };

  return (
    categoryMappings[category.toLowerCase().replace(/[\s-]/g, '_')] || formatCategoryName(category)
  );
}

/**
 * Full mapping for a Firefly transaction
 */
export interface FireflyTransactionMapping {
  type: FireflyTransactionType;
  category: string;
  description: string;
}

export function mapInternalRecordToFirefly(record: {
  bucket: CoreLedgerBucket;
  category: string;
  description?: string;
  vendorName?: string;
}): FireflyTransactionMapping {
  return {
    type: mapInternalBucketToFirefly(record.bucket),
    category: mapInternalCategoryToFireflyCategory(record.bucket, record.category),
    description: record.description || record.vendorName || 'Transaction',
  };
}

// ============================================================================
// DOCUMENT TYPE TO INTERNAL BUCKET MAPPING
// ============================================================================

/**
 * Maps document types to internal ledger buckets
 * This is used by AI analysis to assign initial bucket
 */
export function mapDocTypeToInternalBucket(docType: string): CoreLedgerBucket {
  const normalized = docType.toUpperCase().replace(/[\s-]/g, '_');

  const incomeTypes = ['PAY_STUB', 'PAYSTUB', 'GENERIC_FINANCIAL_INCOME', 'INCOME'];
  const assetTypes = ['BANK_STATEMENT', 'INVESTMENT'];
  const liabilityTypes = [
    'MORTGAGE_STATEMENT',
    'LOAN_STATEMENT',
    'CREDIT_CARD_STATEMENT',
    'MORTGAGE',
    'LOAN',
    'CREDIT_CARD',
  ];
  const expenseTypes = [
    'UTILITY_BILL',
    'RECEIPT',
    'INVOICE',
    'GENERIC_FINANCIAL_EXPENSE',
    'PROPERTY_TAX',
    'INSURANCE_POLICY',
    'EXPENSE',
  ];

  if (incomeTypes.includes(normalized)) return 'INCOME';
  if (assetTypes.includes(normalized)) return 'ASSET';
  if (liabilityTypes.includes(normalized)) return 'LIABILITY';
  if (expenseTypes.includes(normalized)) return 'EXPENSE';

  return 'UNKNOWN';
}

/**
 * Maps document types to internal finance categories
 */
export function mapDocTypeToInternalCategory(docType: string): string {
  const normalized = docType.toUpperCase().replace(/[\s-]/g, '_');

  const categoryMap: Record<string, string> = {
    PAY_STUB: 'salary_wages',
    PAYSTUB: 'salary_wages',
    UTILITY_BILL: 'utilities',
    MORTGAGE_STATEMENT: 'mortgage',
    CREDIT_CARD_STATEMENT: 'credit_card',
    LOAN_STATEMENT: 'personal_loan',
    BANK_STATEMENT: 'bank_account',
    INSURANCE_POLICY: 'insurance',
    PROPERTY_TAX: 'housing',
    RECEIPT: 'miscellaneous',
    INVOICE: 'miscellaneous',
    GENERIC_FINANCIAL_EXPENSE: 'miscellaneous',
    GENERIC_FINANCIAL_INCOME: 'other_income',
  };

  return categoryMap[normalized] || 'needs_review';
}

// ============================================================================
// LEGACY COMPATIBILITY MAPPING
// ============================================================================

/**
 * Maps extended QuickBooks-style buckets to core internal buckets
 * Used for backward compatibility with existing data that may have COGS, TAX, etc.
 */
export function mapExtendedBucketToCore(extendedBucket: string): CoreLedgerBucket {
  const normalized = extendedBucket.toUpperCase();

  const mapping: Record<string, CoreLedgerBucket> = {
    // Core buckets pass through
    INCOME: 'INCOME',
    EXPENSE: 'EXPENSE',
    ASSET: 'ASSET',
    LIABILITY: 'LIABILITY',
    UNKNOWN: 'UNKNOWN',

    // Extended buckets map to core
    COGS: 'EXPENSE',
    TAX: 'EXPENSE',
    OWNER_EQUITY: 'ASSET',
    TRANSFER: 'ASSET',
  };

  return mapping[normalized] || 'UNKNOWN';
}

/**
 * Checks if a bucket is a core bucket
 */
export function isCoreLeaderBucket(bucket: string): bucket is CoreLedgerBucket {
  return CORE_LEDGER_BUCKETS.includes(bucket as CoreLedgerBucket);
}

// ============================================================================
// HELPER UTILITIES
// ============================================================================

/**
 * Formats a snake_case or kebab-case category to Title Case
 */
function formatCategoryName(category: string): string {
  return category.replace(/[_-]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Determines the record type (expense/income/asset/debt) from a core bucket
 * Used for creating financial records in the database
 */
export function mapCoreBucketToRecordType(
  bucket: CoreLedgerBucket
): 'expense' | 'income' | 'asset' | 'debt' {
  switch (bucket) {
    case 'INCOME':
      return 'income';
    case 'ASSET':
      return 'asset';
    case 'LIABILITY':
      return 'debt';
    case 'EXPENSE':
    case 'UNKNOWN':
    default:
      return 'expense';
  }
}

/**
 * Normalizes various category string formats to internal format
 */
export function normalizeCategory(category: string): string {
  return category
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_');
}

/**
 * Validates if a category exists in the internal model
 */
export function isValidInternalCategory(bucket: CoreLedgerBucket, category: string): boolean {
  const normalized = normalizeCategory(category);
  const validCategories = INTERNAL_FINANCE_CATEGORIES[bucket] as readonly string[];
  return validCategories.includes(normalized);
}

/**
 * Gets the default category for a bucket
 */
export function getDefaultCategory(bucket: CoreLedgerBucket): string {
  const defaults: Record<CoreLedgerBucket, string> = {
    INCOME: 'other_income',
    EXPENSE: 'needs_review',
    ASSET: 'other_asset',
    LIABILITY: 'other_liability',
    UNKNOWN: 'needs_review',
  };
  return defaults[bucket];
}
