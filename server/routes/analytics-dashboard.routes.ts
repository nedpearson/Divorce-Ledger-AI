import { Router, Request, Response } from 'express';
import { db, getPool } from '../db';
import { safeQuery } from '../lib/safeQuery';
import { handleRouteError } from '../lib/errorHandler';
import {
  users,
  violations,
  billingRecords,
  cases,
  type User,
  type Violation,
} from '@shared/schema';
import { sql, gte, lte, desc, count, sum, eq, and } from 'drizzle-orm';

const router = Router();

interface MRRData {
  month: string;
  mrr: number;
  arr: number;
  growth: number;
  tierBreakdown: Record<string, number>;
}

interface CohortData {
  cohort: string;
  users: number;
  month1: number;
  month2: number;
  month3: number;
  month6: number;
  month12: number;
}

interface ChurnData {
  month: string;
  churnRate: number;
  churnedUsers: number;
  retainedUsers: number;
  ltv: number;
}

interface ViolationPattern {
  category: string;
  count: number;
  avgSeverity: number;
  trend: 'up' | 'down' | 'stable';
}

interface AtRiskUser {
  userId: number;
  email: string;
  tier: string;
  riskScore: number;
  riskFactors: string[];
  daysSinceActivity: number;
  violationCount: number;
}

interface TierMigration {
  month: string;
  upgrades: number;
  downgrades: number;
  netMigration: number;
  fromTo: Record<string, number>;
}

const TIER_PRICES: Record<string, number> = {
  free: 0,
  individual: 1200,
  pro: 4900,
  team: 14900,
  enterprise: 39900,
};

router.get('/revenue', async (req: Request, res: Response) => {
  try {
    const months = parseInt(req.query.months as string) || 12;
    const mrrData: MRRData[] = [];

    for (let i = months - 1; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
      const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);

      const monthlyBilling = await db
        .select({
          total: sql<number>`COALESCE(SUM(amount_cents), 0)`,
          tier: billingRecords.tier,
        })
        .from(billingRecords)
        .where(
          and(
            gte(billingRecords.periodStart, startOfMonth),
            lte(billingRecords.periodStart, endOfMonth)
          )
        )
        .groupBy(billingRecords.tier);

      const tierBreakdown: Record<string, number> = {};
      let totalMrr = 0;

      for (const record of monthlyBilling) {
        const tier = record.tier || 'free';
        const amount = Number(record.total) || 0;
        tierBreakdown[tier] = amount;
        totalMrr += amount;
      }

      const allUsers: User[] = await db.select().from(users);
      const tierUserCounts: Record<string, number> = {};
      for (const user of allUsers) {
        const tier = user.subscriptionTier || 'free';
        tierUserCounts[tier] = (tierUserCounts[tier] || 0) + 1;
      }

      for (const [tier, userCount] of Object.entries(tierUserCounts)) {
        if (!tierBreakdown[tier] && tier !== 'free') {
          const tierRevenue = userCount * (TIER_PRICES[tier] || 0);
          tierBreakdown[tier] = tierRevenue;
          totalMrr += tierRevenue;
        }
      }

      const prevMonth = mrrData[mrrData.length - 1];
      const growth = prevMonth ? ((totalMrr - prevMonth.mrr) / (prevMonth.mrr || 1)) * 100 : 0;

      mrrData.push({
        month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        mrr: totalMrr,
        arr: totalMrr * 12,
        growth: Math.round(growth * 100) / 100,
        tierBreakdown,
      });
    }

    const currentMrr = mrrData[mrrData.length - 1]?.mrr || 0;
    const prevMrr = mrrData[mrrData.length - 2]?.mrr || 0;

    res.json({
      summary: {
        currentMrr,
        currentArr: currentMrr * 12,
        monthlyGrowth: prevMrr ? ((currentMrr - prevMrr) / prevMrr) * 100 : 0,
        avgRevenuePerUser: currentMrr / Math.max((await db.select().from(users)).length, 1),
      },
      monthlyData: mrrData,
    });
  } catch (error: any) {
    console.error('[Analytics] Revenue error:', error);
    handleRouteError(res, error);
  }
});

