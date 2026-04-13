export * from './drilldown-schema';
import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  date,
  real,
  jsonb,
  numeric,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// Subscription tier types and configuration
export const SUBSCRIPTION_TIERS = {
  free: {
    name: 'Free',
    price: 0,
    maxCases: 1,
    maxViolationsPerMonth: 10,
    pdfWatermark: true,
    maxTeamMembers: 1,
    aiPatternDetection: false,
    hiddenAssetDetection: false,
    apiAccess: false,
    customTemplates: false,
    prioritySupport: false,
    // File & Storage limits
    maxFileSizeMB: 10,
    maxStorageMB: 100,
    // Voice & Media limits
    maxVoiceTranscriptionsPerMonth: 10,
    maxMediaUploadsPerMonth: 5,
    maxVideoLengthSeconds: 30,
    aiClassification: 'manual' as const,
    screenshotOCR: false,
  },
  individual: {
    name: 'Individual',
    price: 12,
    maxCases: 1,
    maxViolationsPerMonth: 20,
    pdfWatermark: false,
    maxTeamMembers: 1,
    aiPatternDetection: false,
    hiddenAssetDetection: false,
    apiAccess: false,
    customTemplates: false,
    prioritySupport: false,
    // File & Storage limits
    maxFileSizeMB: 50,
    maxStorageMB: 500,
    // Voice & Media limits
    maxVoiceTranscriptionsPerMonth: 100,
    maxMediaUploadsPerMonth: 50,
    maxVideoLengthSeconds: 120,
    aiClassification: 'basic' as const,
    screenshotOCR: false,
  },
  pro: {
    name: 'Pro',
    price: 49,
    maxCases: -1, // unlimited
    maxViolationsPerMonth: 50,
    pdfWatermark: false,
    maxTeamMembers: 1,
    aiPatternDetection: true,
    hiddenAssetDetection: false,
    apiAccess: false,
    customTemplates: false,
    prioritySupport: false,
    // File & Storage limits
    maxFileSizeMB: 100,
    maxStorageMB: 2048, // 2GB
    // Voice & Media limits
    maxVoiceTranscriptionsPerMonth: -1, // unlimited
    maxMediaUploadsPerMonth: -1,
    maxVideoLengthSeconds: -1, // unlimited
    aiClassification: 'advanced' as const,
    screenshotOCR: true,
  },
  team: {
    name: 'Team',
    price: 149,
    maxCases: -1,
    maxViolationsPerMonth: -1, // unlimited
    pdfWatermark: false,
    maxTeamMembers: 5,
    aiPatternDetection: true,
    hiddenAssetDetection: false,
    apiAccess: false,
    customTemplates: false,
    prioritySupport: true,
    // File & Storage limits
    maxFileSizeMB: 250,
    maxStorageMB: 10240, // 10GB
    // Voice & Media limits
    maxVoiceTranscriptionsPerMonth: -1,
    maxMediaUploadsPerMonth: -1,
    maxVideoLengthSeconds: -1,
    aiClassification: 'advanced' as const,
    screenshotOCR: true,
  },
  enterprise: {
    name: 'Enterprise',
    price: 399,
    maxCases: -1,
    maxViolationsPerMonth: -1, // unlimited
    pdfWatermark: false,
    maxTeamMembers: -1, // unlimited
    aiPatternDetection: true,
    hiddenAssetDetection: true,
    apiAccess: true,
    customTemplates: true,
    prioritySupport: true,
    // File & Storage limits
    maxFileSizeMB: 500,
    maxStorageMB: -1, // unlimited
    // Voice & Media limits
    maxVoiceTranscriptionsPerMonth: -1,
    maxMediaUploadsPerMonth: -1,
    maxVideoLengthSeconds: -1,
    aiClassification: 'custom' as const,
    screenshotOCR: true,
  },
} as const;

export type SubscriptionTier = keyof typeof SUBSCRIPTION_TIERS;

// Core Ledger Buckets - Simple, stable internal model
export const CORE_LEDGER_BUCKETS = ['INCOME', 'EXPENSE', 'ASSET', 'LIABILITY', 'UNKNOWN'] as const;

export type CoreLedgerBucket = (typeof CORE_LEDGER_BUCKETS)[number];

// Extended Ledger Buckets - For QuickBooks/Firefly mapping only (NOT stored internally)
export const EXTENDED_LEDGER_BUCKETS = ['COGS', 'TAX', 'OWNER_EQUITY', 'TRANSFER'] as const;

export type ExtendedLedgerBucket = (typeof EXTENDED_LEDGER_BUCKETS)[number];

// All Ledger Buckets (for backward compatibility with existing code)
export const LEDGER_BUCKETS = [...CORE_LEDGER_BUCKETS, ...EXTENDED_LEDGER_BUCKETS] as const;
export type LedgerBucket = (typeof LEDGER_BUCKETS)[number];

// Internal Finance Categories - Simple, stable (used for internal storage)
export const INTERNAL_FINANCE_CATEGORIES = {
  INCOME: [
    'salary_wages',
    'bonus_commission',
    'investment_income',
    'rental_income',
    'child_support_received',
    'alimony_received',
    'refund_reimbursement',
    'other_income',
  ],
  EXPENSE: [
    'housing',
    'utilities',
    'groceries',
    'transportation',
    'childcare',
    'healthcare',
    'insurance',
    'legal_professional',
    'education',
    'entertainment',
    'clothing',
    'personal_care',
    'subscriptions',
    'child_support_paid',
    'alimony_paid',
    'miscellaneous',
    'needs_review',
  ],
  ASSET: [
    'bank_account',
    'investment_account',
    'real_property',
    'vehicle',
    'personal_property',
    'retirement_account',
    'other_asset',
  ],
  LIABILITY: [
    'mortgage',
    'auto_loan',
    'credit_card',
    'personal_loan',
    'student_loan',
    'medical_debt',
    'other_liability',
  ],
  UNKNOWN: ['uncategorized', 'needs_review'],
} as const;

export type InternalFinanceCategory = {
  [K in CoreLedgerBucket]: (typeof INTERNAL_FINANCE_CATEGORIES)[K][number];
}[CoreLedgerBucket];

// QuickBooks-style Extended Categories - For mapping/export ONLY (not stored internally)
export const QUICKBOOKS_FINANCE_CATEGORIES = {
  INCOME: [
    'Sales of Product Income',
    'Service/Fee Income',
    'Rental Income',
    'Salary/Wages',
    'Bonus/Commission',
    'Other Income',
  ],
  EXPENSE: [
    'Advertising & Marketing',
    'Automobile & Vehicle',
    'Insurance',
    'Legal & Professional Services',
    'Utilities',
    'Rent or Lease',
    'Miscellaneous Expense',
  ],
  COGS: [
    'Cost of Goods Sold - Materials',
    'Cost of Goods Sold - Labor',
    'Cost of Goods Sold - Other',
  ],
  ASSET: [
    'Bank Account',
    'Fixed Asset - Property',
    'Fixed Asset - Vehicles',
    'Investment Account',
    'Other Asset',
  ],
  LIABILITY: [
    'Credit Card',
    'Loan - Mortgage',
    'Loan - Vehicle',
    'Loan - Personal',
    'Other Liability',
  ],
  TAX: ['Income Tax', 'Sales Tax Payable', 'Property Tax'],
  OWNER_EQUITY: ["Owner's Equity", "Owner's Draw", 'Retained Earnings'],
  TRANSFER: ['Transfer Between Accounts', 'Internal Transfer'],
  UNKNOWN: ['Uncategorized'],
} as const;

// Legacy compatibility - FINANCE_CATEGORIES alias for existing code
export const FINANCE_CATEGORIES = QUICKBOOKS_FINANCE_CATEGORIES;

export type FinanceCategory = {
  [K in LedgerBucket]: (typeof QUICKBOOKS_FINANCE_CATEGORIES)[K][number];
}[LedgerBucket];

export const users = pgTable('users', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: text('email').notNull().unique(),
  password: text('password').notNull(),
  fullName: text('full_name').notNull(),
  role: text('role').notNull().default('client'), // 'client' | 'admin'
  isAdmin: boolean('is_admin').notNull().default(false),
  status: text('status').notNull().default('active'), // 'active' | 'suspended' | 'pending'
  environment: text('environment').notNull().default('demo'),
  profilePhoto: text('profile_photo'),
  createdAt: timestamp('created_at').defaultNow(),
  lastLoginAt: timestamp('last_login_at'),
  // Subscription fields - use subscriptionTier as DB column, maps to 'tier' concept
  subscriptionTier: text('subscription_tier').notNull().default('free'),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  subscriptionStatus: text('subscription_status').default('active'),
  casesCount: integer('cases_count').notNull().default(0),
  violationsCountThisMonth: integer('violations_count_this_month').notNull().default(0),
  billingCycleStart: date('billing_cycle_start'),
  teamId: varchar('team_id'),
  // Voice & Media usage tracking
  voiceTranscriptionsThisMonth: integer('voice_transcriptions_this_month').notNull().default(0),
  mediaUploadsThisMonth: integer('media_uploads_this_month').notNull().default(0),
  // QuickBooks integration - per-user OAuth tokens (multi-tenant, encrypted at rest)
  // Access token with its own IV/authTag
  qbAccessTokenEncrypted: text('qb_access_token_encrypted'),
  qbAccessTokenIv: text('qb_access_token_iv'),
  qbAccessTokenAuthTag: text('qb_access_token_auth_tag'),
  // Refresh token with its own IV/authTag (critical for independent decryption)
  qbRefreshTokenEncrypted: text('qb_refresh_token_encrypted'),
  qbRefreshTokenIv: text('qb_refresh_token_iv'),
  qbRefreshTokenAuthTag: text('qb_refresh_token_auth_tag'),
  qbRealmId: varchar('qb_realm_id', { length: 50 }),
  qbTokenExpiresAt: timestamp('qb_token_expires_at'),
  qbConnected: boolean('qb_connected').notNull().default(false),
  qbScopes: text('qb_scopes').array(),
  qbCompanyName: text('qb_company_name'),
  qbConnectedAt: timestamp('qb_connected_at'),
  qbLastSyncAt: timestamp('qb_last_sync_at'),
  // QuickBooks API rate limiting
  qbApiCallsToday: integer('qb_api_calls_today').notNull().default(0),
  qbDailyResetAt: text('qb_daily_reset_at'),
  // Password reset
  passwordResetToken: text('password_reset_token'),
  passwordResetExpires: timestamp('password_reset_expires'),
  // Phone number for 2FA (E.164 format: +1234567890)
  phoneNumber: text('phone_number'),
  phoneVerifiedAt: timestamp('phone_verified_at'),
  // 2FA settings
  twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
  twoFactorMethod: text('two_factor_method').default('sms'), // 'sms' | 'authenticator'
  // Platform-level role for Super Admin console access
  platformRole: varchar('platform_role', { length: 20 }), // 'super_admin' | 'support_admin' | null
});

export const insertUserSchema = createInsertSchema(users)
  .pick({
    email: true,
    password: true,
    fullName: true,
    role: true,
    isAdmin: true,
    status: true,
    environment: true,
    phoneNumber: true,
    twoFactorEnabled: true,
  })
  .extend({
    phoneVerified: z.boolean().optional(),
  });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Cases table for case management
