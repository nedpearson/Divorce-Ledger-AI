-- Staging model for subscription data from tier_migrations
with tier_migrations as (
  select
    id as subscription_id,
    user_id,
    from_tier,
    to_tier,
    reason,
    status,
    scheduled_date,
    effective_date,
    created_at,
    cast(to_char(coalesce(effective_date, scheduled_date), 'YYYYMMDD') as integer) as start_date_id,
    row_number() over (partition by user_id order by created_at desc) as rn
  from {{ source('raw', 'tier_migrations') }}
),

current_users as (
  select
    id as user_id,
    subscription_tier as current_tier,
    subscription_status as status,
    billing_cycle_start
  from {{ source('raw', 'users') }}
)

select
  coalesce(tm.subscription_id, cu.user_id) as subscription_id,
  cu.user_id,
  coalesce(tm.to_tier, cu.current_tier) as tier,
  coalesce(tm.from_tier, 'free') as previous_tier,
  cu.status,
  coalesce(tm.start_date_id, cast(to_char(cu.billing_cycle_start, 'YYYYMMDD') as integer)) as start_date_id,
  null::integer as end_date_id,
  tm.reason as migration_reason,
  current_timestamp as dbt_valid_from,
  null::timestamp as dbt_valid_to,
  true as is_current
from current_users cu
left join tier_migrations tm on cu.user_id = tm.user_id and tm.rn = 1
