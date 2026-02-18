import { pool } from '../db';
import { safeQuery } from '../lib/safeQuery';

function getPool() {
  if (!pool) throw new Error('Database pool not initialized');
  return pool;
}

interface AggregationResult {
  tableName: string;
  rowsAggregated: number;
  executionTimeMs: number;
  status: 'success' | 'failed';
  error?: string;
}

class AggregationService {
  async aggregateDailyUserMetrics(targetDate: Date): Promise<AggregationResult> {
    const startTime = Date.now();
    const dateStr = targetDate.toISOString().split('T')[0];

    try {
      await safeQuery(
        getPool(),
        'etl.aggregation:dailyUserMetrics',
        `INSERT INTO agg_daily_user_metrics (
          metric_date, user_key, subscription_tier,
          total_violations, total_evidence_files, total_transactions,
          critical_violations, high_violations, medium_violations, low_violations,
          total_assets_cents, total_debts_cents, total_income_cents, total_expenses_cents,
          storage_used_bytes, ai_features_used, pdf_exports, updated_at
        )
        SELECT 
          $1::date as metric_date,
          du.user_key,
          du.subscription_tier,
          COALESCE(v.violation_count, 0),
          COALESCE(v.evidence_count, 0),
          COALESCE(ft.transaction_count, 0),
          COALESCE(v.critical_count, 0),
          COALESCE(v.high_count, 0),
          COALESCE(v.medium_count, 0),
          COALESCE(v.low_count, 0),
          COALESCE(ft.assets_cents, 0),
          COALESCE(ft.debts_cents, 0),
          COALESCE(ft.income_cents, 0),
          COALESCE(ft.expenses_cents, 0),
          COALESCE(u.storage_bytes, 0),
          COALESCE(u.ai_uses, 0),
          COALESCE(u.pdf_exports, 0),
          NOW()
        FROM dim_user du
        LEFT JOIN (
          SELECT 
            fv.user_key,
            COUNT(*) as violation_count,
            SUM(fv.evidence_count) as evidence_count,
            SUM(CASE WHEN vc.severity_level = 'critical' THEN 1 ELSE 0 END) as critical_count,
            SUM(CASE WHEN vc.severity_level = 'high' THEN 1 ELSE 0 END) as high_count,
            SUM(CASE WHEN vc.severity_level = 'medium' THEN 1 ELSE 0 END) as medium_count,
            SUM(CASE WHEN vc.severity_level = 'low' THEN 1 ELSE 0 END) as low_count
          FROM fact_violation fv
          LEFT JOIN dim_violation_category vc ON fv.category_key = vc.category_key
          LEFT JOIN dim_time dt ON fv.time_key = dt.time_key
          WHERE dt.full_date = $1::date
          GROUP BY fv.user_key
        ) v ON du.user_key = v.user_key
        LEFT JOIN (
          SELECT 
            ft.user_key,
            COUNT(*) as transaction_count,
            SUM(CASE WHEN ft.transaction_type = 'asset' THEN ft.amount_cents ELSE 0 END) as assets_cents,
            SUM(CASE WHEN ft.transaction_type = 'debt' THEN ft.amount_cents ELSE 0 END) as debts_cents,
            SUM(CASE WHEN ft.transaction_type = 'income' THEN ft.amount_cents ELSE 0 END) as income_cents,
            SUM(CASE WHEN ft.transaction_type = 'expense' THEN ft.amount_cents ELSE 0 END) as expenses_cents
          FROM fact_financial_transaction ft
          LEFT JOIN dim_time dt ON ft.time_key = dt.time_key
          WHERE dt.full_date = $1::date
          GROUP BY ft.user_key
        ) ft ON du.user_key = ft.user_key
        LEFT JOIN (
          SELECT 
            fum.user_key,
            fum.storage_used_bytes as storage_bytes,
            fum.ai_classifications_used + fum.ai_pattern_detections_used as ai_uses,
            fum.pdf_exports_count as pdf_exports
          FROM fact_usage_metric fum
          WHERE fum.metric_date = $1::date
        ) u ON du.user_key = u.user_key
        WHERE du.is_current = TRUE
        ON CONFLICT (metric_date, user_key) DO UPDATE SET
          total_violations = EXCLUDED.total_violations,
          total_evidence_files = EXCLUDED.total_evidence_files,
          total_transactions = EXCLUDED.total_transactions,
          critical_violations = EXCLUDED.critical_violations,
          high_violations = EXCLUDED.high_violations,
          medium_violations = EXCLUDED.medium_violations,
          low_violations = EXCLUDED.low_violations,
          total_assets_cents = EXCLUDED.total_assets_cents,
          total_debts_cents = EXCLUDED.total_debts_cents,
          total_income_cents = EXCLUDED.total_income_cents,
          total_expenses_cents = EXCLUDED.total_expenses_cents,
          storage_used_bytes = EXCLUDED.storage_used_bytes,
          ai_features_used = EXCLUDED.ai_features_used,
          pdf_exports = EXCLUDED.pdf_exports,
          updated_at = NOW()`,
        [dateStr]
      );

      const countResult = await safeQuery(
        getPool(),
        'etl.aggregation:dailyUserMetricsCount',
        'SELECT COUNT(*) FROM agg_daily_user_metrics WHERE metric_date = $1',
        [dateStr]
      );

      return {
        tableName: 'agg_daily_user_metrics',
        rowsAggregated: parseInt(countResult.rows[0].count),
        executionTimeMs: Date.now() - startTime,
        status: 'success'
      };
    } catch (error: any) {
      return {
        tableName: 'agg_daily_user_metrics',
        rowsAggregated: 0,
        executionTimeMs: Date.now() - startTime,
        status: 'failed',
        error: error.message
      };
    }
  }

