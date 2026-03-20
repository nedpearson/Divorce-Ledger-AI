import { getPool } from '../db';
import { isDemoMode } from './sql-utils';
import { safeQuery } from '../lib/safeQuery';

export interface ReconciliationJob {
  id: string;
  jobName: string;
  sourceSystem: 'app' | 'warehouse' | 'quickbooks';
  targetSystem: 'app' | 'warehouse' | 'quickbooks';
  reconciliationType: 'count' | 'sum' | 'hash' | 'detailed';
  sourceQuery: string;
  targetQuery: string;
  matchKeys: string[];
  tolerancePercent: number;
}

export interface ReconciliationResult {
  jobId: string;
  jobName: string;
  status: 'matched' | 'mismatched' | 'error';
  sourceCount?: number;
  targetCount?: number;
  matchedCount?: number;
  mismatchedCount?: number;
  sourceSum?: number;
  targetSum?: number;
  variance?: number;
  variancePercent?: number;
  details?: any;
  executedAt: Date;
  message: string;
}

class ReconciliationService {
  private defaultJobs: ReconciliationJob[] = [
    {
      id: 'app_warehouse_users',
      jobName: 'App to Warehouse User Count',
      sourceSystem: 'app',
      targetSystem: 'warehouse',
      reconciliationType: 'count',
      sourceQuery: 'SELECT COUNT(*) as cnt FROM users',
      targetQuery: 'SELECT COUNT(*) as cnt FROM dim_users',
      matchKeys: ['user_id'],
      tolerancePercent: 0,
    },
    {
      id: 'app_warehouse_violations',
      jobName: 'App to Warehouse Violation Count',
      sourceSystem: 'app',
      targetSystem: 'warehouse',
      reconciliationType: 'count',
      sourceQuery: 'SELECT COUNT(*) as cnt FROM violations',
      targetQuery: 'SELECT COUNT(*) as cnt FROM fact_violations',
      matchKeys: ['violation_id'],
      tolerancePercent: 5,
    },
    {
      id: 'app_warehouse_transactions_sum',
      jobName: 'App to Warehouse Transaction Sum',
      sourceSystem: 'app',
      targetSystem: 'warehouse',
      reconciliationType: 'sum',
      sourceQuery: `
        SELECT COALESCE(SUM(amount), 0) as total_amount 
        FROM transactions 
        WHERE created_at >= NOW() - INTERVAL '30 days'
      `,
      targetQuery: `
        SELECT COALESCE(SUM(amount_cents::numeric / 100), 0) as total_amount 
        FROM fact_transactions 
        WHERE transaction_date >= NOW() - INTERVAL '30 days'
      `,
      matchKeys: [],
      tolerancePercent: 1,
    },
  ];

  async runAllReconciliations(runId: string): Promise<ReconciliationResult[]> {
    if (isDemoMode()) {
      return this.defaultJobs.map((job) => ({
        jobId: job.id,
        jobName: job.jobName,
        status: 'matched' as const,
        executedAt: new Date(),
        message: '[Demo Mode] Reconciliation skipped in demo mode',
      }));
    }

    const results: ReconciliationResult[] = [];

    const customJobs = await this.getCustomJobs();
    const allJobs = [...this.defaultJobs, ...customJobs];

    for (const job of allJobs) {
      try {
        const result = await this.runReconciliation(job, runId);
        results.push(result);
        await this.saveResult(result, runId);
      } catch (error: any) {
        const errorResult: ReconciliationResult = {
          jobId: job.id,
          jobName: job.jobName,
          status: 'error',
          executedAt: new Date(),
          message: `Error running reconciliation: ${error.message}`,
        };
        results.push(errorResult);
        await this.saveResult(errorResult, runId);
      }
    }

    return results;
  }

  async runReconciliation(job: ReconciliationJob, runId: string): Promise<ReconciliationResult> {
    if (isDemoMode()) {
      return {
        jobId: job.id,
        jobName: job.jobName,
        status: 'matched',
        executedAt: new Date(),
        message: '[Demo Mode] Reconciliation skipped in demo mode',
      };
    }

    const pool = getPool();

    switch (job.reconciliationType) {
      case 'count':
        return this.runCountReconciliation(pool, job);
      case 'sum':
        return this.runSumReconciliation(pool, job);
      case 'hash':
        return this.runHashReconciliation(pool, job);
      case 'detailed':
        return this.runDetailedReconciliation(pool, job);
      default:
        throw new Error(`Unknown reconciliation type: ${job.reconciliationType}`);
    }
  }

