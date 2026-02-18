import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================
// DATA CLASSIFICATION & PII CATALOG
// ============================================

export const dataClassifications = pgTable("data_classifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 50 }).notNull().unique(),
  level: integer("level").notNull(),
  description: text("description"),
  handlingRequirements: text("handling_requirements"),
  encryptionRequired: boolean("encryption_required").default(false),
  maskingRequired: boolean("masking_required").default(false),
  auditRequired: boolean("audit_required").default(true),
  retentionDays: integer("retention_days"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDataClassificationSchema = createInsertSchema(dataClassifications).omit({ id: true, createdAt: true });
export type InsertDataClassification = z.infer<typeof insertDataClassificationSchema>;
export type DataClassification = typeof dataClassifications.$inferSelect;

export const piiCatalog = pgTable("pii_catalog", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tableName: varchar("table_name", { length: 100 }).notNull(),
  columnName: varchar("column_name", { length: 100 }).notNull(),
  dataType: varchar("data_type", { length: 50 }).notNull(),
  classificationId: varchar("classification_id").notNull(),
  piiType: varchar("pii_type", { length: 50 }),
  sensitivityLevel: varchar("sensitivity_level", { length: 20 }).notNull(),
  encryptionKeyId: varchar("encryption_key_id"),
  maskingProfile: varchar("masking_profile", { length: 50 }),
  isEncrypted: boolean("is_encrypted").default(false),
  sampleMaskedValue: text("sample_masked_value"),
  businessOwner: varchar("business_owner", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPiiCatalogSchema = createInsertSchema(piiCatalog).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPiiCatalog = z.infer<typeof insertPiiCatalogSchema>;
export type PiiCatalogEntry = typeof piiCatalog.$inferSelect;

// ============================================
// DATA LINEAGE (DAG)
// ============================================

export const dataLineageSources = pgTable("data_lineage_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  sourceType: varchar("source_type", { length: 50 }).notNull(),
  connectionDetails: jsonb("connection_details"),
  schemaInfo: jsonb("schema_info"),
  refreshSchedule: varchar("refresh_schedule", { length: 50 }),
  lastRefreshedAt: timestamp("last_refreshed_at"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDataLineageSourceSchema = createInsertSchema(dataLineageSources).omit({ id: true, createdAt: true });
export type InsertDataLineageSource = z.infer<typeof insertDataLineageSourceSchema>;
export type DataLineageSource = typeof dataLineageSources.$inferSelect;

export const dataLineageNodes = pgTable("data_lineage_nodes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nodeType: varchar("node_type", { length: 30 }).notNull(),
  entityName: varchar("entity_name", { length: 200 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  description: text("description"),
  metadata: jsonb("metadata"),
  sourceId: varchar("source_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDataLineageNodeSchema = createInsertSchema(dataLineageNodes).omit({ id: true, createdAt: true });
export type InsertDataLineageNode = z.infer<typeof insertDataLineageNodeSchema>;
export type DataLineageNode = typeof dataLineageNodes.$inferSelect;

export const dataLineageEdges = pgTable("data_lineage_edges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceNodeId: varchar("source_node_id").notNull(),
  targetNodeId: varchar("target_node_id").notNull(),
  transformationType: varchar("transformation_type", { length: 50 }),
  transformationLogic: text("transformation_logic"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDataLineageEdgeSchema = createInsertSchema(dataLineageEdges).omit({ id: true, createdAt: true });
export type InsertDataLineageEdge = z.infer<typeof insertDataLineageEdgeSchema>;
export type DataLineageEdge = typeof dataLineageEdges.$inferSelect;

// ============================================
// CONSENT MANAGEMENT
// ============================================

export const consentPurposes = pgTable("consent_purposes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description").notNull(),
  lawfulBasis: varchar("lawful_basis", { length: 50 }).notNull(),
  isRequired: boolean("is_required").default(false),
  dataCategories: text("data_categories").array(),
  retentionPeriodDays: integer("retention_period_days"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertConsentPurposeSchema = createInsertSchema(consentPurposes).omit({ id: true, createdAt: true });
export type InsertConsentPurpose = z.infer<typeof insertConsentPurposeSchema>;
export type ConsentPurpose = typeof consentPurposes.$inferSelect;

export const userConsents = pgTable("user_consents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  purposeId: varchar("purpose_id").notNull(),
  consentGiven: boolean("consent_given").notNull(),
  consentMethod: varchar("consent_method", { length: 50 }).notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  consentVersion: varchar("consent_version", { length: 20 }),
  expiresAt: timestamp("expires_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserConsentSchema = createInsertSchema(userConsents).omit({ id: true, createdAt: true });
export type InsertUserConsent = z.infer<typeof insertUserConsentSchema>;
export type UserConsent = typeof userConsents.$inferSelect;

// ============================================
// DATA SUBJECT REQUESTS (GDPR/CCPA)
// ============================================

export const dataSubjectRequests = pgTable("data_subject_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  requestType: varchar("request_type", { length: 30 }).notNull(),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  regulationType: varchar("regulation_type", { length: 20 }).notNull(),
  requestDetails: jsonb("request_details"),
  verificationMethod: varchar("verification_method", { length: 50 }),
  verifiedAt: timestamp("verified_at"),
  deadlineAt: timestamp("deadline_at").notNull(),
  processedAt: timestamp("processed_at"),
  processedBy: varchar("processed_by"),
  fulfillmentLog: jsonb("fulfillment_log"),
  exportFileUrl: text("export_file_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDataSubjectRequestSchema = createInsertSchema(dataSubjectRequests).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDataSubjectRequest = z.infer<typeof insertDataSubjectRequestSchema>;
export type DataSubjectRequest = typeof dataSubjectRequests.$inferSelect;

// ============================================
// RETENTION POLICIES
// ============================================

export const retentionPolicies = pgTable("retention_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  tableName: varchar("table_name", { length: 100 }).notNull(),
  dataCategory: varchar("data_category", { length: 50 }).notNull(),
  retentionPeriodDays: integer("retention_period_days").notNull(),
  archiveAfterDays: integer("archive_after_days"),
  deleteAfterDays: integer("delete_after_days"),
  purgeMode: varchar("purge_mode", { length: 30 }).notNull(),
  archiveBucket: varchar("archive_bucket", { length: 200 }),
  legalHoldEnabled: boolean("legal_hold_enabled").default(false),
  conditionColumn: varchar("condition_column", { length: 100 }),
  conditionValue: text("condition_value"),
  isActive: boolean("is_active").default(true),
  lastExecutedAt: timestamp("last_executed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRetentionPolicySchema = createInsertSchema(retentionPolicies).omit({ id: true, createdAt: true });
export type InsertRetentionPolicy = z.infer<typeof insertRetentionPolicySchema>;
export type RetentionPolicy = typeof retentionPolicies.$inferSelect;

export const retentionJobs = pgTable("retention_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  policyId: varchar("policy_id").notNull(),
  status: varchar("status", { length: 30 }).notNull(),
  recordsProcessed: integer("records_processed").default(0),
  recordsArchived: integer("records_archived").default(0),
  recordsDeleted: integer("records_deleted").default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertRetentionJobSchema = createInsertSchema(retentionJobs).omit({ id: true, startedAt: true });
export type InsertRetentionJob = z.infer<typeof insertRetentionJobSchema>;
export type RetentionJob = typeof retentionJobs.$inferSelect;

// ============================================
// AUDIT TRAIL
// ============================================

export const auditTrail = pgTable("audit_trail", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  sessionId: varchar("session_id"),
  action: varchar("action", { length: 50 }).notNull(),
  resourceType: varchar("resource_type", { length: 50 }).notNull(),
  resourceId: varchar("resource_id"),
  tableName: varchar("table_name", { length: 100 }),
  oldValues: jsonb("old_values"),
  newValues: jsonb("new_values"),
  changedFields: text("changed_fields").array(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  requestPath: varchar("request_path", { length: 500 }),
  requestMethod: varchar("request_method", { length: 10 }),
  responseStatus: integer("response_status"),
  durationMs: integer("duration_ms"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAuditTrailSchema = createInsertSchema(auditTrail).omit({ id: true, createdAt: true });
export type InsertAuditTrail = z.infer<typeof insertAuditTrailSchema>;
export type AuditTrailEntry = typeof auditTrail.$inferSelect;

// ============================================
// ENCRYPTION KEYS MANAGEMENT
// ============================================

export const encryptionKeys = pgTable("encryption_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  keyAlias: varchar("key_alias", { length: 100 }).notNull().unique(),
  keyType: varchar("key_type", { length: 30 }).notNull(),
  algorithm: varchar("algorithm", { length: 30 }).notNull(),
  purpose: varchar("purpose", { length: 100 }).notNull(),
  encryptedKeyMaterial: text("encrypted_key_material"),
  keyVersion: integer("key_version").notNull().default(1),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  rotationScheduleDays: integer("rotation_schedule_days"),
  lastRotatedAt: timestamp("last_rotated_at"),
  expiresAt: timestamp("expires_at"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertEncryptionKeySchema = createInsertSchema(encryptionKeys).omit({ id: true, createdAt: true });
export type InsertEncryptionKey = z.infer<typeof insertEncryptionKeySchema>;
export type EncryptionKey = typeof encryptionKeys.$inferSelect;

// ============================================
// BUSINESS METRICS DEFINITIONS
// ============================================

export const businessMetrics = pgTable("business_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull().unique(),
  displayName: varchar("display_name", { length: 150 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }).notNull(),
  formula: text("formula").notNull(),
  sqlQuery: text("sql_query"),
  unit: varchar("unit", { length: 30 }),
  aggregationType: varchar("aggregation_type", { length: 30 }),
  dimensions: text("dimensions").array(),
  dataSource: varchar("data_source", { length: 100 }),
  refreshFrequency: varchar("refresh_frequency", { length: 30 }),
  owner: varchar("owner", { length: 100 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBusinessMetricSchema = createInsertSchema(businessMetrics).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBusinessMetric = z.infer<typeof insertBusinessMetricSchema>;
export type BusinessMetric = typeof businessMetrics.$inferSelect;

// ============================================
// DATA QUALITY TESTS
// ============================================

export const dataQualityTests = pgTable("data_quality_tests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  testType: varchar("test_type", { length: 50 }).notNull(),
  tableName: varchar("table_name", { length: 100 }).notNull(),
  columnName: varchar("column_name", { length: 100 }),
  testQuery: text("test_query").notNull(),
  expectedResult: text("expected_result"),
  threshold: real("threshold"),
  severity: varchar("severity", { length: 20 }).notNull(),
  schedule: varchar("schedule", { length: 50 }),
  isActive: boolean("is_active").default(true),
  lastRunAt: timestamp("last_run_at"),
  lastRunStatus: varchar("last_run_status", { length: 20 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDataQualityTestSchema = createInsertSchema(dataQualityTests).omit({ id: true, createdAt: true });
export type InsertDataQualityTest = z.infer<typeof insertDataQualityTestSchema>;
export type DataQualityTest = typeof dataQualityTests.$inferSelect;

export const dataQualityTestRuns = pgTable("data_quality_test_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  testId: varchar("test_id").notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  actualResult: text("actual_result"),
  passed: boolean("passed"),
  errorMessage: text("error_message"),
  recordsChecked: integer("records_checked"),
  failedRecords: integer("failed_records"),
  executionTimeMs: integer("execution_time_ms"),
  executedAt: timestamp("executed_at").notNull().defaultNow(),
});

export const insertDataQualityTestRunSchema = createInsertSchema(dataQualityTestRuns).omit({ id: true, executedAt: true });
export type InsertDataQualityTestRun = z.infer<typeof insertDataQualityTestRunSchema>;
export type DataQualityTestRun = typeof dataQualityTestRuns.$inferSelect;

// ============================================
// METADATA CATALOG
// ============================================

export const metadataCatalog = pgTable("metadata_catalog", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityName: varchar("entity_name", { length: 200 }).notNull(),
  schemaName: varchar("schema_name", { length: 100 }),
  description: text("description"),
  businessDefinition: text("business_definition"),
  dataOwner: varchar("data_owner", { length: 100 }),
  dataSteward: varchar("data_steward", { length: 100 }),
  tags: text("tags").array(),
  customProperties: jsonb("custom_properties"),
  documentation: text("documentation"),
  lastUpdatedBy: varchar("last_updated_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertMetadataCatalogSchema = createInsertSchema(metadataCatalog).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMetadataCatalog = z.infer<typeof insertMetadataCatalogSchema>;
export type MetadataCatalogEntry = typeof metadataCatalog.$inferSelect;

// ============================================
// TYPE EXPORTS
// ============================================

export type DataSubjectRequestType = 'access' | 'erasure' | 'portability' | 'rectification' | 'restriction' | 'objection';
export type DataSubjectRequestStatus = 'pending' | 'verified' | 'in_progress' | 'completed' | 'rejected' | 'expired';
export type RegulationType = 'gdpr' | 'ccpa' | 'hipaa' | 'other';
export type SensitivityLevel = 'public' | 'internal' | 'confidential' | 'restricted' | 'highly_restricted';
export type PurgeMode = 'soft_delete' | 'hard_delete' | 'archive' | 'anonymize';
export type AuditAction = 'create' | 'read' | 'update' | 'delete' | 'export' | 'login' | 'logout' | 'consent' | 'access_denied';