  async aggregateWeeklyCohortMetrics(cohortWeek: Date): Promise<AggregationResult> {
    const startTime = Date.now();
    const weekStr = cohortWeek.toISOString().split('T')[0];

    try {
      await safeQuery(
        getPool(),
        'etl.aggregation:weeklyCohortMetrics',
        `INSERT INTO agg_weekly_cohort_metrics (
          cohort_week, weeks_since_signup, subscription_tier,
          cohort_size, active_users, churned_users, upgraded_users, downgraded_users,
          retention_rate, churn_rate, mrr_cents, arpu_cents,
          avg_violations_per_user, avg_evidence_per_user, updated_at
        )
        SELECT 
          DATE_TRUNC('week', du.created_at)::date as cohort_week,
          EXTRACT(WEEK FROM AGE($1::date, DATE_TRUNC('week', du.created_at))) as weeks_since_signup,
          du.subscription_tier,
          COUNT(DISTINCT du.user_id) as cohort_size,
          COUNT(DISTINCT CASE WHEN du.is_current THEN du.user_id END) as active_users,
          COUNT(DISTINCT CASE WHEN NOT du.is_current THEN du.user_id END) as churned_users,
          COUNT(DISTINCT CASE WHEN th.is_upgrade THEN th.user_id END) as upgraded_users,
          COUNT(DISTINCT CASE WHEN th.is_downgrade THEN th.user_id END) as downgraded_users,
          CASE WHEN COUNT(DISTINCT du.user_id) > 0 
               THEN COUNT(DISTINCT CASE WHEN du.is_current THEN du.user_id END)::decimal / COUNT(DISTINCT du.user_id)
               ELSE 0 END as retention_rate,
          CASE WHEN COUNT(DISTINCT du.user_id) > 0 
               THEN COUNT(DISTINCT CASE WHEN NOT du.is_current THEN du.user_id END)::decimal / COUNT(DISTINCT du.user_id)
               ELSE 0 END as churn_rate,
          COALESCE(SUM(ds.monthly_price_cents), 0) as mrr_cents,
          CASE WHEN COUNT(DISTINCT du.user_id) > 0 
               THEN COALESCE(SUM(ds.monthly_price_cents), 0) / COUNT(DISTINCT du.user_id)
               ELSE 0 END as arpu_cents,
          COALESCE(AVG(v.violation_count), 0) as avg_violations_per_user,
          COALESCE(AVG(v.evidence_count), 0) as avg_evidence_per_user,
          NOW()
        FROM dim_user du
        LEFT JOIN dim_subscription ds ON du.subscription_tier = ds.tier_name AND ds.is_current = TRUE
        LEFT JOIN dim_user_tier_history th ON du.user_id = th.user_id
        LEFT JOIN (
          SELECT user_key, COUNT(*) as violation_count, SUM(evidence_count) as evidence_count
          FROM fact_violation
          GROUP BY user_key
        ) v ON du.user_key = v.user_key
        WHERE DATE_TRUNC('week', du.created_at)::date <= $1::date
        GROUP BY DATE_TRUNC('week', du.created_at)::date, du.subscription_tier
        ON CONFLICT (cohort_week, weeks_since_signup, subscription_tier) DO UPDATE SET
          cohort_size = EXCLUDED.cohort_size,
          active_users = EXCLUDED.active_users,
          churned_users = EXCLUDED.churned_users,
          retention_rate = EXCLUDED.retention_rate,
          churn_rate = EXCLUDED.churn_rate,
          mrr_cents = EXCLUDED.mrr_cents,
          arpu_cents = EXCLUDED.arpu_cents,
          avg_violations_per_user = EXCLUDED.avg_violations_per_user,
          updated_at = NOW()`,
        [weekStr]
      );

      const countResult = await safeQuery(
        getPool(),
        'etl.aggregation:weeklyCohortMetricsCount',
        'SELECT COUNT(*) FROM agg_weekly_cohort_metrics WHERE cohort_week = $1',
        [weekStr]
      );

      return {
        tableName: 'agg_weekly_cohort_metrics',
        rowsAggregated: parseInt(countResult.rows[0].count),
        executionTimeMs: Date.now() - startTime,
        status: 'success'
      };
    } catch (error: any) {
      return {
        tableName: 'agg_weekly_cohort_metrics',
        rowsAggregated: 0,
        executionTimeMs: Date.now() - startTime,
        status: 'failed',
        error: error.message
      };
    }
  }

