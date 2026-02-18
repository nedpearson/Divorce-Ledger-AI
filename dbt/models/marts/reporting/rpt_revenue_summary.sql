-- Revenue summary report by month and tier
{{ config(materialized='view') }}

with monthly_transactions as (
  select
    date_trunc('month', dd.date_actual) as month,
    ft.tier_id,
    sum(ft.amount_cents) as total_revenue_cents,
    count(distinct ft.user_id) as unique_customers,
    count(*) as transaction_count,
    sum(case when ft.transaction_type = 'charge' then ft.amount_cents else 0 end) as charges_cents,
    sum(case when ft.transaction_type = 'refund' then ft.amount_cents else 0 end) as refunds_cents
  from {{ ref('fact_transactions') }} ft
  inner join {{ ref('dim_date') }} dd on ft.transaction_date_id = dd.date_id
  group by 1, 2
)

select
  month,
  tier_id,
  dt.tier_name,
  total_revenue_cents,
  round(total_revenue_cents / 100.0, 2) as total_revenue_usd,
  unique_customers,
  transaction_count,
  charges_cents,
  refunds_cents,
  round(charges_cents / 100.0, 2) as charges_usd,
  round(refunds_cents / 100.0, 2) as refunds_usd,
  case when unique_customers > 0 
    then round(total_revenue_cents / 100.0 / unique_customers, 2)
    else 0 
  end as arpu_usd
from monthly_transactions mt
left join {{ ref('dim_tier') }} dt on mt.tier_id = dt.tier_id
order by month desc, tier_id
