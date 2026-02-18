-- Divorce Ledger Event Streaming Schema
-- PostgreSQL-based event streaming with Kafka-like semantics

-- ============================================
-- EVENT LOG TABLE (Core Event Store)
-- ============================================

CREATE TABLE IF NOT EXISTS event_log (
  event_id BIGSERIAL PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  topic VARCHAR(100) NOT NULL,
  partition_key VARCHAR(255),
  payload JSONB NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  sequence_number BIGINT,
  correlation_id VARCHAR(255),
  causation_id VARCHAR(255),
  version INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_event_log_topic ON event_log(topic, event_id);
CREATE INDEX IF NOT EXISTS idx_event_log_type ON event_log(event_type);
CREATE INDEX IF NOT EXISTS idx_event_log_partition ON event_log(topic, partition_key, event_id);
CREATE INDEX IF NOT EXISTS idx_event_log_created ON event_log(created_at);
CREATE INDEX IF NOT EXISTS idx_event_log_correlation ON event_log(correlation_id);

-- ============================================
-- CONSUMER GROUPS (Track Consumer Progress)
-- ============================================

CREATE TABLE IF NOT EXISTS event_consumer_groups (
  group_id VARCHAR(100) PRIMARY KEY,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- CONSUMER OFFSETS (Track Last Processed Event)
-- ============================================

CREATE TABLE IF NOT EXISTS event_consumer_offsets (
  id SERIAL PRIMARY KEY,
  consumer_group VARCHAR(100) NOT NULL,
  topic VARCHAR(100) NOT NULL,
  partition_key VARCHAR(255) DEFAULT '_default',
  last_offset BIGINT NOT NULL DEFAULT 0,
  last_processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(consumer_group, topic, partition_key)
);

CREATE INDEX IF NOT EXISTS idx_consumer_offsets_group ON event_consumer_offsets(consumer_group);

-- ============================================
-- OUTBOX TABLE (Transactional Outbox Pattern)
-- ============================================

CREATE TABLE IF NOT EXISTS event_outbox (
  outbox_id BIGSERIAL PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  topic VARCHAR(100) NOT NULL,
  partition_key VARCHAR(255),
  payload JSONB NOT NULL,
  metadata JSONB DEFAULT '{}',
  correlation_id VARCHAR(255),
  causation_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  published_at TIMESTAMP WITH TIME ZONE,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 5,
  status VARCHAR(20) DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_outbox_status ON event_outbox(status, created_at);
CREATE INDEX IF NOT EXISTS idx_outbox_topic ON event_outbox(topic);

-- ============================================
-- DEAD LETTER QUEUE (Failed Events)
-- ============================================

CREATE TABLE IF NOT EXISTS event_dead_letter (
  dlq_id BIGSERIAL PRIMARY KEY,
  original_event_id BIGINT,
  consumer_group VARCHAR(100) NOT NULL,
  topic VARCHAR(100) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  error_message TEXT,
  error_stack TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_retry_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(20) DEFAULT 'failed'
);

CREATE INDEX IF NOT EXISTS idx_dlq_status ON event_dead_letter(status, consumer_group);
CREATE INDEX IF NOT EXISTS idx_dlq_topic ON event_dead_letter(topic);

-- ============================================
-- EVENT SUBSCRIPTIONS (Topic Subscriptions)
-- ============================================

CREATE TABLE IF NOT EXISTS event_subscriptions (
  subscription_id SERIAL PRIMARY KEY,
  consumer_group VARCHAR(100) NOT NULL,
  topic VARCHAR(100) NOT NULL,
  filter_expression JSONB,
  handler_name VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(consumer_group, topic, handler_name)
);

-- ============================================
-- SEQUENCE GENERATOR FOR ORDERING
-- ============================================

CREATE SEQUENCE IF NOT EXISTS event_sequence_seq START 1;

-- ============================================
-- FUNCTIONS FOR EVENT STREAMING
-- ============================================

CREATE OR REPLACE FUNCTION publish_event(
  p_event_type VARCHAR,
  p_topic VARCHAR,
  p_payload JSONB,
  p_partition_key VARCHAR DEFAULT NULL,
  p_correlation_id VARCHAR DEFAULT NULL,
  p_causation_id VARCHAR DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS BIGINT AS $$
DECLARE
  v_event_id BIGINT;
  v_sequence BIGINT;
BEGIN
  v_sequence := nextval('event_sequence_seq');
  
  INSERT INTO event_log (
    event_type, topic, partition_key, payload, metadata,
    sequence_number, correlation_id, causation_id
  )
  VALUES (
    p_event_type, p_topic, COALESCE(p_partition_key, 'default'),
    p_payload, p_metadata, v_sequence, p_correlation_id, p_causation_id
  )
  RETURNING event_id INTO v_event_id;
  
  PERFORM pg_notify('events_' || p_topic, json_build_object(
    'event_id', v_event_id,
    'event_type', p_event_type,
    'topic', p_topic
  )::text);
  
  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION commit_offset(
  p_consumer_group VARCHAR,
  p_topic VARCHAR,
  p_offset BIGINT,
  p_partition_key VARCHAR DEFAULT '_default'
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO event_consumer_offsets (consumer_group, topic, partition_key, last_offset, last_processed_at)
  VALUES (p_consumer_group, p_topic, p_partition_key, p_offset, NOW())
  ON CONFLICT (consumer_group, topic, partition_key) 
  DO UPDATE SET 
    last_offset = EXCLUDED.last_offset,
    last_processed_at = NOW();
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_pending_events(
  p_consumer_group VARCHAR,
  p_topic VARCHAR,
  p_limit INTEGER DEFAULT 100,
  p_partition_key VARCHAR DEFAULT NULL
)
RETURNS TABLE (
  event_id BIGINT,
  event_type VARCHAR,
  topic VARCHAR,
  partition_key VARCHAR,
  payload JSONB,
  metadata JSONB,
  sequence_number BIGINT,
  correlation_id VARCHAR,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
  v_last_offset BIGINT;
BEGIN
  SELECT COALESCE(eco.last_offset, 0) INTO v_last_offset
  FROM event_consumer_offsets eco
  WHERE eco.consumer_group = p_consumer_group 
    AND eco.topic = p_topic
    AND (p_partition_key IS NULL OR eco.partition_key = p_partition_key);
  
  IF v_last_offset IS NULL THEN
    v_last_offset := 0;
  END IF;
  
  RETURN QUERY
  SELECT 
    el.event_id, el.event_type, el.topic, el.partition_key,
    el.payload, el.metadata, el.sequence_number, el.correlation_id, el.created_at
  FROM event_log el
  WHERE el.topic = p_topic
    AND el.event_id > v_last_offset
    AND (p_partition_key IS NULL OR el.partition_key = p_partition_key)
  ORDER BY el.sequence_number
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION process_outbox()
RETURNS INTEGER AS $$
DECLARE
  v_outbox RECORD;
  v_event_id BIGINT;
  v_processed INTEGER := 0;
BEGIN
  FOR v_outbox IN 
    SELECT * FROM event_outbox 
    WHERE status = 'pending' 
    ORDER BY created_at 
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      v_event_id := publish_event(
        v_outbox.event_type,
        v_outbox.topic,
        v_outbox.payload,
        v_outbox.partition_key,
        v_outbox.correlation_id,
        v_outbox.causation_id,
        v_outbox.metadata
      );
      
      UPDATE event_outbox 
      SET status = 'published', published_at = NOW()
      WHERE outbox_id = v_outbox.outbox_id;
      
      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE event_outbox 
      SET retry_count = retry_count + 1,
          status = CASE WHEN retry_count >= max_retries - 1 THEN 'failed' ELSE 'pending' END
      WHERE outbox_id = v_outbox.outbox_id;
    END;
  END LOOP;
  
  RETURN v_processed;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- SEED CONSUMER GROUPS
-- ============================================

INSERT INTO event_consumer_groups (group_id, description)
VALUES 
  ('analytics-processor', 'Processes events for real-time analytics'),
  ('warehouse-loader', 'Loads events into data warehouse'),
  ('notification-sender', 'Sends notifications based on events'),
  ('billing-processor', 'Processes billing-related events'),
  ('audit-logger', 'Logs events for audit trail')
ON CONFLICT (group_id) DO NOTHING;

-- ============================================
-- SEED EVENT SUBSCRIPTIONS
-- ============================================

INSERT INTO event_subscriptions (consumer_group, topic, handler_name)
VALUES 
  ('analytics-processor', 'user.tier_changed', 'processTierChange'),
  ('analytics-processor', 'billing.payment', 'processPayment'),
  ('analytics-processor', 'violation.created', 'processViolation'),
  ('warehouse-loader', 'user.tier_changed', 'loadTierChange'),
  ('warehouse-loader', 'billing.payment', 'loadPayment'),
  ('warehouse-loader', 'violation.created', 'loadViolation'),
  ('notification-sender', 'user.tier_changed', 'sendTierChangeNotification'),
  ('notification-sender', 'billing.payment_failed', 'sendPaymentFailedNotification'),
  ('audit-logger', 'user.tier_changed', 'auditTierChange'),
  ('audit-logger', 'billing.payment', 'auditPayment'),
  ('audit-logger', 'violation.created', 'auditViolation')
ON CONFLICT (consumer_group, topic, handler_name) DO NOTHING;
