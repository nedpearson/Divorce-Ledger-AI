{% snapshot users_snapshot %}

{{
    config(
      target_schema='snapshots',
      unique_key='user_id',
      strategy='check',
      check_cols=['user_name', 'email', 'tier'],
    )
}}

select
    id as user_id,
    full_name as user_name,
    email,
    subscription_tier as tier,
    current_timestamp as created_at
from {{ source('raw', 'users') }}

{% endsnapshot %}
