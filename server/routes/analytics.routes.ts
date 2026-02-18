import { Router, Request, Response } from 'express';
import { analyticsService } from '../analytics-service';
import { billingService } from '../billing-service';
import { tierMigrationService } from '../tier-migration-service';
import { quotaResetService } from '../quota-reset-service';
import { cronScheduler } from '../cron-scheduler';

const router = Router();

function requireAdmin(req: Request, res: Response, next: () => void) {
  const adminSecret = req.headers["x-admin-secret"] as string;
  if (!process.env.ADMIN_SECRET || adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  next();
}

router.get('/analytics/platform-metrics', requireAdmin, async (req: Request, res: Response) => {
  try {
    const metrics = await analyticsService.getPlatformMetrics();

    res.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to get platform metrics', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

router.get('/analytics/cohorts', requireAdmin, async (req: Request, res: Response) => {
  try {
    const months = req.query.months ? parseInt(req.query.months as string) : 12;
    const cohorts = await analyticsService.getCohortAnalysis(months);

    res.json({
      success: true,
      data: cohorts,
    });
  } catch (error) {
    console.error('Failed to get cohort analysis', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

router.get('/analytics/usage-trends', requireAdmin, async (req: Request, res: Response) => {
  try {
    const days = req.query.days ? parseInt(req.query.days as string) : 90;
    const trends = await analyticsService.getUsageTrends(days);

    res.json({
      success: true,
      data: trends,
    });
  } catch (error) {
    console.error('Failed to get usage trends', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

router.get('/analytics/revenue', requireAdmin, async (req: Request, res: Response) => {
  try {
    const month = req.query.month ? new Date(req.query.month as string) : undefined;
    const revenue = await analyticsService.getRevenueByTier(month);

    res.json({
      success: true,
      data: revenue,
      currency: 'USD',
      period: month
        ? `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`
        : 'current',
    });
  } catch (error) {
    console.error('Failed to get revenue data', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

router.get('/admin/analytics/billing-stats', requireAdmin, async (req: Request, res: Response) => {
  try {
    const stats = await billingService.getBillingStats();
    res.json(stats);
  } catch (error) {
    console.error('Failed to get billing stats', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

router.get('/admin/analytics/quota-resets', requireAdmin, async (req: Request, res: Response) => {
  try {
    const stats = await quotaResetService.getQuotaResetStats();
    res.json(stats);
  } catch (error) {
    console.error('Failed to get quota reset stats', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

router.get('/admin/migrations/pending-status', requireAdmin, async (req: Request, res: Response) => {
  try {
    const status = await tierMigrationService.getPendingMigrationsStatus();
    res.json(status);
  } catch (error) {
    console.error('Failed to get pending migrations status', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

router.post('/admin/billing/process-monthly', requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await billingService.processMonthlyBillings();

    res.json({
      success: true,
      data: result,
      message: `Processed ${result.processed} users, ${result.failed} failed`,
    });
  } catch (error) {
    console.error('Monthly billing failed', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

router.post('/admin/quotas/reset-monthly', requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await quotaResetService.resetMonthlyQuotas();

    res.json({
      success: true,
      data: result,
      message: `Reset ${result.reset} users, ${result.failed} failed`,
    });
  } catch (error) {
    console.error('Quota reset failed', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

router.post('/admin/migrations/apply-pending', requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await tierMigrationService.applyPendingMigrations();

    res.json({
      success: true,
      data: result,
      message: `Applied ${result.applied} migrations, ${result.failed} failed`,
    });
  } catch (error) {
    console.error('Migration application failed', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

router.get('/admin/analytics/at-risk-users', requireAdmin, async (req: Request, res: Response) => {
  try {
    const atRiskUsers = await analyticsService.getAtRiskUsers();
    res.json({
      success: true,
      data: atRiskUsers,
      count: atRiskUsers.length,
      highRisk: atRiskUsers.filter(u => u.riskLevel === 'high').length,
      mediumRisk: atRiskUsers.filter(u => u.riskLevel === 'medium').length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to get at-risk users', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

router.get('/admin/cron/status', requireAdmin, async (req: Request, res: Response) => {
  try {
    const status = cronScheduler.getStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    console.error('Failed to get cron status', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

router.post('/admin/cron/run-all', requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await cronScheduler.runAllMonthlyTasks();
    res.json({
      success: true,
      data: result,
      message: 'All monthly tasks executed successfully',
    });
  } catch (error) {
    console.error('Failed to run all cron tasks', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

export default router;
