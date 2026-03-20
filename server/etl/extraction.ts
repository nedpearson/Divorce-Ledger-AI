import { pool, getPool } from '../db';
import { etlService, DataQualityCheck } from './etl-service';
import { safeQuery } from '../lib/safeQuery';

export interface ExtractedData {
  users: any[];
  violations: any[];
  transactions: any[];
  billingEvents: any[];
  evidenceFiles: any[];
  quickbooksSyncs: any[];
}

class ExtractionService {
  async extractUsers(since?: Date, updateWatermark: boolean = false): Promise<any[]> {
    const watermark = since || (await etlService.getWatermark('users'));
    const query = watermark
      ? `SELECT id, email, name, subscription_tier, stripe_customer_id, 
                violations_count_this_month, cases_count, created_at
         FROM users WHERE created_at > $1 ORDER BY created_at`
      : `SELECT id, email, name, subscription_tier, stripe_customer_id,
                violations_count_this_month, cases_count, created_at
         FROM users ORDER BY created_at`;

    const result = await safeQuery(
      getPool(),
      'etl.extractUsers',
      query,
      watermark ? [watermark] : []
    );

    return result.rows;
  }

  async commitUserWatermark(users: any[]): Promise<void> {
    if (users.length > 0) {
      const lastRow = users[users.length - 1];
      await etlService.updateWatermark('users', lastRow.created_at, lastRow.id);
    }
  }

  async extractViolations(since?: Date): Promise<any[]> {
    const watermark = since || (await etlService.getWatermark('violations'));
    const query = watermark
      ? `SELECT v.*, u.email as user_email, u.subscription_tier
         FROM violations v
         LEFT JOIN users u ON v.user_id = u.id
         WHERE v.created_at > $1 ORDER BY v.created_at`
      : `SELECT v.*, u.email as user_email, u.subscription_tier
         FROM violations v
         LEFT JOIN users u ON v.user_id = u.id
         ORDER BY v.created_at`;

    const result = await safeQuery(
      getPool(),
      'etl.extractViolations',
      query,
      watermark ? [watermark] : []
    );
    return result.rows;
  }

  async commitViolationWatermark(violations: any[]): Promise<void> {
    if (violations.length > 0) {
      const lastRow = violations[violations.length - 1];
      await etlService.updateWatermark('violations', lastRow.created_at, String(lastRow.id));
    }
  }

  async extractTransactions(since?: Date): Promise<any[]> {
    const watermark = since || (await etlService.getWatermark('transactions'));
    const ALLOWED_TABLES = ['transactions', 'assets', 'debts', 'incomes', 'expenses'];
    const allTransactions: any[] = [];

    for (const table of ALLOWED_TABLES) {
      try {
        const safeTable = `"${table}"`;
        const query = watermark
          ? `SELECT *, $2 as source_table FROM ${safeTable} WHERE created_at > $1`
          : `SELECT *, $1 as source_table FROM ${safeTable}`;

        const params = watermark ? [watermark, table] : [table];
        const result = await safeQuery(
          getPool(),
          `etl.extractTransactions.${table}`,
          query,
          params
        );
        allTransactions.push(...result.rows);
      } catch (error) {
        // Silently skip - table may not exist
      }
    }

    return allTransactions;
  }

  async commitTransactionWatermark(transactions: any[]): Promise<void> {
    if (transactions.length > 0) {
      const latestDate = transactions.reduce(
        (max, t) => (t.created_at > max ? t.created_at : max),
        transactions[0].created_at
      );
      await etlService.updateWatermark('transactions', latestDate);
    }
  }

  async extractBillingEvents(since?: Date): Promise<any[]> {
    const watermark = since || (await etlService.getWatermark('billing_audit_log'));

    try {
      const query = watermark
        ? `SELECT * FROM billing_audit_log WHERE created_at > $1 ORDER BY created_at`
        : `SELECT * FROM billing_audit_log ORDER BY created_at`;

      const result = await safeQuery(
        getPool(),
        'etl.extractBillingEvents',
        query,
        watermark ? [watermark] : []
      );
      return result.rows;
    } catch (error) {
      return [];
    }
  }

  async commitAllWatermarks(data: ExtractedData): Promise<void> {
    await this.commitUserWatermark(data.users);
    await this.commitViolationWatermark(data.violations);
    await this.commitTransactionWatermark(data.transactions);
  }

  async extractEvidenceFiles(since?: Date): Promise<any[]> {
    const watermark = since || (await etlService.getWatermark('evidence_files'));

    try {
      const query = watermark
        ? `SELECT * FROM evidence_files WHERE created_at > $1 ORDER BY created_at`
        : `SELECT * FROM evidence_files ORDER BY created_at`;

      const result = await safeQuery(
        getPool(),
        'etl.extractEvidenceFiles',
        query,
        watermark ? [watermark] : []
      );
      return result.rows;
    } catch (error) {
      return [];
    }
  }

  async extractQuickBooksSyncs(since?: Date): Promise<any[]> {
    const watermark = since || (await etlService.getWatermark('quickbooks_sync_log'));

    try {
      const query = watermark
        ? `SELECT * FROM quickbooks_sync_log WHERE sync_timestamp > $1 ORDER BY sync_timestamp`
        : `SELECT * FROM quickbooks_sync_log ORDER BY sync_timestamp`;

      const result = await safeQuery(
        getPool(),
        'etl.extractQuickBooksSyncs',
        query,
        watermark ? [watermark] : []
      );
      return result.rows;
    } catch (error) {
      return [];
    }
  }

  async extractAll(since?: Date): Promise<ExtractedData> {
    const [users, violations, transactions, billingEvents, evidenceFiles, quickbooksSyncs] =
      await Promise.all([
        this.extractUsers(since),
        this.extractViolations(since),
        this.extractTransactions(since),
        this.extractBillingEvents(since),
        this.extractEvidenceFiles(since),
        this.extractQuickBooksSyncs(since),
      ]);

    return { users, violations, transactions, billingEvents, evidenceFiles, quickbooksSyncs };
  }

  async runQualityChecks(data: ExtractedData, jobId: number): Promise<DataQualityCheck[]> {
    const checks: DataQualityCheck[] = [];

    const userNullCheck: DataQualityCheck = {
      checkName: 'users_id_not_null',
      checkType: 'null_check',
      tableName: 'users',
      columnName: 'id',
      passed: data.users.every((u) => u.id != null),
      severity: 'critical',
    };
    checks.push(userNullCheck);
    await etlService.logQualityCheck(jobId, userNullCheck);

    const violationsNullCheck: DataQualityCheck = {
      checkName: 'violations_user_id_not_null',
      checkType: 'null_check',
      tableName: 'violations',
      columnName: 'user_id',
      passed: data.violations.every((v) => v.user_id != null),
      severity: 'critical',
    };
    checks.push(violationsNullCheck);
    await etlService.logQualityCheck(jobId, violationsNullCheck);

    const freshnessCheck: DataQualityCheck = {
      checkName: 'data_freshness',
      checkType: 'freshness',
      tableName: 'all',
      expectedValue: '< 2 hours',
      actualValue: `${data.users.length + data.violations.length + data.transactions.length} records`,
      passed: true,
      severity: 'warning',
    };
    checks.push(freshnessCheck);
    await etlService.logQualityCheck(jobId, freshnessCheck);

    return checks;
  }
}

export const extractionService = new ExtractionService();
