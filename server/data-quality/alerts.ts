import { getPool } from '../db';
import type { ExpectationResult } from './expectations';
import type { AnomalyDetection } from './profiler';
import type { ReconciliationResult } from './reconciliation';
import { safeQuery } from '../lib/safeQuery';

export interface DqAlert {
  id?: string;
  runId?: string;
  metricId?: string;
  anomalyId?: string;
  reconciliationResultId?: string;
  alertType: 'validation_failed' | 'anomaly_detected' | 'reconciliation_mismatch';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  affectedTable?: string;
  affectedColumn?: string;
  suggestedAction?: string;
  isResolved: boolean;
  createdAt?: Date;
}

class DqAlertService {
  async createAlertFromValidation(result: ExpectationResult, runId: string, metricId?: string): Promise<DqAlert | null> {
    if (result.passed) return null;

    const alert: DqAlert = {
      runId,
      metricId,
      alertType: 'validation_failed',
      severity: result.expectation.severity,
      title: `Validation Failed: ${result.expectation.name}`,
      description: result.message,
      affectedTable: result.expectation.table,
      affectedColumn: result.expectation.column,
      suggestedAction: this.getSuggestedAction('validation', result),
      isResolved: false
    };

    return this.saveAlert(alert);
  }

  async createAlertFromAnomaly(anomaly: AnomalyDetection, runId: string, anomalyId?: string): Promise<DqAlert> {
    const alert: DqAlert = {
      runId,
      anomalyId,
      alertType: 'anomaly_detected',
      severity: anomaly.severity,
      title: `Anomaly Detected: ${anomaly.anomalyType} in ${anomaly.tableName}`,
      description: anomaly.description,
      affectedTable: anomaly.tableName,
      affectedColumn: anomaly.columnName,
      suggestedAction: this.getSuggestedAction('anomaly', anomaly),
      isResolved: false
    };

    return this.saveAlert(alert);
  }

  async createAlertFromReconciliation(result: ReconciliationResult, runId: string, resultId?: string): Promise<DqAlert | null> {
    if (result.status === 'matched') return null;

    const severity = result.status === 'error' ? 'critical' : 
      (result.variancePercent && result.variancePercent > 10 ? 'critical' : 'warning');

    const alert: DqAlert = {
      runId,
      reconciliationResultId: resultId,
      alertType: 'reconciliation_mismatch',
      severity,
      title: `Reconciliation Mismatch: ${result.jobName}`,
      description: result.message,
      suggestedAction: this.getSuggestedAction('reconciliation', result),
      isResolved: false
    };

    return this.saveAlert(alert);
  }

  private getSuggestedAction(type: string, data: any): string {
    switch (type) {
      case 'validation':
        if (data.expectation?.type === 'not_null') {
          return 'Review and update records with null values, or adjust data quality rules if nulls are acceptable';
        }
        if (data.expectation?.type === 'referential_integrity') {
          return 'Investigate orphaned records and either create missing references or remove invalid foreign keys';
        }
        if (data.expectation?.type === 'unique') {
          return 'Identify and resolve duplicate records through deduplication or data correction';
        }
        return 'Review the failed validation and correct the underlying data issues';

      case 'anomaly':
        if (data.anomalyType === 'spike') {
          return 'Investigate the sudden increase in data volume. Check for bulk imports, duplicates, or unexpected data sources';
        }
        if (data.anomalyType === 'drop') {
          return 'Investigate the sudden decrease in data. Check for data deletion, ETL failures, or source system issues';
        }
        if (data.anomalyType === 'drift') {
          return 'Analyze the data distribution change. This may indicate business changes or data quality issues';
        }
        if (data.anomalyType === 'missing_data') {
          return 'Investigate increased null values. Check data sources and ETL processes for failures';
        }
        return 'Review the anomaly and investigate root causes';

      case 'reconciliation':
        if (data.status === 'error') {
          return 'Fix the reconciliation query errors and retry the job';
        }
        return 'Compare source and target systems to identify missing or inconsistent data. Check ETL processes for failures';

      default:
        return 'Review the data quality issue and take appropriate corrective action';
    }
  }

