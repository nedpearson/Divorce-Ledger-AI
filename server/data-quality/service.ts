import { getPool } from '../db';
import { ExpectationSuite, createAppExpectationSuite, createWarehouseExpectationSuite, ExpectationResult } from './expectations';
import { dataProfiler, TableProfile, AnomalyDetection } from './profiler';
import { reconciliationService, ReconciliationResult } from './reconciliation';
import { dqAlertService } from './alerts';
import { safeQuery } from '../lib/safeQuery';

export interface DataQualityRunResult {
  runId: string;
  runType: 'full' | 'validation' | 'profiling' | 'reconciliation';
  targetSystem: string;
  status: 'completed' | 'failed';
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  warningChecks: number;
  validationResults?: ExpectationResult[];
  profiles?: TableProfile[];
  anomalies?: AnomalyDetection[];
  reconciliationResults?: ReconciliationResult[];
  alertsCreated: number;
  duration: number;
  startedAt: Date;
  completedAt: Date;
}

const APP_TABLES = ['users', 'cases', 'violations', 'transactions', 'assets', 'debts', 'incomes', 'expenses'];
const WAREHOUSE_TABLES = ['dim_users', 'dim_date', 'fact_violations', 'fact_transactions'];

class DataQualityService {
  async runFullQualityCheck(): Promise<DataQualityRunResult> {
    const startTime = Date.now();
    const runId = await this.createRun('full', 'all');

    let validationResults: ExpectationResult[] = [];
    let profiles: TableProfile[] = [];
    let anomalies: AnomalyDetection[] = [];
    let reconciliationResults: ReconciliationResult[] = [];
    let alertsCreated = 0;

    try {
      console.log('[DQ] Starting full data quality check...');

      console.log('[DQ] Running app validations...');
      const appSuite = createAppExpectationSuite();
      const appResults = await appSuite.validate();
      validationResults.push(...appResults);

      try {
        console.log('[DQ] Running warehouse validations...');
        const warehouseSuite = createWarehouseExpectationSuite();
        const warehouseResults = await warehouseSuite.validate();
        validationResults.push(...warehouseResults);
      } catch (e) {
        console.log('[DQ] Warehouse validation skipped (tables may not exist)');
      }

      for (const result of validationResults) {
        await this.saveMetric(runId, result);
        if (!result.passed) {
          const alert = await dqAlertService.createAlertFromValidation(result, runId);
          if (alert) alertsCreated++;
        }
      }

      console.log('[DQ] Running data profiling...');
      for (const table of APP_TABLES) {
        try {
          const profile = await dataProfiler.profileTable(table);
          profiles.push(profile);
          await this.saveProfile(runId, profile);

          const historicalProfiles = await dataProfiler.getHistoricalProfiles(table);
          const tableAnomalies = await dataProfiler.detectAnomalies(profile, historicalProfiles);
          
          for (const anomaly of tableAnomalies) {
            const anomalyId = await this.saveAnomaly(runId, anomaly);
            const alert = await dqAlertService.createAlertFromAnomaly(anomaly, runId, anomalyId);
            if (alert) alertsCreated++;
          }
          anomalies.push(...tableAnomalies);
        } catch (e) {
          console.log(`[DQ] Profiling skipped for ${table}: table may not exist`);
        }
      }

      console.log('[DQ] Running reconciliation checks...');
      reconciliationResults = await reconciliationService.runAllReconciliations(runId);
      
      for (const result of reconciliationResults) {
        if (result.status !== 'matched') {
          const alert = await dqAlertService.createAlertFromReconciliation(result, runId);
          if (alert) alertsCreated++;
        }
      }

      const passedChecks = validationResults.filter(r => r.passed).length + 
                           reconciliationResults.filter(r => r.status === 'matched').length;
      const failedChecks = validationResults.filter(r => !r.passed && r.expectation.severity === 'critical').length +
                           reconciliationResults.filter(r => r.status !== 'matched').length;
      const warningChecks = validationResults.filter(r => !r.passed && r.expectation.severity === 'warning').length;
      const totalChecks = validationResults.length + reconciliationResults.length;

      const endTime = Date.now();
      await this.completeRun(runId, 'completed', totalChecks, passedChecks, failedChecks, warningChecks);

      console.log(`[DQ] Full check completed: ${passedChecks}/${totalChecks} passed, ${alertsCreated} alerts created`);

      return {
        runId,
        runType: 'full',
        targetSystem: 'all',
        status: 'completed',
        totalChecks,
        passedChecks,
        failedChecks,
        warningChecks,
        validationResults,
        profiles,
        anomalies,
        reconciliationResults,
        alertsCreated,
        duration: endTime - startTime,
        startedAt: new Date(startTime),
        completedAt: new Date(endTime)
      };
    } catch (error: any) {
      await this.completeRun(runId, 'failed', 0, 0, 0, 0);
      throw error;
    }
  }