  private async runCountReconciliation(
    pool: any,
    job: ReconciliationJob
  ): Promise<ReconciliationResult> {
    const [sourceResult, targetResult] = await Promise.all([
      safeQuery(pool, 'reconciliation:countSource', job.sourceQuery, []),
      safeQuery(pool, 'reconciliation:countTarget', job.targetQuery, []),
    ]);

    const sourceCount = parseInt(sourceResult.rows[0]?.cnt || sourceResult.rows[0]?.count || 0);
    const targetCount = parseInt(targetResult.rows[0]?.cnt || targetResult.rows[0]?.count || 0);

    const variance = Math.abs(sourceCount - targetCount);
    const variancePercent =
      sourceCount > 0 ? (variance / sourceCount) * 100 : targetCount > 0 ? 100 : 0;
    const isWithinTolerance = variancePercent <= job.tolerancePercent;

    return {
      jobId: job.id,
      jobName: job.jobName,
      status: isWithinTolerance ? 'matched' : 'mismatched',
      sourceCount,
      targetCount,
      variance,
      variancePercent,
      executedAt: new Date(),
      message: isWithinTolerance
        ? `Counts match within tolerance: source=${sourceCount}, target=${targetCount}`
        : `Count mismatch: source=${sourceCount}, target=${targetCount}, variance=${variancePercent.toFixed(2)}%`,
    };
  }

  private async runSumReconciliation(
    pool: any,
    job: ReconciliationJob
  ): Promise<ReconciliationResult> {
    const [sourceResult, targetResult] = await Promise.all([
      safeQuery(pool, 'reconciliation:sumSource', job.sourceQuery, []),
      safeQuery(pool, 'reconciliation:sumTarget', job.targetQuery, []),
    ]);

    const sourceSum = parseFloat(
      sourceResult.rows[0]?.total_amount || sourceResult.rows[0]?.total || 0
    );
    const targetSum = parseFloat(
      targetResult.rows[0]?.total_amount || targetResult.rows[0]?.total || 0
    );

    const variance = Math.abs(sourceSum - targetSum);
    const variancePercent =
      sourceSum !== 0 ? (variance / Math.abs(sourceSum)) * 100 : targetSum !== 0 ? 100 : 0;
    const isWithinTolerance = variancePercent <= job.tolerancePercent;

    return {
      jobId: job.id,
      jobName: job.jobName,
      status: isWithinTolerance ? 'matched' : 'mismatched',
      sourceSum,
      targetSum,
      variance,
      variancePercent,
      executedAt: new Date(),
      message: isWithinTolerance
        ? `Sums match within tolerance: source=${sourceSum.toFixed(2)}, target=${targetSum.toFixed(2)}`
        : `Sum mismatch: source=${sourceSum.toFixed(2)}, target=${targetSum.toFixed(2)}, variance=${variancePercent.toFixed(2)}%`,
    };
  }

  private async runHashReconciliation(
    pool: any,
    job: ReconciliationJob
  ): Promise<ReconciliationResult> {
    const matchKeysSql = job.matchKeys.join(', ');

    const sourceHashQuery = `
      SELECT md5(string_agg(${matchKeysSql}::text, '|' ORDER BY ${matchKeysSql})) as hash
      FROM (${job.sourceQuery.replace(/;$/, '')}) sub
    `;
    const targetHashQuery = `
      SELECT md5(string_agg(${matchKeysSql}::text, '|' ORDER BY ${matchKeysSql})) as hash
      FROM (${job.targetQuery.replace(/;$/, '')}) sub
    `;

    const [sourceResult, targetResult] = await Promise.all([
      safeQuery(pool, 'reconciliation:hashSource', sourceHashQuery, []),
      safeQuery(pool, 'reconciliation:hashTarget', targetHashQuery, []),
    ]);

    const sourceHash = sourceResult.rows[0]?.hash;
    const targetHash = targetResult.rows[0]?.hash;
    const isMatched = sourceHash === targetHash;

    return {
      jobId: job.id,
      jobName: job.jobName,
      status: isMatched ? 'matched' : 'mismatched',
      executedAt: new Date(),
      message: isMatched
        ? 'Hash values match'
        : `Hash mismatch: source=${sourceHash?.substring(0, 8)}..., target=${targetHash?.substring(0, 8)}...`,
      details: { sourceHash, targetHash },
    };
  }

