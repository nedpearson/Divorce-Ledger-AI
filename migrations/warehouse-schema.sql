-- Divorce Ledger Data Warehouse Schema
-- Kimball-style star schema for analytics
-- Supports slowly changing dimensions (SCD Type 2) for historical tracking

-- ============================================
-- DIMENSION TABLES
-- ============================================

-- Time dimension with comprehensive date attributes
CREATE TABLE IF NOT EXISTS dim_time (
  time_key SERIAL PRIMARY KEY,
  full_date DATE NOT NULL UNIQUE,
  day_of_week INTEGER,
  day_name VARCHAR(10),
  day_of_month INTEGER,
  day_of_year INTEGER,
  week_of_year INTEGER,
  month INTEGER,
  month_name VARCHAR(20),
  quarter INTEGER,
  quarter_name VARCHAR(10),
  year INTEGER,
  fiscal_year INTEGER,
  fiscal_quarter INTEGER,
  is_weekend BOOLEAN,
  is_holiday BOOLEAN DEFAULT FALSE,
  is_month_start BOOLEAN,
  is_month_end BOOLEAN,
  is_quarter_start BOOLEAN,
  is_quarter_end BOOLEAN,
  is_year_start BOOLEAN,
  is_year_end BOOLEAN
);

-- User dimension with SCD Type 2 for tier history tracking
CREATE TABLE IF NOT EXISTS dim_user (
  user_key SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  name VARCHAR(255),
  subscription_tier VARCHAR(50),
  stripe_customer_id VARCHAR(255),
  signup_source VARCHAR(100),
  referral_code VARCHAR(50),
  account_status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP,
  -- SCD Type 2 fields
  effective_from TIMESTAMP DEFAULT NOW(),
  effective_to TIMESTAMP DEFAULT '9999-12-31',
  is_current BOOLEAN DEFAULT TRUE,
  version INTEGER DEFAULT 1,
  UNIQUE(user_id, effective_from)
);

-- User tier history - explicit SCD tracking for subscription changes
CREATE TABLE IF NOT EXISTS dim_user_tier_history (
  tier_history_key SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  user_key INTEGER REFERENCES dim_user(user_key),
  previous_tier VARCHAR(50),
  new_tier VARCHAR(50) NOT NULL,
  change_reason VARCHAR(100),
  change_source VARCHAR(50),
  mrr_change_cents INTEGER DEFAULT 0,
  changed_at TIMESTAMP NOT NULL,
  effective_from TIMESTAMP NOT NULL,
  effective_to TIMESTAMP DEFAULT '9999-12-31',
  is_upgrade BOOLEAN,
  is_downgrade BOOLEAN,
  is_churn BOOLEAN DEFAULT FALSE,
  days_in_previous_tier INTEGER
);

-- Subscription/Tier dimension with SCD Type 2
CREATE TABLE IF NOT EXISTS dim_subscription (
  subscription_key SERIAL PRIMARY KEY,
  tier_name VARCHAR(50) NOT NULL,
  tier_display_name VARCHAR(100),
  monthly_price_cents INTEGER,
  annual_price_cents INTEGER,
  max_cases INTEGER,
  max_violations_per_month INTEGER,
  max_file_size_mb INTEGER,
  max_storage_mb INTEGER,
  max_team_members INTEGER,
  max_voice_minutes INTEGER,
  max_media_uploads INTEGER,
  has_ai_features BOOLEAN,
  has_voice_transcription BOOLEAN,
  has_team_features BOOLEAN,
  has_api_access BOOLEAN,
  has_priority_support BOOLEAN,
  has_custom_branding BOOLEAN,
  -- SCD Type 2 fields
  effective_from TIMESTAMP DEFAULT NOW(),
  effective_to TIMESTAMP DEFAULT '9999-12-31',
  is_current BOOLEAN DEFAULT TRUE
);

-- Geography dimension for location-based analytics
CREATE TABLE IF NOT EXISTS dim_geography (
  geography_key SERIAL PRIMARY KEY,
  country_code VARCHAR(3),
  country_name VARCHAR(100),
  state_province VARCHAR(100),
  state_code VARCHAR(10),
  city VARCHAR(100),
  postal_code VARCHAR(20),
  timezone VARCHAR(50),
  region VARCHAR(50),
  court_jurisdiction VARCHAR(100),
  is_community_property_state BOOLEAN,
  divorce_filing_fee_cents INTEGER
);