router.get('/cohorts', async (req: Request, res: Response) => {
  try {
    const pool = getPool();

    const cohortResult = await safeQuery(
      pool,
      'analytics:cohorts',
      `WITH user_cohorts AS (
        SELECT 
          id,
          TO_CHAR(DATE_TRUNC('month', COALESCE(
            (SELECT MIN(timestamp) FROM violations WHERE user_id = users.id),
            NOW()
          )), 'YYYY-MM') as cohort_month
        FROM users
      ),
      cohort_activity AS (
        SELECT 
          uc.cohort_month,
          COUNT(DISTINCT uc.id) as total_users,
          COUNT(DISTINCT CASE WHEN v.timestamp >= NOW() - INTERVAL '1 month' THEN uc.id END) as active_m1,
          COUNT(DISTINCT CASE WHEN v.timestamp >= NOW() - INTERVAL '2 months' AND v.timestamp < NOW() - INTERVAL '1 month' THEN uc.id END) as active_m2,
          COUNT(DISTINCT CASE WHEN v.timestamp >= NOW() - INTERVAL '3 months' AND v.timestamp < NOW() - INTERVAL '2 months' THEN uc.id END) as active_m3,
          COUNT(DISTINCT CASE WHEN v.timestamp >= NOW() - INTERVAL '6 months' AND v.timestamp < NOW() - INTERVAL '3 months' THEN uc.id END) as active_m6,
          COUNT(DISTINCT CASE WHEN v.timestamp >= NOW() - INTERVAL '12 months' AND v.timestamp < NOW() - INTERVAL '6 months' THEN uc.id END) as active_m12
        FROM user_cohorts uc
        LEFT JOIN violations v ON v.user_id = uc.id
        GROUP BY uc.cohort_month
        ORDER BY uc.cohort_month DESC
        LIMIT 12
      )
      SELECT * FROM cohort_activity`,
      []
    );

    const cohorts: CohortData[] = cohortResult.rows.map((row: any) => ({
      cohort: row.cohort_month,
      users: parseInt(row.total_users) || 0,
      month1: Math.round((parseInt(row.active_m1) / Math.max(parseInt(row.total_users), 1)) * 100),
      month2: Math.round((parseInt(row.active_m2) / Math.max(parseInt(row.total_users), 1)) * 100),
      month3: Math.round((parseInt(row.active_m3) / Math.max(parseInt(row.total_users), 1)) * 100),
      month6: Math.round((parseInt(row.active_m6) / Math.max(parseInt(row.total_users), 1)) * 100),
      month12: Math.round(
        (parseInt(row.active_m12) / Math.max(parseInt(row.total_users), 1)) * 100
      ),
    }));

    res.json({ cohorts });
  } catch (error: any) {
    console.error('[Analytics] Cohorts error:', error);
    handleRouteError(res, error);
  }
});

