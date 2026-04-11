import fs from 'fs';
import path from 'path';

const schemaPath = path.join(process.cwd(), 'shared', 'schema.ts');

const newSchema = `
// ============================================================
// OBLIGATION ENGINE SYSTEM (Phase 1)
// ============================================================

// ── extracted_entities ─────────────────────────────────────────────
// Raw entities extracted by AI (names, aliases, raw values)
export const extractedEntities = pgTable('extracted_entities', {
  id: varchar('id').primaryKey().default(sql\`gen_random_uuid()\`),
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
  id: varchar('id').primaryKey().default(sql\`gen_random_uuid()\`),
  caseId: varchar('case_id').notNull(), // Assuming a specific case Context
  sourceDocumentId: varchar('source_document_id'), // The document that established this rule
  ruleType: text('rule_type').notNull(), // 'percentage_split', 'fixed_amount', 'event_trigger'
  category: text('category'), // e.g., 'uninsured_medical', 'extracurricular'
  partyARole: text('party_a_role'), // e.g., 'Husband', 'Plaintiff'
  partyBRole: text('party_b_role'), 
  partyAPercentage: integer('party_a_percentage'), // e.g. 60
  partyBPercentage: integer('party_b_percentage'), // e.g. 40
  fixedAmount: integer('fixed_amount'), // if not a percentage
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
  id: varchar('id').primaryKey().default(sql\`gen_random_uuid()\`),
  caseId: varchar('case_id').notNull(),
  documentId: varchar('document_id').notNull(), // invoice or bill document
  ruleId: varchar('rule_id'), // optional link to the general rule applied
  category: text('category').notNull(),
  vendor: text('vendor'),
  amountGross: integer('amount_gross').notNull(), // total amount
  insuranceCoveredAmount: integer('insurance_covered_amount').default(0),
  partyAOwed: integer('party_a_owed'), // calculated split amount in cents
  partyBOwed: integer('party_b_owed'),
  dueDate: text('due_date'),
  status: text('status').notNull().default('pending'), // 'pending', 'paid', 'disputed'
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

// ── source_citations ───────────────────────────────────────────────
// Traceability mappings (which page/text block proves this number)
export const sourceCitations = pgTable('source_citations', {
  id: varchar('id').primaryKey().default(sql\`gen_random_uuid()\`),
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
  id: varchar('id').primaryKey().default(sql\`gen_random_uuid()\`),
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
`;

fs.appendFileSync(schemaPath, '\\n' + newSchema);
console.log('Successfully appended Obligation Engine schema blocks to shared/schema.ts!');