  async runValidation(targetSystem: 'app' | 'warehouse' = 'app'): Promise<DataQualityRunResult> {
    const startTime = Date.now();
    const runId = await this.createRun('validation', targetSystem);

    try {
      const suite = targetSystem === 'app' ? createAppExpectationSuite() : createWarehouseExpectationSuite();
      const results = await suite.validate();

      let alertsCreated = 0;
      for (const result of results) {
        await this.saveMetric(runId, result);
        if (!result.passed) {
          const alert = await dqAlertService.createAlertFromValidation(result, runId);
          if (alert) alertsCreated++;
        }
      }

      const passedChecks = results.filter(r => r.passed).length;
      const failedChecks = results.filter(r => !r.passed && r.expectation.severity === 'critical').length;
      const warningChecks = results.filter(r => !r.passed && r.expectation.severity === 'warning').length;

      const endTime = Date.now();
      await this.completeRun(runId, 'completed', results.length, passedChecks, failedChecks, warningChecks);

      return {
        runId,
        runType: 'validation',
        targetSystem,
        status: 'completed',
        totalChecks: results.length,
        passedChecks,
        failedChecks,
        warningChecks,
        validationResults: results,
        alertsCreated,
        duration: endTime - startTime,
        startedAt: new Date(startTime),
        completedAt: new Date(endTime)
      };
    } catch (error: any) {
      await this.completeRun(runId, 'failed', 0, 0, 0, 0);
      throw error;
    }
  }

  async runProfiling(tables: string[] = APP_TABLES): Promise<DataQualityRunResult> {
    const startTime = Date.now();
    const runId = await this.createRun('profiling', 'app');

    const profiles: TableProfile[] = [];
    const anomalies: AnomalyDetection[] = [];
    let alertsCreated = 0;

    try {
      for (const table of tables) {
        try {
          const profile = await dataProfiler.profileTable(table);
          profiles.push(profile);
          await this.saveProfile(runId, profile);

          const historicalProfiles = await dataProfiler.getHistoricalProfiles(table);
          const tableAnomalies = await dataProfiler.detectAnomalies(profile, historicalProfiles);
          
          for (const anomaly of tableAnomalies) {
            const anomalyId = await this.saveAnomaly(runId, anomaly);
            const alert = await dqAlertService.createAlertFromAnomaly(anomaly, runId, anomalyId);
            if (alert) alertsCreated++;
          }
          anomalies.push(...tableAnomalies);
        } catch (e) {
          console.log(`[DQ] Profiling skipped for ${table}`);
        }
      }

      const endTime = Date.now();
      await this.completeRun(runId, 'completed', tables.length, tables.length - anomalies.length, 0, anomalies.length);

      return {
        runId,
        runType: 'profiling',
        targetSystem: 'app',
        status: 'completed',
        totalChecks: tables.length,
        passedChecks: tables.length,
        failedChecks: 0,
        warningChecks: anomalies.length,
        profiles,
        anomalies,
        alertsCreated,
        duration: endTime - startTime,
        startedAt: new Date(startTime),
        completedAt: new Date(endTime)
      };
    } catch (error: any) {
      await this.completeRun(runId, 'failed', 0, 0, 0, 0);
      throw error;
    }
  }