router.get('/churn-ltv', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const months = parseInt(req.query.months as string) || 12;

    const churnData: ChurnData[] = [];

    for (let i = months - 1; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      const allUsers: User[] = await db.select().from(users);
      const paidUsers = allUsers.filter(
        (u: User) => u.subscriptionTier && u.subscriptionTier !== 'free'
      );

      const thirtyDaysAgo = new Date(date);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const inactiveUsers = await safeQuery(
        pool,
        'analytics:inactiveUsers',
        `SELECT COUNT(DISTINCT u.id) as cnt
        FROM users u
        LEFT JOIN violations v ON v.user_id = u.id AND v.timestamp >= $1
        WHERE u.subscription_tier != 'free' 
          AND u.subscription_tier IS NOT NULL
          AND v.id IS NULL`,
        [thirtyDaysAgo]
      );

      const churnedCount = parseInt(inactiveUsers.rows[0]?.cnt) || 0;
      const retainedCount = paidUsers.length - churnedCount;
      const churnRate = paidUsers.length > 0 ? (churnedCount / paidUsers.length) * 100 : 0;

      const avgRevenue =
        paidUsers.reduce(
          (acc: number, u: User) => acc + (TIER_PRICES[u.subscriptionTier || 'free'] || 0),
          0
        ) / Math.max(paidUsers.length, 1);
      const avgLifetime = 12;
      const ltv = avgRevenue * avgLifetime;

      churnData.push({
        month: monthStr,
        churnRate: Math.round(churnRate * 100) / 100,
        churnedUsers: churnedCount,
        retainedUsers: retainedCount,
        ltv: Math.round(ltv),
      });
    }

    const currentChurn = churnData[churnData.length - 1];

    res.json({
      summary: {
        currentChurnRate: currentChurn?.churnRate || 0,
        averageLTV: currentChurn?.ltv || 0,
        atRiskUsers: await getAtRiskUserCount(),
        retentionRate: 100 - (currentChurn?.churnRate || 0),
      },
      monthlyData: churnData,
    });
  } catch (error: any) {
    console.error('[Analytics] Churn/LTV error:', error);
    handleRouteError(res, error);
  }
});

async function getAtRiskUserCount(): Promise<number> {
  try {
    const pool = getPool();
    const result = await safeQuery(
      pool,
      'analytics:atRiskUserCount',
      `SELECT COUNT(DISTINCT u.id) as cnt
      FROM users u
      LEFT JOIN violations v ON v.user_id = u.id AND v.timestamp >= NOW() - INTERVAL '14 days'
      WHERE u.subscription_tier != 'free' 
        AND u.subscription_tier IS NOT NULL
        AND v.id IS NULL`,
      []
    );
    return parseInt(result.rows[0]?.cnt) || 0;
  } catch {
    return 0;
  }
}

router.get('/at-risk-users', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await safeQuery(
      pool,
      'analytics:atRiskUsers',
      `WITH user_activity AS (
        SELECT 
          u.id,
          u.email,
          u.subscription_tier,
          MAX(v.timestamp) as last_activity,
          COUNT(v.id) as violation_count,
          EXTRACT(DAY FROM NOW() - COALESCE(MAX(v.timestamp), NOW() - INTERVAL '365 days')) as days_inactive
        FROM users u
        LEFT JOIN violations v ON v.user_id = u.id
        WHERE u.subscription_tier != 'free' AND u.subscription_tier IS NOT NULL
        GROUP BY u.id, u.email, u.subscription_tier
      )
      SELECT 
        id as user_id,
        email,
        subscription_tier as tier,
        days_inactive,
        violation_count,
        CASE 
          WHEN days_inactive > 30 THEN 90
          WHEN days_inactive > 14 THEN 70
          WHEN days_inactive > 7 THEN 50
          WHEN violation_count < 2 THEN 40
          ELSE 20
        END as risk_score
      FROM user_activity
      WHERE days_inactive > 7 OR violation_count < 2
      ORDER BY risk_score DESC, days_inactive DESC
      LIMIT $1`,
      [limit]
    );

    const atRiskUsers: AtRiskUser[] = result.rows.map((row: any) => {
      const riskFactors: string[] = [];
      if (parseInt(row.days_inactive) > 30) riskFactors.push('No activity in 30+ days');
      else if (parseInt(row.days_inactive) > 14) riskFactors.push('No activity in 14+ days');
      else if (parseInt(row.days_inactive) > 7) riskFactors.push('No activity in 7+ days');
      if (parseInt(row.violation_count) < 2) riskFactors.push('Low engagement');

      return {
        userId: parseInt(row.user_id),
        email: row.email,
        tier: row.tier,
        riskScore: parseInt(row.risk_score),
        riskFactors,
        daysSinceActivity: parseInt(row.days_inactive),
        violationCount: parseInt(row.violation_count),
      };
    });

    res.json({ atRiskUsers, total: atRiskUsers.length });
  } catch (error: any) {
    console.error('[Analytics] At-risk users error:', error);
    handleRouteError(res, error);
  }
});

