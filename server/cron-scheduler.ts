import { billingService } from './billing-service';
import { quotaResetService } from './quota-reset-service';
import { tierMigrationService } from './tier-migration-service';

/**
 * Section 2C: OPTIONAL CRON
 * The scheduler is now isolated. It checks environment variables internally
 * but is also guarded during initialization in index.ts.
 */
interface ScheduledTask {
  name: string;
  schedule: { day: number; hour: number; minute: number };
  handler: () => Promise<any>;
  lastRun?: Date;
}

class CronScheduler {
  private tasks: ScheduledTask[] = [];
  private intervalId: NodeJS.Timeout | null = null;
  private checkIntervalMs = 60000; // Check every minute

  constructor() {
    this.tasks = [
      {
        name: 'Reset Monthly Quotas',
        schedule: { day: 1, hour: 0, minute: 5 },
        handler: async () => {
          console.log('[CRON] Running monthly quota reset...');
          return await quotaResetService.resetMonthlyQuotas();
        },
      },
      {
        name: 'Process Monthly Billings',
        schedule: { day: 1, hour: 0, minute: 10 },
        handler: async () => {
          console.log('[CRON] Running monthly billing process...');
          return await billingService.processMonthlyBillings();
        },
      },
      {
        name: 'Apply Pending Tier Migrations',
        schedule: { day: 1, hour: 0, minute: 15 },
        handler: async () => {
          console.log('[CRON] Applying pending tier migrations...');
          return await tierMigrationService.applyPendingMigrations();
        },
      },
    ];
  }

  start(): void {
    // Section 6: Enforce APP_MODE isolation
    if (process.env.APP_MODE !== 'demo' || process.env.CRON_ENABLED !== 'true') {
      console.log('[CRON] Scheduler skipped: Environment isolation active (NOT in demo mode or cron disabled).');
      return;
    }

    if (this.intervalId) {
      console.log('[CRON] Scheduler already running');
      return;
    }

    console.log('[CRON] Starting isolated scheduler...');
    console.log('[CRON] Scheduled tasks:');
    for (const task of this.tasks) {
      const { day, hour, minute } = task.schedule;
      console.log(`  - ${task.name}: Day ${day} at ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} UTC`);
    }

    this.intervalId = setInterval(() => this.tick(), this.checkIntervalMs);
    this.tick();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[CRON] Scheduler stopped');
    }
  }

  private async tick(): Promise<void> {
    const now = new Date();
    const currentDay = now.getUTCDate();
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();
    const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const timestamp = now.toISOString();
    const correlationId = Math.random().toString(36).substring(2, 10);

    for (const task of this.tasks) {
      const { day, hour, minute } = task.schedule;

      if (currentDay === day && currentHour === hour && currentMinute === minute) {
        const lastRunMonth = task.lastRun
          ? `${task.lastRun.getUTCFullYear()}-${String(task.lastRun.getUTCMonth() + 1).padStart(2, '0')}`
          : null;

        if (lastRunMonth !== currentMonth) {
          try {
            console.log(`[CRON][${timestamp}][${correlationId}] Executing: ${task.name}`);
            const result = await task.handler();
            task.lastRun = now;
            console.log(`[CRON][${timestamp}][${correlationId}] Completed: ${task.name}`, result);
          } catch (error) {
            console.error(`[CRON][${timestamp}][${correlationId}] Failed: ${task.name}`, error);
          }
        }
      }
    }
  }

  async runNow(taskName: string): Promise<any> {
    const task = this.tasks.find(t => t.name === taskName);
    if (!task) {
      throw new Error(`Task not found: ${taskName}`);
    }

    console.log(`[CRON] Manual run: ${task.name}`);
    const result = await task.handler();
    task.lastRun = new Date();
    return result;
  }

  async runAllMonthlyTasks(): Promise<{ quotas: any; billing: any; migrations: any }> {
    console.log('[CRON] Running all monthly tasks manually...');
    
    const quotas = await quotaResetService.resetMonthlyQuotas();
    const billing = await billingService.processMonthlyBillings();
    const migrations = await tierMigrationService.applyPendingMigrations();
    
    return { quotas, billing, migrations };
  }

  getStatus(): { running: boolean; tasks: Array<{ name: string; lastRun: Date | null; nextRun: string }> } {
    const now = new Date();
    
    return {
      running: this.intervalId !== null,
      tasks: this.tasks.map(task => {
        const { day, hour, minute } = task.schedule;
        
        let nextRun = new Date(Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          day,
          hour,
          minute
        ));
        
        if (nextRun <= now) {
          nextRun = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth() + 1,
            day,
            hour,
            minute
          ));
        }
        
        return {
          name: task.name,
          lastRun: task.lastRun || null,
          nextRun: nextRun.toISOString(),
        };
      }),
    };
  }
}

export const cronScheduler = new CronScheduler();
