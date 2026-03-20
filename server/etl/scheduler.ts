import { etlPipeline } from './pipeline';
import { ETLJobResult } from './etl-service';

interface ScheduledJob {
  name: string;
  cronExpression: string;
  lastRun: Date | null;
  nextRun: Date | null;
  enabled: boolean;
  runNow: () => Promise<ETLJobResult>;
}

class ETLScheduler {
  private jobs: Map<string, ScheduledJob> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private isRunning = false;

  constructor() {
    this.registerDefaultJobs();
  }

  private registerDefaultJobs(): void {
    this.jobs.set('full_pipeline', {
      name: 'Full ETL Pipeline',
      cronExpression: '0 2 * * *',
      lastRun: null,
      nextRun: this.calculateNextRun('0 2 * * *'),
      enabled: true,
      runNow: () => etlPipeline.runFullPipeline(),
    });

    this.jobs.set('hourly_violations', {
      name: 'Hourly Violations Sync',
      cronExpression: '0 * * * *',
      lastRun: null,
      nextRun: this.calculateNextRun('0 * * * *'),
      enabled: true,
      runNow: () => etlPipeline.runViolationsPipeline(),
    });

    this.jobs.set('hourly_users', {
      name: 'Hourly Users Sync',
      cronExpression: '30 * * * *',
      lastRun: null,
      nextRun: this.calculateNextRun('30 * * * *'),
      enabled: true,
      runNow: () => etlPipeline.runUsersPipeline(),
    });
  }

  private calculateNextRun(cronExpression: string): Date {
    const now = new Date();
    const parts = cronExpression.split(' ');
    const minute = parseInt(parts[0]) || 0;
    const hour = parts[1] === '*' ? now.getHours() : parseInt(parts[1]);

    const next = new Date(now);
    next.setMinutes(minute);
    next.setSeconds(0);
    next.setMilliseconds(0);

    if (parts[1] !== '*') {
      next.setHours(hour);
    }

    if (next <= now) {
      if (parts[1] === '*') {
        next.setHours(next.getHours() + 1);
      } else {
        next.setDate(next.getDate() + 1);
      }
    }

    return next;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('[ETL Scheduler] Starting scheduler');

    const fullPipelineInterval = setInterval(async () => {
      const now = new Date();
      if (now.getHours() === 2 && now.getMinutes() === 0) {
        await this.runJob('full_pipeline');
      }
    }, 60000);
    this.intervals.set('full_pipeline', fullPipelineInterval);

    const hourlyInterval = setInterval(async () => {
      const now = new Date();
      if (now.getMinutes() === 0) {
        await this.runJob('hourly_violations');
      }
      if (now.getMinutes() === 30) {
        await this.runJob('hourly_users');
      }
    }, 60000);
    this.intervals.set('hourly', hourlyInterval);

    console.log('[ETL Scheduler] Scheduler started with jobs:', Array.from(this.jobs.keys()));
  }

  stop(): void {
    this.isRunning = false;
    Array.from(this.intervals.values()).forEach((interval) => {
      clearInterval(interval);
    });
    this.intervals.clear();
    console.log('[ETL Scheduler] Scheduler stopped');
  }

  async runJob(jobName: string): Promise<ETLJobResult | null> {
    const job = this.jobs.get(jobName);
    if (!job) {
      console.error(`[ETL Scheduler] Job not found: ${jobName}`);
      return null;
    }

    if (!job.enabled) {
      console.log(`[ETL Scheduler] Job disabled: ${jobName}`);
      return null;
    }

    console.log(`[ETL Scheduler] Running job: ${jobName}`);

    try {
      const result = await job.runNow();
      job.lastRun = new Date();
      job.nextRun = this.calculateNextRun(job.cronExpression);

      console.log(`[ETL Scheduler] Job ${jobName} completed:`, {
        status: result.status,
        rowsLoaded: result.rowsLoaded,
        duration: result.duration,
      });

      return result;
    } catch (error) {
      console.error(`[ETL Scheduler] Job ${jobName} failed:`, error);
      return null;
    }
  }

  async triggerManualRun(jobName: string): Promise<ETLJobResult | null> {
    console.log(`[ETL Scheduler] Manual trigger for job: ${jobName}`);
    return this.runJob(jobName);
  }

  getStatus(): { isRunning: boolean; jobs: any[] } {
    const jobList = Array.from(this.jobs.entries()).map(([key, job]) => ({
      id: key,
      name: job.name,
      cronExpression: job.cronExpression,
      lastRun: job.lastRun,
      nextRun: job.nextRun,
      enabled: job.enabled,
    }));

    return {
      isRunning: this.isRunning,
      jobs: jobList,
    };
  }

  enableJob(jobName: string): boolean {
    const job = this.jobs.get(jobName);
    if (job) {
      job.enabled = true;
      return true;
    }
    return false;
  }

  disableJob(jobName: string): boolean {
    const job = this.jobs.get(jobName);
    if (job) {
      job.enabled = false;
      return true;
    }
    return false;
  }
}

export const etlScheduler = new ETLScheduler();