  async runReconciliation(): Promise<DataQualityRunResult> {
    const startTime = Date.now();
    const runId = await this.createRun('reconciliation', 'all');

    try {
      const results = await reconciliationService.runAllReconciliations(runId);

      let alertsCreated = 0;
      for (const result of results) {
        if (result.status !== 'matched') {
          const alert = await dqAlertService.createAlertFromReconciliation(result, runId);
          if (alert) alertsCreated++;
        }
      }

      const passedChecks = results.filter(r => r.status === 'matched').length;
      const failedChecks = results.filter(r => r.status !== 'matched').length;

      const endTime = Date.now();
      await this.completeRun(runId, 'completed', results.length, passedChecks, failedChecks, 0);

      return {
        runId,
        runType: 'reconciliation',
        targetSystem: 'all',
        status: 'completed',
        totalChecks: results.length,
        passedChecks,
        failedChecks,
        warningChecks: 0,
        reconciliationResults: results,
        alertsCreated,
        duration: endTime - startTime,
        startedAt: new Date(startTime),
        completedAt: new Date(endTime)
      };
    } catch (error: any) {
      await this.completeRun(runId, 'failed', 0, 0, 0, 0);
      throw error;
    }
  }

  async getRunHistory(limit: number = 20): Promise<any[]> {
    const pool = getPool();
    const result = await safeQuery(
      pool,
      'dq.service:getRunHistory',
      `SELECT * FROM quality_runs 
      ORDER BY started_at DESC 
      LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  async getRunDetails(runId: string): Promise<any> {
    const pool = getPool();
    const [runResult, metricsResult, profilesResult, anomaliesResult, reconciliationResult] = await Promise.all([
      safeQuery(pool, 'dq.service:getRunById', 'SELECT * FROM quality_runs WHERE id = $1', [runId]),
      safeQuery(pool, 'dq.service:getMetricsByRun', 'SELECT * FROM quality_metrics WHERE run_id = $1', [runId]),
      safeQuery(pool, 'dq.service:getProfilesByRun', 'SELECT * FROM data_profiles WHERE run_id = $1', [runId]),
      safeQuery(pool, 'dq.service:getAnomaliesByRun', 'SELECT * FROM quality_anomalies WHERE run_id = $1', [runId]),
      safeQuery(pool, 'dq.service:getReconciliationByRun', 'SELECT * FROM reconciliation_results WHERE run_id = $1', [runId])
    ]);

    return {
      run: runResult.rows[0],
      metrics: metricsResult.rows,
      profiles: profilesResult.rows,
      anomalies: anomaliesResult.rows,
      reconciliationResults: reconciliationResult.rows
    };
  }

  async getDashboardStats(): Promise<{
    lastRun: any;
    totalRuns: number;
    passRate: number;
    activeAlerts: number;
    alertsBySeverity: Record<string, number>;
    recentFailures: any[];
  }> {
    const pool = getPool();

    const [lastRunResult, totalResult, passRateResult, alertStats, failuresResult] = await Promise.all([
      safeQuery(pool, 'dq.service:lastRun', 'SELECT * FROM quality_runs ORDER BY started_at DESC LIMIT 1', []),
      safeQuery(pool, 'dq.service:totalRuns', 'SELECT COUNT(*) as cnt FROM quality_runs', []),
      safeQuery(
        pool,
        'dq.service:passRate',
        `SELECT 
          COALESCE(SUM(passed_checks), 0) as passed,
          COALESCE(SUM(total_checks), 0) as total
        FROM quality_runs 
        WHERE started_at >= NOW() - INTERVAL '7 days'`,
        []
      ),
      dqAlertService.getAlertStats(),
      safeQuery(
        pool,
        'dq.service:recentFailures',
        `SELECT qm.* FROM quality_metrics qm
        JOIN quality_runs qr ON qm.run_id = qr.id
        WHERE qm.passed = false
        ORDER BY qm.checked_at DESC
        LIMIT 10`,
        []
      )
    ]);

    const passed = parseInt(passRateResult.rows[0].passed);
    const total = parseInt(passRateResult.rows[0].total);
    const passRate = total > 0 ? (passed / total) * 100 : 100;

    return {
      lastRun: lastRunResult.rows[0],
      totalRuns: parseInt(totalResult.rows[0].cnt),
      passRate,
      activeAlerts: alertStats.active,
      alertsBySeverity: alertStats.bySeverity,
      recentFailures: failuresResult.rows
    };
  }

  private async createRun(runType: string, targetSystem: string): Promise<string> {
    const pool = getPool();
    const result = await safeQuery(
      pool,
      'dq.service:createRun',
      `INSERT INTO quality_runs (run_type, target_system, status)
      VALUES ($1, $2, 'running')
      RETURNING id`,
      [runType, targetSystem]
    );
    return result.rows[0].id;
  }

  private async completeRun(runId: string, status: string, totalChecks: number, passedChecks: number, failedChecks: number, warningChecks: number): Promise<void> {
    const pool = getPool();
    await safeQuery(
      pool,
      'dq.service:completeRun',
      `UPDATE quality_runs 
      SET status = $2, total_checks = $3, passed_checks = $4, failed_checks = $5, warning_checks = $6, completed_at = NOW()
      WHERE id = $1`,
      [runId, status, totalChecks, passedChecks, failedChecks, warningChecks]
    );
  }

  private async saveMetric(runId: string, result: ExpectationResult): Promise<string> {
    const pool = getPool();
    const res = await safeQuery(
      pool,
      'dq.service:saveMetric',
      `INSERT INTO quality_metrics 
      (run_id, check_name, table_name, column_name, expectation_type, expected_value, actual_value, passed, severity, message, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id`,
      [
        runId, result.expectation.name, result.expectation.table, result.expectation.column,
        result.expectation.type, result.expectedValue, result.actualValue, result.passed,
        result.expectation.severity, result.message, JSON.stringify(result.metadata || {})
      ]
    );
    return res.rows[0].id;
  }

  private async saveProfile(runId: string, profile: TableProfile): Promise<void> {
    const pool = getPool();
    for (const col of profile.columns) {
      await safeQuery(
        pool,
        'dq.service:saveProfile',
        `INSERT INTO data_profiles 
        (run_id, table_name, column_name, data_type, total_count, null_count, unique_count,
         min_value, max_value, mean_value, std_dev_value, percentiles, top_values)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          runId, col.tableName, col.columnName, col.dataType, col.totalCount,
          col.nullCount, col.uniqueCount, col.minValue, col.maxValue,
          col.meanValue, col.stdDevValue, JSON.stringify(col.percentiles), JSON.stringify(col.topValues)
        ]
      );
    }
  }

  private async saveAnomaly(runId: string, anomaly: AnomalyDetection): Promise<string> {
    const pool = getPool();
    const result = await safeQuery(
      pool,
      'dq.service:saveAnomaly',
      `INSERT INTO quality_anomalies 
      (run_id, table_name, column_name, anomaly_type, severity, description, expected_baseline, actual_value, deviation_score)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id`,
      [
        runId, anomaly.tableName, anomaly.columnName, anomaly.anomalyType,
        anomaly.severity, anomaly.description, anomaly.expectedBaseline, anomaly.actualValue, anomaly.deviationScore
      ]
    );
    return result.rows[0].id;
  }
}

export const dataQualityService = new DataQualityService();
