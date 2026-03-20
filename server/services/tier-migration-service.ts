import { db } from '../db';
import { users, tierMigrations, type TierMigration as TierMigrationRow } from '@shared/schema';
import { eq, and, or, lte, desc, gte, sql } from 'drizzle-orm';

export interface TierMigration {
  id: string;
  userId: string;
  fromTier: string;
  toTier: string;
  reason: string;
  gracePeriodDays: number;
  migratedAt: Date;
  effectiveAt: Date;
  status: 'pending' | 'active' | 'completed';
}

import { isDemoMode, getAppMode } from '../config';

export class TierMigrationService {
  async migrateTier(
    userId: string,
    newTier: string,
    reason: string = 'User requested',
    gracePeriodDays: number = 0
  ): Promise<TierMigration> {
    try {
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);

      if (!user[0]) {
        throw new Error(`User ${userId} not found`);
      }

      const fromTier = user[0].subscriptionTier || 'free';

      if (fromTier === newTier) {
        throw new Error(`User already on ${newTier} tier`);
      }

      const now = new Date();
      const effectiveAt = new Date();
      effectiveAt.setDate(effectiveAt.getDate() + gracePeriodDays);

      const migrationId = `migration_${userId}_${Date.now()}`;
      const status = gracePeriodDays > 0 ? 'pending' : 'active';

      await db.insert(tierMigrations).values({
        id: migrationId,
        userId,
        fromTier,
        toTier: newTier,
        reason,
        gracePeriodDays,
        effectiveAt,
        status,
      });

      if (gracePeriodDays === 0) {
        await db.update(users).set({ subscriptionTier: newTier }).where(eq(users.id, userId));
        console.log(`User ${userId} migrated: ${fromTier} -> ${newTier}`);
      } else {
        console.log(
          `User ${userId} migration scheduled: ${fromTier} -> ${newTier} (grace period: ${gracePeriodDays} days)`
        );
      }

      return {
        id: migrationId,
        userId,
        fromTier,
        toTier: newTier,
        reason,
        gracePeriodDays,
        migratedAt: now,
        effectiveAt,
        status: status as 'pending' | 'active' | 'completed',
      };
    } catch (error) {
      console.error('Tier migration failed', error);
      throw error;
    }
  }

  /**
   * Apply pending tier migrations.
   * This is safe to run in any mode as it only applies scheduled changes.
   */
  async applyPendingMigrations(): Promise<{ applied: number; failed: number }> {
    const appMode = getAppMode();
    console.log(`[TIER-MIGRATION] Applying pending migrations in ${appMode} mode...`);

    try {
      const pendingMigrations = await db
        .select()
        .from(tierMigrations)
        .where(
          and(eq(tierMigrations.status, 'pending'), lte(tierMigrations.effectiveAt, new Date()))
        );

      let applied = 0;
      let failed = 0;

      for (const migration of pendingMigrations) {
        try {
          await db
            .update(users)
            .set({ subscriptionTier: migration.toTier })
            .where(eq(users.id, migration.userId));

          await db
            .update(tierMigrations)
            .set({ status: 'active' })
            .where(eq(tierMigrations.id, migration.id));

          applied++;
          console.log(`Applied pending migration for user ${migration.userId}`);
        } catch (error) {
          console.error(`Failed to apply migration for user ${migration.userId}`, error);
          failed++;
        }
      }

      return { applied, failed };
    } catch (error) {
      console.error('Failed to apply pending migrations', error);
      throw error;
    }
  }

  async getActiveMigration(userId: string): Promise<TierMigration | null> {
    try {
      const result = await db
        .select()
        .from(tierMigrations)
        .where(
          and(
            eq(tierMigrations.userId, userId),
            or(eq(tierMigrations.status, 'pending'), eq(tierMigrations.status, 'active'))
          )
        )
        .orderBy(desc(tierMigrations.migratedAt))
        .limit(1);

      if (!result[0]) return null;

      return {
        id: result[0].id,
        userId: result[0].userId,
        fromTier: result[0].fromTier,
        toTier: result[0].toTier,
        reason: result[0].reason,
        gracePeriodDays: result[0].gracePeriodDays || 0,
        migratedAt: result[0].migratedAt,
        effectiveAt: result[0].effectiveAt,
        status: result[0].status as 'pending' | 'active' | 'completed',
      };
    } catch (error) {
      console.error('Failed to get active migration', error);
      throw error;
    }
  }

  async cancelMigration(migrationId: string): Promise<void> {
    try {
      await db
        .update(tierMigrations)
        .set({ status: 'completed' })
        .where(eq(tierMigrations.id, migrationId));

      console.log(`Migration ${migrationId} cancelled`);
    } catch (error) {
      console.error('Failed to cancel migration', error);
      throw error;
    }
  }

  async getMigrationHistory(userId: string, limit: number = 10): Promise<TierMigration[]> {
    try {
      const result = await db
        .select()
        .from(tierMigrations)
        .where(eq(tierMigrations.userId, userId))
        .orderBy(desc(tierMigrations.migratedAt))
        .limit(limit);

      return result.map((m: TierMigrationRow) => ({
        id: m.id,
        userId: m.userId,
        fromTier: m.fromTier,
        toTier: m.toTier,
        reason: m.reason,
        gracePeriodDays: m.gracePeriodDays || 0,
        migratedAt: m.migratedAt,
        effectiveAt: m.effectiveAt,
        status: m.status as 'pending' | 'active' | 'completed',
      }));
    } catch (error) {
      console.error('Failed to get migration history', error);
      throw error;
    }
  }

  async getPendingMigrationsStatus(): Promise<{
    pending_migrations: number;
    pending_details: Array<{
      migration_id: string;
      user_id: string;
      from_tier: string;
      to_tier: string;
      grace_period_expires: string;
      days_remaining: number;
    }>;
    last_applied: string | null;
    total_applied_this_month: number;
  }> {
    try {
      const pendingMigrations = await db
        .select()
        .from(tierMigrations)
        .where(eq(tierMigrations.status, 'pending'))
        .orderBy(desc(tierMigrations.effectiveAt));

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const appliedThisMonth = await db
        .select()
        .from(tierMigrations)
        .where(
          and(
            or(eq(tierMigrations.status, 'active'), eq(tierMigrations.status, 'completed')),
            gte(tierMigrations.migratedAt, startOfMonth)
          )
        )
        .orderBy(desc(tierMigrations.migratedAt));

      const lastApplied = appliedThisMonth[0];

      const pendingDetails = pendingMigrations.map((m: TierMigrationRow) => {
        const effectiveDate = new Date(m.effectiveAt);
        const daysRemaining = Math.max(
          0,
          Math.ceil((effectiveDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        );

        return {
          migration_id: m.id,
          user_id: m.userId,
          from_tier: m.fromTier,
          to_tier: m.toTier,
          grace_period_expires: effectiveDate.toISOString(),
          days_remaining: daysRemaining,
        };
      });

      return {
        pending_migrations: pendingMigrations.length,
        pending_details: pendingDetails,
        last_applied: lastApplied?.migratedAt?.toISOString() || null,
        total_applied_this_month: appliedThisMonth.length,
      };
    } catch (error) {
      console.error('Failed to get pending migrations status', error);
      throw error;
    }
  }
}

export const tierMigrationService = new TierMigrationService();
