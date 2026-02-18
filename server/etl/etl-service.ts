import { pool } from '../db';
import { safeQuery } from '../lib/safeQuery';

function getPool() {
  if (!pool) throw new Error('Database pool not initialized');
  return pool;
}

export interface ETLJobResult {
  jobId: number;
  jobName: string;
  status: 'success' | 'partial' | 'failed';
  rowsExtracted: number;
  rowsTransformed: number;
  rowsLoaded: number;
  rowsRejected: number;
  duration: number;
  errors: string[];
}

export interface DataQualityCheck {
  checkName: string;
  checkType: 'row_count' | 'null_check' | 'referential' | 'range' | 'freshness';
  tableName: string;
  columnName?: string;
  expectedValue?: string;
  actualValue?: string;
  passed: boolean;
  severity: 'info' | 'warning' | 'critical';
}

class ETLService {
  private maxRetries = 3;
  private retryDelayMs = 1000;

  async startJob(jobName: string, jobType: string): Promise<number> {
    const result = await safeQuery(
      getPool(),
      'etl.service:startJob',
      `INSERT INTO etl_job_log (job_name, job_type, status, started_at, metadata)
       VALUES ($1, $2, 'running', NOW(), $3)
       RETURNING job_id`,
      [jobName, jobType, JSON.stringify({ started_by: 'scheduler' })]
    );
    return result.rows[0].job_id;
  }

  async completeJob(jobId: number, result: Partial<ETLJobResult>): Promise<void> {
    await safeQuery(
      getPool(),
      'etl.service:completeJob',
      `UPDATE etl_job_log 
       SET status = $1, completed_at = NOW(), 
           rows_extracted = $2, rows_transformed = $3, 
           rows_loaded = $4, rows_rejected = $5,
           error_message = $6
       WHERE job_id = $7`,
      [
        result.status || 'success',
        result.rowsExtracted || 0,
        result.rowsTransformed || 0,
        result.rowsLoaded || 0,
        result.rowsRejected || 0,
        result.errors?.join('; ') || null,
        jobId
      ]
    );
  }

  async logQualityCheck(jobId: number, check: DataQualityCheck): Promise<void> {
    await safeQuery(
      getPool(),
      'etl.service:logQualityCheck',
      `INSERT INTO etl_data_quality_log 
       (job_id, check_name, check_type, table_name, column_name, 
        expected_value, actual_value, passed, severity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        jobId, check.checkName, check.checkType, check.tableName,
        check.columnName, check.expectedValue, check.actualValue,
        check.passed, check.severity
      ]
    );
  }

  async getWatermark(tableName: string): Promise<Date | null> {
    const result = await safeQuery(
      getPool(),
      'etl.service:getWatermark',
      'SELECT last_extracted_at FROM etl_watermark WHERE table_name = $1',
      [tableName]
    );
    return result.rows[0]?.last_extracted_at || null;
  }

  async updateWatermark(tableName: string, timestamp: Date, lastId?: string): Promise<void> {
    await safeQuery(
      getPool(),
      'etl.service:updateWatermark',
      `INSERT INTO etl_watermark (table_name, last_extracted_at, last_extracted_id, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (table_name) DO UPDATE SET
         last_extracted_at = $2, last_extracted_id = $3, updated_at = NOW()`,
      [tableName, timestamp, lastId]
    );
  }

  async withRetry<T>(operation: () => Promise<T>, context: string): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        console.error(`ETL ${context} failed (attempt ${attempt}/${this.maxRetries}):`, error);
        
        if (attempt < this.maxRetries) {
          const delay = this.retryDelayMs * Math.pow(2, attempt - 1) + Math.random() * 500;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  async ensureTimeDimension(): Promise<void> {
    const result = await safeQuery(
      getPool(),
      'etl.service:checkTimeDimension',
      'SELECT COUNT(*) FROM dim_time',
      []
    );
    if (parseInt(result.rows[0].count) > 0) return;

    const startDate = new Date('2024-01-01');
    const endDate = new Date('2027-12-31');
    const dates: any[] = [];
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const date = new Date(d);
      dates.push({
        fullDate: date.toISOString().split('T')[0],
        dayOfWeek: date.getDay(),
        dayOfMonth: date.getDate(),
        dayOfYear: Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000),
        weekOfYear: Math.ceil((date.getTime() - new Date(date.getFullYear(), 0, 1).getTime()) / 604800000),
        month: date.getMonth() + 1,
        monthName: date.toLocaleString('default', { month: 'long' }),
        quarter: Math.ceil((date.getMonth() + 1) / 3),
        year: date.getFullYear(),
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
        isMonthEnd: new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate() === date.getDate()
      });
    }

    for (const d of dates) {
      await safeQuery(
        getPool(),
        'etl.service:insertTimeDimension',
        `INSERT INTO dim_time (full_date, day_of_week, day_of_month, day_of_year, week_of_year, 
         month, month_name, quarter, year, is_weekend, is_month_end)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (full_date) DO NOTHING`,
        [d.fullDate, d.dayOfWeek, d.dayOfMonth, d.dayOfYear, d.weekOfYear,
         d.month, d.monthName, d.quarter, d.year, d.isWeekend, d.isMonthEnd]
      );
    }
    console.log(`Populated dim_time with ${dates.length} dates`);
  }
}

export const etlService = new ETLService();
