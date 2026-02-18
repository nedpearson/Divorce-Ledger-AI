-- Staging model for financial records (assets, debts, income, expenses)
-- LIMITATION: Source tables lack business timestamps (no created_at/updated_at)
-- We track snapshot_date (when dbt captured the data) for freshness analysis
-- This means facts show current balances, not historical changes over time

with assets_data as (
  select
    id as record_id,
    user_id,
    'asset' as record_type,
    name,
    category,
    value as amount_cents,
    ownership,
    verified,
    environment
  from {{ source('raw', 'assets') }}
),

debts_data as (
  select
    id as record_id,
    user_id,
    'debt' as record_type,
    name,
    category,
    amount as amount_cents,
    ownership,
    null::boolean as verified,
    environment
  from {{ source('raw', 'debts') }}
),

income_data as (
  select
    id as record_id,
    user_id,
    'income' as record_type,
    source as name,
    frequency as category,
    amount as amount_cents,
    owner as ownership,
    verified,
    environment
  from {{ source('raw', 'incomes') }}
),

expense_data as (
  select
    id as record_id,
    user_id,
    'expense' as record_type,
    description as name,
    category,
    amount as amount_cents,
    owner as ownership,
    null::boolean as verified,
    environment
  from {{ source('raw', 'expenses') }}
),

all_records as (
  select * from assets_data
  union all
  select * from debts_data
  union all
  select * from income_data
  union all
  select * from expense_data
)

select 
  record_id,
  user_id,
  record_type,
  name,
  category,
  amount_cents,
  {{ cents_to_dollars('amount_cents') }} as amount_dollars,
  ownership,
  verified,
  environment,
  current_date as snapshot_date,
  cast(to_char(current_date, 'YYYYMMDD') as integer) as date_id,
  current_timestamp as dbt_ingested_at
from all_records
