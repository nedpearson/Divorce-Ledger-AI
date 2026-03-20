import { db } from '../db';
import { users, violations, evidenceFiles, billingRecords } from '@shared/schema';
import { eq, sql, and, gte, lte } from 'drizzle-orm';
import { isDemoMode } from '../config';

export interface BillingRecord {
  id: string;
  userId: string;
  tier: string;
  periodStart: Date;
  periodEnd: Date;
  violationsRecorded: number;
  storageUsedMb: number;
  amountCents: number;
  status: 'pending' | 'charged' | 'failed' | 'refunded';
  stripeInvoiceId?: string;
  createdAt: Date;
}

export interface TierPricingConfig {
  tier: string;
  monthlyBasePriceCents: number;
  overageChargePerViolationCents: number;
  overageChargePerGbCents: number;
}

const TIER_PRICING: Record<string, TierPricingConfig> = {
  free: {
    tier: 'free',
    monthlyBasePriceCents: 0,
    overageChargePerViolationCents: 0,
    overageChargePerGbCents: 0,
  },
  individual: {
    tier: 'individual',
    monthlyBasePriceCents: 1200,
    overageChargePerViolationCents: 50,
    overageChargePerGbCents: 100,
  },
  pro: {
    tier: 'pro',
    monthlyBasePriceCents: 4900,
    overageChargePerViolationCents: 25,
    overageChargePerGbCents: 50,
  },
  team: {
    tier: 'team',
    monthlyBasePriceCents: 14900,
    overageChargePerViolationCents: 0,
    overageChargePerGbCents: 0,
  },
  enterprise: {
    tier: 'enterprise',
    monthlyBasePriceCents: 39900,
    overageChargePerViolationCents: 0,
    overageChargePerGbCents: 0,
  },
};

const TIER_LIMITS: Record<string, { violations: number; storageMB: number }> = {
  free: { violations: 10, storageMB: 100 },
  individual: { violations: 20, storageMB: 500 },
  pro: { violations: 50, storageMB: 2048 },
  team: { violations: -1, storageMB: 10240 },
  enterprise: { violations: -1, storageMB: -1 },
};

export class BillingService {
  /**
   * LIVE MODE GUARD: Check if billing operations should proceed.
   * Returns false in demo mode (billing should be skipped).
   */
  private shouldRunBilling(): boolean {
    return !isDemoMode();
  }

  /**
   * Calculate monthly billing for a user.
   * In demo mode, returns a mock billing record without persisting charges.
   */
  async calculateMonthlyBilling(userId: string, month: Date = new Date()): Promise<BillingRecord> {
    const isDemo = !this.shouldRunBilling();
    if (isDemo) {
      console.log(`[BILLING] Demo mode: Calculating preview billing for user ${userId}`);
    }

    try {
      const startOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
      const endOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0);

      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);

      if (!user[0]) {
        throw new Error(`User ${userId} not found`);
      }

      const userTier = user[0].subscriptionTier || 'free';
      const pricing = TIER_PRICING[userTier] || TIER_PRICING.free;
      const limits = TIER_LIMITS[userTier] || TIER_LIMITS.free;

      const violationsResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(violations)
        .where(
          and(
            eq(violations.userId, userId),
            gte(violations.timestamp, startOfMonth),
            lte(violations.timestamp, endOfMonth)
          )
        );

      const violationsCount = Number(violationsResult[0]?.count) || 0;

      const storageResult = await db
        .select({
          storageMB: sql<number>`COALESCE(SUM(file_size) / (1024.0 * 1024.0), 0)`,
        })
        .from(evidenceFiles)
        .where(
          and(
            eq(evidenceFiles.userId, userId),
            gte(evidenceFiles.timestamp, startOfMonth),
            lte(evidenceFiles.timestamp, endOfMonth)
          )
        );

      const storageMB = Number(storageResult[0]?.storageMB) || 0;

      let totalChargeCents = pricing.monthlyBasePriceCents;

      if (limits.violations !== -1 && violationsCount > limits.violations) {
        const overageViolations = violationsCount - limits.violations;
        totalChargeCents += overageViolations * pricing.overageChargePerViolationCents;
      }

      if (limits.storageMB !== -1 && storageMB > limits.storageMB) {
        const overageGB = (storageMB - limits.storageMB) / 1024;
        totalChargeCents += Math.ceil(overageGB) * pricing.overageChargePerGbCents;
      }

