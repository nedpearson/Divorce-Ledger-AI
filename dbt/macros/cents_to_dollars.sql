{% macro cents_to_dollars(amount_cents) %}
  round({{ amount_cents }} / 100.0, 2)
{% endmacro %}
