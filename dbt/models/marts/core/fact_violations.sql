-- Fact table for violations with proper incremental filtering
{{ 
  config(
    materialized='incremental',
    unique_key='violation_id',
    incremental_strategy='delete+insert',
    on_schema_change='sync_all_columns'
  ) 
}}

with violations_data as (
  select * from {{ ref('stg_violations') }}
  {% if is_incremental() %}
    where updated_at >= (select coalesce(max(dbt_loaded_at), '1900-01-01'::timestamp) from {{ this }})
  {% endif %}
)

select
  violation_id,
  user_id,
  violation_date_id,
  violation_type,
  severity,
  severity_score,
  case_id,
  description,
  media_count,
  photo_count,
  video_duration,
  witness_count,
  ai_classification,
  ai_confidence_score,
  is_resolved,
  is_draft,
  environment,
  status,
  updated_at,
  null::jsonb as metadata,
  current_timestamp as dbt_loaded_at
from violations_data
