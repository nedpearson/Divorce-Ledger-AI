-- Intermediate model for user-level metrics aggregation
with user_violations as (
  select
    user_id,
    count(*) as total_violations,
    count(case when severity = 'critical' then 1 end) as critical_violations,
    count(case when severity = 'high' then 1 end) as high_violations,
    count(case when is_resolved then 1 end) as resolved_violations,
    min(violation_date_id) as first_violation_date_id,
    max(violation_date_id) as last_violation_date_id
  from {{ ref('stg_violations') }}
  group by user_id
),

user_financials as (
  select
    user_id,
    sum(case when record_type = 'asset' then amount_cents else 0 end) as total_assets_cents,
    sum(case when record_type = 'debt' then amount_cents else 0 end) as total_debts_cents,
    sum(case when record_type = 'income' then amount_cents else 0 end) as monthly_income_cents,
    sum(case when record_type = 'expense' then amount_cents else 0 end) as monthly_expenses_cents,
    count(*) as total_financial_records
  from {{ ref('stg_financial_records') }}
  group by user_id
),

user_billing as (
  select
    user_id,
    sum(amount_cents) as lifetime_revenue_cents,
    count(*) as total_transactions,
    min(billing_date) as first_payment_date,
    max(billing_date) as last_payment_date
  from {{ ref('stg_billing') }}
  where status = 'paid'
  group by user_id
)

select
  u.user_id,
  u.email,
  u.user_name,
  u.current_tier,
  u.is_active,
  
  coalesce(v.total_violations, 0) as total_violations,
  coalesce(v.critical_violations, 0) as critical_violations,
  coalesce(v.resolved_violations, 0) as resolved_violations,
  
  coalesce(f.total_assets_cents, 0) as total_assets_cents,
  coalesce(f.total_debts_cents, 0) as total_debts_cents,
  coalesce(f.monthly_income_cents, 0) as monthly_income_cents,
  coalesce(f.monthly_expenses_cents, 0) as monthly_expenses_cents,
  coalesce(f.total_assets_cents, 0) - coalesce(f.total_debts_cents, 0) as net_worth_cents,
  
  coalesce(b.lifetime_revenue_cents, 0) as lifetime_revenue_cents,
  coalesce(b.total_transactions, 0) as total_transactions,
  b.first_payment_date,
  b.last_payment_date

from {{ ref('stg_users') }} u
left join user_violations v on u.user_id = v.user_id
left join user_financials f on u.user_id = f.user_id
left join user_billing b on u.user_id = b.user_id