  private async runDetailedReconciliation(
    pool: any,
    job: ReconciliationJob
  ): Promise<ReconciliationResult> {
    const sourceResult = await safeQuery(
      pool,
      'reconciliation:detailedSource',
      job.sourceQuery,
      []
    );
    const targetResult = await safeQuery(
      pool,
      'reconciliation:detailedTarget',
      job.targetQuery,
      []
    );

    const sourceMap: Record<string, any> = {};
    for (const r of sourceResult.rows) {
      const key = job.matchKeys.map((k) => r[k]).join('|');
      sourceMap[key] = r;
    }

    const targetMap: Record<string, any> = {};
    for (const r of targetResult.rows) {
      const key = job.matchKeys.map((k) => r[k]).join('|');
      targetMap[key] = r;
    }

    let matchedCount = 0;
    let mismatchedCount = 0;
    const mismatches: any[] = [];

    for (const key of Object.keys(sourceMap)) {
      const targetRow = targetMap[key];
      if (targetRow) {
        matchedCount++;
      } else {
        mismatchedCount++;
        if (mismatches.length < 100) {
          mismatches.push({ type: 'source_only', key, data: sourceMap[key] });
        }
      }
    }

    for (const key of Object.keys(targetMap)) {
      if (!sourceMap[key]) {
        mismatchedCount++;
        if (mismatches.length < 100) {
          mismatches.push({ type: 'target_only', key, data: targetMap[key] });
        }
      }
    }

    const isMatched = mismatchedCount === 0;

    return {
      jobId: job.id,
      jobName: job.jobName,
      status: isMatched ? 'matched' : 'mismatched',
      sourceCount: sourceResult.rows.length,
      targetCount: targetResult.rows.length,
      matchedCount,
      mismatchedCount,
      executedAt: new Date(),
      message: isMatched
        ? `All ${matchedCount} records matched`
        : `${mismatchedCount} mismatched records found out of ${matchedCount + mismatchedCount}`,
      details: { mismatches: mismatches.slice(0, 20) },
    };
  }

  private async getCustomJobs(): Promise<ReconciliationJob[]> {
    if (isDemoMode()) {
      return [];
    }

    const pool = getPool();
    try {
      const result = await safeQuery(
        pool,
        'reconciliation:getCustomJobs',
        `SELECT * FROM reconciliation_jobs WHERE is_active = true`,
        []
      );
      return result.rows.map((r: any) => ({
        id: r.id,
        jobName: r.job_name,
        sourceSystem: r.source_system,
        targetSystem: r.target_system,
        reconciliationType: r.reconciliation_type,
        sourceQuery: r.source_query,
        targetQuery: r.target_query,
        matchKeys: r.match_keys || [],
        tolerancePercent: r.tolerance_percent || 0,
      }));
    } catch (e) {
      return [];
    }
  }

  private async saveResult(result: ReconciliationResult, runId: string): Promise<void> {
    if (isDemoMode()) {
      return;
    }

    const pool = getPool();
    try {
      await safeQuery(
        pool,
        'reconciliation:saveResult',
        `INSERT INTO reconciliation_results 
        (job_id, run_id, status, source_count, target_count, matched_count, mismatched_count,
         source_sum, target_sum, variance, variance_percent, details)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          result.jobId,
          runId,
          result.status,
          result.sourceCount,
          result.targetCount,
          result.matchedCount,
          result.mismatchedCount,
          result.sourceSum,
          result.targetSum,
          result.variance,
          result.variancePercent,
          JSON.stringify(result.details),
        ]
      );
    } catch (e) {
      console.error('[Reconciliation] Failed to save result:', e);
    }
  }

  async createCustomJob(job: Omit<ReconciliationJob, 'id'>): Promise<string> {
    if (isDemoMode()) {
      return 'demo-job-id';
    }

    const pool = getPool();
    const result = await safeQuery(
      pool,
      'reconciliation:createCustomJob',
      `INSERT INTO reconciliation_jobs 
      (job_name, source_system, target_system, reconciliation_type, source_query, target_query, match_keys, tolerance_percent)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id`,
      [
        job.jobName,
        job.sourceSystem,
        job.targetSystem,
        job.reconciliationType,
        job.sourceQuery,
        job.targetQuery,
        JSON.stringify(job.matchKeys),
        job.tolerancePercent,
      ]
    );

    return result.rows[0].id;
  }

  async getReconciliationHistory(limit: number = 20): Promise<any[]> {
    if (isDemoMode()) {
      return [];
    }

    const pool = getPool();
    const result = await safeQuery(
      pool,
      'reconciliation:getHistory',
      `SELECT rr.*, rj.job_name
      FROM reconciliation_results rr
      LEFT JOIN reconciliation_jobs rj ON rr.job_id = rj.id
      ORDER BY rr.executed_at DESC
      LIMIT $1`,
      [limit]
    );
    return result.rows;
  }
}

export const reconciliationService = new ReconciliationService();
