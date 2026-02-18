export interface GoldenSetDocument {
  id: string;
  name: string;
  description: string;
  fileType: 'image' | 'pdf' | 'document';
  mimeType: string;
  category: string;
  expectedExtraction: ExpectedExtraction;
  shouldAutoFinalize: boolean;
  tags: string[];
}

export interface ExpectedExtraction {
  dates?: ExpectedDate[];
  amounts?: ExpectedAmount[];
  entities?: ExpectedEntity[];
  lineItems?: ExpectedLineItem[];
  documentType?: string;
  documentNumber?: string;
}

export interface ExpectedDate {
  field: string;
  value: string;
  format: 'YYYY-MM-DD';
}

export interface ExpectedAmount {
  field: string;
  value: number;
  currency: string;
}

export interface ExpectedEntity {
  field: string;
  name: string;
  type: 'person' | 'organization' | 'vendor';
}

export interface ExpectedLineItem {
  description: string;
  amount: number;
  quantity?: number;
}

export interface EvaluationResult {
  documentId: string;
  documentName: string;
  success: boolean;
  metrics: DocumentMetrics;
  errors: string[];
}

export interface DocumentMetrics {
  dateAccuracy: AccuracyMetric;
  amountAccuracy: AccuracyMetric;
  categoryAccuracy: boolean;
  entityAccuracy: AccuracyMetric;
  lineItemAccuracy: AccuracyMetric;
  correctlyFinalized: boolean;
  falseFinalization: boolean;
}

export interface AccuracyMetric {
  total: number;
  correct: number;
  accuracy: number;
}

export interface GoldenSetReport {
  timestamp: string;
  modelVersion: string;
  promptVersionHash: string;
  totalDocuments: number;
  passedDocuments: number;
  overallAccuracy: number;
  metrics: AggregateMetrics;
  falseFinalizationRate: number;
  results: EvaluationResult[];
  regressionStatus: 'pass' | 'fail' | 'baseline';
}

export interface AggregateMetrics {
  dateAccuracy: number;
  amountAccuracy: number;
  categoryAccuracy: number;
  entityAccuracy: number;
  lineItemAccuracy: number;
}

export interface BaselineMetrics {
  version: string;
  timestamp: string;
  dateAccuracy: number;
  amountAccuracy: number;
  categoryAccuracy: number;
  entityAccuracy: number;
  lineItemAccuracy: number;
  falseFinalizationRate: number;
}
