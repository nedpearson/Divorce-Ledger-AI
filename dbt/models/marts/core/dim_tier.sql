-- Tier dimension table with pricing and limits
{{ config(materialized='table') }}

select
  'free' as tier_id,
  'Free' as tier_name,
  0 as price_usd_monthly,
  100 as api_limit_daily,
  1 as storage_gb,
  1 as max_cases,
  10 as max_violations_per_month,
  false as ai_features,
  false as priority_support,
  '2020-01-01'::timestamp as effective_from,
  null::timestamp as effective_to

union all

select
  'individual' as tier_id,
  'Individual' as tier_name,
  12 as price_usd_monthly,
  500 as api_limit_daily,
  5 as storage_gb,
  1 as max_cases,
  20 as max_violations_per_month,
  false as ai_features,
  false as priority_support,
  '2020-01-01'::timestamp as effective_from,
  null::timestamp as effective_to

union all

select
  'pro' as tier_id,
  'Pro' as tier_name,
  49 as price_usd_monthly,
  2000 as api_limit_daily,
  25 as storage_gb,
  -1 as max_cases,
  -1 as max_violations_per_month,
  true as ai_features,
  false as priority_support,
  '2020-01-01'::timestamp as effective_from,
  null::timestamp as effective_to

union all

select
  'team' as tier_id,
  'Team' as tier_name,
  199 as price_usd_monthly,
  10000 as api_limit_daily,
  100 as storage_gb,
  -1 as max_cases,
  -1 as max_violations_per_month,
  true as ai_features,
  true as priority_support,
  '2020-01-01'::timestamp as effective_from,
  null::timestamp as effective_to

union all

select
  'enterprise' as tier_id,
  'Enterprise' as tier_name,
  499 as price_usd_monthly,
  -1 as api_limit_daily,
  -1 as storage_gb,
  -1 as max_cases,
  -1 as max_violations_per_month,
  true as ai_features,
  true as priority_support,
  '2020-01-01'::timestamp as effective_from,
  null::timestamp as effective_to
