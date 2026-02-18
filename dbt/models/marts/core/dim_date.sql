-- Date dimension table - generates dates from 2020 to 2030
{{ config(materialized='table') }}

-- Generate date dimension (2020-2030)
with date_spine as (
  select
    cast(date_trunc('day', date) as date) as date_actual
  from generate_series(
    '2020-01-01'::date,
    '2030-12-31'::date,
    '1 day'::interval
  ) as date
),

transformed as (
  select
    to_char(date_actual, 'YYYYMMDD')::int as date_id,
    date_actual,
    extract(year from date_actual)::int as year,
    extract(quarter from date_actual)::int as quarter,
    extract(month from date_actual)::int as month,
    extract(day from date_actual)::int as day_of_month,
    extract(dow from date_actual)::int as day_of_week,
    case when extract(dow from date_actual) in (0, 6) then true else false end as is_weekend,
    false as is_holiday,  -- Update with actual holidays
    extract(week from date_actual)::int as week_of_year,
    to_char(date_actual, 'Month') as month_name,
    to_char(date_actual, 'Day') as day_name
  from date_spine
)

select * from transformed
order by date_id
