{% macro generate_date_id(date_column) %}
  cast(to_char({{ date_column }}, 'YYYYMMDD') as integer)
{% endmacro %}
