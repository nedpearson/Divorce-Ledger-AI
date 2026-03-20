import { db } from './db';
import { scheduledJobRuns, type ScheduledJobRun } from '@shared/schema';
import { billingService } from './services/billing-service';
import { quotaResetService } from './services/quota-reset-service';
import { tierMigrationService } from './services/tier-migration-service';
import { eq, and, desc } from 'drizzle-orm';

/**
 * LIVE MODE SCHEDULER
 *
 * This scheduler is designed exclusively for LIVE/PRODUCTION mode.
 * It provides:
 * - Idempotency via scheduled_job_runs table
 * - Observability with full job history
 * - Safety guards to prevent accidental execution in demo mode
 * - Reconciliation-based operations (no destructive patterns)
 */

interface ScheduledTask {
  name: string;
  schedule: { day: number; hour: number; minute: number };
  handler: () => Promise<{ processed?: number; failed?: number; applied?: number; reset?: number }>;
  description: string;
}

import { isLiveMode, isDemoMode, getAppMode } from './config';

class LiveScheduler {
  private tasks: ScheduledTask[] = [];
  private intervalId: NodeJS.Timeout | null = null;
  private readonly checkIntervalMs = 60000; // Check every minute

  constructor() {
    this.tasks = [
      {
        name: 'Reset Monthly Quotas',
        description: 'Resets monthly usage counters for all users while preserving audit history',
        schedule: { day: 1, hour: 0, minute: 5 },
        handler: async () => {
          console.log('[LIVE-SCHEDULER] Running monthly quota reset...');
          return await quotaResetService.resetMonthlyQuotas();
        },
      },
      {
        name: 'Process Monthly Billings',
        description: 'Calculates and records billing for all users based on usage',
        schedule: { day: 1, hour: 0, minute: 10 },
        handler: async () => {
          console.log('[LIVE-SCHEDULER] Running monthly billing process...');
          return await billingService.processMonthlyBillings();
        },
      },
      {
        name: 'Apply Pending Tier Migrations',
        description: 'Applies scheduled tier changes after grace periods expire',
        schedule: { day: 1, hour: 0, minute: 15 },
        handler: async () => {
          console.log('[LIVE-SCHEDULER] Applying pending tier migrations...');
          return await tierMigrationService.applyPendingMigrations();
        },
      },
    ];
  }