  async aggregateMonthlyRevenue(targetMonth: Date): Promise<AggregationResult> {
    const startTime = Date.now();
    const monthStr = targetMonth.toISOString().split('T')[0].slice(0, 7) + '-01';

    try {
      await safeQuery(
        getPool(),
        'etl.aggregation:monthlyRevenue',
        `INSERT INTO agg_monthly_revenue (
          revenue_month, subscription_tier,
          total_subscribers, new_subscribers, churned_subscribers,
          gross_revenue_cents, refunds_cents, discounts_cents, net_revenue_cents,
          beginning_mrr_cents, new_mrr_cents, churned_mrr_cents, ending_mrr_cents,
          updated_at
        )
        SELECT 
          $1::date as revenue_month,
          du.subscription_tier,
          COUNT(DISTINCT du.user_id) as total_subscribers,
          COUNT(DISTINCT CASE WHEN DATE_TRUNC('month', du.created_at) = DATE_TRUNC('month', $1::date) THEN du.user_id END) as new_subscribers,
          COUNT(DISTINCT CASE WHEN th.is_churn AND DATE_TRUNC('month', th.changed_at) = DATE_TRUNC('month', $1::date) THEN th.user_id END) as churned_subscribers,
          COALESCE(SUM(CASE WHEN be.event_type IN ('payment', 'subscription_created') THEN be.amount_cents ELSE 0 END), 0) as gross_revenue_cents,
          COALESCE(SUM(CASE WHEN be.event_type = 'refund' THEN be.amount_cents ELSE 0 END), 0) as refunds_cents,
          COALESCE(SUM(be.discount_cents), 0) as discounts_cents,
          COALESCE(SUM(CASE WHEN be.event_type IN ('payment', 'subscription_created') THEN be.amount_cents ELSE 0 END), 0) - 
          COALESCE(SUM(CASE WHEN be.event_type = 'refund' THEN be.amount_cents ELSE 0 END), 0) -
          COALESCE(SUM(be.discount_cents), 0) as net_revenue_cents,
          0 as beginning_mrr_cents,
          COALESCE(SUM(CASE WHEN th.is_upgrade THEN th.mrr_change_cents ELSE 0 END), 0) as new_mrr_cents,
          COALESCE(SUM(CASE WHEN th.is_churn THEN ABS(th.mrr_change_cents) ELSE 0 END), 0) as churned_mrr_cents,
          COUNT(DISTINCT du.user_id) * COALESCE(ds.monthly_price_cents, 0) as ending_mrr_cents,
          NOW()
        FROM dim_user du
        LEFT JOIN dim_subscription ds ON du.subscription_tier = ds.tier_name AND ds.is_current = TRUE
        LEFT JOIN dim_user_tier_history th ON du.user_id = th.user_id AND DATE_TRUNC('month', th.changed_at) = DATE_TRUNC('month', $1::date)
        LEFT JOIN fact_billing_event be ON du.user_key = be.user_key
        LEFT JOIN dim_time dt ON be.time_key = dt.time_key
        WHERE du.is_current = TRUE
          AND (dt.full_date IS NULL OR DATE_TRUNC('month', dt.full_date) = DATE_TRUNC('month', $1::date))
        GROUP BY du.subscription_tier, ds.monthly_price_cents
        ON CONFLICT (revenue_month, subscription_tier, geography_key) DO UPDATE SET
          total_subscribers = EXCLUDED.total_subscribers,
          new_subscribers = EXCLUDED.new_subscribers,
          gross_revenue_cents = EXCLUDED.gross_revenue_cents,
          net_revenue_cents = EXCLUDED.net_revenue_cents,
          ending_mrr_cents = EXCLUDED.ending_mrr_cents,
          updated_at = NOW()`,
        [monthStr]
      );

      const countResult = await safeQuery(
        getPool(),
        'etl.aggregation:monthlyRevenueCount',
        `SELECT COUNT(*) FROM agg_monthly_revenue WHERE revenue_month = $1`,
        [monthStr]
      );

      return {
        tableName: 'agg_monthly_revenue',
        rowsAggregated: parseInt(countResult.rows[0].count),
        executionTimeMs: Date.now() - startTime,
        status: 'success'
      };
    } catch (error: any) {
      return {
        tableName: 'agg_monthly_revenue',
        rowsAggregated: 0,
        executionTimeMs: Date.now() - startTime,
        status: 'failed',
        error: error.message
      };
    }
  }

