-- Fact table for daily financial summaries per user
-- NOTE: Source financial tables lack timestamps, so this represents current balances
-- captured at each dbt run, not historical point-in-time snapshots
{{ 
  config(
    materialized='incremental',
    unique_key='summary_id',
    incremental_strategy='delete+insert',
    on_schema_change='sync_all_columns'
  ) 
}}

with financial_data as (
  select * from {{ ref('stg_financial_records') }}
),

daily_summaries as (
  select
    user_id,
    date_id as summary_date_id,
    sum(case when record_type = 'asset' then amount_cents else 0 end) as total_assets_cents,
    sum(case when record_type = 'debt' then amount_cents else 0 end) as total_debts_cents,
    sum(case when record_type = 'income' then amount_cents else 0 end) as total_income_cents,
    sum(case when record_type = 'expense' then amount_cents else 0 end) as total_expenses_cents,
    count(case when record_type = 'asset' then 1 end) as asset_count,
    count(case when record_type = 'debt' then 1 end) as debt_count,
    count(case when record_type = 'income' then 1 end) as income_source_count,
    count(case when record_type = 'expense' then 1 end) as expense_count
  from financial_data
  group by user_id, date_id
)

select
  {{ dbt_utils.generate_surrogate_key(['user_id', 'summary_date_id']) }} as summary_id,
  user_id,
  summary_date_id,
  null as case_id,
  total_assets_cents,
  total_debts_cents,
  total_income_cents,
  total_expenses_cents,
  (total_assets_cents - total_debts_cents) as net_worth_cents,
  {{ cents_to_dollars('total_assets_cents') }} as total_assets_dollars,
  {{ cents_to_dollars('total_debts_cents') }} as total_debts_dollars,
  {{ cents_to_dollars('total_income_cents') }} as total_income_dollars,
  {{ cents_to_dollars('total_expenses_cents') }} as total_expenses_dollars,
  asset_count,
  debt_count,
  income_source_count,
  expense_count,
  current_timestamp as dbt_loaded_at
from daily_summaries
-- Full refresh each run since source lacks change tracking
