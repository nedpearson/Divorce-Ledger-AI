import { db } from './db';
import { users, violations, cases, evidenceFiles, usageAudit } from '@shared/schema';
import { eq, and, sql, gte } from 'drizzle-orm';

export interface TierLimits {
  tier: string;
  maxFileSizeMB: number;
  maxStorageMB: number | null;
  maxViolationsPerMonth: number | null;
  maxCases: number | null;
}

export interface UserUsageMetrics {
  userId: string;
  tier: string;
  violationsThisMonth: number;
  storageUsedMB: number;
  mediaCount: number;
  fileUploadsThisMonth: number;
  casesActive: number;
}

export interface TierEnforcementResult {
  allowed: boolean;
  reason?: string;
  currentUsage: UserUsageMetrics;
  tierLimits: TierLimits;
  warning?: string;
}

const TIER_LIMITS: Record<string, TierLimits> = {
  free: {
    tier: 'free',
    maxFileSizeMB: 10,
    maxStorageMB: 100,
    maxViolationsPerMonth: 10,
    maxCases: 1,
  },
  individual: {
    tier: 'individual',
    maxFileSizeMB: 50,
    maxStorageMB: 500,
    maxViolationsPerMonth: 20,
    maxCases: 1,
  },
  pro: {
    tier: 'pro',
    maxFileSizeMB: 100,
    maxStorageMB: 2048,
    maxViolationsPerMonth: 50,
    maxCases: null,
  },
  team: {
    tier: 'team',
    maxFileSizeMB: 250,
    maxStorageMB: 10240,
    maxViolationsPerMonth: null,
    maxCases: null,
  },
  enterprise: {
    tier: 'enterprise',
    maxFileSizeMB: 500,
    maxStorageMB: null,
    maxViolationsPerMonth: null,
    maxCases: null,
  },
};

