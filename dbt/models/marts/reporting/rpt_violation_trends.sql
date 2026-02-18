-- Violation trends report by week
{{ config(materialized='view') }}

with weekly_violations as (
  select
    date_trunc('week', dd.date_actual) as week_start,
    fv.severity,
    fv.violation_type,
    count(*) as violation_count,
    count(case when fv.is_resolved then 1 end) as resolved_count,
    avg(fv.evidence_count) as avg_evidence_per_violation
  from {{ ref('fact_violations') }} fv
  inner join {{ ref('dim_date') }} dd on fv.violation_date_id = dd.date_id
  group by 1, 2, 3
)

select
  week_start,
  severity,
  violation_type,
  violation_count,
  resolved_count,
  round(avg_evidence_per_violation, 2) as avg_evidence,
  round(resolved_count::numeric / nullif(violation_count, 0) * 100, 2) as resolution_rate_pct,
  sum(violation_count) over (partition by severity order by week_start) as cumulative_violations
from weekly_violations
order by week_start desc, severity, violation_type