      const billingId = `billing_${userId}_${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;

      return {
        id: billingId,
        userId,
        tier: userTier,
        periodStart: startOfMonth,
        periodEnd: endOfMonth,
        violationsRecorded: violationsCount,
        storageUsedMb: storageMB,
        amountCents: totalChargeCents,
        status: 'pending',
        createdAt: new Date(),
      };
    } catch (error) {
      console.error('Billing calculation failed', error);
      throw error;
    }
  }

  /**
   * Save billing record to database.
   * In demo mode, logs but does not persist to prevent accidental charges.
   */
  async saveBillingRecord(record: BillingRecord): Promise<void> {
    if (!this.shouldRunBilling()) {
      console.log(
        `[BILLING] Demo mode: Would save billing record ${record.id} for $${(record.amountCents / 100).toFixed(2)}`
      );
      return;
    }

    try {
      await db
        .insert(billingRecords)
        .values({
          id: record.id,
          userId: record.userId,
          tier: record.tier,
          periodStart: record.periodStart,
          periodEnd: record.periodEnd,
          violationsRecorded: record.violationsRecorded,
          storageUsedMb: record.storageUsedMb,
          amountCents: record.amountCents,
          status: record.status,
        })
        .onConflictDoUpdate({
          target: billingRecords.id,
          set: {
            amountCents: record.amountCents,
            status: record.status,
          },
        });

      console.log(`Billing record saved: ${record.id}`);
    } catch (error) {
      console.error('Failed to save billing record', error);
      throw error;
    }
  }

  async getBillingHistory(userId: string, limit: number = 12): Promise<any[]> {
    try {
      const records = await db
        .select()
        .from(billingRecords)
        .where(eq(billingRecords.userId, userId))
        .orderBy(sql`period_start DESC`)
        .limit(limit);

      return records;
    } catch (error) {
      console.error('Failed to get billing history', error);
      throw error;
    }
  }

  async processMonthlyBillings(): Promise<{
    processed: number;
    failed: number;
    skipped?: boolean;
  }> {
    // LIVE MODE GUARD: Skip actual billing in demo mode
    if (process.env.APP_MODE === 'demo') {
      console.log('[BILLING] Skipping monthly billing: Running in demo mode');
      return { processed: 0, failed: 0, skipped: true };
    }

    try {
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);

      console.log('[BILLING] Starting monthly billing process...');

      const allUsers = await db.select({ id: users.id }).from(users);

      let processed = 0;
      let failed = 0;

      for (const user of allUsers) {
        try {
          const billing = await this.calculateMonthlyBilling(user.id, lastMonth);
          await this.saveBillingRecord(billing);
          processed++;
        } catch (error) {
          console.error(`Failed to bill user ${user.id}`, error);
          failed++;
        }
      }

      console.log(`Monthly billing complete: ${processed} processed, ${failed} failed`);
      return { processed, failed };
    } catch (error) {
      console.error('Monthly billing process failed', error);
      throw error;
    }
  }

  static getPricing(tier: string): TierPricingConfig {
    return TIER_PRICING[tier] || TIER_PRICING.free;
  }

  static formatPrice(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
  }

  static getLimits(tier: string): { violations: number; storageMB: number } {
    return TIER_LIMITS[tier] || TIER_LIMITS.free;
  }

  async getBillingStats(): Promise<{
    last_run: string | null;
    records_processed: number;
    records_successful: number;
    success_rate: number;
    failures: Array<{ user_id: string; error: string }>;
    total_revenue: number;
  }> {
    try {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const allRecords = await db
        .select()
        .from(billingRecords)
        .where(gte(billingRecords.periodStart, startOfMonth));

      type BillingRecordRow = (typeof allRecords)[number];

      const successfulRecords = allRecords.filter(
        (r: BillingRecordRow) => r.status === 'charged' || r.status === 'pending'
      );
      const failedRecords = allRecords.filter((r: BillingRecordRow) => r.status === 'failed');

      const totalRevenue =
        successfulRecords.reduce(
          (sum: number, r: BillingRecordRow) => sum + (r.amountCents || 0),
          0
        ) / 100;

      const lastRecord =
        allRecords.length > 0
          ? allRecords.reduce((latest: BillingRecordRow, r: BillingRecordRow) =>
              r.createdAt && (!latest.createdAt || r.createdAt > latest.createdAt) ? r : latest
            )
          : null;

      return {
        last_run: lastRecord?.createdAt?.toISOString() || null,
        records_processed: allRecords.length,
        records_successful: successfulRecords.length,
        success_rate:
          allRecords.length > 0
            ? parseFloat(((successfulRecords.length / allRecords.length) * 100).toFixed(1))
            : 100,
        failures: failedRecords.map((r: BillingRecordRow) => ({
          user_id: r.userId,
          error: 'payment processing failed',
        })),
        total_revenue: parseFloat(totalRevenue.toFixed(2)),
      };
    } catch (error) {
      console.error('Failed to get billing stats', error);
      throw error;
    }
  }
}

export const billingService = new BillingService();