export const cases = pgTable('cases', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  title: text('title').notNull(),
  caseNumber: text('case_number'),
  court: text('court'),
  opposingParty: text('opposing_party'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  environment: text('environment').notNull().default('demo'),
});

export const insertCaseSchema = createInsertSchema(cases).omit({ id: true, createdAt: true });
export type InsertCase = z.infer<typeof insertCaseSchema>;
export type Case = typeof cases.$inferSelect;

// Teams table for Team/Enterprise tiers
export const teams = pgTable('teams', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  ownerId: varchar('owner_id').notNull(),
  tier: text('tier').notNull().default('team'),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  subscriptionStatus: text('subscription_status').default('active'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertTeamSchema = createInsertSchema(teams).omit({ id: true, createdAt: true });
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teams.$inferSelect;

// Tier limits table for subscription feature gating
export const tierLimits = pgTable('tier_limits', {
  tier: varchar('tier', { length: 20 }).primaryKey(),
  maxCases: integer('max_cases'),
  maxViolationsPerMonth: integer('max_violations_per_month'),
  maxVoiceTranscriptions: integer('max_voice_transcriptions'),
  maxMediaUploads: integer('max_media_uploads'),
  aiClassificationEnabled: boolean('ai_classification_enabled').default(false),
  priceMonthly: real('price_monthly').default(0),
});

export type TierLimit = typeof tierLimits.$inferSelect;

export const transactions = pgTable('transactions', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  date: text('date').notNull(),
  description: text('description').notNull(),
  amount: integer('amount').notNull(),
  category: text('category').notNull(),
  type: text('type').notNull(),
  vendor: text('vendor'),
  documentId: varchar('document_id'),
  environment: text('environment').notNull().default('demo'),
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;

export const assets = pgTable('assets', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  value: integer('value').notNull(),
  ownership: text('ownership').notNull(),
  verified: boolean('verified').default(false),
  vendor: text('vendor'),
  documentId: varchar('document_id'),
  acquiredDate: text('acquired_date'),
  environment: text('environment').notNull().default('demo'),
});

export const insertAssetSchema = createInsertSchema(assets).omit({ id: true });
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Asset = typeof assets.$inferSelect;

export const debts = pgTable('debts', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  amount: integer('amount').notNull(),
  ownership: text('ownership').notNull(),
  monthlyPayment: integer('monthly_payment'),
  vendor: text('vendor'),
  documentId: varchar('document_id'),
  openedDate: text('opened_date'),
  environment: text('environment').notNull().default('demo'),
});

export const insertDebtSchema = createInsertSchema(debts).omit({ id: true });
export type InsertDebt = z.infer<typeof insertDebtSchema>;
export type Debt = typeof debts.$inferSelect;

export const incomes = pgTable('incomes', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  source: text('source').notNull(),
  amount: integer('amount').notNull(),
  frequency: text('frequency').notNull(),
  verified: boolean('verified').default(false),
  owner: text('owner').notNull(),
  vendor: text('vendor'),
  documentId: varchar('document_id'),
  startDate: text('start_date'),
  environment: text('environment').notNull().default('demo'),
});

export const insertIncomeSchema = createInsertSchema(incomes).omit({ id: true });
export type InsertIncome = z.infer<typeof insertIncomeSchema>;
export type Income = typeof incomes.$inferSelect;

export const expenses = pgTable('expenses', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  category: text('category').notNull(),
  description: text('description').notNull(),
  amount: integer('amount').notNull(),
  frequency: text('frequency').notNull(),
  owner: text('owner').notNull(),
  vendor: text('vendor'),
  documentId: varchar('document_id'),
  startDate: text('start_date'),
  environment: text('environment').notNull().default('demo'),
});

export const insertExpenseSchema = createInsertSchema(expenses).omit({ id: true });
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expenses.$inferSelect;

