-- User cohort analysis by signup month
{{ config(materialized='view') }}

with user_cohorts as (
  select
    du.user_id,
    date_trunc('month', dd.date_actual) as signup_cohort,
    du.current_tier,
    du.is_active
  from {{ ref('dim_users') }} du
  inner join {{ ref('dim_date') }} dd on du.created_date_id = dd.date_id
  where du.is_current = true
),

cohort_activity as (
  select
    uc.signup_cohort,
    uc.current_tier,
    count(distinct uc.user_id) as total_users,
    count(distinct case when uc.is_active then uc.user_id end) as active_users,
    count(distinct case when not uc.is_active then uc.user_id end) as churned_users
  from user_cohorts uc
  group by 1, 2
),

cohort_revenue as (
  select
    uc.signup_cohort,
    uc.current_tier,
    sum(ft.amount_cents) as lifetime_revenue_cents
  from user_cohorts uc
  inner join {{ ref('fact_transactions') }} ft on uc.user_id = ft.user_id
  where ft.transaction_type = 'charge'
  group by 1, 2
)

select
  ca.signup_cohort,
  ca.current_tier,
  dt.tier_name,
  ca.total_users,
  ca.active_users,
  ca.churned_users,
  round(ca.active_users::numeric / nullif(ca.total_users, 0) * 100, 2) as retention_rate_pct,
  round(ca.churned_users::numeric / nullif(ca.total_users, 0) * 100, 2) as churn_rate_pct,
  coalesce(cr.lifetime_revenue_cents, 0) as lifetime_revenue_cents,
  round(coalesce(cr.lifetime_revenue_cents, 0) / 100.0, 2) as lifetime_revenue_usd,
  case when ca.total_users > 0 
    then round(coalesce(cr.lifetime_revenue_cents, 0) / 100.0 / ca.total_users, 2)
    else 0 
  end as ltv_per_user_usd
from cohort_activity ca
left join cohort_revenue cr on ca.signup_cohort = cr.signup_cohort 
  and ca.current_tier = cr.current_tier
left join {{ ref('dim_tier') }} dt on ca.current_tier = dt.tier_id
order by ca.signup_cohort desc, ca.current_tier
