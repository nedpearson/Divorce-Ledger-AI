import { etlService, ETLJobResult } from './etl-service';
import { extractionService } from './extraction';
import { transformationService } from './transformation';
import { loadingService } from './loading';
import { safeQuery } from '../lib/safeQuery';

class ETLPipeline {
  async runFullPipeline(since?: Date): Promise<ETLJobResult> {
    const startTime = Date.now();
    const jobId = await etlService.startJob('full_etl_pipeline', 'full');
    const errors: string[] = [];
    
    let rowsExtracted = 0;
    let rowsTransformed = 0;
    let rowsLoaded = 0;
    let rowsRejected = 0;

    try {
      console.log(`[ETL] Starting full pipeline run at ${new Date().toISOString()}`);
      
      await etlService.ensureTimeDimension();
      
      console.log('[ETL] Phase 1: Extraction');
      const extractedData = await etlService.withRetry(
        () => extractionService.extractAll(since),
        'extraction'
      );
      
      rowsExtracted = 
        extractedData.users.length +
        extractedData.violations.length +
        extractedData.transactions.length +
        extractedData.billingEvents.length +
        extractedData.evidenceFiles.length +
        extractedData.quickbooksSyncs.length;
      
      console.log(`[ETL] Extracted ${rowsExtracted} total records`);
      
      const qualityChecks = await extractionService.runQualityChecks(extractedData, jobId);
      const criticalFailures = qualityChecks.filter(c => !c.passed && c.severity === 'critical');
      
      if (criticalFailures.length > 0) {
        throw new Error(`Critical data quality failures: ${criticalFailures.map(c => c.checkName).join(', ')}`);
      }

      console.log('[ETL] Phase 2: Transformation');
      const transformedData = transformationService.transformAll(extractedData);
      
      rowsTransformed = 
        transformedData.dimUsers.length +
        transformedData.factViolations.length +
        transformedData.factTransactions.length +
        transformedData.factBillingEvents.length;
      
      console.log(`[ETL] Transformed ${rowsTransformed} records`);

      console.log('[ETL] Phase 3: Loading');
      const loadResult = await etlService.withRetry(
        () => loadingService.loadAll(transformedData),
        'loading'
      );
      
      rowsLoaded = 
        loadResult.usersLoaded +
        loadResult.violationsLoaded +
        loadResult.transactionsLoaded +
        loadResult.billingEventsLoaded;
      
      errors.push(...loadResult.errors);
      rowsRejected = rowsTransformed - rowsLoaded;
      
      console.log(`[ETL] Loaded ${rowsLoaded} records, rejected ${rowsRejected}`);
      
      console.log('[ETL] Phase 4: Commit watermarks');
      await extractionService.commitAllWatermarks(extractedData);
      console.log('[ETL] Watermarks committed successfully');

      const duration = Date.now() - startTime;
      const status = errors.length > 0 ? 'partial' : 'success';
      
      const result: ETLJobResult = {
        jobId,
        jobName: 'full_etl_pipeline',
        status,
        rowsExtracted,
        rowsTransformed,
        rowsLoaded,
        rowsRejected,
        duration,
        errors
      };
      
      await etlService.completeJob(jobId, result);
      console.log(`[ETL] Pipeline completed in ${duration}ms with status: ${status}`);
      
      return result;

    } catch (error: any) {
      const duration = Date.now() - startTime;
      errors.push(error.message);
      
      const result: ETLJobResult = {
        jobId,
        jobName: 'full_etl_pipeline',
        status: 'failed',
        rowsExtracted,
        rowsTransformed,
        rowsLoaded,
        rowsRejected,
        duration,
        errors
      };
      
      await etlService.completeJob(jobId, result);
      console.error(`[ETL] Pipeline failed after ${duration}ms:`, error);
      
      return result;
    }
  }

  async runIncrementalPipeline(): Promise<ETLJobResult> {
    console.log('[ETL] Running incremental pipeline (using watermarks)');
    return this.runFullPipeline();
  }

  async runUsersPipeline(): Promise<ETLJobResult> {
    const startTime = Date.now();
    const jobId = await etlService.startJob('users_etl', 'incremental');
    
    try {
      const users = await extractionService.extractUsers();
      const dimUsers = transformationService.transformUsers(users);
      const loaded = await loadingService.loadDimUsers(dimUsers);
      
      const result: ETLJobResult = {
        jobId,
        jobName: 'users_etl',
        status: 'success',
        rowsExtracted: users.length,
        rowsTransformed: dimUsers.length,
        rowsLoaded: loaded,
        rowsRejected: dimUsers.length - loaded,
        duration: Date.now() - startTime,
        errors: []
      };
      
      await etlService.completeJob(jobId, result);
      return result;
      
    } catch (error: any) {
      const result: ETLJobResult = {
        jobId,
        jobName: 'users_etl',
        status: 'failed',
        rowsExtracted: 0,
        rowsTransformed: 0,
        rowsLoaded: 0,
        rowsRejected: 0,
        duration: Date.now() - startTime,
        errors: [error.message]
      };
      
      await etlService.completeJob(jobId, result);
      return result;
    }
  }

  async runViolationsPipeline(): Promise<ETLJobResult> {
    const startTime = Date.now();
    const jobId = await etlService.startJob('violations_etl', 'incremental');
    
    try {
      const violations = await extractionService.extractViolations();
      const factViolations = transformationService.transformViolations(violations);
      const loaded = await loadingService.loadFactViolations(factViolations);
      
      const result: ETLJobResult = {
        jobId,
        jobName: 'violations_etl',
        status: 'success',
        rowsExtracted: violations.length,
        rowsTransformed: factViolations.length,
        rowsLoaded: loaded,
        rowsRejected: factViolations.length - loaded,
        duration: Date.now() - startTime,
        errors: []
      };
      
      await etlService.completeJob(jobId, result);
      return result;
      
    } catch (error: any) {
      const result: ETLJobResult = {
        jobId,
        jobName: 'violations_etl',
        status: 'failed',
        rowsExtracted: 0,
        rowsTransformed: 0,
        rowsLoaded: 0,
        rowsRejected: 0,
        duration: Date.now() - startTime,
        errors: [error.message]
      };
      
      await etlService.completeJob(jobId, result);
      return result;
    }
  }

  async getJobHistory(limit: number = 20): Promise<any[]> {
    const { pool } = await import('../db');
    if (!pool) throw new Error('Database pool not initialized');
    
    const result = await safeQuery(
      pool,
      'etl.pipeline:getJobHistory',
      `SELECT job_id, job_name, job_type, status, started_at, completed_at,
              rows_extracted, rows_transformed, rows_loaded, rows_rejected, error_message
       FROM etl_job_log
       ORDER BY started_at DESC
       LIMIT $1`,
      [limit]
    );
    
    return result.rows;
  }

  async getQualityReport(jobId?: number): Promise<any[]> {
    const { pool } = await import('../db');
    if (!pool) throw new Error('Database pool not initialized');
    
    const query = jobId
      ? `SELECT * FROM etl_data_quality_log WHERE job_id = $1 ORDER BY checked_at DESC`
      : `SELECT * FROM etl_data_quality_log ORDER BY checked_at DESC LIMIT 100`;
    
    const result = await safeQuery(pool, 'etl.pipeline:getQualityReport', query, jobId ? [jobId] : []);
    return result.rows;
  }
}

export const etlPipeline = new ETLPipeline();