  async aggregateTierTransitions(targetMonth: Date): Promise<AggregationResult> {
    const startTime = Date.now();
    const monthStr = targetMonth.toISOString().split('T')[0].slice(0, 7) + '-01';

    try {
      await safeQuery(
        getPool(),
        'etl.aggregation:tierTransitions',
        `INSERT INTO agg_tier_transitions (
          transition_month, from_tier, to_tier, transition_type,
          transition_count, mrr_impact_cents, avg_days_before_transition, updated_at
        )
        SELECT 
          DATE_TRUNC('month', th.changed_at)::date as transition_month,
          th.previous_tier as from_tier,
          th.new_tier as to_tier,
          CASE 
            WHEN th.is_upgrade THEN 'upgrade'
            WHEN th.is_downgrade THEN 'downgrade'
            WHEN th.is_churn THEN 'churn'
            ELSE 'lateral'
          END as transition_type,
          COUNT(*) as transition_count,
          SUM(th.mrr_change_cents) as mrr_impact_cents,
          AVG(th.days_in_previous_tier)::integer as avg_days_before_transition,
          NOW()
        FROM dim_user_tier_history th
        WHERE DATE_TRUNC('month', th.changed_at) = DATE_TRUNC('month', $1::date)
        GROUP BY DATE_TRUNC('month', th.changed_at)::date, th.previous_tier, th.new_tier,
                 CASE 
                   WHEN th.is_upgrade THEN 'upgrade'
                   WHEN th.is_downgrade THEN 'downgrade'
                   WHEN th.is_churn THEN 'churn'
                   ELSE 'lateral'
                 END
        ON CONFLICT (transition_month, from_tier, to_tier) DO UPDATE SET
          transition_count = EXCLUDED.transition_count,
          mrr_impact_cents = EXCLUDED.mrr_impact_cents,
          avg_days_before_transition = EXCLUDED.avg_days_before_transition,
          updated_at = NOW()`,
        [monthStr]
      );

      const countResult = await safeQuery(
        getPool(),
        'etl.aggregation:tierTransitionsCount',
        `SELECT COUNT(*) FROM agg_tier_transitions WHERE transition_month = $1`,
        [monthStr]
      );

      return {
        tableName: 'agg_tier_transitions',
        rowsAggregated: parseInt(countResult.rows[0].count),
        executionTimeMs: Date.now() - startTime,
        status: 'success'
      };
    } catch (error: any) {
      return {
        tableName: 'agg_tier_transitions',
        rowsAggregated: 0,
        executionTimeMs: Date.now() - startTime,
        status: 'failed',
        error: error.message
      };
    }
  }

