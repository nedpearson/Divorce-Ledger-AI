-- Staging model for billing records
with source_data as (
  select
    id as billing_id,
    user_id,
    tier,
    period_start,
    period_end,
    violations_recorded,
    storage_used_mb,
    amount_cents,
    status,
    stripe_invoice_id,
    created_at,
    created_at as updated_at,
    cast(created_at as date) as billing_date,
    row_number() over (partition by id order by created_at desc) as rn
  from {{ source('raw', 'billing_records') }}
)

select
  billing_id,
  user_id,
  tier,
  billing_date,
  amount_cents,
  {{ cents_to_dollars('amount_cents') }} as amount_dollars,
  status,
  stripe_invoice_id,
  violations_recorded,
  storage_used_mb,
  period_start,
  period_end,
  cast(to_char(billing_date, 'YYYYMMDD') as integer) as date_id,
  updated_at
from source_data
where rn = 1