export class TierEnforcementService {
  async canUploadFile(userId: string, fileSizeMB: number): Promise<TierEnforcementResult> {
    try {
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);

      if (user.length === 0) {
        throw new Error(`User ${userId} not found`);
      }

      const userTier = user[0].subscriptionTier || 'free';
      const tierLimits = TIER_LIMITS[userTier] || TIER_LIMITS.free;
      const currentUsage = await this.getUserUsageMetrics(userId);

      if (fileSizeMB > tierLimits.maxFileSizeMB) {
        return {
          allowed: false,
          reason: `File size (${fileSizeMB}MB) exceeds tier limit (${tierLimits.maxFileSizeMB}MB)`,
          currentUsage,
          tierLimits,
        };
      }

      if (tierLimits.maxStorageMB !== null) {
        const storageRemaining = tierLimits.maxStorageMB - currentUsage.storageUsedMB;

        if (fileSizeMB > storageRemaining) {
          return {
            allowed: false,
            reason: `File would exceed monthly storage limit. Used: ${currentUsage.storageUsedMB.toFixed(1)}MB / ${tierLimits.maxStorageMB}MB`,
            currentUsage,
            tierLimits,
          };
        }
      }

      if (tierLimits.maxViolationsPerMonth !== null) {
        if (currentUsage.violationsThisMonth >= tierLimits.maxViolationsPerMonth) {
          return {
            allowed: false,
            reason: `Monthly violation limit reached (${currentUsage.violationsThisMonth}/${tierLimits.maxViolationsPerMonth})`,
            currentUsage,
            tierLimits,
          };
        }
      }

      const warning = this.generateUsageWarning(currentUsage, tierLimits);

      return {
        allowed: true,
        currentUsage,
        tierLimits,
        warning,
      };
    } catch (error) {
      console.error('Tier enforcement check failed', error);
      throw error;
    }
  }

  async getUserUsageMetrics(userId: string): Promise<UserUsageMetrics> {
    try {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const violationsResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(violations)
        .where(
          and(
            eq(violations.userId, userId),
            gte(violations.timestamp, startOfMonth)
          )
        );

      const storageResult = await db
        .select({
          storageMB: sql<number>`COALESCE(SUM(file_size) / (1024.0 * 1024.0), 0)`,
          mediaCount: sql<number>`COUNT(*)`,
        })
        .from(evidenceFiles)
        .where(
          and(
            eq(evidenceFiles.userId, userId),
            gte(evidenceFiles.timestamp, startOfMonth)
          )
        );

      const casesResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(cases)
        .where(
          and(
            eq(cases.userId, userId),
            eq(cases.status, 'active')
          )
        );

      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const userTier = user[0]?.subscriptionTier || 'free';

      return {
        userId,
        tier: userTier,
        violationsThisMonth: Number(violationsResult[0]?.count) || 0,
        storageUsedMB: Number(storageResult[0]?.storageMB) || 0,
        mediaCount: Number(storageResult[0]?.mediaCount) || 0,
        fileUploadsThisMonth: Number(storageResult[0]?.mediaCount) || 0,
        casesActive: Number(casesResult[0]?.count) || 0,
      };
    } catch (error) {
      console.error('Failed to get usage metrics', error);
      throw error;
    }
  }

  private generateUsageWarning(usage: UserUsageMetrics, limits: TierLimits): string | undefined {
    const warnings: string[] = [];

    if (limits.maxStorageMB !== null) {
      const storagePercentage = (usage.storageUsedMB / limits.maxStorageMB) * 100;
      if (storagePercentage > 80) {
        warnings.push(
          `Storage usage at ${storagePercentage.toFixed(0)}% (${usage.storageUsedMB.toFixed(1)}MB / ${limits.maxStorageMB}MB)`
        );
      }
    }

    if (limits.maxViolationsPerMonth !== null) {
      const violationPercentage = (usage.violationsThisMonth / limits.maxViolationsPerMonth) * 100;
      if (violationPercentage > 80) {
        warnings.push(
          `Violation limit at ${violationPercentage.toFixed(0)}% (${usage.violationsThisMonth}/${limits.maxViolationsPerMonth})`
        );
      }
    }

    if (limits.maxCases !== null) {
      const casePercentage = (usage.casesActive / limits.maxCases) * 100;
      if (casePercentage > 80) {
        warnings.push(
          `Case limit at ${casePercentage.toFixed(0)}% (${usage.casesActive}/${limits.maxCases})`
        );
      }
    }

    return warnings.length > 0 ? warnings.join(' | ') : undefined;
  }

  async getRecommendedTierUpgrade(userId: string): Promise<{
    currentTier: string;
    recommendedTier: string;
    reason: string;
    upgradeCostSavings?: string;
  }> {
    try {
      const usage = await this.getUserUsageMetrics(userId);
      const currentLimits = TIER_LIMITS[usage.tier] || TIER_LIMITS.free;

      let recommendedTier = usage.tier;
      let reason = 'Within current tier limits';

      if (
        currentLimits.maxViolationsPerMonth !== null &&
        usage.violationsThisMonth >= currentLimits.maxViolationsPerMonth * 0.8
      ) {
        recommendedTier = this.getNextTier(usage.tier);
        reason = `Approaching violation limit (${usage.violationsThisMonth}/${currentLimits.maxViolationsPerMonth})`;
      }

      if (
        currentLimits.maxStorageMB !== null &&
        usage.storageUsedMB >= currentLimits.maxStorageMB * 0.8
      ) {
        const tierForStorage = this.getTierForStorage(usage.storageUsedMB);
        if (this.tierHierarchy(tierForStorage) > this.tierHierarchy(recommendedTier)) {
          recommendedTier = tierForStorage;
          reason = `Approaching storage limit (${usage.storageUsedMB.toFixed(1)}MB/${currentLimits.maxStorageMB}MB)`;
        }
      }

      if (
        currentLimits.maxCases !== null &&
        usage.casesActive >= currentLimits.maxCases * 0.8
      ) {
        const tierForCases = this.getTierForCases(usage.casesActive);
        if (this.tierHierarchy(tierForCases) > this.tierHierarchy(recommendedTier)) {
          recommendedTier = tierForCases;
          reason = `Approaching case limit (${usage.casesActive}/${currentLimits.maxCases})`;
        }
      }

      return {
        currentTier: usage.tier,
        recommendedTier,
        reason,
        upgradeCostSavings:
          usage.tier !== recommendedTier
            ? `Upgrade to ${recommendedTier} for expanded resources`
            : undefined,
      };
    } catch (error) {
      console.error('Failed to get recommended tier', error);
      throw error;
    }
  }

  private tierHierarchy(tier: string): number {
    const hierarchy: Record<string, number> = {
      free: 0,
      individual: 1,
      pro: 2,
      team: 3,
      enterprise: 4,
    };
    return hierarchy[tier] || 0;
  }

  private getNextTier(currentTier: string): string {
    const tiers = ['free', 'individual', 'pro', 'team', 'enterprise'];
    const index = tiers.indexOf(currentTier);
    return index < tiers.length - 1 ? tiers[index + 1] : 'enterprise';
  }

  private getTierForStorage(storageMB: number): string {
    if (storageMB > 10240) return 'enterprise';
    if (storageMB > 2048) return 'team';
    if (storageMB > 500) return 'pro';
    if (storageMB > 100) return 'individual';
    return 'free';
  }

  private getTierForCases(caseCount: number): string {
    if (caseCount > 1) return 'pro';
    return 'free';
  }

  static getTierLimits(tier: string): TierLimits {
    return TIER_LIMITS[tier] || TIER_LIMITS.free;
  }

  static canHaveMultipleCases(tier: string): boolean {
    return tier !== 'free' && tier !== 'individual';
  }

  async logUsageMetrics(userId: string, environment: string = 'demo'): Promise<void> {
    try {
      const usage = await this.getUserUsageMetrics(userId);

      await db.insert(usageAudit).values({
        userId,
        tier: usage.tier,
        violationsCount: usage.violationsThisMonth,
        storageUsedMb: usage.storageUsedMB,
        mediaCount: usage.mediaCount,
        activeCases: usage.casesActive,
        environment,
      });

      console.log(`Usage logged for user ${userId}`);
    } catch (error) {
      console.error('Failed to log usage metrics', error);
    }
  }
}

export const tierEnforcementService = new TierEnforcementService();
