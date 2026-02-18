-- =============================================================================
-- SELF-SERVICE ANALYTICS TEMPLATE
-- =============================================================================
-- Copy and customize these queries for your own analysis needs.
-- All queries use the dimensional data warehouse for consistency.
-- Note: amount_cents columns store values in cents - divide by 100 for USD
-- =============================================================================

-- =============================================================================
-- 1. REVENUE ANALYSIS
-- =============================================================================

-- Monthly Recurring Revenue (MRR) by Tier
select
  date_trunc('month', dd.date_actual) as month,
  dt.tier_name,
  count(distinct ft.user_id) as paying_customers,
  sum(ft.amount_cents) / 100.0 as revenue_usd,
  avg(ft.amount_cents) / 100.0 as avg_transaction_usd
from fact_transactions ft
inner join dim_date dd on ft.transaction_date_id = dd.date_id
inner join dim_tier dt on ft.tier_id = dt.tier_id
where ft.transaction_type = 'charge'
  and dd.year = extract(year from current_date)
group by 1, 2
order by 1 desc, 2;

-- Revenue Trend (Last 12 Months)
select
  date_trunc('month', dd.date_actual) as month,
  sum(case when ft.transaction_type = 'charge' then ft.amount_cents else 0 end) / 100.0 as charges_usd,
  sum(case when ft.transaction_type = 'refund' then ft.amount_cents else 0 end) / 100.0 as refunds_usd,
  (sum(case when ft.transaction_type = 'charge' then ft.amount_cents else 0 end) - 
   sum(case when ft.transaction_type = 'refund' then ft.amount_cents else 0 end)) / 100.0 as net_revenue_usd
from fact_transactions ft
inner join dim_date dd on ft.transaction_date_id = dd.date_id
where dd.date_actual >= current_date - interval '12 months'
group by 1
order by 1 desc;

-- =============================================================================
-- 2. USER ANALYSIS
-- =============================================================================

-- Active Users by Tier
select
  du.current_tier,
  dt.tier_name,
  count(*) as total_users,
  count(case when du.is_active then 1 end) as active_users,
  round(count(case when du.is_active then 1 end)::numeric / count(*) * 100, 2) as active_pct
from dim_users du
inner join dim_tier dt on du.current_tier = dt.tier_id
where du.is_current = true
group by 1, 2
order by total_users desc;

-- User Tier History (SCD Type 2)
-- Shows all historical tier changes for a user
select
  user_id,
  user_name,
  current_tier,
  dbt_valid_from,
  dbt_valid_to,
  is_current
from dim_users
where user_id = 1  -- Replace with actual user_id
order by dbt_valid_from;

-- User Cohort Retention (by signup month)
with cohorts as (
  select
    user_id,
    date_trunc('month', dbt_valid_from) as cohort_month,
    is_active
  from dim_users
  where is_current = true
)
select
  cohort_month,
  count(*) as cohort_size,
  count(case when is_active then 1 end) as retained,
  round(count(case when is_active then 1 end)::numeric / count(*) * 100, 2) as retention_pct
from cohorts
group by 1
order by 1 desc;

-- =============================================================================
-- 3. VIOLATION ANALYSIS
-- =============================================================================

-- Violations by Severity and Type
select
  fv.severity,
  fv.violation_type,
  count(*) as total_violations,
  count(case when fv.is_resolved then 1 end) as resolved,
  round(avg(fv.evidence_count), 2) as avg_evidence
from fact_violations fv
group by 1, 2
order by total_violations desc;

-- Violation Trends (Weekly)
select
  date_trunc('week', dd.date_actual) as week,
  count(*) as violations,
  count(case when fv.severity = 'critical' then 1 end) as critical,
  count(case when fv.severity = 'high' then 1 end) as high
from fact_violations fv
inner join dim_date dd on fv.violation_date_id = dd.date_id
where dd.date_actual >= current_date - interval '3 months'
group by 1
order by 1 desc;

-- =============================================================================
-- 4. FINANCIAL ANALYSIS
-- =============================================================================

-- Net Worth Distribution by Tier
select
  du.current_tier,
  dt.tier_name,
  count(distinct ffs.user_id) as users_with_data,
  round(avg(ffs.net_worth), 2) as avg_net_worth,
  round(min(ffs.net_worth), 2) as min_net_worth,
  round(max(ffs.net_worth), 2) as max_net_worth
from fact_financial_summary ffs
inner join dim_users du on ffs.user_id = du.user_id and du.is_current = true
inner join dim_tier dt on du.current_tier = dt.tier_id
group by 1, 2
order by avg_net_worth desc;

-- Average Financial Profile
select
  round(avg(total_assets), 2) as avg_assets,
  round(avg(total_debts), 2) as avg_debts,
  round(avg(total_income), 2) as avg_income,
  round(avg(total_expenses), 2) as avg_expenses,
  round(avg(net_worth), 2) as avg_net_worth
from fact_financial_summary;

-- =============================================================================
-- 5. USAGE METRICS
-- =============================================================================

-- Quota Usage by Tier
select
  fum.tier_id,
  dt.tier_name,
  fum.metric_type,
  round(avg(fum.percentage_used), 2) as avg_usage_pct,
  count(case when fum.percentage_used >= 80 then 1 end) as near_limit_count,
  count(case when fum.percentage_used >= 100 then 1 end) as over_limit_count
from fact_usage_metrics fum
inner join dim_tier dt on fum.tier_id = dt.tier_id
group by 1, 2, 3
order by avg_usage_pct desc;
