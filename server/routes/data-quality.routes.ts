import { Router, Request, Response } from 'express';
import { dataQualityService } from '../data-quality/service';
import { dqAlertService } from '../data-quality/alerts';
import { reconciliationService } from '../data-quality/reconciliation';
import { handleRouteError } from '../lib/errorHandler';

const router = Router();

function requireAdminSecret(req: Request, res: Response, next: Function) {
  const adminSecret = req.headers['x-admin-secret'];
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized - admin secret required' });
  }
  next();
}

router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const stats = await dataQualityService.getDashboardStats();
    res.json(stats);
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.get('/runs', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const runs = await dataQualityService.getRunHistory(limit);
    res.json({ runs });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.get('/runs/:runId', async (req: Request, res: Response) => {
  try {
    const details = await dataQualityService.getRunDetails(req.params.runId);
    if (!details.run) {
      return res.status(404).json({ error: 'Run not found' });
    }
    res.json(details);
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.post('/run/full', requireAdminSecret, async (req: Request, res: Response) => {
  try {
    res.json({ 
      message: 'Full data quality check started',
      note: 'Check is running in background'
    });

    dataQualityService.runFullQualityCheck()
      .then(result => {
        console.log('[DQ API] Full check completed:', result.status);
      })
      .catch(error => {
        console.error('[DQ API] Full check failed:', error);
        // Background job - error logged, don't crash
      });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.post('/run/validation', requireAdminSecret, async (req: Request, res: Response) => {
  try {
    const targetSystem = (req.body.targetSystem as 'app' | 'warehouse') || 'app';
    const result = await dataQualityService.runValidation(targetSystem);
    res.json(result);
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.post('/run/profiling', requireAdminSecret, async (req: Request, res: Response) => {
  try {
    const tables = req.body.tables as string[] | undefined;
    const result = await dataQualityService.runProfiling(tables);
    res.json(result);
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.post('/run/reconciliation', requireAdminSecret, async (req: Request, res: Response) => {
  try {
    const result = await dataQualityService.runReconciliation();
    res.json(result);
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.get('/alerts', async (req: Request, res: Response) => {
  try {
    const activeOnly = req.query.active !== 'false';
    const limit = parseInt(req.query.limit as string) || 50;
    
    const alerts = activeOnly 
      ? await dqAlertService.getActiveAlerts(limit)
      : await dqAlertService.getAlertHistory(limit);
    
    res.json({ alerts });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.get('/alerts/stats', async (req: Request, res: Response) => {
  try {
    const stats = await dqAlertService.getAlertStats();
    res.json(stats);
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.post('/alerts/:alertId/resolve', requireAdminSecret, async (req: Request, res: Response) => {
  try {
    const resolvedBy = req.body.resolvedBy || 'admin';
    const alert = await dqAlertService.resolveAlert(req.params.alertId, resolvedBy);
    
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    res.json(alert);
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.get('/reconciliation/history', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const history = await reconciliationService.getReconciliationHistory(limit);
    res.json({ history });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.post('/reconciliation/jobs', requireAdminSecret, async (req: Request, res: Response) => {
  try {
    const { jobName, sourceSystem, targetSystem, reconciliationType, sourceQuery, targetQuery, matchKeys, tolerancePercent } = req.body;
    
    if (!jobName || !sourceSystem || !targetSystem || !reconciliationType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const jobId = await reconciliationService.createCustomJob({
      jobName,
      sourceSystem,
      targetSystem,
      reconciliationType,
      sourceQuery: sourceQuery || '',
      targetQuery: targetQuery || '',
      matchKeys: matchKeys || [],
      tolerancePercent: tolerancePercent || 0
    });

    res.status(201).json({ id: jobId, message: 'Reconciliation job created' });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

export default router;