// Reimbursements owed by category (manual input by user)
export const reimbursements = pgTable('reimbursements', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  category: text('category').notNull(), // Document category (financial_statement, medical_record, etc.)
  description: text('description').notNull(),
  amount: integer('amount').notNull(), // Amount in cents
  owedBy: text('owed_by').notNull(), // Who owes this (e.g., "Ex-Spouse", "Joint")
  status: text('status').notNull().default('pending'), // pending, paid, disputed
  dueDate: timestamp('due_date'),
  notes: text('notes'),
  linkedDocumentIds: text('linked_document_ids').array(), // Related document IDs
  environment: text('environment').notNull().default('demo'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertReimbursementSchema = createInsertSchema(reimbursements).omit({
  id: true,
  createdAt: true,
});
export type InsertReimbursement = z.infer<typeof insertReimbursementSchema>;
export type Reimbursement = typeof reimbursements.$inferSelect;

// W2 Income Records for both parties
export const w2Records = pgTable('w2_records', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  party: text('party').notNull(), // "self" or "spouse"
  taxYear: integer('tax_year').notNull(),
  employerName: text('employer_name').notNull(),
  employerEin: text('employer_ein'), // Employer Identification Number
  wagesAndTips: integer('wages_and_tips').notNull(), // Box 1 - in cents
  federalWithheld: integer('federal_withheld'), // Box 2 - in cents
  socialSecurityWages: integer('social_security_wages'), // Box 3 - in cents
  socialSecurityWithheld: integer('social_security_withheld'), // Box 4 - in cents
  medicareWages: integer('medicare_wages'), // Box 5 - in cents
  medicareWithheld: integer('medicare_withheld'), // Box 6 - in cents
  stateWages: integer('state_wages'), // Box 16 - in cents
  stateWithheld: integer('state_withheld'), // Box 17 - in cents
  otherCompensation: integer('other_compensation').default(0), // Box 14 - bonuses, commissions, tips in cents
  notes: text('notes'),
  documentId: varchar('document_id'), // Link to uploaded W2 document
  verified: boolean('verified').default(false),
  environment: text('environment').notNull().default('demo'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertW2RecordSchema = createInsertSchema(w2Records).omit({
  id: true,
  createdAt: true,
});
export type InsertW2Record = z.infer<typeof insertW2RecordSchema>;
export type W2Record = typeof w2Records.$inferSelect;

export const alerts = pgTable('alerts', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  type: text('type').notNull(),
  severity: text('severity').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  isRead: boolean('is_read').default(false),
  environment: text('environment').notNull().default('demo'),
});

export const insertAlertSchema = createInsertSchema(alerts).omit({ id: true });
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alerts.$inferSelect;

export type DashboardStats = {
  totalAssets: number;
  totalDebts: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  childSupportOwed: number;
  alimonyOwed: number;
  maritalAssets: number;
  netPosition: number;
  yourIncome: number;
  monthlyDebtPayments: number;
  unaccountedExpenses: number;
  childSupportDate?: string;
  alimonyDate?: string;
  violationsCount?: number;
  casesCount?: number;
};

export const violations = pgTable('violations', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  caseId: varchar('case_id'),
  type: text('type').notNull(),
  description: text('description').notNull(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  location: text('location'),
  mediaUrls: text('media_urls').array(),
  photoCount: integer('photo_count').default(0),
  videoDuration: integer('video_duration'),
  witnesses: text('witnesses').array(),
  isDraft: boolean('is_draft').default(false),
  status: text('status').notNull().default('pending'),
  environment: text('environment').notNull().default('demo'),
  // Voice & AI classification fields
  audioTranscript: text('audio_transcript'),
  audioFileUrl: text('audio_file_url'),
  aiClassification: text('ai_classification'),
  aiConfidenceScore: real('ai_confidence_score'),
  severityScore: integer('severity_score').default(0),
  voiceNotes: text('voice_notes'),
  mediaDescriptions: jsonb('media_descriptions'),
});

export const insertViolationSchema = createInsertSchema(violations).omit({
  id: true,
  timestamp: true,
});
export type InsertViolation = z.infer<typeof insertViolationSchema>;
export type Violation = typeof violations.$inferSelect;

export const evidenceFiles = pgTable('evidence_files', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  violationId: varchar('violation_id').notNull(),
  userId: varchar('user_id').notNull(),
  fileName: text('file_name').notNull(),
  fileType: text('file_type').notNull(),
  fileSize: integer('file_size').notNull(),
  objectPath: text('object_path').notNull(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  deviceId: text('device_id'),
  gpsLatitude: text('gps_latitude'),
  gpsLongitude: text('gps_longitude'),
  altitude: text('altitude'),
  networkType: text('network_type'),
  exifData: text('exif_data'),
  sha256Hash: text('sha256_hash'),
  isEncrypted: boolean('is_encrypted').default(false),
  environment: text('environment').notNull().default('demo'),
  evidenceSource: text('evidence_source'),
  evidenceMetadata: jsonb('evidence_metadata'),
});

export const insertEvidenceFileSchema = createInsertSchema(evidenceFiles).omit({
  id: true,
  timestamp: true,
});
export type InsertEvidenceFile = z.infer<typeof insertEvidenceFileSchema>;
export type EvidenceFile = typeof evidenceFiles.$inferSelect;

export const chainOfCustody = pgTable('chain_of_custody', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  evidenceId: varchar('evidence_id').notNull(),
  userId: varchar('user_id').notNull(),
  action: text('action').notNull(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  previousHash: text('previous_hash'),
  entryHash: text('entry_hash'),
  environment: text('environment').notNull().default('demo'),
});

export const insertChainOfCustodySchema = createInsertSchema(chainOfCustody).omit({
  id: true,
  timestamp: true,
});
export type InsertChainOfCustody = z.infer<typeof insertChainOfCustodySchema>;
export type ChainOfCustody = typeof chainOfCustody.$inferSelect;

export const messages = pgTable('messages', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  senderId: varchar('sender_id').notNull(),
  senderRole: text('sender_role').notNull(),
  senderName: text('sender_name').notNull(),
  content: text('content').notNull(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  isRead: boolean('is_read').default(false),
  attachmentUrl: text('attachment_url'),
  attachmentName: text('attachment_name'),
  environment: text('environment').notNull().default('demo'),
});

export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, timestamp: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// Usage audit table for tier analytics
export const usageAudit = pgTable('usage_audit', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  tier: varchar('tier', { length: 50 }).notNull(),
  violationsCount: integer('violations_count').default(0),
  storageUsedMb: real('storage_used_mb').default(0),
  mediaCount: integer('media_count').default(0),
  activeCases: integer('active_cases').default(0),
  recordedAt: timestamp('recorded_at').notNull().defaultNow(),
  environment: text('environment').notNull().default('demo'),
});

export const insertUsageAuditSchema = createInsertSchema(usageAudit).omit({
  id: true,
  recordedAt: true,
});
export type InsertUsageAudit = z.infer<typeof insertUsageAuditSchema>;
export type UsageAudit = typeof usageAudit.$inferSelect;

// Billing records table for subscription billing
export const billingRecords = pgTable('billing_records', {
  id: varchar('id').primaryKey(),
  userId: varchar('user_id').notNull(),
  tier: varchar('tier', { length: 50 }).notNull(),
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),
  violationsRecorded: integer('violations_recorded').default(0),
  storageUsedMb: real('storage_used_mb').default(0),
  amountCents: integer('amount_cents').default(0),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  stripeInvoiceId: varchar('stripe_invoice_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertBillingRecordSchema = createInsertSchema(billingRecords).omit({
  createdAt: true,
});
export type InsertBillingRecord = z.infer<typeof insertBillingRecordSchema>;
export type BillingRecord = typeof billingRecords.$inferSelect;

// Tier migrations table for tracking subscription changes
export const tierMigrations = pgTable('tier_migrations', {
  id: varchar('id').primaryKey(),
  userId: varchar('user_id').notNull(),
  fromTier: varchar('from_tier', { length: 50 }).notNull(),
  toTier: varchar('to_tier', { length: 50 }).notNull(),
  reason: text('reason').notNull(),
  gracePeriodDays: integer('grace_period_days').default(0),
  migratedAt: timestamp('migrated_at').notNull().defaultNow(),
  effectiveAt: timestamp('effective_at').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
});

export const insertTierMigrationSchema = createInsertSchema(tierMigrations).omit({
  migratedAt: true,
});
export type InsertTierMigration = z.infer<typeof insertTierMigrationSchema>;
export type TierMigration = typeof tierMigrations.$inferSelect;

// Quota reset log table for tracking monthly resets
export const quotaResetLog = pgTable('quota_reset_log', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  resetAt: timestamp('reset_at').notNull().defaultNow(),
  resetMonth: varchar('reset_month', { length: 7 }).notNull(),
  violationsCountBefore: integer('violations_count_before').default(0),
  voiceTranscriptionsBefore: integer('voice_transcriptions_before').default(0),
  mediaUploadsBefore: integer('media_uploads_before').default(0),
});

export const insertQuotaResetLogSchema = createInsertSchema(quotaResetLog).omit({
  id: true,
  resetAt: true,
});
export type InsertQuotaResetLog = z.infer<typeof insertQuotaResetLogSchema>;
export type QuotaResetLog = typeof quotaResetLog.$inferSelect;

export const demoMeta = pgTable('demo_meta', {
  id: integer('id').primaryKey(),
  lastResetAt: timestamp('last_reset_at').notNull(),
});

export const insertDemoMetaSchema = createInsertSchema(demoMeta);
export type InsertDemoMeta = z.infer<typeof insertDemoMetaSchema>;
export type DemoMeta = typeof demoMeta.$inferSelect;

// Mobile Pairing Tokens for QR Code Login
export const mobilePairingTokens = pgTable('mobile_pairing_tokens', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  environment: text('environment').notNull(),
  token: varchar('token', { length: 128 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertMobilePairingTokenSchema = createInsertSchema(mobilePairingTokens).omit({ 
  id: true, 
  createdAt: true 
});
export type InsertMobilePairingToken = z.infer<typeof insertMobilePairingTokenSchema>;
export type MobilePairingToken = typeof mobilePairingTokens.$inferSelect;

// Calendar events table
export const calendarEvents = pgTable('calendar_events', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  eventType: text('event_type').notNull(),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date'),
  allDay: boolean('all_day').default(false),
  location: text('location'),
  reminder: boolean('reminder').default(true),
  reminderMinutes: integer('reminder_minutes').default(60),
  isRecurring: boolean('is_recurring').default(false),
  recurringPattern: text('recurring_pattern'),
  status: text('status').notNull().default('scheduled'),
  environment: text('environment').notNull().default('demo'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertCalendarEventSchema = createInsertSchema(calendarEvents).omit({
  id: true,
  createdAt: true,
});
export type InsertCalendarEvent = z.infer<typeof insertCalendarEventSchema>;
export type CalendarEvent = typeof calendarEvents.$inferSelect;

// API schema with string-to-date coercion for HTTP requests
export const createCalendarEventSchema = z.object({
  title: z.string(),
  description: z.string().nullish(),
  eventType: z.string(),
  startDate: z.string().transform((v) => new Date(v)),
  endDate: z
    .string()
    .nullish()
    .transform((v) => (v ? new Date(v) : null)),
  allDay: z.boolean().optional(),
  location: z.string().nullish(),
  reminder: z.boolean().optional(),
  reminderMinutes: z.number().optional(),
  isRecurring: z.boolean().optional(),
  recurringPattern: z.string().nullish(),
});

// Legal documents table
export const legalDocuments = pgTable('legal_documents', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  title: text('title').notNull(),
  documentType: text('document_type').notNull(),
  description: text('description'),
  fileUrl: text('file_url'),
  fileName: text('file_name'),
  fileSize: integer('file_size'),
  status: text('status').notNull().default('draft'),
  courtCase: text('court_case'),
  filingDate: timestamp('filing_date'),
  effectiveDate: timestamp('effective_date'),
  expirationDate: timestamp('expiration_date'),
  parties: text('parties').array(),
  tags: text('tags').array(),
  environment: text('environment').notNull().default('demo'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertLegalDocumentSchema = createInsertSchema(legalDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLegalDocument = z.infer<typeof insertLegalDocumentSchema>;
export type LegalDocument = typeof legalDocuments.$inferSelect;

// Child support payments table
export const childSupportPayments = pgTable('child_support_payments', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  paymentType: text('payment_type').notNull(),
  amount: integer('amount').notNull(),
  dueDate: timestamp('due_date').notNull(),
  paidDate: timestamp('paid_date'),
  status: text('status').notNull().default('pending'),
  paymentMethod: text('payment_method'),
  referenceNumber: text('reference_number'),
  notes: text('notes'),
  childName: text('child_name'),
  courtOrderId: varchar('court_order_id'),
  environment: text('environment').notNull().default('demo'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertChildSupportPaymentSchema = createInsertSchema(childSupportPayments).omit({
  id: true,
  createdAt: true,
});
export type InsertChildSupportPayment = z.infer<typeof insertChildSupportPaymentSchema>;
export type ChildSupportPayment = typeof childSupportPayments.$inferSelect;

// API schema with string-to-date coercion for HTTP requests
export const createChildSupportPaymentSchema = z.object({
  paymentType: z.string(),
  amount: z.number(),
  dueDate: z.string().transform((v) => new Date(v)),
  paidDate: z
    .string()
    .nullish()
    .transform((v) => (v ? new Date(v) : null)),
  status: z.string().optional(),
  paymentMethod: z.string().nullish(),
  referenceNumber: z.string().nullish(),
  notes: z.string().nullish(),
  childName: z.string().nullish(),
  courtOrderId: z.string().nullish(),
});

export const updateChildSupportPaymentSchema = z.object({
  status: z.string().optional(),
  notes: z.string().nullish(),
  paidDate: z
    .string()
    .nullish()
    .transform((v) => (v ? new Date(v) : null)),
  paymentMethod: z.string().nullish(),
});

// Document categories for AI sorting
export const DOCUMENT_CATEGORIES = [
  'financial_statement',
  'tax_return',
  'bank_statement',
  'property_deed',
  'court_order',
  'custody_agreement',
  'correspondence',
  'evidence_photo',
  'evidence_video',
  'legal_filing',
  'medical_record',
  'employment_record',
  'insurance_document',
  'asset_valuation',
  'debt_statement',
  'other',
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

// Documents/files table for general document management
export const documents = pgTable('documents', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  title: text('title').notNull(),
  category: text('category').notNull(),
  description: text('description'),
  fileUrl: text('file_url'),
  fileName: text('file_name'),
  fileType: text('file_type'),
  fileSize: integer('file_size'),
  tags: text('tags').array(),
  isConfidential: boolean('is_confidential').default(false),
  environment: text('environment').notNull().default('demo'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  aiCategory: text('ai_category'),
  aiConfidence: real('ai_confidence'),
  aiSummary: text('ai_summary'),
  aiSuggestedTags: text('ai_suggested_tags').array(),
  aiAnalysisStatus: text('ai_analysis_status').default('pending'),
  aiAnalyzedAt: timestamp('ai_analyzed_at'),
  mobileUploaded: boolean('mobile_uploaded').default(false),
  aiExtractedText: text('ai_extracted_text'),
  // ── Batch Ingestion Extension (added 2026-04-10, backward-compatible) ──
  batchId: varchar('batch_id'),                                // FK → upload_batches.id
  originalFilename: text('original_filename'),                 // raw name from user's filesystem
  sanitizedFilename: text('sanitized_filename'),               // safe server-side name
  fileHash: text('file_hash'),                                 // SHA-256 for dedup
  processingStatus: text('processing_status').default('queued'), // queued | uploading | uploaded | processing | ocr_in_progress | extracting | classifying | completed | failed | needs_review | duplicate_skipped
  reviewStatus: text('review_status').default('unreviewed'),   // unreviewed | ai_processed | needs_review | user_corrected | approved | rejected
  isDuplicate: boolean('is_duplicate').default(false),
  duplicateOfDocumentId: varchar('duplicate_of_document_id'),  // FK → documents.id
  caseId: varchar('case_id'),                                  // optional case link
  storageKey: text('storage_key'),                             // filesystem path or cloud key
  pageCount: integer('page_count'),
  mimeType: text('mime_type'),                                 // canonical MIME from multer
  processedAt: timestamp('processed_at'),
  errorCode: text('error_code'),
});

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  aiAnalyzedAt: true,
});
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

// ── Processing status and review status enums (shared constants) ──────────────
export const DOCUMENT_PROCESSING_STATUSES = [
  'queued',
  'uploading',
  'uploaded',
  'processing',
  'ocr_in_progress',
  'extracting',
  'classifying',
  'completed',
  'failed',
  'needs_review',
  'duplicate_skipped',
] as const;
export type DocumentProcessingStatus = (typeof DOCUMENT_PROCESSING_STATUSES)[number];

export const DOCUMENT_REVIEW_STATUSES = [
  'unreviewed',
  'ai_processed',
  'needs_review',
  'user_corrected',
  'approved',
  'rejected',
] as const;
export type DocumentReviewStatus = (typeof DOCUMENT_REVIEW_STATUSES)[number];

// Canonical document types for forensic parsing
export const CANONICAL_DOC_TYPES = [
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
] as const;

export type CanonicalDocType = (typeof CANONICAL_DOC_TYPES)[number];

// Document line items for fine-grain audit trail
export const documentLineItems = pgTable('document_line_items', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  documentId: varchar('document_id').notNull(),
  userId: varchar('user_id').notNull(),
  lineItemIndex: integer('line_item_index').notNull(),
  label: text('label').notNull(),
  categoryHint: text('category_hint'),
  amount: integer('amount').notNull(),
  amountText: text('amount_text'),
  isCreditOrRefund: boolean('is_credit_or_refund').default(false),
  isRecurringGuess: boolean('is_recurring_guess').default(false),
  pageNumber: integer('page_number'),
  surroundingTextSnippet: text('surrounding_text_snippet'),
  linkedRecordType: text('linked_record_type'),
  linkedRecordId: varchar('linked_record_id'),
  environment: text('environment').notNull().default('demo'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertDocumentLineItemSchema = createInsertSchema(documentLineItems).omit({
  id: true,
  createdAt: true,
});
export type InsertDocumentLineItem = z.infer<typeof insertDocumentLineItemSchema>;
export type DocumentLineItem = typeof documentLineItems.$inferSelect;

// Document parse results for storing raw LLM output
export const documentParseResults = pgTable('document_parse_results', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  documentId: varchar('document_id').notNull(),
  userId: varchar('user_id').notNull(),
  docType: text('doc_type').notNull(),
  parseStatus: text('parse_status').notNull(),
  language: text('language').default('en'),
  currency: text('currency').default('USD'),
  vendorName: text('vendor_name'),
  accountNumber: text('account_number'),
  billingPeriodStart: text('billing_period_start'),
  billingPeriodEnd: text('billing_period_end'),
  statementDate: text('statement_date'),
  dueDate: text('due_date'),
  totalAmountDue: integer('total_amount_due'),
  totalAmountText: text('total_amount_text'),
  customerName: text('customer_name'),
  serviceAddress: text('service_address'),
  mailingAddress: text('mailing_address'),
  rawLlmResponse: jsonb('raw_llm_response'),
  notes: text('notes').array(),
  requestTokens: integer('request_tokens'),
  responseTokens: integer('response_tokens'),
  latencyMs: integer('latency_ms'),
  environment: text('environment').notNull().default('demo'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertDocumentParseResultSchema = createInsertSchema(documentParseResults).omit({
  id: true,
  createdAt: true,
});
export type InsertDocumentParseResult = z.infer<typeof insertDocumentParseResultSchema>;
export type DocumentParseResult = typeof documentParseResults.$inferSelect;

// Mobile violation reports for quick violation creation
export const mobileViolationReports = pgTable('mobile_violation_reports', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  title: text('title').notNull(),
  violationType: text('violation_type').notNull(),
  description: text('description').notNull(),
  severity: text('severity').notNull().default('medium'),
  location: text('location'),
  occurredAt: timestamp('occurred_at').notNull().defaultNow(),
  relatedDocumentIds: text('related_document_ids').array(),
  witnesses: text('witnesses').array(),
  status: text('status').notNull().default('draft'),
  environment: text('environment').notNull().default('demo'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  submittedAt: timestamp('submitted_at'),
  linkedViolationId: varchar('linked_violation_id'),
});

export const insertMobileViolationReportSchema = createInsertSchema(mobileViolationReports).omit({
  id: true,
  createdAt: true,
  submittedAt: true,
});
export type InsertMobileViolationReport = z.infer<typeof insertMobileViolationReportSchema>;
export type MobileViolationReport = typeof mobileViolationReports.$inferSelect;

// QuickBooks sync audit log for multi-tenant tracking
export const quickbooksSyncLog = pgTable('quickbooks_sync_log', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  action: varchar('action', { length: 100 }).notNull(),
  qbEntityType: varchar('qb_entity_type', { length: 50 }),
  qbEntityId: varchar('qb_entity_id', { length: 50 }),
  requestMethod: varchar('request_method', { length: 10 }),
  requestPath: text('request_path'),
  responseStatus: integer('response_status'),
  errorMessage: text('error_message'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertQuickbooksSyncLogSchema = createInsertSchema(quickbooksSyncLog).omit({
  id: true,
  createdAt: true,
});
export type InsertQuickbooksSyncLog = z.infer<typeof insertQuickbooksSyncLogSchema>;
export type QuickbooksSyncLog = typeof quickbooksSyncLog.$inferSelect;

// Data Quality Framework Tables

// Quality rules definition table
export const qualityRules = pgTable('quality_rules', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  description: text('description'),
  ruleType: varchar('rule_type', { length: 50 }).notNull(), // 'expectation', 'reconciliation', 'freshness', 'schema'
  targetSystem: varchar('target_system', { length: 50 }).notNull(), // 'app', 'warehouse', 'quickbooks'
  targetTable: text('target_table').notNull(),
  targetColumn: text('target_column'),
  expectationType: varchar('expectation_type', { length: 100 }).notNull(), // 'not_null', 'unique', 'range', 'regex', 'referential', etc.
  parameters: jsonb('parameters'), // JSON config for the expectation
  severity: varchar('severity', { length: 20 }).notNull().default('warning'), // 'info', 'warning', 'critical'
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertQualityRuleSchema = createInsertSchema(qualityRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertQualityRule = z.infer<typeof insertQualityRuleSchema>;
export type QualityRule = typeof qualityRules.$inferSelect;

// Quality run tracking
export const qualityRuns = pgTable('quality_runs', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  runType: varchar('run_type', { length: 50 }).notNull(), // 'validation', 'profiling', 'reconciliation'
  targetSystem: varchar('target_system', { length: 50 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('running'), // 'running', 'completed', 'failed'
  totalChecks: integer('total_checks').default(0),
  passedChecks: integer('passed_checks').default(0),
  failedChecks: integer('failed_checks').default(0),
  warningChecks: integer('warning_checks').default(0),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  metadata: jsonb('metadata'),
});

export const insertQualityRunSchema = createInsertSchema(qualityRuns).omit({
  id: true,
  startedAt: true,
});
export type InsertQualityRun = z.infer<typeof insertQualityRunSchema>;
export type QualityRun = typeof qualityRuns.$inferSelect;

// Quality metrics for individual check results
export const qualityMetrics = pgTable('quality_metrics', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  runId: varchar('run_id').notNull(),
  ruleId: varchar('rule_id'),
  checkName: text('check_name').notNull(),
  tableName: text('table_name').notNull(),
  columnName: text('column_name'),
  expectationType: varchar('expectation_type', { length: 100 }).notNull(),
  expectedValue: text('expected_value'),
  actualValue: text('actual_value'),
  passed: boolean('passed').notNull(),
  severity: varchar('severity', { length: 20 }).notNull(),
  message: text('message'),
  metadata: jsonb('metadata'),
  checkedAt: timestamp('checked_at').notNull().defaultNow(),
});

export const insertQualityMetricSchema = createInsertSchema(qualityMetrics).omit({
  id: true,
  checkedAt: true,
});
export type InsertQualityMetric = z.infer<typeof insertQualityMetricSchema>;
export type QualityMetric = typeof qualityMetrics.$inferSelect;

// Data profiling results
export const dataProfiles = pgTable('data_profiles', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  runId: varchar('run_id').notNull(),
  tableName: text('table_name').notNull(),
  columnName: text('column_name').notNull(),
  dataType: varchar('data_type', { length: 50 }),
  totalCount: integer('total_count').default(0),
  nullCount: integer('null_count').default(0),
  uniqueCount: integer('unique_count').default(0),
  minValue: text('min_value'),
  maxValue: text('max_value'),
  meanValue: real('mean_value'),
  stdDevValue: real('std_dev_value'),
  percentiles: jsonb('percentiles'), // { p25, p50, p75, p90, p95, p99 }
  topValues: jsonb('top_values'), // [{ value, count }]
  profiledAt: timestamp('profiled_at').notNull().defaultNow(),
});

export const insertDataProfileSchema = createInsertSchema(dataProfiles).omit({
  id: true,
  profiledAt: true,
});
export type InsertDataProfile = z.infer<typeof insertDataProfileSchema>;
export type DataProfile = typeof dataProfiles.$inferSelect;

// Anomaly detection results
export const qualityAnomalies = pgTable('quality_anomalies', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  runId: varchar('run_id'),
  tableName: text('table_name').notNull(),
  columnName: text('column_name'),
  anomalyType: varchar('anomaly_type', { length: 50 }).notNull(), // 'spike', 'drop', 'drift', 'outlier', 'missing_data'
  severity: varchar('severity', { length: 20 }).notNull(),
  description: text('description').notNull(),
  expectedBaseline: text('expected_baseline'),
  actualValue: text('actual_value'),
  deviationScore: real('deviation_score'), // z-score or deviation percentage
  detectedAt: timestamp('detected_at').notNull().defaultNow(),
  isAcknowledged: boolean('is_acknowledged').default(false),
  acknowledgedBy: varchar('acknowledged_by'),
  acknowledgedAt: timestamp('acknowledged_at'),
});

export const insertQualityAnomalySchema = createInsertSchema(qualityAnomalies).omit({
  id: true,
  detectedAt: true,
});
export type InsertQualityAnomaly = z.infer<typeof insertQualityAnomalySchema>;
export type QualityAnomaly = typeof qualityAnomalies.$inferSelect;

// Reconciliation jobs
export const reconciliationJobs = pgTable('reconciliation_jobs', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  jobName: text('job_name').notNull(),
  sourceSystem: varchar('source_system', { length: 50 }).notNull(), // 'app', 'warehouse', 'quickbooks'
  targetSystem: varchar('target_system', { length: 50 }).notNull(),
  reconciliationType: varchar('reconciliation_type', { length: 50 }).notNull(), // 'count', 'sum', 'hash', 'detailed'
  sourceQuery: text('source_query'),
  targetQuery: text('target_query'),
  matchKeys: jsonb('match_keys'), // columns to match on
  tolerancePercent: real('tolerance_percent').default(0),
  isActive: boolean('is_active').default(true),
  schedule: varchar('schedule', { length: 50 }), // cron expression
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertReconciliationJobSchema = createInsertSchema(reconciliationJobs).omit({
  id: true,
  createdAt: true,
});
export type InsertReconciliationJob = z.infer<typeof insertReconciliationJobSchema>;
export type ReconciliationJob = typeof reconciliationJobs.$inferSelect;

// Reconciliation results
export const reconciliationResults = pgTable('reconciliation_results', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  jobId: varchar('job_id').notNull(),
  runId: varchar('run_id').notNull(),
  status: varchar('status', { length: 20 }).notNull(), // 'matched', 'mismatched', 'error'
  sourceCount: integer('source_count'),
  targetCount: integer('target_count'),
  matchedCount: integer('matched_count'),
  mismatchedCount: integer('mismatched_count'),
  sourceSum: real('source_sum'),
  targetSum: real('target_sum'),
  variance: real('variance'),
  variancePercent: real('variance_percent'),
  details: jsonb('details'), // detailed mismatch info
  executedAt: timestamp('executed_at').notNull().defaultNow(),
});

export const insertReconciliationResultSchema = createInsertSchema(reconciliationResults).omit({
  id: true,
  executedAt: true,
});
export type InsertReconciliationResult = z.infer<typeof insertReconciliationResultSchema>;
export type ReconciliationResult = typeof reconciliationResults.$inferSelect;

// Data quality alerts
export const dqAlerts = pgTable('dq_alerts', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  runId: varchar('run_id'),
  metricId: varchar('metric_id'),
  anomalyId: varchar('anomaly_id'),
  reconciliationResultId: varchar('reconciliation_result_id'),
  alertType: varchar('alert_type', { length: 50 }).notNull(), // 'validation_failed', 'anomaly_detected', 'reconciliation_mismatch'
  severity: varchar('severity', { length: 20 }).notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  affectedTable: text('affected_table'),
  affectedColumn: text('affected_column'),
  suggestedAction: text('suggested_action'),
  isResolved: boolean('is_resolved').default(false),
  resolvedBy: varchar('resolved_by'),
  resolvedAt: timestamp('resolved_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertDqAlertSchema = createInsertSchema(dqAlerts).omit({ id: true, createdAt: true });
export type InsertDqAlert = z.infer<typeof insertDqAlertSchema>;
export type DqAlert = typeof dqAlerts.$inferSelect;

export type UserRole = 'client' | 'attorney' | 'cpa' | 'admin';
export type Environment = 'live' | 'demo';
export type AlertSeverity = 'critical' | 'warning' | 'info';
export type ViolationStatus = 'pending' | 'reviewed' | 'approved';

// ============================================
// DATA WAREHOUSE - DIMENSION TABLES
// ============================================

export const dimDate = pgTable('drizzle_dim_date', {
  dateId: integer('date_id').primaryKey(),
  dateActual: date('date_actual').notNull(),
  year: integer('year').notNull(),
  quarter: integer('quarter').notNull(),
  month: integer('month').notNull(),
  dayOfMonth: integer('day_of_month').notNull(),
  dayOfWeek: integer('day_of_week').notNull(),
  isWeekend: boolean('is_weekend').default(false),
  isHoliday: boolean('is_holiday').default(false),
  weekOfYear: integer('week_of_year'),
  monthName: varchar('month_name', { length: 20 }),
  dayName: varchar('day_name', { length: 20 }),
});

export type DimDate = typeof dimDate.$inferSelect;

export const dimTier = pgTable('drizzle_dim_tier', {
  tierId: varchar('tier_id').primaryKey(),
  tierName: varchar('tier_name', { length: 50 }).notNull(),
  priceUsdMonthly: integer('price_usd_monthly').notNull(),
  apiLimitDaily: integer('api_limit_daily'),
  storageGb: integer('storage_gb'),
  maxCases: integer('max_cases'),
  maxViolationsPerMonth: integer('max_violations_per_month'),
  aiFeatures: boolean('ai_features').default(false),
  prioritySupport: boolean('priority_support').default(false),
  effectiveFrom: timestamp('effective_from').notNull().defaultNow(),
  effectiveTo: timestamp('effective_to'),
});

export type DimTier = typeof dimTier.$inferSelect;

export const dimUsers = pgTable('drizzle_dim_users', {
  userId: varchar('user_id').primaryKey(),
  userName: varchar('user_name', { length: 200 }),
  email: varchar('email', { length: 255 }),
  currentTier: varchar('current_tier', { length: 50 }),
  tierStartDate: timestamp('tier_start_date'),
  isActive: boolean('is_active').default(true),
  createdDateId: integer('created_date_id'),
  dbtValidFrom: timestamp('dbt_valid_from').notNull().defaultNow(),
  dbtValidTo: timestamp('dbt_valid_to'),
  isCurrent: boolean('is_current').default(true),
});

export type DimUsers = typeof dimUsers.$inferSelect;

export const dimSubscription = pgTable('drizzle_dim_subscription', {
  subscriptionId: varchar('subscription_id').primaryKey(),
  userId: varchar('user_id').notNull(),
  tierId: varchar('tier_id').notNull(),
  status: varchar('status', { length: 30 }).notNull(),
  startDateId: integer('start_date_id'),
  endDateId: integer('end_date_id'),
  billingCycle: varchar('billing_cycle', { length: 20 }),
  priceAtSubscription: integer('price_at_subscription'),
  dbtValidFrom: timestamp('dbt_valid_from').notNull().defaultNow(),
  dbtValidTo: timestamp('dbt_valid_to'),
  isCurrent: boolean('is_current').default(true),
});

export type DimSubscription = typeof dimSubscription.$inferSelect;

// ============================================
// DATA WAREHOUSE - FACT TABLES
// ============================================

export const factTransactions = pgTable('drizzle_fact_transactions', {
  transactionId: varchar('transaction_id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  transactionDateId: integer('transaction_date_id').notNull(),
  amountUsd: integer('amount_usd').notNull(),
  transactionType: varchar('transaction_type', { length: 30 }).notNull(),
  paymentMethod: varchar('payment_method', { length: 50 }),
  stripePaymentIntentId: varchar('stripe_payment_intent_id'),
  subscriptionId: varchar('subscription_id'),
  tierId: varchar('tier_id'),
  currency: varchar('currency', { length: 3 }).default('USD'),
  status: varchar('status', { length: 30 }),
  refundReason: text('refund_reason'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertFactTransactionSchema = createInsertSchema(factTransactions).omit({
  transactionId: true,
  createdAt: true,
});
export type InsertFactTransaction = z.infer<typeof insertFactTransactionSchema>;
export type FactTransaction = typeof factTransactions.$inferSelect;

export const factViolations = pgTable('drizzle_fact_violations', {
  violationId: varchar('violation_id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  violationDateId: integer('violation_date_id').notNull(),
  violationType: varchar('violation_type', { length: 50 }).notNull(),
  severity: varchar('severity', { length: 20 }).notNull(),
  caseId: varchar('case_id'),
  description: text('description'),
  evidenceCount: integer('evidence_count').default(0),
  isResolved: boolean('is_resolved').default(false),
  resolvedDateId: integer('resolved_date_id'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertFactViolationSchema = createInsertSchema(factViolations).omit({
  violationId: true,
  createdAt: true,
});
export type InsertFactViolation = z.infer<typeof insertFactViolationSchema>;
export type FactViolation = typeof factViolations.$inferSelect;

export const factUsageMetrics = pgTable('drizzle_fact_usage_metrics', {
  metricId: varchar('metric_id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  metricDateId: integer('metric_date_id').notNull(),
  metricType: varchar('metric_type', { length: 50 }).notNull(),
  metricValue: real('metric_value').notNull(),
  unit: varchar('unit', { length: 30 }),
  tierId: varchar('tier_id'),
  quotaLimit: integer('quota_limit'),
  percentageUsed: real('percentage_used'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertFactUsageMetricSchema = createInsertSchema(factUsageMetrics).omit({
  metricId: true,
  createdAt: true,
});
export type InsertFactUsageMetric = z.infer<typeof insertFactUsageMetricSchema>;
export type FactUsageMetric = typeof factUsageMetrics.$inferSelect;

export const factFinancialSummary = pgTable('fact_financial_summary', {
  summaryId: varchar('summary_id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  summaryDateId: integer('summary_date_id').notNull(),
  caseId: varchar('case_id'),
  totalAssets: integer('total_assets').default(0),
  totalDebts: integer('total_debts').default(0),
  totalIncome: integer('total_income').default(0),
  totalExpenses: integer('total_expenses').default(0),
  netWorth: integer('net_worth').default(0),
  assetCount: integer('asset_count').default(0),
  debtCount: integer('debt_count').default(0),
  incomeSourceCount: integer('income_source_count').default(0),
  expenseCount: integer('expense_count').default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertFactFinancialSummarySchema = createInsertSchema(factFinancialSummary).omit({
  summaryId: true,
  createdAt: true,
});
export type InsertFactFinancialSummary = z.infer<typeof insertFactFinancialSummarySchema>;
export type FactFinancialSummary = typeof factFinancialSummary.$inferSelect;

// ============================================
// IMPROVEMENT RECOMMENDATIONS (Demo Testing)
// ============================================

export const improvementRecommendations = pgTable('improvement_recommendations', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  userEmail: text('user_email'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  inputType: text('input_type').notNull(), // 'voice', 'text', 'camera', 'file'
  transcription: text('transcription'), // Voice transcription if applicable
  mediaUrls: text('media_urls').array(), // Uploaded file/image URLs
  // Status workflow: submitted -> reviewing -> testing -> approved -> implemented (or rejected)
  status: text('status').notNull().default('submitted'),
  environment: text('environment').notNull().default('demo'),
  // Admin editing fields
  editedTitle: text('edited_title'), // Admin-corrected title
  editedBody: text('edited_body'), // Admin-corrected body
  adminNotes: text('admin_notes'), // Internal notes from admin
  reviewedBy: text('reviewed_by'), // Admin email who reviewed
  reviewedAt: timestamp('reviewed_at'),
  // Testing workflow
  testUserId: text('test_user_id'), // Test user assigned for approval
  testUserEmail: text('test_user_email'),
  testFeedback: text('test_feedback'), // Feedback from test user
  testApproved: boolean('test_approved'),
  testedAt: timestamp('tested_at'),
  // Implementation tracking
  implementedAt: timestamp('implemented_at'),
  implementedBy: text('implemented_by'), // Admin who implemented
  changelogEntry: text('changelog_entry'), // Public-facing description for changelog
  changelogTranslations: jsonb('changelog_translations'), // AI translations { es: "...", fr: "...", etc }
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const RECOMMENDATION_STATUSES = {
  submitted: 'Submitted',
  reviewing: 'Under Review',
  testing: 'Testing',
  approved: 'Approved',
  implemented: 'Implemented',
  rejected: 'Rejected',
} as const;

export type RecommendationStatus = keyof typeof RECOMMENDATION_STATUSES;

export const insertImprovementRecommendationSchema = createInsertSchema(
  improvementRecommendations
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertImprovementRecommendation = z.infer<typeof insertImprovementRecommendationSchema>;
export type ImprovementRecommendation = typeof improvementRecommendations.$inferSelect;

// ============================================
// JOURNAL ENTRIES
// ============================================

export const journalEntries = pgTable('journal_entries', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  environment: text('environment').notNull().default('demo'),
  title: text('title'),
  content: text('content').notNull(),
  inputType: text('input_type').notNull().default('text'), // 'text', 'voice', 'camera', 'file'
  voiceTranscription: text('voice_transcription'), // AI transcription of voice input
  mood: text('mood'), // Optional mood tag: 'positive', 'neutral', 'negative', 'mixed'
  tags: text('tags').array(), // User-defined tags
  isPrivate: boolean('is_private').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertJournalEntrySchema = createInsertSchema(journalEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertJournalEntry = z.infer<typeof insertJournalEntrySchema>;
export type JournalEntry = typeof journalEntries.$inferSelect;

export const journalAttachments = pgTable('journal_attachments', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  journalEntryId: varchar('journal_entry_id').notNull(),
  userId: varchar('user_id').notNull(),
  fileName: text('file_name').notNull(),
  fileType: text('file_type').notNull(), // 'image', 'audio', 'video', 'document'
  fileUrl: text('file_url').notNull(),
  fileSizeBytes: integer('file_size_bytes'),
  aiDescription: text('ai_description'), // AI-generated description of the attachment
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertJournalAttachmentSchema = createInsertSchema(journalAttachments).omit({
  id: true,
  createdAt: true,
});
export type InsertJournalAttachment = z.infer<typeof insertJournalAttachmentSchema>;
export type JournalAttachment = typeof journalAttachments.$inferSelect;

// ============================================
// CONVERSATIONS & MESSAGING
// ============================================

export const conversations = pgTable('conversations', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  creatorUserId: varchar('creator_user_id').notNull(),
  environment: text('environment').notNull().default('demo'),
  title: text('title'), // Optional conversation title
  type: text('type').notNull().default('direct'), // 'direct', 'group', 'legal'
  status: text('status').notNull().default('active'), // 'active', 'archived', 'reported'
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;

export const conversationParticipants = pgTable('conversation_participants', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  conversationId: varchar('conversation_id').notNull(),
  userId: varchar('user_id'), // Null if invited by email but not yet registered
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role').notNull().default('party'), // 'party', 'legal_counsel', 'mediator', 'therapist', 'observer'
  status: text('status').notNull().default('active'), // 'active', 'invited', 'left', 'removed'
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
  leftAt: timestamp('left_at'),
});

export const insertConversationParticipantSchema = createInsertSchema(
  conversationParticipants
).omit({
  id: true,
  joinedAt: true,
});
export type InsertConversationParticipant = z.infer<typeof insertConversationParticipantSchema>;
export type ConversationParticipant = typeof conversationParticipants.$inferSelect;

export const conversationMessages = pgTable('conversation_messages', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  conversationId: varchar('conversation_id').notNull(),
  senderId: varchar('sender_id').notNull(),
  senderEmail: text('sender_email').notNull(),
  senderName: text('sender_name').notNull(),
  content: text('content').notNull(),
  inputType: text('input_type').notNull().default('text'), // 'text', 'voice', 'image'
  voiceTranscription: text('voice_transcription'),
  // Sentiment analysis fields
  sentimentScore: real('sentiment_score'), // -1 to 1 scale
  sentimentLabel: text('sentiment_label'), // 'positive', 'neutral', 'negative'
  hasNegativeContent: boolean('has_negative_content').default(false),
  negativeTopics: text('negative_topics').array(), // AI-extracted topics of negativity
  isEdited: boolean('is_edited').notNull().default(false),
  editedAt: timestamp('edited_at'),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertConversationMessageSchema = createInsertSchema(conversationMessages).omit({
  id: true,
  createdAt: true,
});
export type InsertConversationMessage = z.infer<typeof insertConversationMessageSchema>;
export type ConversationMessage = typeof conversationMessages.$inferSelect;

export const messageAttachments = pgTable('message_attachments', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  messageId: varchar('message_id').notNull(),
  fileName: text('file_name').notNull(),
  fileType: text('file_type').notNull(),
  fileUrl: text('file_url').notNull(),
  fileSizeBytes: integer('file_size_bytes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertMessageAttachmentSchema = createInsertSchema(messageAttachments).omit({
  id: true,
  createdAt: true,
});
export type InsertMessageAttachment = z.infer<typeof insertMessageAttachmentSchema>;
export type MessageAttachment = typeof messageAttachments.$inferSelect;

// ============================================
// SENTIMENT REPORTS
// ============================================

export const sentimentReports = pgTable('sentiment_reports', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  conversationId: varchar('conversation_id').notNull(),
  generatedByUserId: varchar('generated_by_user_id').notNull(),
  environment: text('environment').notNull().default('demo'),
  title: text('title').notNull(),
  reportType: text('report_type').notNull().default('negative_communication'), // 'negative_communication', 'conflict_summary', 'behavioral_pattern'
  dateRangeStart: timestamp('date_range_start'),
  dateRangeEnd: timestamp('date_range_end'),
  totalMessagesAnalyzed: integer('total_messages_analyzed').notNull().default(0),
  negativeMessageCount: integer('negative_message_count').notNull().default(0),
  // Detailed breakdown stored as JSON
  topicBreakdown: jsonb('topic_breakdown'), // { "finances": [...], "custody": [...], "communication": [...] }
  participantBreakdown: jsonb('participant_breakdown'), // { "user1": { negativeCount: 5, topics: [...] }, ... }
  summary: text('summary'), // AI-generated summary
  recommendations: text('recommendations'), // AI-generated recommendations
  // Export/sharing
  pdfUrl: text('pdf_url'),
  sharedWith: text('shared_with').array(), // Emails of people this was shared with
  status: text('status').notNull().default('generated'), // 'generating', 'generated', 'shared', 'archived'
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertSentimentReportSchema = createInsertSchema(sentimentReports).omit({
  id: true,
  createdAt: true,
});
export type InsertSentimentReport = z.infer<typeof insertSentimentReportSchema>;
export type SentimentReport = typeof sentimentReports.$inferSelect;

// Stores individual negative message excerpts for reports
export const sentimentReportItems = pgTable('sentiment_report_items', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  reportId: varchar('report_id').notNull(),
  messageId: varchar('message_id').notNull(),
  senderName: text('sender_name').notNull(),
  senderEmail: text('sender_email').notNull(),
  messageContent: text('message_content').notNull(),
  messageTimestamp: timestamp('message_timestamp').notNull(),
  sentimentScore: real('sentiment_score').notNull(),
  primaryTopic: text('primary_topic').notNull(), // Main subject of negativity
  secondaryTopics: text('secondary_topics').array(),
  aiAnalysis: text('ai_analysis'), // AI explanation of why this is flagged
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertSentimentReportItemSchema = createInsertSchema(sentimentReportItems).omit({
  id: true,
  createdAt: true,
});
export type InsertSentimentReportItem = z.infer<typeof insertSentimentReportItemSchema>;
export type SentimentReportItem = typeof sentimentReportItems.$inferSelect;

// ============================================
// SECURITY - DEVICE & SESSION MANAGEMENT
// ============================================

// User devices - tracks all devices that have logged in
export const userDevices = pgTable('user_devices', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  // Device identification
  deviceFingerprint: text('device_fingerprint').notNull(), // Hashed fingerprint
  deviceName: text('device_name'), // User-friendly name like "Chrome on MacOS"
  userAgent: text('user_agent').notNull(),
  platform: text('platform'), // 'Windows', 'MacOS', 'iOS', 'Android', etc.
  browser: text('browser'), // 'Chrome', 'Safari', 'Firefox', etc.
  // Trust & status
  isTrusted: boolean('is_trusted').notNull().default(false),
  isBlocked: boolean('is_blocked').notNull().default(false),
  // Tracking
  firstSeenAt: timestamp('first_seen_at').notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at').notNull().defaultNow(),
  lastIp: text('last_ip'),
  lastLocation: text('last_location'), // Approximate location from IP
});

export const insertUserDeviceSchema = createInsertSchema(userDevices).omit({
  id: true,
  firstSeenAt: true,
  lastSeenAt: true,
});
export type InsertUserDevice = z.infer<typeof insertUserDeviceSchema>;
export type UserDevice = typeof userDevices.$inferSelect;

// Auth sessions - database-backed sessions with revocation support
export const authSessions = pgTable('auth_sessions', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  deviceId: varchar('device_id'), // FK to userDevices
  // Token management
  refreshTokenHash: text('refresh_token_hash').notNull(), // SHA-256 of refresh token
  // Session metadata
  ipAddress: text('ip_address'),
  ipHistory: jsonb('ip_history').$type<string[]>(), // Track IP changes
  userAgent: text('user_agent'),
  // Flags
  isRememberMe: boolean('is_remember_me').notNull().default(false),
  mfaVerified: boolean('mfa_verified').notNull().default(false),
  mfaVerifiedAt: timestamp('mfa_verified_at'),
  // Lifecycle
  createdAt: timestamp('created_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
  lastActivityAt: timestamp('last_activity_at').notNull().defaultNow(),
  revokedAt: timestamp('revoked_at'),
  revokedReason: text('revoked_reason'), // 'logout', 'password_change', 'admin_revoke', 'suspicious'
});

export const insertAuthSessionSchema = createInsertSchema(authSessions).omit({
  id: true,
  createdAt: true,
  lastActivityAt: true,
});
export type InsertAuthSession = z.infer<typeof insertAuthSessionSchema>;
export type AuthSession = typeof authSessions.$inferSelect;

// MFA challenges - tracks verification codes
export const mfaChallenges = pgTable('mfa_challenges', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  sessionId: varchar('session_id'), // Pending session waiting for MFA
  // Challenge details
  codeHash: text('code_hash').notNull(), // SHA-256 of verification code
  channel: text('channel').notNull().default('sms'), // 'sms' | 'email' | 'authenticator'
  phoneNumber: text('phone_number'), // Masked phone number used
  // Attempt tracking
  attemptCount: integer('attempt_count').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(5),
  // Lifecycle
  createdAt: timestamp('created_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
  verifiedAt: timestamp('verified_at'),
  // Rate limiting
  lastResendAt: timestamp('last_resend_at'),
  resendCount: integer('resend_count').notNull().default(0),
});

export const insertMfaChallengeSchema = createInsertSchema(mfaChallenges).omit({
  id: true,
  createdAt: true,
  attemptCount: true,
  resendCount: true,
});
export type InsertMfaChallenge = z.infer<typeof insertMfaChallengeSchema>;
export type MfaChallenge = typeof mfaChallenges.$inferSelect;

// Security events - comprehensive audit log
export const securityEvents = pgTable('security_events', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar('user_id'), // Null for failed login attempts with unknown user
  sessionId: varchar('session_id'),
  deviceId: varchar('device_id'),
  // Event details
  eventType: text('event_type').notNull(), // 'login', 'logout', 'mfa_sent', 'mfa_verified', 'mfa_failed', 'password_change', 'session_revoke', 'device_blocked', etc.
  eventStatus: text('event_status').notNull().default('success'), // 'success', 'failed', 'pending'
  // Context
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  location: text('location'),
  // Additional data (event-specific)
  metadata: jsonb('metadata'), // { reason: '...', targetDeviceId: '...', etc. }
  // Risk assessment
  riskScore: integer('risk_score'), // 0-100
  riskFactors: text('risk_factors').array(), // ['new_device', 'unusual_location', 'rapid_attempts']
  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertSecurityEventSchema = createInsertSchema(securityEvents).omit({
  id: true,
  createdAt: true,
});
export type InsertSecurityEvent = z.infer<typeof insertSecurityEventSchema>;
export type SecurityEvent = typeof securityEvents.$inferSelect;

// SMS delivery tracking (for troubleshooting)
export const smsDeliveries = pgTable('sms_deliveries', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  challengeId: varchar('challenge_id'),
  // Delivery details
  twilioMessageSid: text('twilio_message_sid'),
  toPhoneNumber: text('to_phone_number').notNull(), // Masked
  fromPhoneNumber: text('from_phone_number').notNull(),
  // Status
  status: text('status').notNull().default('sent'), // 'queued', 'sent', 'delivered', 'failed', 'undelivered'
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  deliveredAt: timestamp('delivered_at'),
});

export const insertSmsDeliverySchema = createInsertSchema(smsDeliveries).omit({
  id: true,
  createdAt: true,
});
export type InsertSmsDelivery = z.infer<typeof insertSmsDeliverySchema>;
export type SmsDelivery = typeof smsDeliveries.$inferSelect;

// Admin MFA challenges - for admin panel 2FA
export const adminMfaChallenges = pgTable('admin_mfa_challenges', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: text('email').notNull(),
  codeHash: text('code_hash').notNull(),
  phoneNumber: text('phone_number').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
  attemptCount: integer('attempt_count').notNull().default(0),
  verifiedAt: timestamp('verified_at'),
});

export const insertAdminMfaChallengeSchema = createInsertSchema(adminMfaChallenges).omit({
  id: true,
  createdAt: true,
  attemptCount: true,
  verifiedAt: true,
});
export type InsertAdminMfaChallenge = z.infer<typeof insertAdminMfaChallengeSchema>;
export type AdminMfaChallenge = typeof adminMfaChallenges.$inferSelect;

// ============================================
// FIREFLY III INTEGRATION
// ============================================

export const fireflyConnections = pgTable('firefly_connections', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  environment: text('environment').notNull().default('demo'),
  instanceUrl: text('instance_url').notNull(),
  accessToken: text('access_token').notNull(),
  instanceVersion: text('instance_version'),
  isActive: boolean('is_active').notNull().default(true),
  autoSyncEnabled: boolean('auto_sync_enabled').notNull().default(false),
  lastSyncAt: timestamp('last_sync_at'),
  lastSyncStatus: text('last_sync_status'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertFireflyConnectionSchema = createInsertSchema(fireflyConnections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertFireflyConnection = z.infer<typeof insertFireflyConnectionSchema>;
export type FireflyConnection = typeof fireflyConnections.$inferSelect;

export const fireflySyncLogs = pgTable('firefly_sync_logs', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  connectionId: varchar('connection_id').notNull(),
  userId: varchar('user_id').notNull(),
  environment: text('environment').notNull().default('demo'),
  syncType: text('sync_type').notNull(),
  sourceType: text('source_type').notNull(),
  sourceId: varchar('source_id').notNull(),
  fireflyTransactionId: text('firefly_transaction_id'),
  status: text('status').notNull().default('pending'),
  errorMessage: text('error_message'),
  syncedAt: timestamp('synced_at').notNull().defaultNow(),
});

export const insertFireflySyncLogSchema = createInsertSchema(fireflySyncLogs).omit({
  id: true,
  syncedAt: true,
});
export type InsertFireflySyncLog = z.infer<typeof insertFireflySyncLogSchema>;
export type FireflySyncLog = typeof fireflySyncLogs.$inferSelect;

// ============================================
// SCHEDULED JOB RUNS - For live-mode idempotency and observability
// ============================================

export const scheduledJobRuns = pgTable('scheduled_job_runs', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  jobName: text('job_name').notNull(),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  status: text('status').notNull().default('pending'), // success, failure, skipped
  startedAt: timestamp('started_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  durationMs: integer('duration_ms'),
  result: text('result'), // JSON string of job result
  errorMessage: text('error_message'),
  appMode: text('app_mode').notNull().default('live'),
});

export const insertScheduledJobRunSchema = createInsertSchema(scheduledJobRuns).omit({
  id: true,
});
export type InsertScheduledJobRun = z.infer<typeof insertScheduledJobRunSchema>;
export type ScheduledJobRun = typeof scheduledJobRuns.$inferSelect;

// ============================================
// DATA GOVERNANCE - RE-EXPORTS
// ============================================

export * from './governance-schema';

// ============================================
// WORKSPACE - RE-EXPORTS
// ============================================

export * from './workspace-schema';

// ============================================
// PLATFORM ADMIN - RE-EXPORTS
// ============================================

export * from './platform-admin-schema';

// ============================================
// SECURITY ALERTS
// ============================================

export const securityAlerts = pgTable('security_alerts', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  type: text('type').notNull(), // '2FA_MISSING', 'DATA_ISOLATION', 'ABNORMAL_TRAFFIC'
  severity: text('severity').notNull().default('medium'), // 'low', 'medium', 'high', 'critical'
  message: text('message').notNull(),
  isResolved: boolean('is_resolved').default(false),
  resolvedAt: timestamp('resolved_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertSecurityAlertSchema = createInsertSchema(securityAlerts).omit({
  id: true,
  createdAt: true,
  resolvedAt: true,
});
export type InsertSecurityAlert = z.infer<typeof insertSecurityAlertSchema>;
export type SecurityAlert = typeof securityAlerts.$inferSelect;

// ============================================
// OAUTH & EXTERNAL INTEGRATIONS
// ============================================

export const userOauthConnections = pgTable('user_oauth_connections', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  provider: text('provider').notNull(), // 'google'
  providerAccountId: text('provider_account_id').notNull(),
  providerEmail: text('provider_email'),
  grantedScopes: text('granted_scopes').array(),
  accessTokenEncrypted: text('access_token_encrypted'),
  refreshTokenEncrypted: text('refresh_token_encrypted'),
  tokenExpiryAt: timestamp('token_expiry_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  disconnectedAt: timestamp('disconnected_at'),
});

export const insertUserOauthConnectionSchema = createInsertSchema(userOauthConnections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUserOauthConnection = z.infer<typeof insertUserOauthConnectionSchema>;
export type UserOauthConnection = typeof userOauthConnections.$inferSelect;

export const integrationConnections = pgTable('integration_connections', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  provider: text('provider').notNull(), // 'google'
  integrationType: text('integration_type').notNull(), // 'calendar', 'drive'
  externalAccountId: text('external_account_id'),
  displayName: text('display_name'),
  grantedScopes: text('granted_scopes').array(),
  accessTokenEncrypted: text('access_token_encrypted'),
  refreshTokenEncrypted: text('refresh_token_encrypted'),
  tokenExpiryAt: timestamp('token_expiry_at'),
  metadataJson: jsonb('metadata_json'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  disconnectedAt: timestamp('disconnected_at'),
});

export const insertIntegrationConnectionSchema = createInsertSchema(integrationConnections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertIntegrationConnection = z.infer<typeof insertIntegrationConnectionSchema>;
export type IntegrationConnection = typeof integrationConnections.$inferSelect;

export const authAuditLogs = pgTable('auth_audit_logs', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id'),
  provider: text('provider').notNull(),
  action: text('action').notNull(), // 'login', 'link', 'disconnect', 'error'
  status: text('status').notNull(), // 'success', 'failure'
  redactedErrorMessage: text('redacted_error_message'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertAuthAuditLogSchema = createInsertSchema(authAuditLogs).omit({
  id: true,
  createdAt: true,
});
export type InsertAuthAuditLog = z.infer<typeof insertAuthAuditLogSchema>;
export type AuthAuditLog = typeof authAuditLogs.$inferSelect;

export const driveFolderBindings = pgTable('drive_folder_bindings', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  integrationConnectionId: varchar('integration_connection_id').notNull(),
  externalFolderId: text('external_folder_id').notNull(),
  folderName: text('folder_name').notNull(),
  purpose: text('purpose').notNull(), // 'case_files', 'reports', 'general'
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertDriveFolderBindingSchema = createInsertSchema(driveFolderBindings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDriveFolderBinding = z.infer<typeof insertDriveFolderBindingSchema>;
export type DriveFolderBinding = typeof driveFolderBindings.$inferSelect;

// Phase 6: Canonical AI Review Queue
export const dataSyncProposals = pgTable('data_sync_proposals', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar('document_id').notNull(),
  userId: varchar('user_id').notNull(),
  caseId: varchar('case_id'),
  targetTable: text('target_table').notNull(), // e.g. 'transactions', 'violations'
  proposedData: jsonb('proposed_data').notNull(),
  confidenceScore: real('confidence_score').notNull(),
  rationale: text('rationale'),
  sourceLineage: jsonb('source_lineage'), // bounding boxes, raw snippet references
  status: text('status').notNull().default('pending_review'), // pending_review, approved, rejected, edited, deferred, merged
  resolvedAt: timestamp('resolved_at'),
  downstreamEffects: text('downstream_effects'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  environment: text('environment').notNull().default('demo'),
});

export const insertDataSyncProposalSchema = createInsertSchema(dataSyncProposals).omit({
  id: true,
  createdAt: true,
  resolvedAt: true,
});
export type InsertDataSyncProposal = z.infer<typeof insertDataSyncProposalSchema>;
export type DataSyncProposal = typeof dataSyncProposals.$inferSelect;

export const driveTransferAudits = pgTable('drive_transfer_audits', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  caseId: varchar('case_id'),
  integrationConnectionId: varchar('integration_connection_id').notNull(),
  direction: text('direction').notNull(), // 'export', 'import'
  localFileId: varchar('local_file_id'),
  externalFileId: text('external_file_id'),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type'),
  action: text('action').notNull(), // 'started', 'completed', 'failed'
  status: text('status').notNull(), // 'success', 'error'
  redactedErrorMessage: text('redacted_error_message'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertDriveTransferAuditSchema = createInsertSchema(driveTransferAudits).omit({
  id: true,
  createdAt: true,
});
export type InsertDriveTransferAudit = z.infer<typeof insertDriveTransferAuditSchema>;
export type DriveTransferAudit = typeof driveTransferAudits.$inferSelect;

// ============================================================
// BATCH INGESTION SYSTEM (added 2026-04-10)
// ============================================================

// ── upload_batches ─────────────────────────────────────────────────────────────
// Groups a set of documents uploaded in the same session.
export const uploadBatches = pgTable('upload_batches', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  caseId: varchar('case_id'),                               // optional pre-assigned case
  batchName: text('batch_name'),
  sourceType: text('source_type').notNull().default('web_upload'), // web_upload | mobile | api
  environment: text('environment').notNull().default('live'),
  totalFiles: integer('total_files').notNull().default(0),
  totalCompleted: integer('total_completed').notNull().default(0),
  totalFailed: integer('total_failed').notNull().default(0),
  totalProcessing: integer('total_processing').notNull().default(0),
  status: text('status').notNull().default('created'),      // created | uploading | processing | completed | partial_failure | failed
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertUploadBatchSchema = createInsertSchema(uploadBatches).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUploadBatch = z.infer<typeof insertUploadBatchSchema>;
export type UploadBatch = typeof uploadBatches.$inferSelect;

export const BATCH_STATUSES = [
  'created',
  'uploading',
  'processing',
  'completed',
  'partial_failure',
  'failed',
] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

// ── document_processing_jobs ───────────────────────────────────────────────────
// One row per pipeline execution attempt. Enables retry, deduplication, and
// independent failure tracking within a batch.
export const documentProcessingJobs = pgTable('document_processing_jobs', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar('document_id').notNull(),              // FK → documents.id
  batchId: varchar('batch_id'),                              // FK → upload_batches.id
  jobType: text('job_type').notNull().default('full_pipeline'), // full_pipeline | ocr_only | classify_only | extract_only | retry
  status: text('status').notNull().default('queued'),        // queued | running | completed | failed | skipped
  attemptCount: integer('attempt_count').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  workerId: text('worker_id'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertDocumentProcessingJobSchema = createInsertSchema(documentProcessingJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDocumentProcessingJob = z.infer<typeof insertDocumentProcessingJobSchema>;
export type DocumentProcessingJob = typeof documentProcessingJobs.$inferSelect;

// ── document_audit_log ─────────────────────────────────────────────────────────
// Immutable, append-only chain-of-custody log for every document event.
// Never delete rows from this table.
export const documentAuditLog = pgTable('document_audit_log', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar('document_id').notNull(),              // FK → documents.id
  batchId: varchar('batch_id'),                              // FK → upload_batches.id
  actorType: text('actor_type').notNull().default('system'), // system | user | ai
  actorId: text('actor_id'),                                 // user_id when actor = user
  eventType: text('event_type').notNull(),                   // uploaded | processing_started | processing_completed | processing_failed | review_submitted | approved | rejected | retry_queued | duplicate_flagged | case_assigned | deleted | reclassified
  oldValue: jsonb('old_value'),
  newValue: jsonb('new_value'),
  notes: text('notes'),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertDocumentAuditLogSchema = createInsertSchema(documentAuditLog).omit({
  id: true,
  createdAt: true,
});
export type InsertDocumentAuditLog = z.infer<typeof insertDocumentAuditLogSchema>;
export type DocumentAuditLog = typeof documentAuditLog.$inferSelect;

// ============================================================
// OBLIGATION ENGINE SYSTEM (Phase 1)
// ============================================================

// ── extracted_entities ─────────────────────────────────────────────
// Raw entities extracted by AI (names, aliases, raw values)
export const extractedEntities = pgTable('extracted_entities', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar('document_id').notNull(),
  entityType: text('entity_type').notNull(), // 'party', 'date', 'amount', 'percentage'
  rawText: text('raw_text').notNull(),
  normalizedValue: text('normalized_value'),
  confidenceScore: real('confidence_score'),
  pageNumber: integer('page_number'),
  boundingBox: jsonb('bounding_box'), // e.g., {x, y, w, h}
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertExtractedEntitySchema = createInsertSchema(extractedEntities).omit({
  id: true,
  createdAt: true,
});
export type InsertExtractedEntity = z.infer<typeof insertExtractedEntitySchema>;
export type ExtractedEntity = typeof extractedEntities.$inferSelect;

// ── obligation_rules ───────────────────────────────────────────────
// Overarching case rules (e.g., "Husband pays 60% of medical bills")
export const obligationRules = pgTable('obligation_rules', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  caseId: varchar('case_id').notNull(), // Assuming a specific case Context
  sourceDocumentId: varchar('source_document_id'), // The document that established this rule
  ruleType: text('rule_type').notNull(), // 'percentage_split', 'fixed_amount', 'event_trigger'
  category: text('category'), // e.g., 'uninsured_medical', 'extracurricular'
  partyARole: text('party_a_role'), // e.g., 'Husband', 'Plaintiff'
  partyBRole: text('party_b_role'), 
  partyAPercentage: integer('party_a_percentage'), // e.g. 60
  partyBPercentage: integer('party_b_percentage'), // e.g. 40
  fixedAmount: integer('fixed_amount'), // if not a percentage
  keywords: text('keywords'), // comma-separated matchers
  effectiveStartDate: text('effective_start_date'),
  effectiveEndDate: text('effective_end_date'),
  isActive: boolean('is_active').notNull().default(true),
  notes: text('notes'),
  environment: text('environment').notNull().default('demo'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertObligationRuleSchema = createInsertSchema(obligationRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertObligationRule = z.infer<typeof insertObligationRuleSchema>;
export type ObligationRule = typeof obligationRules.$inferSelect;

// ── obligation_instances ───────────────────────────────────────────
// Specific billing events correctly routed via obligation rules
export const obligationInstances = pgTable('obligation_instances', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  caseId: varchar('case_id').notNull(),
  documentId: varchar('document_id'), // Made optional for manual entry (e.g. child support without a specific monthly receipt)
  ruleId: varchar('rule_id'), // optional link to the general rule applied
  title: text('title'), // E.g. "January Child Support"
  description: text('description'), // E.g. Notes
  category: text('category').notNull(), // child_support, uninsured_medical
  vendor: text('vendor'),
  amountGross: integer('amount_gross').notNull(), // total amount
  insuranceCoveredAmount: integer('insurance_covered_amount').default(0),
  partyAOwed: integer('party_a_owed'), // calculated split amount in cents
  partyBOwed: integer('party_b_owed'),
  direction: text('direction').notNull().default('due_from_spouse'), // 'due_from_spouse', 'due_to_spouse', 'split'
  payorId: varchar('payor_id'), // explicitly mapping who pays
  payeeId: varchar('payee_id'), // explicitly mapping who receives
  dueDate: text('due_date'),
  remainingBalance: integer('remaining_balance'), // Cents remaining
  status: text('status').notNull().default('pending'), // 'pending', 'paid', 'partially_paid', 'overdue', 'suspended', 'disputed'
  isRecurring: boolean('is_recurring').default(false),
  recurrenceFrequency: text('recurrence_frequency'), // 'monthly', 'weekly', 'biweekly'
  effectiveEndDate: text('effective_end_date'),
  isArrearage: boolean('is_arrearage').default(false),
  isAiComputed: boolean('is_ai_computed').default(true),
  confidenceScore: real('confidence_score'),
  reviewStatus: text('review_status').default('needs_review'), // 'needs_review', 'approved', 'corrected'
  environment: text('environment').notNull().default('demo'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertObligationInstanceSchema = createInsertSchema(obligationInstances).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertObligationInstance = z.infer<typeof insertObligationInstanceSchema>;
export type ObligationInstance = typeof obligationInstances.$inferSelect;

// ── obligation_payments ───────────────────────────────────────────
// Tracking discrete payments against a single obligation
export const obligationPayments = pgTable('obligation_payments', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  obligationId: varchar('obligation_id').notNull(),
  userId: varchar('user_id').notNull(),
  amountCents: integer('amount_cents').notNull(),
  paymentDate: text('payment_date').notNull(),
  paymentMethod: text('payment_method'), // 'bank_transfer', 'cash', 'zelle', 'other'
  notes: text('notes'),
  status: text('status').notNull().default('completed'), // 'completed', 'pending'
  environment: text('environment').notNull().default('demo'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertObligationPaymentSchema = createInsertSchema(obligationPayments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertObligationPayment = z.infer<typeof insertObligationPaymentSchema>;
export type ObligationPayment = typeof obligationPayments.$inferSelect;

// ── source_citations ───────────────────────────────────────────────
// Traceability mappings (which page/text block proves this number)
export const sourceCitations = pgTable('source_citations', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  targetTable: text('target_table').notNull(), // e.g. 'obligation_instances'
  targetId: varchar('target_id').notNull(), // ID of the obligation
  documentId: varchar('document_id').notNull(),
  pageNumber: integer('page_number'),
  snippet: text('snippet'),
  boundingBox: jsonb('bounding_box'),
  explanation: text('explanation'), // AI's explanation of why it extracted this
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertSourceCitationSchema = createInsertSchema(sourceCitations).omit({
  id: true,
  createdAt: true,
});
export type InsertSourceCitation = z.infer<typeof insertSourceCitationSchema>;
export type SourceCitation = typeof sourceCitations.$inferSelect;

// ── ai_extraction_runs ─────────────────────────────────────────────
// Audit trail of the entire pipeline
export const aiExtractionRuns = pgTable('ai_extraction_runs', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar('document_id').notNull(),
  modelUsed: text('model_used').notNull(), // e.g. 'gpt-4o-structured'
  stage: text('stage').notNull(), // 'classification', 'entity_extraction', 'obligation_logic'
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  latencyMs: integer('latency_ms'),
  rawOutput: jsonb('raw_output'),
  status: text('status').notNull().default('success'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertAiExtractionRunSchema = createInsertSchema(aiExtractionRuns).omit({
  id: true,
  createdAt: true,
});
export type InsertAiExtractionRun = z.infer<typeof insertAiExtractionRunSchema>;
export type AiExtractionRun = typeof aiExtractionRuns.$inferSelect;


// ============================================
// PHASE 1: RECURRING BILLS / MISSING UPLOADS
// ============================================

export const recurringBillTemplates = pgTable('recurring_bill_templates', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  caseId: varchar('case_id').notNull(),
  userId: varchar('user_id').notNull(),
  environment: text('environment').notNull().default('demo'),
  vendorName: text('vendor_name').notNull(),
  billName: text('bill_name').notNull(),
  category: text('category').notNull(),
  subcategory: text('subcategory'),
  expectedFrequency: text('expected_frequency').notNull().default('monthly'), // 'monthly', 'quarterly', 'yearly'
  expectedDayOfMonth: integer('expected_day_of_month'),
  dueDayOfMonth: integer('due_day_of_month'), // When it's usually due
  uploadWindowStartOffset: integer('upload_window_start_offset').default(-14), // Days before expected
  uploadWindowEndOffset: integer('upload_window_end_offset').default(14), // Days after expected
  splitType: text('split_type').notNull().default('custom'), // 'custom', 'pro_rata', 'equal'
  splitPercentageSpouse: numeric('split_percentage_spouse').notNull().default('0'),
  linkedObligationType: text('linked_obligation_type'),
  courtOrderRelated: boolean('court_order_related').notNull().default(false),
  requiredForReporting: boolean('required_for_reporting').notNull().default(false),
  active: boolean('active').notNull().default(true),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertRecurringBillTemplateSchema = createInsertSchema(recurringBillTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRecurringBillTemplate = z.infer<typeof insertRecurringBillTemplateSchema>;
export type RecurringBillTemplate = typeof recurringBillTemplates.$inferSelect;


export const recurringBillCycles = pgTable('recurring_bill_cycles', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  recurringBillTemplateId: varchar('recurring_bill_template_id').notNull().references(() => recurringBillTemplates.id, { onDelete: 'cascade' }),
  cycleMonth: integer('cycle_month').notNull(),
  cycleYear: integer('cycle_year').notNull(),
  expectedStartDate: timestamp('expected_start_date').notNull(),
  expectedEndDate: timestamp('expected_end_date').notNull(),
  dueDate: timestamp('due_date'),
  status: text('status').notNull().default('pending'), // 'uploaded', 'pending', 'missing', 'waived', 'overdue'
  matchedDocumentId: varchar('matched_document_id'),
  matchConfidence: numeric('match_confidence'),
  missingFlag: boolean('missing_flag').notNull().default(false),
  waivedFlag: boolean('waived_flag').notNull().default(false),
  snoozedUntil: timestamp('snoozed_until'),
  impactFlagsJson: jsonb('impact_flags_json'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertRecurringBillCycleSchema = createInsertSchema(recurringBillCycles).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRecurringBillCycle = z.infer<typeof insertRecurringBillCycleSchema>;
export type RecurringBillCycle = typeof recurringBillCycles.$inferSelect;


export const recurringBillNotifications = pgTable('recurring_bill_notifications', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  recurringBillCycleId: varchar('recurring_bill_cycle_id').notNull().references(() => recurringBillCycles.id, { onDelete: 'cascade' }),
  userId: varchar('user_id').notNull(),
  notificationType: text('notification_type').notNull(), // 'missing', 'overdue', 'auto_matched'
  severity: text('severity').notNull().default('info'), // 'info', 'warning', 'critical'
  status: text('status').notNull().default('unread'), // 'unread', 'read', 'archived'
  sentAt: timestamp('sent_at').notNull().defaultNow(),
  readAt: timestamp('read_at'),
  snoozedUntil: timestamp('snoozed_until'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertRecurringBillNotificationSchema = createInsertSchema(recurringBillNotifications).omit({ id: true, createdAt: true });
export type InsertRecurringBillNotification = z.infer<typeof insertRecurringBillNotificationSchema>;
export type RecurringBillNotification = typeof recurringBillNotifications.$inferSelect;


export const notificationPreferences = pgTable('notification_preferences', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull().unique(), // ensure 1 per user
  enableInApp: boolean('enable_in_app').notNull().default(true),
  enableEmailFutureReady: boolean('enable_email_future_ready').notNull().default(false),
  defaultPreDueDays: integer('default_pre_due_days').notNull().default(3),
  defaultOnDue: boolean('default_on_due').notNull().default(true),
  defaultPostDueDays: integer('default_post_due_days').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertNotificationPreferenceSchema = createInsertSchema(notificationPreferences).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertNotificationPreference = z.infer<typeof insertNotificationPreferenceSchema>;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;


export const recurringBillMatchEvents = pgTable('recurring_bill_match_events', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  recurringBillCycleId: varchar('recurring_bill_cycle_id').notNull().references(() => recurringBillCycles.id, { onDelete: 'cascade' }),
  documentId: varchar('document_id').notNull(),
  matchReason: text('match_reason').notNull(), // e.g. "Vendor & Date match"
  confidenceScore: numeric('confidence_score').notNull(),
  wasAutoApplied: boolean('was_auto_applied').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertRecurringBillMatchEventSchema = createInsertSchema(recurringBillMatchEvents).omit({ id: true, createdAt: true });
export type InsertRecurringBillMatchEvent = z.infer<typeof insertRecurringBillMatchEventSchema>;
export type RecurringBillMatchEvent = typeof recurringBillMatchEvents.$inferSelect;
