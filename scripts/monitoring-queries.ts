/**
 * MONITORING QUERIES
 * Copy-paste queries for your dashboard (Metabase/Grafana)
 * 
 * Run with: npx tsx scripts/monitoring-queries.ts
 */

export const MONITORING_QUERIES = {
  activeUsersByTier: `
    SELECT subscription_tier as tier, COUNT(*) as user_count, 
      ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) as percentage
    FROM users
    GROUP BY subscription_tier
    ORDER BY user_count DESC
  `,

  violationsPerDay: `
    SELECT DATE(timestamp) as date, 
      COUNT(*) as violation_count,
      ROUND(AVG(COUNT(*)) OVER (ORDER BY DATE(timestamp) ROWS BETWEEN 7 PRECEDING AND CURRENT ROW), 0) as moving_avg_7d
    FROM violations
    WHERE timestamp > NOW() - INTERVAL '90 days'
    GROUP BY DATE(timestamp)
    ORDER BY date DESC
  `,

  storageGrowth: `
    SELECT DATE(uploaded_at) as date,
      ROUND(SUM(file_size) / (1024*1024*1024), 2) as storage_gb,
      SUM(SUM(file_size)) OVER (ORDER BY DATE(uploaded_at)) / (1024*1024*1024) as cumulative_gb
    FROM evidence_files
    WHERE evidence_source = 'media_upload'
    AND uploaded_at > NOW() - INTERVAL '90 days'
    GROUP BY DATE(uploaded_at)
  `,

  usersAtTierLimits: `
    SELECT u.id, u.email, u.subscription_tier as tier,
      u.violations_count_this_month as current_violations,
      CASE
        WHEN u.subscription_tier = 'individual' THEN 20
        WHEN u.subscription_tier = 'pro' THEN 50
        ELSE 999999
      END as tier_limit,
      ROUND(100.0 * u.violations_count_this_month / 
        CASE
          WHEN u.subscription_tier = 'individual' THEN 20
          WHEN u.subscription_tier = 'pro' THEN 50
          ELSE 999999
        END, 1) as percent_of_limit
    FROM users u
    WHERE u.violations_count_this_month >= 
      CASE
        WHEN u.subscription_tier = 'individual' THEN 15
        WHEN u.subscription_tier = 'pro' THEN 40
        ELSE 999999
      END
    ORDER BY percent_of_limit DESC
  `,

  billingCalculationSuccess: `
    SELECT DATE(created_at) as date,
      COUNT(*) as total_records,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'charged' THEN 1 ELSE 0 END) as charged,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      ROUND(100.0 * SUM(CASE WHEN status != 'failed' THEN 1 ELSE 0 END) / COUNT(*), 1) as success_rate
    FROM billing_records
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY DATE(created_at)
    ORDER BY date DESC
  `,

  revenueByTier: `
    SELECT br.tier,
      EXTRACT(YEAR FROM br.period_start) as year,
      EXTRACT(MONTH FROM br.period_start) as month,
      COUNT(DISTINCT br.user_id) as active_users,
      ROUND(SUM(br.amount_cents) / 100.0, 2) as revenue_usd,
      ROUND(AVG(br.amount_cents) / 100.0, 2) as avg_revenue_per_user
    FROM billing_records br
    WHERE br.period_start > NOW() - INTERVAL '12 months'
    GROUP BY br.tier, EXTRACT(YEAR FROM br.period_start), EXTRACT(MONTH FROM br.period_start)
    ORDER BY year DESC, month DESC
  `,

  cohortRetention: `
    SELECT 
      DATE_TRUNC('month', u.created_at) as cohort_month,
      COUNT(DISTINCT u.id) as cohort_size,
      ROUND(AVG(
        CASE
          WHEN u.subscription_tier = 'enterprise' THEN 5
          WHEN u.subscription_tier = 'team' THEN 4
          WHEN u.subscription_tier = 'pro' THEN 3
          WHEN u.subscription_tier = 'individual' THEN 2
          ELSE 1
        END
      ), 2) as avg_tier_level
    FROM users u
    WHERE u.created_at > NOW() - INTERVAL '12 months'
    GROUP BY DATE_TRUNC('month', u.created_at)
    ORDER BY cohort_month DESC
  `,

  migrationStatus: `
    SELECT 
      status,
      COUNT(*) as count,
      ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) as percentage
    FROM tier_migrations
    WHERE migrated_at > NOW() - INTERVAL '30 days'
    GROUP BY status
  `,

  quotaResetCoverage: `
    SELECT 
      DATE_TRUNC('month', reset_at) as month,
      COUNT(DISTINCT user_id) as users_reset,
      ROUND(AVG(violations_count_before), 1) as avg_violations_before
    FROM quota_reset_log
    WHERE reset_at > NOW() - INTERVAL '12 months'
    GROUP BY DATE_TRUNC('month', reset_at)
    ORDER BY month DESC
  `,
};

console.log('\n' + '='.repeat(80));
console.log('         DIVORCEEASE AI - MONITORING QUERIES');
console.log('         Copy-paste for Metabase/Grafana/DataDog');
console.log('='.repeat(80));

Object.entries(MONITORING_QUERIES).forEach(([name, query]) => {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Query: ${name}`);
  console.log(`${'='.repeat(80)}`);
  console.log(query.trim());
});

console.log('\n' + '='.repeat(80));
console.log('Total queries available: ' + Object.keys(MONITORING_QUERIES).length);
console.log('='.repeat(80) + '\n');