  /**
   * Start the scheduler - ONLY in live mode with CRON_ENABLED=true
   */
  start(): void {
    // CRITICAL: Strict mode guard
    if (!isLiveMode()) {
      console.log(`[LIVE-SCHEDULER] Skipped: APP_MODE="${getAppMode()}" (requires "live")`);
      return;
    }

    if (process.env.CRON_ENABLED !== 'true') {
      console.log('[LIVE-SCHEDULER] Skipped: CRON_ENABLED is not "true"');
      return;
    }

    if (this.intervalId) {
      console.log('[LIVE-SCHEDULER] Already running');
      return;
    }

    console.log('[LIVE-SCHEDULER] Starting live mode scheduler...');
    console.log('[LIVE-SCHEDULER] Registered tasks:');
    for (const task of this.tasks) {
      const { day, hour, minute } = task.schedule;
      console.log(
        `  - ${task.name}: Day ${day} at ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} UTC`
      );
      console.log(`    ${task.description}`);
    }

    this.intervalId = setInterval(() => this.tick(), this.checkIntervalMs);
    this.tick();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[LIVE-SCHEDULER] Stopped');
    }
  }

  /**
   * Generate idempotency key for a job run
   */
  private generateIdempotencyKey(taskName: string, date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${taskName.replace(/\s+/g, '_').toLowerCase()}_${year}-${month}`;
  }

  /**
   * Check if a job has already been run for the current period
   */
  private async hasAlreadyRun(idempotencyKey: string): Promise<boolean> {
    const existing = await db
      .select()
      .from(scheduledJobRuns)
      .where(
        and(
          eq(scheduledJobRuns.idempotencyKey, idempotencyKey),
          eq(scheduledJobRuns.status, 'success')
        )
      )
      .limit(1);

    return existing.length > 0;
  }

  /**
   * Record a job run for observability
   */
  private async recordJobRun(
    taskName: string,
    idempotencyKey: string,
    status: 'success' | 'failure' | 'skipped',
    durationMs: number,
    result?: any,
    errorMessage?: string
  ): Promise<void> {
    await db.insert(scheduledJobRuns).values({
      jobName: taskName,
      idempotencyKey,
      status,
      startedAt: new Date(Date.now() - durationMs),
      completedAt: new Date(),
      durationMs,
      result: result ? JSON.stringify(result) : null,
      errorMessage,
      appMode: getAppMode(),
    });
  }

  private async tick(): Promise<void> {
    // Double-check mode guard in tick
    if (!isLiveMode()) {
      return;
    }

    const now = new Date();
    const currentDay = now.getUTCDate();
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();
    const correlationId = Math.random().toString(36).substring(2, 10);

    for (const task of this.tasks) {
      const { day, hour, minute } = task.schedule;

      if (currentDay === day && currentHour === hour && currentMinute === minute) {
        const idempotencyKey = this.generateIdempotencyKey(task.name, now);

        // Check idempotency - prevent duplicate runs
        if (await this.hasAlreadyRun(idempotencyKey)) {
          console.log(
            `[LIVE-SCHEDULER][${correlationId}] Skipped (already run): ${task.name} [${idempotencyKey}]`
          );
          continue;
        }

        const startTime = Date.now();

        try {
          console.log(`[LIVE-SCHEDULER][${correlationId}] Executing: ${task.name}`);
          const result = await task.handler();
          const durationMs = Date.now() - startTime;

          await this.recordJobRun(task.name, idempotencyKey, 'success', durationMs, result);

          console.log(
            `[LIVE-SCHEDULER][${correlationId}] Completed: ${task.name} in ${durationMs}ms`,
            result
          );
        } catch (error) {
          const durationMs = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorStack = error instanceof Error ? error.stack : undefined;

          await this.recordJobRun(
            task.name,
            idempotencyKey,
            'failure',
            durationMs,
            undefined,
            errorMessage
          );

          console.error(
            `[LIVE-SCHEDULER][${correlationId}] FAILED: ${task.name} in ${durationMs}ms`
          );
          console.error(`[LIVE-SCHEDULER][${correlationId}] Error:`, errorMessage);
          if (errorStack) {
            console.error(`[LIVE-SCHEDULER][${correlationId}] Stack:`, errorStack);
          }
        }
      }
    }
  }

  /**
   * Manual run with idempotency check
   */
  async runNow(taskName: string, forceRun: boolean = false): Promise<any> {
    if (!isLiveMode() && !forceRun) {
      throw new Error(`Cannot run scheduler tasks: APP_MODE="${getAppMode()}" (requires "live")`);
    }

    const task = this.tasks.find((t) => t.name === taskName);
    if (!task) {
      throw new Error(`Task not found: ${taskName}`);
    }

    const now = new Date();
    const idempotencyKey = this.generateIdempotencyKey(task.name, now);

    if (!forceRun && (await this.hasAlreadyRun(idempotencyKey))) {
      return { skipped: true, reason: `Already run for period: ${idempotencyKey}` };
    }

    const startTime = Date.now();

    try {
      console.log(`[LIVE-SCHEDULER] Manual run: ${task.name}`);
      const result = await task.handler();
      const durationMs = Date.now() - startTime;

      await this.recordJobRun(task.name, idempotencyKey, 'success', durationMs, result);

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.recordJobRun(
        task.name,
        idempotencyKey,
        'failure',
        durationMs,
        undefined,
        errorMessage
      );

      throw error;
    }
  }

  /**
   * Get job run history for observability
   */
  async getJobHistory(limit: number = 50): Promise<ScheduledJobRun[]> {
    return await db
      .select()
      .from(scheduledJobRuns)
      .orderBy(desc(scheduledJobRuns.startedAt))
      .limit(limit);
  }

  getStatus(): {
    running: boolean;
    appMode: string;
    cronEnabled: boolean;
    tasks: Array<{ name: string; description: string; nextRun: string }>;
  } {
    const now = new Date();

    return {
      running: this.intervalId !== null,
      appMode: getAppMode(),
      cronEnabled: process.env.CRON_ENABLED === 'true',
      tasks: this.tasks.map((task) => {
        const { day, hour, minute } = task.schedule;

        let nextRun = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, hour, minute)
        );

        if (nextRun <= now) {
          nextRun = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, day, hour, minute)
          );
        }

        return {
          name: task.name,
          description: task.description,
          nextRun: nextRun.toISOString(),
        };
      }),
    };
  }
}

export const liveScheduler = new LiveScheduler();
export { isLiveMode, isDemoMode, getAppMode };
