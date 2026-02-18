-- Staging model for users
with source_data as (
  select
    id as user_id,
    email,
    full_name as user_name,
    subscription_tier as current_tier,
    billing_cycle_start as tier_start_date,
    environment,
    stripe_customer_id,
    stripe_subscription_id,
    subscription_status,
    cases_count,
    violations_count_this_month,
    qb_connected,
    qb_company_name,
    case when subscription_status = 'active' or subscription_status is null then true else false end as is_active,
    cast(to_char(coalesce(billing_cycle_start, current_date), 'YYYYMMDD') as integer) as created_date_id,
    row_number() over (partition by id order by id) as rn
  from {{ source('raw', 'users') }}
)

select
  user_id,
  email,
  user_name,
  current_tier,
  tier_start_date,
  environment,
  stripe_customer_id,
  subscription_status,
  cases_count,
  violations_count_this_month,
  qb_connected,
  qb_company_name,
  is_active,
  created_date_id,
  current_timestamp as dbt_valid_from,
  null::timestamp as dbt_valid_to,
  true as is_current
from source_data
where rn = 1
