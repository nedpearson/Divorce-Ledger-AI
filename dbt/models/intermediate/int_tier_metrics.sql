-- Intermediate model for tier-level aggregations
with tier_users as (
  select
    current_tier as tier_id,
    count(*) as user_count,
    count(case when is_active then 1 end) as active_users,
    count(case when not is_active then 1 end) as churned_users
  from {{ ref('stg_users') }}
  group by current_tier
),

tier_revenue as (
  select
    ut.current_tier as tier_id,
    sum(b.amount_cents) as total_revenue_cents,
    avg(b.amount_cents) as avg_transaction_cents,
    count(distinct b.user_id) as paying_users
  from {{ ref('stg_billing') }} b
  inner join {{ ref('stg_users') }} ut on b.user_id = ut.user_id
  where b.status = 'paid'
  group by ut.current_tier
),

tier_violations as (
  select
    ut.current_tier as tier_id,
    count(*) as total_violations,
    avg(case when v.is_resolved then 1 else 0 end) as resolution_rate
  from {{ ref('stg_violations') }} v
  inner join {{ ref('stg_users') }} ut on v.user_id = ut.user_id
  group by ut.current_tier
)

select
  t.tier_id,
  t.tier_name,
  t.price_usd_monthly,
  
  coalesce(tu.user_count, 0) as user_count,
  coalesce(tu.active_users, 0) as active_users,
  coalesce(tu.churned_users, 0) as churned_users,
  
  coalesce(tr.total_revenue_cents, 0) as total_revenue_cents,
  coalesce(tr.avg_transaction_cents, 0) as avg_transaction_cents,
  coalesce(tr.paying_users, 0) as paying_users,
  
  coalesce(tv.total_violations, 0) as total_violations,
  coalesce(tv.resolution_rate, 0) as resolution_rate,
  
  case when tu.user_count > 0 
    then round(coalesce(tu.active_users, 0)::numeric / tu.user_count * 100, 2)
    else 0 
  end as retention_rate

from {{ ref('dim_tier') }} t
left join tier_users tu on t.tier_id = tu.tier_id
left join tier_revenue tr on t.tier_id = tr.tier_id
left join tier_violations tv on t.tier_id = tv.tier_id
