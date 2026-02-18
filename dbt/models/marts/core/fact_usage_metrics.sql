-- Fact table for usage metrics aggregated daily
{{ 
  config(
    materialized='incremental',
    unique_key='metric_id',
    incremental_strategy='delete+insert',
    on_schema_change='sync_all_columns'
  ) 
}}

with daily_usage as (
  select
    user_id,
    violation_date_id as metric_date_id,
    'violations' as metric_type,
    count(*) as metric_value,
    'count' as unit
  from {{ ref('stg_violations') }}
  group by user_id, violation_date_id

  union all

  select
    user_id,
    date_id as metric_date_id,
    'financial_records' as metric_type,
    count(*) as metric_value,
    'count' as unit
  from {{ ref('stg_financial_records') }}
  group by user_id, date_id
),

user_tiers as (
  select user_id, current_tier
  from {{ ref('dim_users') }}
  where is_current = true
),

tier_limits as (
  select tier_id, max_violations_per_month as quota_limit
  from {{ ref('dim_tier') }}
)

select
  {{ dbt_utils.generate_surrogate_key(['du.user_id', 'du.metric_date_id', 'du.metric_type']) }} as metric_id,
  du.user_id,
  du.metric_date_id,
  du.metric_type,
  du.metric_value,
  du.unit,
  ut.current_tier as tier_id,
  tl.quota_limit,
  case 
    when tl.quota_limit > 0 then round((du.metric_value::float / tl.quota_limit) * 100, 2)
    else 0 
  end as percentage_used,
  current_timestamp as dbt_loaded_at
from daily_usage du
left join user_tiers ut on du.user_id = ut.user_id
left join tier_limits tl on ut.current_tier = tl.tier_id

{% if is_incremental() %}
  -- Delete+insert on metric_id refreshes updated metrics
{% endif %}
