import { Router, Request, Response } from 'express';
import { etlPipeline } from '../etl/pipeline';
import { etlScheduler } from '../etl/scheduler';
import { aggregationService } from '../etl/aggregation';
import { handleRouteError } from '../lib/errorHandler';

const router = Router();

const ETL_DISABLED = true;
const ETL_DISABLED_MESSAGE = 'ETL module temporarily disabled - pending schema migration';

function checkEtlDisabled(req: Request, res: Response, next: Function) {
  if (ETL_DISABLED) {
    return res.status(503).json({ 
      error: ETL_DISABLED_MESSAGE,
      disabled: true 
    });
  }
  next();
}

function requireAdminSecret(req: Request, res: Response, next: Function) {
  const adminSecret = req.headers['x-admin-secret'];
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized - admin secret required' });
  }
  next();
}

router.get('/status', checkEtlDisabled, async (req: Request, res: Response) => {
  try {
    const schedulerStatus = etlScheduler.getStatus();
    const recentJobs = await etlPipeline.getJobHistory(5);
    
    res.json({
      scheduler: schedulerStatus,
      recentJobs
    });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.get('/history', checkEtlDisabled, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const jobs = await etlPipeline.getJobHistory(limit);
    res.json({ jobs });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.get('/quality/:jobId?', checkEtlDisabled, async (req: Request, res: Response) => {
  try {
    const jobId = req.params.jobId ? parseInt(req.params.jobId) : undefined;
    const checks = await etlPipeline.getQualityReport(jobId);
    res.json({ qualityChecks: checks });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.post('/run/full', checkEtlDisabled, requireAdminSecret, async (req: Request, res: Response) => {
  try {
    const since = req.body.since ? new Date(req.body.since) : undefined;
    
    res.json({ 
      message: 'Full ETL pipeline started',
      note: 'Pipeline running in background'
    });

    etlPipeline.runFullPipeline(since)
      .then(result => {
        console.log('[ETL API] Full pipeline completed:', result.status);
      })
      .catch(error => {
        console.error('[ETL API] Full pipeline failed:', error);
        // Background job - error logged, don't crash
      });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.post('/run/incremental', checkEtlDisabled, requireAdminSecret, async (req: Request, res: Response) => {
  try {
    res.json({ 
      message: 'Incremental ETL pipeline started',
      note: 'Pipeline running in background'
    });

    etlPipeline.runIncrementalPipeline()
      .then(result => {
        console.log('[ETL API] Incremental pipeline completed:', result.status);
      })
      .catch(error => {
        console.error('[ETL API] Incremental pipeline failed:', error);
        // Background job - error logged, don't crash
      });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.post('/run/users', checkEtlDisabled, requireAdminSecret, async (req: Request, res: Response) => {
  try {
    const result = await etlPipeline.runUsersPipeline();
    res.json({ 
      message: 'Users ETL completed',
      result 
    });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.post('/run/violations', checkEtlDisabled, requireAdminSecret, async (req: Request, res: Response) => {
  try {
    const result = await etlPipeline.runViolationsPipeline();
    res.json({ 
      message: 'Violations ETL completed',
      result 
    });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.post('/scheduler/start', checkEtlDisabled, requireAdminSecret, async (req: Request, res: Response) => {
  try {
    await etlScheduler.start();
    res.json({ message: 'ETL scheduler started', status: etlScheduler.getStatus() });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.post('/scheduler/stop', checkEtlDisabled, requireAdminSecret, async (req: Request, res: Response) => {
  try {
    etlScheduler.stop();
    res.json({ message: 'ETL scheduler stopped', status: etlScheduler.getStatus() });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.post('/scheduler/trigger/:jobName', checkEtlDisabled, requireAdminSecret, async (req: Request, res: Response) => {
  try {
    const { jobName } = req.params;
    const result = await etlScheduler.triggerManualRun(jobName);
    
    if (!result) {
      return res.status(404).json({ error: `Job not found or disabled: ${jobName}` });
    }
    
    res.json({ message: `Job ${jobName} triggered`, result });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.post('/scheduler/enable/:jobName', checkEtlDisabled, requireAdminSecret, async (req: Request, res: Response) => {
  const { jobName } = req.params;
  const success = etlScheduler.enableJob(jobName);
  
  if (success) {
    res.json({ message: `Job ${jobName} enabled` });
  } else {
    res.status(404).json({ error: `Job not found: ${jobName}` });
  }
});

router.post('/scheduler/disable/:jobName', checkEtlDisabled, requireAdminSecret, async (req: Request, res: Response) => {
  const { jobName } = req.params;
  const success = etlScheduler.disableJob(jobName);
  
  if (success) {
    res.json({ message: `Job ${jobName} disabled` });
  } else {
    res.status(404).json({ error: `Job not found: ${jobName}` });
  }
});

router.post('/aggregations/run', checkEtlDisabled, requireAdminSecret, async (req: Request, res: Response) => {
  try {
    const targetDate = req.body.targetDate ? new Date(req.body.targetDate) : new Date();
    
    res.json({ 
      message: 'Aggregation job started',
      targetDate: targetDate.toISOString()
    });

    aggregationService.runAllAggregations(targetDate)
      .then(results => {
        console.log('[ETL API] Aggregations completed:', results.length, 'tables processed');
      })
      .catch(error => {
        console.error('[ETL API] Aggregations failed:', error);
        // Background job - error logged, don't crash
      });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.post('/aggregations/daily', checkEtlDisabled, requireAdminSecret, async (req: Request, res: Response) => {
  try {
    const targetDate = req.body.targetDate ? new Date(req.body.targetDate) : new Date();
    const result = await aggregationService.aggregateDailyUserMetrics(targetDate);
    res.json({ message: 'Daily user metrics aggregated', result });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.post('/aggregations/cohorts', checkEtlDisabled, requireAdminSecret, async (req: Request, res: Response) => {
  try {
    const targetDate = req.body.targetDate ? new Date(req.body.targetDate) : new Date();
    const weekStart = new Date(targetDate);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const result = await aggregationService.aggregateWeeklyCohortMetrics(weekStart);
    res.json({ message: 'Weekly cohort metrics aggregated', result });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.post('/aggregations/revenue', checkEtlDisabled, requireAdminSecret, async (req: Request, res: Response) => {
  try {
    const targetMonth = req.body.targetMonth ? new Date(req.body.targetMonth) : new Date();
    const result = await aggregationService.aggregateMonthlyRevenue(targetMonth);
    res.json({ message: 'Monthly revenue aggregated', result });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.post('/aggregations/transitions', checkEtlDisabled, requireAdminSecret, async (req: Request, res: Response) => {
  try {
    const targetMonth = req.body.targetMonth ? new Date(req.body.targetMonth) : new Date();
    const result = await aggregationService.aggregateTierTransitions(targetMonth);
    res.json({ message: 'Tier transitions aggregated', result });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.post('/aggregations/feature-usage', checkEtlDisabled, requireAdminSecret, async (req: Request, res: Response) => {
  try {
    const targetMonth = req.body.targetMonth ? new Date(req.body.targetMonth) : new Date();
    const result = await aggregationService.aggregateFeatureUsageByTier(targetMonth);
    res.json({ message: 'Feature usage by tier aggregated', result });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

export default router;