-- Violation category dimension
CREATE TABLE IF NOT EXISTS dim_violation_category (
  category_key SERIAL PRIMARY KEY,
  category_name VARCHAR(100) NOT NULL UNIQUE,
  category_group VARCHAR(50),
  severity_level VARCHAR(20),
  severity_weight INTEGER DEFAULT 1,
  legal_classification VARCHAR(100),
  statute_reference VARCHAR(100),
  description TEXT,
  recommended_action TEXT
);

-- Evidence type dimension
CREATE TABLE IF NOT EXISTS dim_evidence_type (
  evidence_type_key SERIAL PRIMARY KEY,
  type_name VARCHAR(50) NOT NULL UNIQUE,
  mime_type_pattern VARCHAR(100),
  is_audio BOOLEAN DEFAULT FALSE,
  is_video BOOLEAN DEFAULT FALSE,
  is_image BOOLEAN DEFAULT FALSE,
  is_document BOOLEAN DEFAULT FALSE,
  legal_admissibility_score INTEGER,
  retention_days INTEGER DEFAULT 365
);

-- Case status dimension
CREATE TABLE IF NOT EXISTS dim_case_status (
  status_key SERIAL PRIMARY KEY,
  status_name VARCHAR(50) NOT NULL UNIQUE,
  status_category VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  is_terminal BOOLEAN DEFAULT FALSE,
  display_order INTEGER
);

-- ============================================
-- FACT TABLES
-- ============================================