router.get('/violation-patterns', async (req: Request, res: Response) => {
  try {
    const pool = getPool();

    const patternsResult = await safeQuery(
      pool,
      'analytics:violationPatterns',
      `WITH current_period AS (
        SELECT 
          COALESCE(type, 'Unknown') as category,
          COUNT(*) as current_count,
          AVG(COALESCE(severity_score, 5)) as avg_severity
        FROM violations
        WHERE timestamp >= NOW() - INTERVAL '30 days'
        GROUP BY type
      ),
      previous_period AS (
        SELECT 
          COALESCE(type, 'Unknown') as category,
          COUNT(*) as prev_count
        FROM violations
        WHERE timestamp >= NOW() - INTERVAL '60 days' 
          AND timestamp < NOW() - INTERVAL '30 days'
        GROUP BY type
      )
      SELECT 
        cp.category,
        cp.current_count as count,
        ROUND(cp.avg_severity::numeric, 1) as avg_severity,
        CASE 
          WHEN pp.prev_count IS NULL OR pp.prev_count = 0 THEN 'stable'
          WHEN cp.current_count > pp.prev_count * 1.1 THEN 'up'
          WHEN cp.current_count < pp.prev_count * 0.9 THEN 'down'
          ELSE 'stable'
        END as trend
      FROM current_period cp
      LEFT JOIN previous_period pp ON cp.category = pp.category
      ORDER BY cp.current_count DESC
      LIMIT 10`,
      []
    );

    const patterns: ViolationPattern[] = patternsResult.rows.map((row: any) => ({
      category: row.category,
      count: parseInt(row.count),
      avgSeverity: parseFloat(row.avg_severity) || 5,
      trend: row.trend as 'up' | 'down' | 'stable',
    }));

    const severityDistribution = await safeQuery(
      pool,
      'analytics:severityDistribution',
      `SELECT severity_level, COUNT(*) as count FROM (
        SELECT 
          CASE 
            WHEN severity_score <= 3 THEN 'Low'
            WHEN severity_score <= 6 THEN 'Medium'
            WHEN severity_score <= 8 THEN 'High'
            ELSE 'Critical'
          END as severity_level
        FROM violations
        WHERE timestamp >= NOW() - INTERVAL '30 days'
      ) sub
      GROUP BY severity_level
      ORDER BY 
        CASE severity_level
          WHEN 'Critical' THEN 1
          WHEN 'High' THEN 2
          WHEN 'Medium' THEN 3
          ELSE 4
        END`,
      []
    );

    res.json({
      patterns,
      severityDistribution: severityDistribution.rows.map((r: any) => ({
        level: r.severity_level,
        count: parseInt(r.count),
      })),
      totalViolations: patterns.reduce((sum, p) => sum + p.count, 0),
    });
  } catch (error: any) {
    console.error('[Analytics] Violation patterns error:', error);
    handleRouteError(res, error);
  }
});