  async aggregateFeatureUsageByTier(targetMonth: Date): Promise<AggregationResult> {
    const startTime = Date.now();
    const monthStr = targetMonth.toISOString().split('T')[0].slice(0, 7) + '-01';

    try {
      const features = [
        { name: 'violations', query: 'violations_created' },
        { name: 'voice_transcription', query: 'voice_recordings_count' },
        { name: 'ai_classification', query: 'ai_classifications_used' },
        { name: 'pdf_exports', query: 'pdf_exports_count' },
        { name: 'evidence_uploads', query: 'evidence_uploaded_count' }
      ];

      for (const feature of features) {
        await safeQuery(
          getPool(),
          'etl.aggregation:featureUsageByTier',
          `INSERT INTO agg_feature_usage_by_tier (
            usage_month, subscription_tier, feature_name,
            total_users, users_who_used, usage_rate, total_uses, avg_uses_per_user, updated_at
          )
          SELECT 
            $1::date as usage_month,
            du.subscription_tier,
            $2 as feature_name,
            COUNT(DISTINCT du.user_key) as total_users,
            COUNT(DISTINCT CASE WHEN COALESCE(fum.${feature.query}, 0) > 0 THEN du.user_key END) as users_who_used,
            CASE WHEN COUNT(DISTINCT du.user_key) > 0 
                 THEN COUNT(DISTINCT CASE WHEN COALESCE(fum.${feature.query}, 0) > 0 THEN du.user_key END)::decimal / COUNT(DISTINCT du.user_key)
                 ELSE 0 END as usage_rate,
            COALESCE(SUM(fum.${feature.query}), 0) as total_uses,
            CASE WHEN COUNT(DISTINCT CASE WHEN COALESCE(fum.${feature.query}, 0) > 0 THEN du.user_key END) > 0
                 THEN COALESCE(SUM(fum.${feature.query}), 0)::decimal / COUNT(DISTINCT CASE WHEN COALESCE(fum.${feature.query}, 0) > 0 THEN du.user_key END)
                 ELSE 0 END as avg_uses_per_user,
            NOW()
          FROM dim_user du
          LEFT JOIN fact_usage_metric fum ON du.user_key = fum.user_key 
            AND DATE_TRUNC('month', fum.metric_date) = DATE_TRUNC('month', $1::date)
          WHERE du.is_current = TRUE
          GROUP BY du.subscription_tier
          ON CONFLICT (usage_month, subscription_tier, feature_name) DO UPDATE SET
            total_users = EXCLUDED.total_users,
            users_who_used = EXCLUDED.users_who_used,
            usage_rate = EXCLUDED.usage_rate,
            total_uses = EXCLUDED.total_uses,
            avg_uses_per_user = EXCLUDED.avg_uses_per_user,
            updated_at = NOW()`,
          [monthStr, feature.name]
        );
      }

      const countResult = await safeQuery(
        getPool(),
        'etl.aggregation:featureUsageByTierCount',
        `SELECT COUNT(*) FROM agg_feature_usage_by_tier WHERE usage_month = $1`,
        [monthStr]
      );

      return {
        tableName: 'agg_feature_usage_by_tier',
        rowsAggregated: parseInt(countResult.rows[0].count),
        executionTimeMs: Date.now() - startTime,
        status: 'success'
      };
    } catch (error: any) {
      return {
        tableName: 'agg_feature_usage_by_tier',
        rowsAggregated: 0,
        executionTimeMs: Date.now() - startTime,
        status: 'failed',
        error: error.message
      };
    }
  }

  async runAllAggregations(targetDate: Date = new Date()): Promise<AggregationResult[]> {
    const results: AggregationResult[] = [];

    results.push(await this.aggregateDailyUserMetrics(targetDate));

    const weekStart = new Date(targetDate);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    results.push(await this.aggregateWeeklyCohortMetrics(weekStart));

    const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    results.push(await this.aggregateMonthlyRevenue(monthStart));
    results.push(await this.aggregateTierTransitions(monthStart));
    results.push(await this.aggregateFeatureUsageByTier(monthStart));

    await this.logAggregationRun(results);

    return results;
  }

  private async logAggregationRun(results: AggregationResult[]): Promise<void> {
    for (const result of results) {
      try {
        await safeQuery(
          getPool(),
          'etl.aggregation:logAggregationRun',
          `INSERT INTO etl_aggregation_log (
            aggregation_name, target_table, rows_aggregated, 
            execution_time_ms, status, error_message, completed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [
            result.tableName,
            result.tableName,
            result.rowsAggregated,
            result.executionTimeMs,
            result.status,
            result.error || null
          ]
        );
      } catch (e) {
        console.warn('Failed to log aggregation result:', e);
      }
    }
  }
}

export const aggregationService = new AggregationService();