-- Violations fact table
CREATE TABLE IF NOT EXISTS fact_violation (
  violation_fact_id SERIAL PRIMARY KEY,
  time_key INTEGER REFERENCES dim_time(time_key),
  user_key INTEGER REFERENCES dim_user(user_key),
  case_key INTEGER,
  category_key INTEGER REFERENCES dim_violation_category(category_key),
  geography_key INTEGER REFERENCES dim_geography(geography_key),
  violation_id INTEGER NOT NULL,
  severity_score INTEGER,
  ai_classification VARCHAR(100),
  ai_confidence DECIMAL(5,4),
  has_audio_transcript BOOLEAN DEFAULT FALSE,
  has_evidence BOOLEAN DEFAULT FALSE,
  evidence_count INTEGER DEFAULT 0,
  witness_count INTEGER DEFAULT 0,
  location VARCHAR(255),
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  duration_minutes INTEGER,
  response_time_hours INTEGER,
  violation_date TIMESTAMP,
  reported_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Financial transactions fact table
CREATE TABLE IF NOT EXISTS fact_financial_transaction (
  transaction_fact_id SERIAL PRIMARY KEY,
  time_key INTEGER REFERENCES dim_time(time_key),
  user_key INTEGER REFERENCES dim_user(user_key),
  case_key INTEGER,
  geography_key INTEGER REFERENCES dim_geography(geography_key),
  transaction_type VARCHAR(50) NOT NULL,
  category VARCHAR(100),
  subcategory VARCHAR(100),
  amount_cents INTEGER NOT NULL,
  original_currency VARCHAR(3) DEFAULT 'USD',
  exchange_rate DECIMAL(10,6) DEFAULT 1.0,
  ownership VARCHAR(50),
  is_verified BOOLEAN DEFAULT FALSE,
  is_hidden BOOLEAN DEFAULT FALSE,
  is_disputed BOOLEAN DEFAULT FALSE,
  verification_method VARCHAR(50),
  environment VARCHAR(20),
  source_table VARCHAR(50),
  source_id INTEGER,
  transaction_date TIMESTAMP,
  discovered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Billing events fact table
CREATE TABLE IF NOT EXISTS fact_billing_event (
  billing_event_id SERIAL PRIMARY KEY,
  time_key INTEGER REFERENCES dim_time(time_key),
  user_key INTEGER REFERENCES dim_user(user_key),
  subscription_key INTEGER REFERENCES dim_subscription(subscription_key),
  payment_method_key INTEGER,
  event_type VARCHAR(50) NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER DEFAULT 0,
  discount_cents INTEGER DEFAULT 0,
  net_amount_cents INTEGER,
  currency VARCHAR(3) DEFAULT 'USD',
  stripe_invoice_id VARCHAR(255),
  stripe_payment_intent_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  promo_code VARCHAR(50),
  status VARCHAR(50),
  failure_reason TEXT,
  retry_count INTEGER DEFAULT 0,
  event_timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Usage metrics fact table (for feature usage tracking)
CREATE TABLE IF NOT EXISTS fact_usage_metric (
  usage_fact_id SERIAL PRIMARY KEY,
  time_key INTEGER REFERENCES dim_time(time_key),
  user_key INTEGER REFERENCES dim_user(user_key),
  subscription_key INTEGER REFERENCES dim_subscription(subscription_key),
  metric_date DATE NOT NULL,
  -- Violation metrics
  violations_created INTEGER DEFAULT 0,
  violations_updated INTEGER DEFAULT 0,
  violations_deleted INTEGER DEFAULT 0,
  -- Evidence metrics
  evidence_uploaded_count INTEGER DEFAULT 0,
  evidence_uploaded_bytes BIGINT DEFAULT 0,
  voice_recordings_count INTEGER DEFAULT 0,
  voice_duration_seconds INTEGER DEFAULT 0,
  -- AI feature usage
  ai_classifications_used INTEGER DEFAULT 0,
  ai_pattern_detections_used INTEGER DEFAULT 0,
  -- Document metrics
  pdf_exports_count INTEGER DEFAULT 0,
  case_summaries_generated INTEGER DEFAULT 0,
  -- Session metrics
  sessions_count INTEGER DEFAULT 0,
  session_duration_seconds INTEGER DEFAULT 0,
  pages_viewed INTEGER DEFAULT 0,
  -- API metrics
  api_calls_count INTEGER DEFAULT 0,
  api_errors_count INTEGER DEFAULT 0,
  -- Storage metrics
  storage_used_bytes BIGINT DEFAULT 0,
  storage_limit_bytes BIGINT DEFAULT 0,
  storage_utilization_pct DECIMAL(5,2),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_key, metric_date)
);

-- Evidence usage fact table
CREATE TABLE IF NOT EXISTS fact_evidence_usage (
  evidence_fact_id SERIAL PRIMARY KEY,
  time_key INTEGER REFERENCES dim_time(time_key),
  user_key INTEGER REFERENCES dim_user(user_key),
  violation_key INTEGER,
  evidence_type_key INTEGER REFERENCES dim_evidence_type(evidence_type_key),
  evidence_id INTEGER NOT NULL,
  file_size_bytes BIGINT,
  duration_seconds INTEGER,
  is_ai_processed BOOLEAN DEFAULT FALSE,
  ai_confidence_score DECIMAL(5,4),
  transcription_word_count INTEGER,
  upload_timestamp TIMESTAMP,
  processed_timestamp TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- QuickBooks sync fact table
CREATE TABLE IF NOT EXISTS fact_quickbooks_sync (
  sync_fact_id SERIAL PRIMARY KEY,
  time_key INTEGER REFERENCES dim_time(time_key),
  user_key INTEGER REFERENCES dim_user(user_key),
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(255),
  qb_id VARCHAR(255),
  qb_realm_id VARCHAR(255),
  sync_status VARCHAR(50),
  sync_direction VARCHAR(20),
  sync_type VARCHAR(20),
  records_processed INTEGER DEFAULT 0,
  records_created INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  duration_ms INTEGER,
  error_code VARCHAR(50),
  error_message TEXT,
  sync_timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- AGGREGATION TABLES FOR BI QUERIES
-- ============================================

-- Daily user metrics aggregate
CREATE TABLE IF NOT EXISTS agg_daily_user_metrics (
  agg_id SERIAL PRIMARY KEY,
  metric_date DATE NOT NULL,
  user_key INTEGER REFERENCES dim_user(user_key),
  subscription_tier VARCHAR(50),
  -- Counts
  total_violations INTEGER DEFAULT 0,
  total_evidence_files INTEGER DEFAULT 0,
  total_transactions INTEGER DEFAULT 0,
  -- Severity
  critical_violations INTEGER DEFAULT 0,
  high_violations INTEGER DEFAULT 0,
  medium_violations INTEGER DEFAULT 0,
  low_violations INTEGER DEFAULT 0,
  -- Financial
  total_assets_cents BIGINT DEFAULT 0,
  total_debts_cents BIGINT DEFAULT 0,
  total_income_cents BIGINT DEFAULT 0,
  total_expenses_cents BIGINT DEFAULT 0,
  -- Usage
  storage_used_bytes BIGINT DEFAULT 0,
  ai_features_used INTEGER DEFAULT 0,
  pdf_exports INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(metric_date, user_key)
);

-- Weekly cohort metrics aggregate
CREATE TABLE IF NOT EXISTS agg_weekly_cohort_metrics (
  agg_id SERIAL PRIMARY KEY,
  cohort_week DATE NOT NULL,
  weeks_since_signup INTEGER NOT NULL,
  subscription_tier VARCHAR(50),
  -- Cohort stats
  cohort_size INTEGER DEFAULT 0,
  active_users INTEGER DEFAULT 0,
  churned_users INTEGER DEFAULT 0,
  upgraded_users INTEGER DEFAULT 0,
  downgraded_users INTEGER DEFAULT 0,
  -- Retention
  retention_rate DECIMAL(5,4),
  churn_rate DECIMAL(5,4),
  -- Revenue
  mrr_cents BIGINT DEFAULT 0,
  arr_cents BIGINT DEFAULT 0,
  arpu_cents INTEGER DEFAULT 0,
  -- Engagement
  avg_violations_per_user DECIMAL(10,2),
  avg_evidence_per_user DECIMAL(10,2),
  avg_session_duration_seconds INTEGER,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(cohort_week, weeks_since_signup, subscription_tier)
);

-- Monthly revenue aggregate
CREATE TABLE IF NOT EXISTS agg_monthly_revenue (
  agg_id SERIAL PRIMARY KEY,
  revenue_month DATE NOT NULL,
  subscription_tier VARCHAR(50),
  geography_key INTEGER REFERENCES dim_geography(geography_key),
  -- User counts
  total_subscribers INTEGER DEFAULT 0,
  new_subscribers INTEGER DEFAULT 0,
  churned_subscribers INTEGER DEFAULT 0,
  reactivated_subscribers INTEGER DEFAULT 0,
  -- Revenue
  gross_revenue_cents BIGINT DEFAULT 0,
  refunds_cents BIGINT DEFAULT 0,
  discounts_cents BIGINT DEFAULT 0,
  net_revenue_cents BIGINT DEFAULT 0,
  -- MRR/ARR
  beginning_mrr_cents BIGINT DEFAULT 0,
  new_mrr_cents BIGINT DEFAULT 0,
  expansion_mrr_cents BIGINT DEFAULT 0,
  contraction_mrr_cents BIGINT DEFAULT 0,
  churned_mrr_cents BIGINT DEFAULT 0,
  ending_mrr_cents BIGINT DEFAULT 0,
  -- Metrics
  ltv_cents BIGINT DEFAULT 0,
  cac_cents BIGINT DEFAULT 0,
  ltv_cac_ratio DECIMAL(10,2),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(revenue_month, subscription_tier, geography_key)
);

-- Tier upgrade/downgrade summary aggregate
CREATE TABLE IF NOT EXISTS agg_tier_transitions (
  agg_id SERIAL PRIMARY KEY,
  transition_month DATE NOT NULL,
  from_tier VARCHAR(50),
  to_tier VARCHAR(50),
  transition_type VARCHAR(20),
  -- Counts
  transition_count INTEGER DEFAULT 0,
  -- Revenue impact
  mrr_impact_cents BIGINT DEFAULT 0,
  -- Timing
  avg_days_before_transition INTEGER,
  median_days_before_transition INTEGER,
  -- Triggers
  triggered_by_limit_reached INTEGER DEFAULT 0,
  triggered_by_feature_request INTEGER DEFAULT 0,
  triggered_by_price_concern INTEGER DEFAULT 0,
  triggered_by_support_issue INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(transition_month, from_tier, to_tier)
);

-- Feature usage by tier aggregate
CREATE TABLE IF NOT EXISTS agg_feature_usage_by_tier (
  agg_id SERIAL PRIMARY KEY,
  usage_month DATE NOT NULL,
  subscription_tier VARCHAR(50) NOT NULL,
  feature_name VARCHAR(100) NOT NULL,
  -- Usage stats
  total_users INTEGER DEFAULT 0,
  users_who_used INTEGER DEFAULT 0,
  usage_rate DECIMAL(5,4),
  total_uses INTEGER DEFAULT 0,
  avg_uses_per_user DECIMAL(10,2),
  -- Limit analysis
  users_at_limit INTEGER DEFAULT 0,
  users_near_limit INTEGER DEFAULT 0,
  upgrade_conversion_rate DECIMAL(5,4),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(usage_month, subscription_tier, feature_name)
);

-- Violation patterns aggregate (for case building)
CREATE TABLE IF NOT EXISTS agg_violation_patterns (
  agg_id SERIAL PRIMARY KEY,
  user_key INTEGER REFERENCES dim_user(user_key),
  analysis_month DATE NOT NULL,
  -- Pattern detection
  primary_violation_category VARCHAR(100),
  secondary_violation_category VARCHAR(100),
  violation_frequency VARCHAR(20),
  avg_severity_score DECIMAL(5,2),
  max_severity_score INTEGER,
  -- Timing patterns
  most_common_day_of_week INTEGER,
  most_common_hour INTEGER,
  avg_days_between_violations DECIMAL(10,2),
  -- Evidence strength
  evidence_strength_score DECIMAL(5,2),
  avg_evidence_per_violation DECIMAL(5,2),
  has_audio_evidence BOOLEAN DEFAULT FALSE,
  has_video_evidence BOOLEAN DEFAULT FALSE,
  -- Legal readiness
  court_ready_violations INTEGER DEFAULT 0,
  needs_review_violations INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_key, analysis_month)
);

-- ============================================
-- ETL CONTROL TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS etl_job_log (
  job_id SERIAL PRIMARY KEY,
  job_name VARCHAR(100) NOT NULL,
  job_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  rows_extracted INTEGER DEFAULT 0,
  rows_transformed INTEGER DEFAULT 0,
  rows_loaded INTEGER DEFAULT 0,
  rows_rejected INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB
);

CREATE TABLE IF NOT EXISTS etl_data_quality_log (
  quality_id SERIAL PRIMARY KEY,
  job_id INTEGER REFERENCES etl_job_log(job_id),
  check_name VARCHAR(100) NOT NULL,
  check_type VARCHAR(50) NOT NULL,
  table_name VARCHAR(100),
  column_name VARCHAR(100),
  expected_value TEXT,
  actual_value TEXT,
  passed BOOLEAN NOT NULL,
  severity VARCHAR(20) DEFAULT 'warning',
  checked_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS etl_watermark (
  watermark_id SERIAL PRIMARY KEY,
  table_name VARCHAR(100) NOT NULL UNIQUE,
  last_extracted_at TIMESTAMP,
  last_extracted_id VARCHAR(255),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Aggregation job tracking
CREATE TABLE IF NOT EXISTS etl_aggregation_log (
  agg_job_id SERIAL PRIMARY KEY,
  aggregation_name VARCHAR(100) NOT NULL,
  target_table VARCHAR(100) NOT NULL,
  period_start DATE,
  period_end DATE,
  rows_aggregated INTEGER DEFAULT 0,
  execution_time_ms INTEGER,
  status VARCHAR(20) DEFAULT 'running',
  error_message TEXT,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Fact table indexes
CREATE INDEX IF NOT EXISTS idx_fact_violation_time ON fact_violation(time_key);
CREATE INDEX IF NOT EXISTS idx_fact_violation_user ON fact_violation(user_key);
CREATE INDEX IF NOT EXISTS idx_fact_violation_category ON fact_violation(category_key);
CREATE INDEX IF NOT EXISTS idx_fact_violation_geo ON fact_violation(geography_key);
CREATE INDEX IF NOT EXISTS idx_fact_violation_date ON fact_violation(violation_date);

CREATE INDEX IF NOT EXISTS idx_fact_financial_time ON fact_financial_transaction(time_key);
CREATE INDEX IF NOT EXISTS idx_fact_financial_user ON fact_financial_transaction(user_key);
CREATE INDEX IF NOT EXISTS idx_fact_financial_type ON fact_financial_transaction(transaction_type);
CREATE INDEX IF NOT EXISTS idx_fact_financial_date ON fact_financial_transaction(transaction_date);

CREATE INDEX IF NOT EXISTS idx_fact_billing_time ON fact_billing_event(time_key);
CREATE INDEX IF NOT EXISTS idx_fact_billing_user ON fact_billing_event(user_key);
CREATE INDEX IF NOT EXISTS idx_fact_billing_sub ON fact_billing_event(subscription_key);
CREATE INDEX IF NOT EXISTS idx_fact_billing_type ON fact_billing_event(event_type);

CREATE INDEX IF NOT EXISTS idx_fact_usage_date ON fact_usage_metric(metric_date);
CREATE INDEX IF NOT EXISTS idx_fact_usage_user ON fact_usage_metric(user_key);

-- Dimension table indexes
CREATE INDEX IF NOT EXISTS idx_dim_time_date ON dim_time(full_date);
CREATE INDEX IF NOT EXISTS idx_dim_time_year_month ON dim_time(year, month);
CREATE INDEX IF NOT EXISTS idx_dim_user_current ON dim_user(user_id) WHERE is_current = TRUE;
CREATE INDEX IF NOT EXISTS idx_dim_user_tier ON dim_user(subscription_tier) WHERE is_current = TRUE;
CREATE INDEX IF NOT EXISTS idx_dim_tier_history_user ON dim_user_tier_history(user_id);
CREATE INDEX IF NOT EXISTS idx_dim_geo_state ON dim_geography(state_code);

-- Aggregation table indexes
CREATE INDEX IF NOT EXISTS idx_agg_daily_date ON agg_daily_user_metrics(metric_date);
CREATE INDEX IF NOT EXISTS idx_agg_cohort_week ON agg_weekly_cohort_metrics(cohort_week);
CREATE INDEX IF NOT EXISTS idx_agg_revenue_month ON agg_monthly_revenue(revenue_month);
CREATE INDEX IF NOT EXISTS idx_agg_transitions_month ON agg_tier_transitions(transition_month);

-- ETL indexes
CREATE INDEX IF NOT EXISTS idx_etl_job_status ON etl_job_log(status, started_at);
CREATE INDEX IF NOT EXISTS idx_etl_agg_status ON etl_aggregation_log(status, started_at);

-- ============================================
-- SEED DIMENSION DATA
-- ============================================

-- Subscription tiers
INSERT INTO dim_subscription (tier_name, tier_display_name, monthly_price_cents, annual_price_cents, max_cases, max_violations_per_month, max_file_size_mb, max_storage_mb, max_team_members, max_voice_minutes, max_media_uploads, has_ai_features, has_voice_transcription, has_team_features, has_api_access, has_priority_support, has_custom_branding)
VALUES 
  ('free', 'Free', 0, 0, 1, 10, 10, 100, 1, 0, 5, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
  ('individual', 'Individual', 1200, 12000, 1, 20, 50, 500, 1, 30, 20, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE),
  ('pro', 'Professional', 4900, 49000, -1, 50, 100, 2048, 1, 120, 50, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE),
  ('team', 'Team', 14900, 149000, -1, -1, 250, 10240, 10, 300, -1, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE),
  ('enterprise', 'Enterprise', 39900, 399000, -1, -1, 500, -1, -1, -1, -1, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE)
ON CONFLICT DO NOTHING;

-- Violation categories
INSERT INTO dim_violation_category (category_name, category_group, severity_level, severity_weight, legal_classification, recommended_action)
VALUES
  ('Financial Hiding', 'Financial', 'high', 8, 'Asset Concealment', 'Document with bank statements'),
  ('Income Concealment', 'Financial', 'high', 8, 'Fraud', 'Request forensic accounting'),
  ('Custody Violation', 'Custody', 'critical', 10, 'Parenting Order Violation', 'File motion immediately'),
  ('Visitation Interference', 'Custody', 'critical', 10, 'Custody Interference', 'Document and notify attorney'),
  ('Communication Harassment', 'Communication', 'medium', 5, 'Harassment', 'Save all messages'),
  ('Threatening Behavior', 'Safety', 'critical', 10, 'Domestic Violence', 'Contact authorities'),
  ('Property Damage', 'Property', 'high', 7, 'Property Violation', 'Document with photos'),
  ('Support Non-Payment', 'Financial', 'high', 8, 'Support Order Violation', 'File contempt motion'),
  ('Unauthorized Access', 'Privacy', 'medium', 6, 'Privacy Violation', 'Change passwords'),
  ('Other', 'General', 'low', 2, 'General Violation', 'Document and consult attorney')
ON CONFLICT DO NOTHING;

-- Evidence types
INSERT INTO dim_evidence_type (type_name, mime_type_pattern, is_audio, is_video, is_image, is_document, legal_admissibility_score, retention_days)
VALUES
  ('Audio Recording', 'audio/%', TRUE, FALSE, FALSE, FALSE, 8, 730),
  ('Video Recording', 'video/%', FALSE, TRUE, FALSE, FALSE, 9, 730),
  ('Photo', 'image/%', FALSE, FALSE, TRUE, FALSE, 7, 730),
  ('PDF Document', 'application/pdf', FALSE, FALSE, FALSE, TRUE, 9, 1095),
  ('Text Message Screenshot', 'image/%', FALSE, FALSE, TRUE, FALSE, 8, 730),
  ('Email Export', 'message/%', FALSE, FALSE, FALSE, TRUE, 8, 1095),
  ('Bank Statement', 'application/pdf', FALSE, FALSE, FALSE, TRUE, 10, 2555),
  ('Court Document', 'application/pdf', FALSE, FALSE, FALSE, TRUE, 10, 2555)
ON CONFLICT DO NOTHING;

-- Case statuses
INSERT INTO dim_case_status (status_name, status_category, is_active, is_terminal, display_order)
VALUES
  ('Active', 'Open', TRUE, FALSE, 1),
  ('Pending Filing', 'Open', TRUE, FALSE, 2),
  ('In Discovery', 'Open', TRUE, FALSE, 3),
  ('Mediation', 'Open', TRUE, FALSE, 4),
  ('Trial Scheduled', 'Open', TRUE, FALSE, 5),
  ('Settled', 'Closed', FALSE, TRUE, 6),
  ('Dismissed', 'Closed', FALSE, TRUE, 7),
  ('Finalized', 'Closed', FALSE, TRUE, 8),
  ('Appealed', 'Open', TRUE, FALSE, 9)
ON CONFLICT DO NOTHING;

-- US States for geography (community property states marked)
INSERT INTO dim_geography (country_code, country_name, state_code, state_province, is_community_property_state)
VALUES
  ('USA', 'United States', 'AZ', 'Arizona', TRUE),
  ('USA', 'United States', 'CA', 'California', TRUE),
  ('USA', 'United States', 'ID', 'Idaho', TRUE),
  ('USA', 'United States', 'LA', 'Louisiana', TRUE),
  ('USA', 'United States', 'NV', 'Nevada', TRUE),
  ('USA', 'United States', 'NM', 'New Mexico', TRUE),
  ('USA', 'United States', 'TX', 'Texas', TRUE),
  ('USA', 'United States', 'WA', 'Washington', TRUE),
  ('USA', 'United States', 'WI', 'Wisconsin', TRUE),
  ('USA', 'United States', 'NY', 'New York', FALSE),
  ('USA', 'United States', 'FL', 'Florida', FALSE),
  ('USA', 'United States', 'IL', 'Illinois', FALSE),
  ('USA', 'United States', 'PA', 'Pennsylvania', FALSE),
  ('USA', 'United States', 'OH', 'Ohio', FALSE),
  ('USA', 'United States', 'GA', 'Georgia', FALSE),
  ('USA', 'United States', 'NC', 'North Carolina', FALSE),
  ('USA', 'United States', 'MI', 'Michigan', FALSE),
  ('USA', 'United States', 'NJ', 'New Jersey', FALSE),
  ('USA', 'United States', 'VA', 'Virginia', FALSE),
  ('USA', 'United States', 'MA', 'Massachusetts', FALSE)
ON CONFLICT DO NOTHING;

-- ============================================
-- TIME DIMENSION POPULATION FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION populate_dim_time(start_date DATE, end_date DATE)
RETURNS INTEGER AS $$
DECLARE
  curr_date DATE;
  rows_inserted INTEGER := 0;
BEGIN
  curr_date := start_date;
  
  WHILE curr_date <= end_date LOOP
    INSERT INTO dim_time (
      full_date, day_of_week, day_name, day_of_month, day_of_year,
      week_of_year, month, month_name, quarter, quarter_name, year,
      fiscal_year, fiscal_quarter, is_weekend, is_month_start, is_month_end,
      is_quarter_start, is_quarter_end, is_year_start, is_year_end
    )
    VALUES (
      curr_date,
      EXTRACT(DOW FROM curr_date),
      TO_CHAR(curr_date, 'Day'),
      EXTRACT(DAY FROM curr_date),
      EXTRACT(DOY FROM curr_date),
      EXTRACT(WEEK FROM curr_date),
      EXTRACT(MONTH FROM curr_date),
      TO_CHAR(curr_date, 'Month'),
      EXTRACT(QUARTER FROM curr_date),
      'Q' || EXTRACT(QUARTER FROM curr_date),
      EXTRACT(YEAR FROM curr_date),
      CASE WHEN EXTRACT(MONTH FROM curr_date) >= 7 
           THEN EXTRACT(YEAR FROM curr_date) + 1 
           ELSE EXTRACT(YEAR FROM curr_date) END,
      CASE WHEN EXTRACT(MONTH FROM curr_date) >= 7 
           THEN EXTRACT(QUARTER FROM curr_date) - 2 
           ELSE EXTRACT(QUARTER FROM curr_date) + 2 END,
      EXTRACT(DOW FROM curr_date) IN (0, 6),
      curr_date = DATE_TRUNC('month', curr_date),
      curr_date = (DATE_TRUNC('month', curr_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE,
      curr_date = DATE_TRUNC('quarter', curr_date),
      curr_date = (DATE_TRUNC('quarter', curr_date) + INTERVAL '3 months' - INTERVAL '1 day')::DATE,
      curr_date = DATE_TRUNC('year', curr_date),
      curr_date = (DATE_TRUNC('year', curr_date) + INTERVAL '1 year' - INTERVAL '1 day')::DATE
    )
    ON CONFLICT (full_date) DO NOTHING;
    
    rows_inserted := rows_inserted + 1;
    curr_date := curr_date + INTERVAL '1 day';
  END LOOP;
  
  RETURN rows_inserted;
END;
$$ LANGUAGE plpgsql;

-- Populate time dimension for 2024-2030
SELECT populate_dim_time('2024-01-01', '2030-12-31');

-- ============================================
-- SCD TYPE 2 UPDATE FUNCTION FOR USERS
-- ============================================

CREATE OR REPLACE FUNCTION update_user_dimension_scd2(
  p_user_id VARCHAR,
  p_email VARCHAR,
  p_name VARCHAR,
  p_subscription_tier VARCHAR,
  p_stripe_customer_id VARCHAR
)
RETURNS INTEGER AS $$
DECLARE
  v_current_key INTEGER;
  v_current_tier VARCHAR;
  v_new_key INTEGER;
BEGIN
  -- Get current record
  SELECT user_key, subscription_tier INTO v_current_key, v_current_tier
  FROM dim_user
  WHERE user_id = p_user_id AND is_current = TRUE;
  
  IF v_current_key IS NULL THEN
    -- Insert new user
    INSERT INTO dim_user (user_id, email, name, subscription_tier, stripe_customer_id, created_at)
    VALUES (p_user_id, p_email, p_name, p_subscription_tier, p_stripe_customer_id, NOW())
    RETURNING user_key INTO v_new_key;
    
    RETURN v_new_key;
  ELSIF v_current_tier != p_subscription_tier THEN
    -- Tier changed - close current record and insert new
    UPDATE dim_user
    SET effective_to = NOW(), is_current = FALSE
    WHERE user_key = v_current_key;
    
    INSERT INTO dim_user (user_id, email, name, subscription_tier, stripe_customer_id, created_at, version)
    SELECT user_id, p_email, p_name, p_subscription_tier, p_stripe_customer_id, created_at, version + 1
    FROM dim_user WHERE user_key = v_current_key
    RETURNING user_key INTO v_new_key;
    
    -- Track tier history
    INSERT INTO dim_user_tier_history (
      user_id, user_key, previous_tier, new_tier, change_reason, changed_at, effective_from,
      is_upgrade, is_downgrade, days_in_previous_tier
    )
    SELECT 
      p_user_id, v_new_key, v_current_tier, p_subscription_tier, 'tier_change', NOW(), NOW(),
      CASE WHEN p_subscription_tier IN ('individual', 'pro', 'team', 'enterprise') 
           AND v_current_tier = 'free' THEN TRUE
           WHEN p_subscription_tier IN ('pro', 'team', 'enterprise') 
           AND v_current_tier = 'individual' THEN TRUE
           ELSE FALSE END,
      CASE WHEN v_current_tier IN ('individual', 'pro', 'team', 'enterprise') 
           AND p_subscription_tier = 'free' THEN TRUE
           ELSE FALSE END,
      EXTRACT(DAY FROM NOW() - effective_from)
    FROM dim_user WHERE user_key = v_current_key;
    
    RETURN v_new_key;
  ELSE
    -- Update non-key attributes
    UPDATE dim_user
    SET email = p_email, name = p_name, stripe_customer_id = p_stripe_customer_id
    WHERE user_key = v_current_key;
    
    RETURN v_current_key;
  END IF;
END;
$$ LANGUAGE plpgsql;
