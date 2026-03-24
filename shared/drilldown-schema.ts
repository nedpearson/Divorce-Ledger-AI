import { z } from 'zod';

// ============================================================================
// PHASE 1: GLOBAL DRILL-DOWN CONTRACT
// This file defines the universal traceability architecture required to
// investigate any calculation, aggregate, or workflow state natively.
// ============================================================================

export type DrilldownLayer = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const DrilldownEntityTypes = [
  'financial_summary',
  'financial_category',
  'financial_record',
  'document',
  'data_sync_proposal',
  'workflow_state',
  'user_action',
  'audit_log',
  'kpi_metric',
  'chart_segment',
  'violation',
] as const;

export type DrilldownEntityType = typeof DrilldownEntityTypes[number];

// 1. The universal payload emitted by any client chart, KPI, or table cell
export const drilldownRequestSchema = z.object({
  // Depth requested
  layer: z.number().min(1).max(8),
  // Type of entity being investigated
  sourceEntity: z.enum(DrilldownEntityTypes),
  // Specifically what instance (e.g. "total_income", "user_123", "category_housing")
  identifier: z.string(),
  // Upward context preserving dashboard/filter states automatically
  context: z.object({
    dateRange: z.object({
      start: z.string().optional(),
      end: z.string().optional()
    }).optional(),
    filters: z.record(z.any()).optional(),
    workspaceId: z.string().optional()
  }).optional(),
  // For chaining traces (breadcrumb memory)
  parentTraceId: z.string().optional()
});

export type DrilldownRequest = z.infer<typeof drilldownRequestSchema>;

// 2. The universal explanatory payload mapping the origin of data
export const lineageMetadataSchema = z.object({
  description: z.string(),
  formula: z.string().optional(),
  sqlExtract: z.string().optional(),
  lastUpdated: z.string().optional(),
  authorId: z.string().optional(),
  contributingRecordCount: z.number().optional(),
  anomalies: z.array(z.string()).optional()
});

export type LineageMetadata = z.infer<typeof lineageMetadataSchema>;

// 3. The universal backend response satisfying the DrillDownDrawer/Modal UI
export interface DrilldownResponse {
  layer: DrilldownLayer;
  title: string;
  // The 'Why/How' block
  lineage: LineageMetadata;
  // The resulting payload maps to exactly one of these arrays/objects depending on depth
  data: {
    summary?: any;             // Layer 1
    segments?: any[];          // Layer 2
    records?: any[];           // Layer 3
    detail?: any;              // Layer 4
    relationships?: any[];     // Layer 5
    auditTimeline?: any[];     // Layer 6
    evidence?: any[];          // Layer 7
    rawMetadata?: any;         // Layer 8
  };
  // Pre-hydrated quick actions for the client drawer controls
  availableActions: string[];
}
