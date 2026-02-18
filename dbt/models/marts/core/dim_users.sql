-- User dimension with proper SCD Type 2 support
{{
  config(
    materialized='incremental',
    unique_key=['user_id', 'dbt_valid_from']
  )
}}

with staged_users as (
  select * from {{ ref('stg_users') }}
),

{% if is_incremental() %}

-- Get existing current records
existing_current as (
  select * from {{ this }}
  where is_current = true
),

-- Identify changed users (tier or active status changed)
changed_users as (
  select 
    s.user_id,
    s.email,
    s.user_name,
    s.current_tier,
    s.tier_start_date,
    s.is_active,
    s.created_date_id
  from staged_users s
  inner join existing_current e on s.user_id = e.user_id
  where s.current_tier != e.current_tier
    or s.is_active != e.is_active
    or s.user_name != e.user_name
),

-- New users not in existing table
new_users as (
  select 
    s.user_id,
    s.email,
    s.user_name,
    s.current_tier,
    s.tier_start_date,
    s.is_active,
    s.created_date_id
  from staged_users s
  left join existing_current e on s.user_id = e.user_id
  where e.user_id is null
),

-- Expire old records for changed users
expired_records as (
  select
    e.user_id,
    e.email,
    e.user_name,
    e.current_tier,
    e.tier_start_date,
    e.is_active,
    e.created_date_id,
    e.dbt_valid_from,
    current_timestamp as dbt_valid_to,
    false as is_current
  from existing_current e
  inner join changed_users c on e.user_id = c.user_id
),

-- New version records for changed users
new_version_records as (
  select
    c.user_id,
    c.email,
    c.user_name,
    c.current_tier,
    c.tier_start_date,
    c.is_active,
    c.created_date_id,
    current_timestamp as dbt_valid_from,
    null::timestamp as dbt_valid_to,
    true as is_current
  from changed_users c
),

-- New user records
new_user_records as (
  select
    n.user_id,
    n.email,
    n.user_name,
    n.current_tier,
    n.tier_start_date,
    n.is_active,
    n.created_date_id,
    current_timestamp as dbt_valid_from,
    null::timestamp as dbt_valid_to,
    true as is_current
  from new_users n
)

-- Combine expired + new versions + new users
select * from expired_records
union all
select * from new_version_records
union all
select * from new_user_records

{% else %}

-- Full refresh: load all users as current
select
  user_id,
  email,
  user_name,
  current_tier,
  tier_start_date,
  is_active,
  created_date_id,
  current_timestamp as dbt_valid_from,
  null::timestamp as dbt_valid_to,
  true as is_current
from staged_users

{% endif %}