router.get('/tier-migrations', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const months = Math.min(Math.max(parseInt(req.query.months as string) || 6, 1), 24);

    const migrationsResult = await safeQuery(
      pool,
      'analytics:tierMigrations',
      `SELECT 
        TO_CHAR(DATE_TRUNC('month', migrated_at), 'YYYY-MM') as month,
        from_tier as previous_tier,
        to_tier as new_tier,
        COUNT(*) as migration_count
      FROM tier_migrations
      WHERE migrated_at >= NOW() - ($1 || ' months')::interval
      GROUP BY DATE_TRUNC('month', migrated_at), from_tier, to_tier
      ORDER BY DATE_TRUNC('month', migrated_at) DESC`,
      [months.toString()]
    );

    const tierOrder: Record<string, number> = {
      free: 0,
      individual: 1,
      pro: 2,
      team: 3,
      enterprise: 4,
    };

    const monthlyData: Record<string, TierMigration> = {};

    for (const row of migrationsResult.rows) {
      const month = row.month;
      if (!monthlyData[month]) {
        monthlyData[month] = {
          month,
          upgrades: 0,
          downgrades: 0,
          netMigration: 0,
          fromTo: {},
        };
      }

      const prevOrder = tierOrder[row.previous_tier] ?? 0;
      const newOrder = tierOrder[row.new_tier] ?? 0;
      const count = parseInt(row.migration_count);

      if (newOrder > prevOrder) {
        monthlyData[month].upgrades += count;
      } else if (newOrder < prevOrder) {
        monthlyData[month].downgrades += count;
      }

      const key = `${row.previous_tier}->${row.new_tier}`;
      monthlyData[month].fromTo[key] = (monthlyData[month].fromTo[key] || 0) + count;
    }

    for (const month of Object.keys(monthlyData)) {
      monthlyData[month].netMigration = monthlyData[month].upgrades - monthlyData[month].downgrades;
    }

    const migrations = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));

    const allUsersForMigration: User[] = await db.select().from(users);
    const totalUsers = allUsersForMigration.length;
    const paidUsers = allUsersForMigration.filter(
      (u: User) => u.subscriptionTier !== 'free'
    ).length;

    res.json({
      summary: {
        totalUpgrades: migrations.reduce((sum, m) => sum + m.upgrades, 0),
        totalDowngrades: migrations.reduce((sum, m) => sum + m.downgrades, 0),
        upgradeRate: totalUsers > 0 ? (paidUsers / totalUsers) * 100 : 0,
        conversionRate: totalUsers > 0 ? (paidUsers / totalUsers) * 100 : 0,
      },
      monthlyData: migrations,
    });
  } catch (error: any) {
    console.error('[Analytics] Tier migrations error:', error);
    handleRouteError(res, error);
  }
});

router.get('/summary', async (req: Request, res: Response) => {
  try {
    // Filter by environment from cookie - demo mode should only show demo data
    const environment = req.cookies?.environment || 'demo';

    const allUsers: User[] = await db
      .select()
      .from(users)
      .where(eq(users.environment, environment));
    const paidUsers = allUsers.filter(
      (u: User) => u.subscriptionTier && u.subscriptionTier !== 'free'
    );

    const currentMrr = paidUsers.reduce(
      (acc: number, u: User) => acc + (TIER_PRICES[u.subscriptionTier || 'free'] || 0),
      0
    );

    const allViolations: Violation[] = await db
      .select()
      .from(violations)
      .where(eq(violations.environment, environment));
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentViolations = allViolations.filter(
      (v: Violation) => new Date(v.timestamp) >= thirtyDaysAgo
    );

    const atRiskCount = await getAtRiskUserCount();

    res.json({
      revenue: {
        mrr: currentMrr,
        arr: currentMrr * 12,
        avgRevenuePerUser: currentMrr / Math.max(paidUsers.length, 1),
      },
      users: {
        total: allUsers.length,
        paid: paidUsers.length,
        conversionRate: allUsers.length > 0 ? (paidUsers.length / allUsers.length) * 100 : 0,
        atRisk: atRiskCount,
      },
      violations: {
        total: allViolations.length,
        last30Days: recentViolations.length,
        avgPerUser: allUsers.length > 0 ? allViolations.length / allUsers.length : 0,
      },
      tierDistribution: {
        free: allUsers.filter((u: User) => !u.subscriptionTier || u.subscriptionTier === 'free')
          .length,
        individual: allUsers.filter((u: User) => u.subscriptionTier === 'individual').length,
        pro: allUsers.filter((u: User) => u.subscriptionTier === 'pro').length,
        team: allUsers.filter((u: User) => u.subscriptionTier === 'team').length,
        enterprise: allUsers.filter((u: User) => u.subscriptionTier === 'enterprise').length,
      },
    });
  } catch (error: any) {
    console.error('[Analytics] Summary error:', error);
    handleRouteError(res, error);
  }
});

export default router;
