-- Staging model for violations data
with source_data as (
  select
    id as violation_id,
    user_id,
    case_id,
    type as violation_type,
    description,
    timestamp as violation_timestamp,
    location,
    media_urls,
    status,
    environment,
    photo_count,
    video_duration,
    witnesses,
    is_draft,
    audio_transcript,
    audio_file_url,
    ai_classification,
    ai_confidence_score,
    severity_score,
    cast(to_char(timestamp, 'YYYYMMDD') as integer) as violation_date_id,
    timestamp as updated_at,
    row_number() over (partition by id order by timestamp desc) as rn
  from {{ source('raw', 'violations') }}
)

select
  violation_id,
  user_id,
  case_id,
  violation_type,
  description,
  violation_timestamp,
  location,
  violation_date_id,
  status,
  environment,
  coalesce(array_length(media_urls, 1), 0) as media_count,
  photo_count,
  video_duration,
  coalesce(array_length(witnesses, 1), 0) as witness_count,
  is_draft,
  ai_classification,
  ai_confidence_score,
  severity_score,
  case 
    when severity_score >= 8 then 'critical'
    when severity_score >= 6 then 'high'
    when severity_score >= 4 then 'medium'
    else 'low'
  end as severity,
  case when status = 'resolved' then true else false end as is_resolved,
  updated_at
from source_data
where rn = 1
