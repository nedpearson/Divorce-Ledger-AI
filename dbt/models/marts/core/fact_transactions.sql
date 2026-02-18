-- Fact table for billing transactions with proper incremental filtering
{{ 
  config(
    materialized='incremental',
    unique_key='transaction_id',
    incremental_strategy='delete+insert',
    on_schema_change='sync_all_columns'
  ) 
}}

with billing_data as (
  select * from {{ ref('stg_billing') }}
  {% if is_incremental() %}
    where updated_at >= (select coalesce(max(dbt_loaded_at), '1900-01-01'::timestamp) from {{ this }})
  {% endif %}
),

user_tier as (
  select 
    user_id,
    current_tier
  from {{ ref('dim_users') }}
  where is_current = true
)

select
  b.billing_id as transaction_id,
  b.user_id,
  b.date_id as transaction_date_id,
  b.amount_cents,
  {{ cents_to_dollars('b.amount_cents') }} as amount_dollars,
  case 
    when b.status = 'paid' then 'charge'
    when b.status = 'refunded' then 'refund'
    when b.status = 'adjusted' then 'adjustment'
    else 'charge'
  end as transaction_type,
  'stripe' as payment_method,
  b.stripe_invoice_id,
  null as subscription_id,
  ut.current_tier as tier_id,
  'USD' as currency,
  b.status,
  null as refund_reason,
  null::jsonb as metadata,
  current_timestamp as dbt_loaded_at
from billing_data b
left join user_tier ut on b.user_id = ut.user_id
