import { db } from '../db';
import { users, quotaResetLog, type QuotaResetLog as QuotaResetLogRow } from '@shared/schema';
import { eq, desc, sql } from 'drizzle-orm';

export interface QuotaReset {
  userId: string;
  resetAt: Date;
  resetMonth: string;
  violationsCountBefore: number;
  voiceTranscriptionsBefore: number;
  mediaUploadsBefore: number;
}

import { isDemoMode, getAppMode } from '../config';

export class QuotaResetService {
  /**
   * Reset monthly quotas for all users.
   * This is safe to run in any mode as it only resets counters, not data.
   * Audit history is preserved in quotaResetLog table.
   */
  async resetMonthlyQuotas(): Promise<{ reset: number; failed: number }> {
    const appMode = getAppMode();
    console.log(`[QUOTA] Starting monthly quota reset in ${appMode} mode...`);

    try {
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const allUsers = await db.select().from(users);

      let reset = 0;
      let failed = 0;

      for (const user of allUsers) {
        try {
          const hasQuotaToReset =
            (user.violationsCountThisMonth || 0) > 0 ||
            (user.voiceTranscriptionsThisMonth || 0) > 0 ||
            (user.mediaUploadsThisMonth || 0) > 0;

          if (hasQuotaToReset) {
            await db.insert(quotaResetLog).values({
              userId: user.id,
              resetMonth: currentMonth,
              violationsCountBefore: user.violationsCountThisMonth || 0,
              voiceTranscriptionsBefore: user.voiceTranscriptionsThisMonth || 0,
              mediaUploadsBefore: user.mediaUploadsThisMonth || 0,
            });

            await db
              .update(users)
              .set({
                violationsCountThisMonth: 0,
                voiceTranscriptionsThisMonth: 0,
                mediaUploadsThisMonth: 0,
              })
              .where(eq(users.id, user.id));

            reset++;
            console.log(`Reset quota for user ${user.id}`);
          }
        } catch (error) {
          console.error(`Failed to reset quota for user ${user.id}`, error);
          failed++;
        }
      }

      console.log(`Monthly quota reset: ${reset} reset, ${failed} failed`);
      return { reset, failed };
    } catch (error) {
      console.error('Monthly quota reset failed', error);
      throw error;
    }
  }

  async resetUserQuota(userId: string): Promise<QuotaReset> {
    try {
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);

      if (!user[0]) {
        throw new Error(`User ${userId} not found`);
      }

      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const quotaReset: QuotaReset = {
        userId,
        resetAt: now,
        resetMonth: currentMonth,
        violationsCountBefore: user[0].violationsCountThisMonth || 0,
        voiceTranscriptionsBefore: user[0].voiceTranscriptionsThisMonth || 0,
        mediaUploadsBefore: user[0].mediaUploadsThisMonth || 0,
      };

      await db.insert(quotaResetLog).values({
        userId,
        resetMonth: currentMonth,
        violationsCountBefore: quotaReset.violationsCountBefore,
        voiceTranscriptionsBefore: quotaReset.voiceTranscriptionsBefore,
        mediaUploadsBefore: quotaReset.mediaUploadsBefore,
      });

      await db
        .update(users)
        .set({
          violationsCountThisMonth: 0,
          voiceTranscriptionsThisMonth: 0,
          mediaUploadsThisMonth: 0,
        })
        .where(eq(users.id, userId));

      console.log(`Reset quota for user ${userId}`);
      return quotaReset;
    } catch (error) {
      console.error('User quota reset failed', error);
      throw error;
    }
  }

  async getResetHistory(userId: string, limit: number = 12): Promise<QuotaReset[]> {
    try {
      const result = await db
        .select()
        .from(quotaResetLog)
        .where(eq(quotaResetLog.userId, userId))
        .orderBy(desc(quotaResetLog.resetAt))
        .limit(limit);

      return result.map((r: QuotaResetLogRow) => ({
        userId: r.userId,
        resetAt: r.resetAt,
        resetMonth: r.resetMonth,
        violationsCountBefore: r.violationsCountBefore || 0,
        voiceTranscriptionsBefore: r.voiceTranscriptionsBefore || 0,
        mediaUploadsBefore: r.mediaUploadsBefore || 0,
      }));
    } catch (error) {
      console.error('Failed to get quota reset history', error);
      throw error;
    }
  }

  getNextResetDate(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  daysUntilReset(): number {
    const now = new Date();
    const nextReset = this.getNextResetDate();
    const diffTime = nextReset.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  getCurrentQuotaStatus(user: any): {
    violationsUsed: number;
    voiceUsed: number;
    mediaUsed: number;
    daysUntilReset: number;
    nextResetDate: Date;
  } {
    return {
      violationsUsed: user.violationsCountThisMonth || 0,
      voiceUsed: user.voiceTranscriptionsThisMonth || 0,
      mediaUsed: user.mediaUploadsThisMonth || 0,
      daysUntilReset: this.daysUntilReset(),
      nextResetDate: this.getNextResetDate(),
    };
  }

  async getQuotaResetStats(): Promise<{
    last_reset_date: string | null;
    users_reset: number;
    users_skipped: number;
    reset_coverage: number;
    avg_violations_before_reset: number;
    reset_history: Array<{
      period: string;
      users_affected: number;
      status: string;
    }>;
  }> {
    try {
      const allUsers = await db.select().from(users);
      const totalUsers = allUsers.length;

      const recentResets = await db
        .select()
        .from(quotaResetLog)
        .orderBy(desc(quotaResetLog.resetAt))
        .limit(100);

      const groupedByMonth: Record<string, QuotaResetLogRow[]> = {};
      for (const reset of recentResets) {
        const month = reset.resetMonth;
        if (!groupedByMonth[month]) {
          groupedByMonth[month] = [];
        }
        groupedByMonth[month].push(reset);
      }

      const resetHistory = Object.entries(groupedByMonth)
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, 12)
        .map(([period, resets]) => ({
          period,
          users_affected: resets.length,
          status: 'completed',
        }));

      const lastReset = recentResets[0];
      const lastResetMonth = lastReset?.resetMonth;
      const usersResetLastMonth = lastResetMonth
        ? recentResets.filter((r: QuotaResetLogRow) => r.resetMonth === lastResetMonth).length
        : 0;

      const avgViolations =
        recentResets.length > 0
          ? recentResets.reduce(
              (sum: number, r: QuotaResetLogRow) => sum + (r.violationsCountBefore || 0),
              0
            ) / recentResets.length
          : 0;

      return {
        last_reset_date: lastReset?.resetAt?.toISOString() || null,
        users_reset: usersResetLastMonth,
        users_skipped: totalUsers - usersResetLastMonth,
        reset_coverage:
          totalUsers > 0 ? parseFloat(((usersResetLastMonth / totalUsers) * 100).toFixed(1)) : 100,
        avg_violations_before_reset: parseFloat(avgViolations.toFixed(1)),
        reset_history: resetHistory,
      };
    } catch (error) {
      console.error('Failed to get quota reset stats', error);
      throw error;
    }
  }
}

export const quotaResetService = new QuotaResetService();
