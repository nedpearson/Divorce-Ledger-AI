-- Database Performance Monitoring Queries
-- Run these in Supabase SQL Editor to identify performance issues

-- 1. Find slow queries (queries taking > 100ms)
SELECT
  query,
  calls,
  total_time,
  mean_time,
  max_time,
  stddev_time
FROM pg_stat_statements
WHERE mean_time > 100
ORDER BY mean_time DESC
LIMIT 20;

-- 2. Find tables with missing indexes (high seq_scan)
SELECT
  schemaname,
  tablename,
  seq_scan,
  seq_tup_read,
  idx_scan,
  seq_tup_read / NULLIF(seq_scan, 0) AS avg_seq_tup_read
FROM pg_stat_user_tables
WHERE seq_scan > 0
ORDER BY seq_tup_read DESC
LIMIT 20;

-- 3. Check index usage efficiency
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC
LIMIT 20;

-- 4. Find unused indexes (candidates for removal)
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND idx_scan = 0
  AND indexrelname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(indexrelid) DESC;

-- 5. Database size by table
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS indexes_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 20;

-- 6. Active connections and states
SELECT
  datname,
  count(*) AS connections,
  state,
  wait_event_type
FROM pg_stat_activity
WHERE datname IS NOT NULL
GROUP BY datname, state, wait_event_type
ORDER BY connections DESC;

-- 7. Long running queries (currently executing)
SELECT
  pid,
  now() - query_start AS duration,
  state,
  query
FROM pg_stat_activity
WHERE state != 'idle'
  AND query NOT LIKE '%pg_stat_activity%'
ORDER BY duration DESC;

-- 8. Table bloat (dead tuples)
SELECT
  schemaname,
  tablename,
  n_live_tup,
  n_dead_tup,
  n_dead_tup * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0) AS dead_percentage
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC
LIMIT 20;

-- 9. Cache hit ratio (should be > 99%)
SELECT
  sum(heap_blks_read) AS heap_read,
  sum(heap_blks_hit) AS heap_hit,
  sum(heap_blks_hit) * 100.0 / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0) AS cache_hit_ratio
FROM pg_statio_user_tables;

-- 10. Transaction wraparound status (monitor for safety)
SELECT
  datname,
  age(datfrozenxid) AS xid_age,
  2147483648 - age(datfrozenxid) AS xids_remaining
FROM pg_database
ORDER BY age(datfrozenxid) DESC;

-- RECOMMENDATIONS:
-- - Run query #1 weekly to identify slow queries
-- - Run query #2 to find missing indexes
-- - Run query #4 to clean up unused indexes
-- - Run query #5 monthly to monitor storage growth
-- - Run query #8 weekly and VACUUM if dead_percentage > 20%
-- - Keep cache_hit_ratio (query #9) above 99%