  private async saveAlert(alert: DqAlert): Promise<DqAlert> {
    const pool = getPool();
    const result = await safeQuery(
      pool,
      'dq.alerts:saveAlert',
      `INSERT INTO dq_alerts 
      (run_id, metric_id, anomaly_id, reconciliation_result_id, alert_type, severity,
       title, description, affected_table, affected_column, suggested_action, is_resolved)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, created_at`,
      [
        alert.runId, alert.metricId, alert.anomalyId, alert.reconciliationResultId,
        alert.alertType, alert.severity, alert.title, alert.description,
        alert.affectedTable, alert.affectedColumn, alert.suggestedAction, alert.isResolved
      ]
    );

    return {
      ...alert,
      id: result.rows[0].id,
      createdAt: result.rows[0].created_at
    };
  }

  async getActiveAlerts(limit: number = 50): Promise<DqAlert[]> {
    const pool = getPool();
    const result = await safeQuery(
      pool,
      'dq.alerts:getActiveAlerts',
      `SELECT * FROM dq_alerts 
      WHERE is_resolved = false 
      ORDER BY 
        CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
        created_at DESC
      LIMIT $1`,
      [limit]
    );

    return result.rows.map(this.mapRowToAlert);
  }

  async getAlertHistory(limit: number = 100): Promise<DqAlert[]> {
    const pool = getPool();
    const result = await safeQuery(
      pool,
      'dq.alerts:getAlertHistory',
      `SELECT * FROM dq_alerts 
      ORDER BY created_at DESC
      LIMIT $1`,
      [limit]
    );

    return result.rows.map(this.mapRowToAlert);
  }

  async resolveAlert(alertId: string, resolvedBy: string): Promise<DqAlert | null> {
    const pool = getPool();
    const result = await safeQuery(
      pool,
      'dq.alerts:resolveAlert',
      `UPDATE dq_alerts 
      SET is_resolved = true, resolved_by = $2, resolved_at = NOW()
      WHERE id = $1
      RETURNING *`,
      [alertId, resolvedBy]
    );

    if (result.rows.length === 0) return null;
    return this.mapRowToAlert(result.rows[0]);
  }

  async getAlertStats(): Promise<{
    total: number;
    active: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
    resolvedLast24h: number;
  }> {
    const pool = getPool();
    
    const [totalResult, activeResult, bySeverityResult, byTypeResult, resolvedResult] = await Promise.all([
      safeQuery(pool, 'dq.alerts:totalCount', 'SELECT COUNT(*) as cnt FROM dq_alerts', []),
      safeQuery(pool, 'dq.alerts:activeCount', 'SELECT COUNT(*) as cnt FROM dq_alerts WHERE is_resolved = false', []),
      safeQuery(pool, 'dq.alerts:bySeverity', 'SELECT severity, COUNT(*) as cnt FROM dq_alerts WHERE is_resolved = false GROUP BY severity', []),
      safeQuery(pool, 'dq.alerts:byType', 'SELECT alert_type, COUNT(*) as cnt FROM dq_alerts WHERE is_resolved = false GROUP BY alert_type', []),
      safeQuery(pool, 'dq.alerts:resolvedLast24h', `SELECT COUNT(*) as cnt FROM dq_alerts WHERE is_resolved = true AND resolved_at >= NOW() - INTERVAL '24 hours'`, [])
    ]);

    const bySeverity: Record<string, number> = {};
    for (const row of bySeverityResult.rows) {
      bySeverity[row.severity] = parseInt(row.cnt);
    }

    const byType: Record<string, number> = {};
    for (const row of byTypeResult.rows) {
      byType[row.alert_type] = parseInt(row.cnt);
    }

    return {
      total: parseInt(totalResult.rows[0].cnt),
      active: parseInt(activeResult.rows[0].cnt),
      bySeverity,
      byType,
      resolvedLast24h: parseInt(resolvedResult.rows[0].cnt)
    };
  }

  private mapRowToAlert(row: any): DqAlert {
    return {
      id: row.id,
      runId: row.run_id,
      metricId: row.metric_id,
      anomalyId: row.anomaly_id,
      reconciliationResultId: row.reconciliation_result_id,
      alertType: row.alert_type,
      severity: row.severity,
      title: row.title,
      description: row.description,
      affectedTable: row.affected_table,
      affectedColumn: row.affected_column,
      suggestedAction: row.suggested_action,
      isResolved: row.is_resolved,
      createdAt: row.created_at
    };
  }
}

export const dqAlertService = new DqAlertService();
