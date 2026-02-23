--
-- PostgreSQL database dump
--

\restrict ns7Gaxyf7Eb0AP5oq79DOkIqsOCs4MYPWeOg6dtrGNXnkTG7KTa7ca5I8u3QtMj

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: stripe; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA stripe;


--
-- Name: invoice_status; Type: TYPE; Schema: stripe; Owner: -
--

CREATE TYPE stripe.invoice_status AS ENUM (
    'draft',
    'open',
    'paid',
    'uncollectible',
    'void',
    'deleted'
);


--
-- Name: pricing_tiers; Type: TYPE; Schema: stripe; Owner: -
--

CREATE TYPE stripe.pricing_tiers AS ENUM (
    'graduated',
    'volume'
);


--
-- Name: pricing_type; Type: TYPE; Schema: stripe; Owner: -
--

CREATE TYPE stripe.pricing_type AS ENUM (
    'one_time',
    'recurring'
);


--
-- Name: subscription_schedule_status; Type: TYPE; Schema: stripe; Owner: -
--

CREATE TYPE stripe.subscription_schedule_status AS ENUM (
    'not_started',
    'active',
    'completed',
    'released',
    'canceled'
);


--
-- Name: subscription_status; Type: TYPE; Schema: stripe; Owner: -
--

CREATE TYPE stripe.subscription_status AS ENUM (
    'trialing',
    'active',
    'canceled',
    'incomplete',
    'incomplete_expired',
    'past_due',
    'unpaid',
    'paused'
);


--
-- Name: commit_offset(character varying, character varying, bigint, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.commit_offset(p_consumer_group character varying, p_topic character varying, p_offset bigint, p_partition_key character varying DEFAULT '_default'::character varying) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO event_consumer_offsets (consumer_group, topic, partition_key, last_offset, last_processed_at)
  VALUES (p_consumer_group, p_topic, p_partition_key, p_offset, NOW())
  ON CONFLICT (consumer_group, topic, partition_key) 
  DO UPDATE SET 
    last_offset = EXCLUDED.last_offset,
    last_processed_at = NOW();
END;
$$;


--
-- Name: get_pending_events(character varying, character varying, integer, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_pending_events(p_consumer_group character varying, p_topic character varying, p_limit integer DEFAULT 100, p_partition_key character varying DEFAULT NULL::character varying) RETURNS TABLE(event_id bigint, event_type character varying, topic character varying, partition_key character varying, payload jsonb, metadata jsonb, sequence_number bigint, correlation_id character varying, created_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: process_outbox(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_outbox() RETURNS integer
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: publish_event(character varying, character varying, jsonb, character varying, character varying, character varying, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.publish_event(p_event_type character varying, p_topic character varying, p_payload jsonb, p_partition_key character varying DEFAULT NULL::character varying, p_correlation_id character varying DEFAULT NULL::character varying, p_causation_id character varying DEFAULT NULL::character varying, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new._updated_at = now();
  return NEW;
end;
$$;


--
-- Name: set_updated_at_metadata(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at_metadata() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return NEW;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_mfa_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_mfa_challenges (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    code_hash text NOT NULL,
    phone_number text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    verified_at timestamp without time zone
);


--
-- Name: alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alerts (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    type text NOT NULL,
    severity text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    is_read boolean DEFAULT false,
    environment text DEFAULT 'demo'::text NOT NULL
);


--
-- Name: assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assets (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    value integer NOT NULL,
    ownership text NOT NULL,
    verified boolean DEFAULT false,
    environment text DEFAULT 'demo'::text NOT NULL,
    vendor text,
    document_id character varying,
    acquired_date text
);


--
-- Name: audit_trail; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_trail (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying,
    session_id character varying,
    action character varying(50) NOT NULL,
    resource_type character varying(50) NOT NULL,
    resource_id character varying,
    table_name character varying(100),
    old_values jsonb,
    new_values jsonb,
    changed_fields text[],
    ip_address character varying(45),
    user_agent text,
    request_path character varying(500),
    request_method character varying(10),
    response_status integer,
    duration_ms integer,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: auth_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_sessions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    device_id character varying,
    refresh_token_hash text NOT NULL,
    ip_address text,
    ip_history jsonb,
    user_agent text,
    is_remember_me boolean DEFAULT false NOT NULL,
    mfa_verified boolean DEFAULT false NOT NULL,
    mfa_verified_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    last_activity_at timestamp without time zone DEFAULT now() NOT NULL,
    revoked_at timestamp without time zone,
    revoked_reason text
);


--
-- Name: billing_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_records (
    id character varying NOT NULL,
    user_id character varying NOT NULL,
    tier character varying(50) NOT NULL,
    period_start timestamp without time zone NOT NULL,
    period_end timestamp without time zone NOT NULL,
    violations_recorded integer DEFAULT 0,
    storage_used_mb real DEFAULT 0,
    amount_cents integer DEFAULT 0,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    stripe_invoice_id character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: business_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_metrics (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    display_name character varying(150) NOT NULL,
    description text,
    category character varying(50) NOT NULL,
    formula text NOT NULL,
    sql_query text,
    unit character varying(30),
    aggregation_type character varying(30),
    dimensions text[],
    data_source character varying(100),
    refresh_frequency character varying(30),
    owner character varying(100),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: calendar_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_events (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    title text NOT NULL,
    description text,
    event_type text NOT NULL,
    start_date timestamp without time zone NOT NULL,
    end_date timestamp without time zone,
    all_day boolean DEFAULT false,
    location text,
    reminder boolean DEFAULT true,
    reminder_minutes integer DEFAULT 60,
    is_recurring boolean DEFAULT false,
    recurring_pattern text,
    status text DEFAULT 'scheduled'::text NOT NULL,
    environment text DEFAULT 'demo'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cases (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    title text NOT NULL,
    case_number text,
    court text,
    opposing_party text,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    environment text DEFAULT 'demo'::text NOT NULL
);


--
-- Name: chain_of_custody; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chain_of_custody (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    evidence_id character varying NOT NULL,
    user_id character varying NOT NULL,
    action text NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    ip_address text,
    user_agent text,
    previous_hash text,
    entry_hash text,
    environment text DEFAULT 'demo'::text NOT NULL
);


--
-- Name: child_support_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.child_support_payments (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    payment_type text NOT NULL,
    amount integer NOT NULL,
    due_date timestamp without time zone NOT NULL,
    paid_date timestamp without time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    payment_method text,
    reference_number text,
    notes text,
    child_name text,
    court_order_id character varying,
    environment text DEFAULT 'demo'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: consent_purposes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consent_purposes (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    description text NOT NULL,
    lawful_basis character varying(50) NOT NULL,
    is_required boolean DEFAULT false,
    data_categories text[],
    retention_period_days integer,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: conversation_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_messages (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    conversation_id character varying NOT NULL,
    sender_id character varying NOT NULL,
    sender_email text NOT NULL,
    sender_name text NOT NULL,
    content text NOT NULL,
    input_type text DEFAULT 'text'::text NOT NULL,
    voice_transcription text,
    sentiment_score real,
    sentiment_label text,
    has_negative_content boolean DEFAULT false,
    negative_topics text[],
    is_edited boolean DEFAULT false NOT NULL,
    edited_at timestamp without time zone,
    is_deleted boolean DEFAULT false NOT NULL,
    deleted_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: conversation_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_participants (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    conversation_id character varying NOT NULL,
    user_id character varying,
    email text NOT NULL,
    display_name text NOT NULL,
    role text DEFAULT 'party'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    joined_at timestamp without time zone DEFAULT now() NOT NULL,
    left_at timestamp without time zone
);


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    creator_user_id character varying NOT NULL,
    environment text DEFAULT 'demo'::text NOT NULL,
    title text,
    type text DEFAULT 'direct'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: data_classifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_classifications (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name character varying(50) NOT NULL,
    level integer NOT NULL,
    description text,
    handling_requirements text,
    encryption_required boolean DEFAULT false,
    masking_required boolean DEFAULT false,
    audit_required boolean DEFAULT true,
    retention_days integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: data_lineage_edges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_lineage_edges (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    source_node_id character varying NOT NULL,
    target_node_id character varying NOT NULL,
    transformation_type character varying(50),
    transformation_logic text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: data_lineage_nodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_lineage_nodes (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    node_type character varying(30) NOT NULL,
    entity_name character varying(200) NOT NULL,
    entity_type character varying(50) NOT NULL,
    description text,
    metadata jsonb,
    source_id character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: data_lineage_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_lineage_sources (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    source_type character varying(50) NOT NULL,
    connection_details jsonb,
    schema_info jsonb,
    refresh_schedule character varying(50),
    last_refreshed_at timestamp without time zone,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: data_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_profiles (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    run_id character varying NOT NULL,
    table_name text NOT NULL,
    column_name text NOT NULL,
    data_type character varying(50),
    total_count integer DEFAULT 0,
    null_count integer DEFAULT 0,
    unique_count integer DEFAULT 0,
    min_value text,
    max_value text,
    mean_value real,
    std_dev_value real,
    percentiles jsonb,
    top_values jsonb,
    profiled_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: data_quality_test_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_quality_test_runs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    test_id character varying NOT NULL,
    status character varying(20) NOT NULL,
    actual_result text,
    passed boolean,
    error_message text,
    records_checked integer,
    failed_records integer,
    execution_time_ms integer,
    executed_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: data_quality_tests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_quality_tests (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    test_type character varying(50) NOT NULL,
    table_name character varying(100) NOT NULL,
    column_name character varying(100),
    test_query text NOT NULL,
    expected_result text,
    threshold real,
    severity character varying(20) NOT NULL,
    schedule character varying(50),
    is_active boolean DEFAULT true,
    last_run_at timestamp without time zone,
    last_run_status character varying(20),
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: data_subject_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_subject_requests (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    request_type character varying(30) NOT NULL,
    status character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    regulation_type character varying(20) NOT NULL,
    request_details jsonb,
    verification_method character varying(50),
    verified_at timestamp without time zone,
    deadline_at timestamp without time zone NOT NULL,
    processed_at timestamp without time zone,
    processed_by character varying,
    fulfillment_log jsonb,
    export_file_url text,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: debts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.debts (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    amount integer NOT NULL,
    ownership text NOT NULL,
    monthly_payment integer,
    environment text DEFAULT 'demo'::text NOT NULL,
    vendor text,
    document_id character varying,
    opened_date text
);


--
-- Name: demo_meta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.demo_meta (
    id integer NOT NULL,
    last_reset_at timestamp without time zone NOT NULL
);


--
-- Name: dim_date; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dim_date (
    date_id integer NOT NULL,
    date_actual date NOT NULL,
    year integer NOT NULL,
    quarter integer NOT NULL,
    month integer NOT NULL,
    day_of_month integer NOT NULL,
    day_of_week integer NOT NULL,
    is_weekend boolean DEFAULT false,
    is_holiday boolean DEFAULT false,
    week_of_year integer,
    month_name character varying(20),
    day_name character varying(20)
);


--
-- Name: dim_subscription; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dim_subscription (
    subscription_id character varying NOT NULL,
    user_id character varying NOT NULL,
    tier_id character varying NOT NULL,
    status character varying(30) NOT NULL,
    start_date_id integer,
    end_date_id integer,
    billing_cycle character varying(20),
    price_at_subscription integer,
    dbt_valid_from timestamp without time zone DEFAULT now() NOT NULL,
    dbt_valid_to timestamp without time zone,
    is_current boolean DEFAULT true
);


--
-- Name: dim_tier; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dim_tier (
    tier_id character varying NOT NULL,
    tier_name character varying(50) NOT NULL,
    price_usd_monthly integer NOT NULL,
    api_limit_daily integer,
    storage_gb integer,
    max_cases integer,
    max_violations_per_month integer,
    ai_features boolean DEFAULT false,
    priority_support boolean DEFAULT false,
    effective_from timestamp without time zone DEFAULT now() NOT NULL,
    effective_to timestamp without time zone
);


--
-- Name: dim_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dim_users (
    user_id character varying NOT NULL,
    user_name character varying(200),
    email character varying(255),
    current_tier character varying(50),
    tier_start_date timestamp without time zone,
    is_active boolean DEFAULT true,
    created_date_id integer,
    dbt_valid_from timestamp without time zone DEFAULT now() NOT NULL,
    dbt_valid_to timestamp without time zone,
    is_current boolean DEFAULT true
);


--
-- Name: document_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_line_items (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    document_id character varying NOT NULL,
    user_id character varying NOT NULL,
    line_item_index integer NOT NULL,
    label text NOT NULL,
    category_hint text,
    amount integer NOT NULL,
    amount_text text,
    is_credit_or_refund boolean DEFAULT false,
    is_recurring_guess boolean DEFAULT false,
    page_number integer,
    surrounding_text_snippet text,
    linked_record_type text,
    linked_record_id character varying,
    environment text DEFAULT 'demo'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: document_parse_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_parse_results (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    document_id character varying NOT NULL,
    user_id character varying NOT NULL,
    doc_type text NOT NULL,
    parse_status text NOT NULL,
    language text DEFAULT 'en'::text,
    currency text DEFAULT 'USD'::text,
    vendor_name text,
    account_number text,
    billing_period_start text,
    billing_period_end text,
    statement_date text,
    due_date text,
    total_amount_due integer,
    total_amount_text text,
    customer_name text,
    service_address text,
    mailing_address text,
    raw_llm_response jsonb,
    notes text[],
    request_tokens integer,
    response_tokens integer,
    latency_ms integer,
    environment text DEFAULT 'demo'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    title text NOT NULL,
    category text NOT NULL,
    description text,
    file_url text,
    file_name text,
    file_type text,
    file_size integer,
    tags text[],
    is_confidential boolean DEFAULT false,
    environment text DEFAULT 'demo'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    ai_category text,
    ai_confidence real,
    ai_summary text,
    ai_suggested_tags text[],
    ai_analysis_status text DEFAULT 'pending'::text,
    ai_analyzed_at timestamp without time zone,
    mobile_uploaded boolean DEFAULT false,
    ai_extracted_text text
);


--
-- Name: dq_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dq_alerts (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    run_id character varying,
    metric_id character varying,
    anomaly_id character varying,
    reconciliation_result_id character varying,
    alert_type character varying(50) NOT NULL,
    severity character varying(20) NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    affected_table text,
    affected_column text,
    suggested_action text,
    is_resolved boolean DEFAULT false,
    resolved_by character varying,
    resolved_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: encryption_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.encryption_keys (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    key_alias character varying(100) NOT NULL,
    key_type character varying(30) NOT NULL,
    algorithm character varying(30) NOT NULL,
    purpose character varying(100) NOT NULL,
    encrypted_key_material text,
    key_version integer DEFAULT 1 NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    rotation_schedule_days integer,
    last_rotated_at timestamp without time zone,
    expires_at timestamp without time zone,
    created_by character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: evidence_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evidence_files (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    violation_id character varying NOT NULL,
    user_id character varying NOT NULL,
    file_name text NOT NULL,
    file_type text NOT NULL,
    file_size integer NOT NULL,
    object_path text NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    device_id text,
    gps_latitude text,
    gps_longitude text,
    altitude text,
    network_type text,
    exif_data text,
    sha256_hash text,
    is_encrypted boolean DEFAULT false,
    environment text DEFAULT 'demo'::text NOT NULL,
    evidence_source text,
    evidence_metadata jsonb
);


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expenses (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    category text NOT NULL,
    description text NOT NULL,
    amount integer NOT NULL,
    frequency text NOT NULL,
    owner text NOT NULL,
    environment text DEFAULT 'demo'::text NOT NULL,
    vendor text,
    document_id character varying,
    start_date text
);


--
-- Name: fact_financial_summary; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fact_financial_summary (
    summary_id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    summary_date_id integer NOT NULL,
    case_id character varying,
    total_assets integer DEFAULT 0,
    total_debts integer DEFAULT 0,
    total_income integer DEFAULT 0,
    total_expenses integer DEFAULT 0,
    net_worth integer DEFAULT 0,
    asset_count integer DEFAULT 0,
    debt_count integer DEFAULT 0,
    income_source_count integer DEFAULT 0,
    expense_count integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: fact_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fact_transactions (
    transaction_id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    transaction_date_id integer NOT NULL,
    amount_usd integer NOT NULL,
    transaction_type character varying(30) NOT NULL,
    payment_method character varying(50),
    stripe_payment_intent_id character varying,
    subscription_id character varying,
    tier_id character varying,
    currency character varying(3) DEFAULT 'USD'::character varying,
    status character varying(30),
    refund_reason text,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: fact_usage_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fact_usage_metrics (
    metric_id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    metric_date_id integer NOT NULL,
    metric_type character varying(50) NOT NULL,
    metric_value real NOT NULL,
    unit character varying(30),
    tier_id character varying,
    quota_limit integer,
    percentage_used real,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: fact_violations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fact_violations (
    violation_id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    violation_date_id integer NOT NULL,
    violation_type character varying(50) NOT NULL,
    severity character varying(20) NOT NULL,
    case_id character varying,
    description text,
    evidence_count integer DEFAULT 0,
    is_resolved boolean DEFAULT false,
    resolved_date_id integer,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: firefly_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.firefly_connections (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    environment text DEFAULT 'demo'::text NOT NULL,
    instance_url text NOT NULL,
    access_token text NOT NULL,
    instance_version text,
    is_active boolean DEFAULT true NOT NULL,
    auto_sync_enabled boolean DEFAULT false NOT NULL,
    last_sync_at timestamp without time zone,
    last_sync_status text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: firefly_sync_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.firefly_sync_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    connection_id character varying NOT NULL,
    user_id character varying NOT NULL,
    environment text DEFAULT 'demo'::text NOT NULL,
    sync_type text NOT NULL,
    source_type text NOT NULL,
    source_id character varying NOT NULL,
    firefly_transaction_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    error_message text,
    synced_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: improvement_recommendations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.improvement_recommendations (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    input_type text NOT NULL,
    transcription text,
    media_urls text[],
    status text DEFAULT 'submitted'::text NOT NULL,
    environment text DEFAULT 'demo'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    user_email text,
    edited_title text,
    edited_body text,
    admin_notes text,
    reviewed_by text,
    reviewed_at timestamp without time zone,
    test_user_id text,
    test_user_email text,
    test_feedback text,
    test_approved boolean,
    tested_at timestamp without time zone,
    implemented_at timestamp without time zone,
    implemented_by text,
    changelog_entry text,
    changelog_translations jsonb
);


--
-- Name: incomes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incomes (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    source text NOT NULL,
    amount integer NOT NULL,
    frequency text NOT NULL,
    verified boolean DEFAULT false,
    owner text NOT NULL,
    environment text DEFAULT 'demo'::text NOT NULL,
    vendor text,
    document_id character varying,
    start_date text
);


--
-- Name: journal_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_attachments (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    journal_entry_id character varying NOT NULL,
    user_id character varying NOT NULL,
    file_name text NOT NULL,
    file_type text NOT NULL,
    file_url text NOT NULL,
    file_size_bytes integer,
    ai_description text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: journal_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_entries (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    environment text DEFAULT 'demo'::text NOT NULL,
    title text,
    content text NOT NULL,
    input_type text DEFAULT 'text'::text NOT NULL,
    voice_transcription text,
    mood text,
    tags text[],
    is_private boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: legal_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.legal_documents (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    title text NOT NULL,
    document_type text NOT NULL,
    description text,
    file_url text,
    file_name text,
    file_size integer,
    status text DEFAULT 'draft'::text NOT NULL,
    court_case text,
    filing_date timestamp without time zone,
    effective_date timestamp without time zone,
    expiration_date timestamp without time zone,
    parties text[],
    tags text[],
    environment text DEFAULT 'demo'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: message_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_attachments (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    message_id character varying NOT NULL,
    file_name text NOT NULL,
    file_type text NOT NULL,
    file_url text NOT NULL,
    file_size_bytes integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    sender_id character varying NOT NULL,
    sender_role text NOT NULL,
    sender_name text NOT NULL,
    content text NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    is_read boolean DEFAULT false,
    attachment_url text,
    attachment_name text,
    environment text DEFAULT 'demo'::text NOT NULL
);


--
-- Name: metadata_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.metadata_catalog (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_name character varying(200) NOT NULL,
    schema_name character varying(100),
    description text,
    business_definition text,
    data_owner character varying(100),
    data_steward character varying(100),
    tags text[],
    custom_properties jsonb,
    documentation text,
    last_updated_by character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: mfa_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mfa_challenges (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    session_id character varying,
    code_hash text NOT NULL,
    channel text DEFAULT 'sms'::text NOT NULL,
    phone_number text,
    attempt_count integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    verified_at timestamp without time zone,
    last_resend_at timestamp without time zone,
    resend_count integer DEFAULT 0 NOT NULL
);


--
-- Name: mobile_violation_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mobile_violation_reports (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    title text NOT NULL,
    violation_type text NOT NULL,
    description text NOT NULL,
    severity text DEFAULT 'medium'::text NOT NULL,
    location text,
    occurred_at timestamp without time zone DEFAULT now() NOT NULL,
    related_document_ids text[],
    witnesses text[],
    status text DEFAULT 'draft'::text NOT NULL,
    environment text DEFAULT 'demo'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    submitted_at timestamp without time zone,
    linked_violation_id character varying
);


--
-- Name: pii_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pii_catalog (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    table_name character varying(100) NOT NULL,
    column_name character varying(100) NOT NULL,
    data_type character varying(50) NOT NULL,
    classification_id character varying NOT NULL,
    pii_type character varying(50),
    sensitivity_level character varying(20) NOT NULL,
    encryption_key_id character varying,
    masking_profile character varying(50),
    is_encrypted boolean DEFAULT false,
    sample_masked_value text,
    business_owner character varying(100),
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: quality_anomalies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quality_anomalies (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    run_id character varying,
    table_name text NOT NULL,
    column_name text,
    anomaly_type character varying(50) NOT NULL,
    severity character varying(20) NOT NULL,
    description text NOT NULL,
    expected_baseline text,
    actual_value text,
    deviation_score real,
    detected_at timestamp without time zone DEFAULT now() NOT NULL,
    is_acknowledged boolean DEFAULT false,
    acknowledged_by character varying,
    acknowledged_at timestamp without time zone
);


--
-- Name: quality_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quality_metrics (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    run_id character varying NOT NULL,
    rule_id character varying,
    check_name text NOT NULL,
    table_name text NOT NULL,
    column_name text,
    expectation_type character varying(100) NOT NULL,
    expected_value text,
    actual_value text,
    passed boolean NOT NULL,
    severity character varying(20) NOT NULL,
    message text,
    metadata jsonb,
    checked_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: quality_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quality_rules (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    rule_type character varying(50) NOT NULL,
    target_system character varying(50) NOT NULL,
    target_table text NOT NULL,
    target_column text,
    expectation_type character varying(100) NOT NULL,
    parameters jsonb,
    severity character varying(20) DEFAULT 'warning'::character varying NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: quality_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quality_runs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    run_type character varying(50) NOT NULL,
    target_system character varying(50) NOT NULL,
    status character varying(20) DEFAULT 'running'::character varying NOT NULL,
    total_checks integer DEFAULT 0,
    passed_checks integer DEFAULT 0,
    failed_checks integer DEFAULT 0,
    warning_checks integer DEFAULT 0,
    started_at timestamp without time zone DEFAULT now() NOT NULL,
    completed_at timestamp without time zone,
    metadata jsonb
);


--
-- Name: quickbooks_sync_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quickbooks_sync_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    action character varying(100) NOT NULL,
    qb_entity_type character varying(50),
    qb_entity_id character varying(50),
    request_method character varying(10),
    request_path text,
    response_status integer,
    error_message text,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: quickbooks_sync_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.quickbooks_sync_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: quickbooks_sync_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.quickbooks_sync_log_id_seq OWNED BY public.quickbooks_sync_log.id;


--
-- Name: quota_reset_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quota_reset_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    reset_at timestamp without time zone DEFAULT now() NOT NULL,
    reset_month character varying(7) NOT NULL,
    violations_count_before integer DEFAULT 0,
    voice_transcriptions_before integer DEFAULT 0,
    media_uploads_before integer DEFAULT 0
);


--
-- Name: reconciliation_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reconciliation_jobs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    job_name text NOT NULL,
    source_system character varying(50) NOT NULL,
    target_system character varying(50) NOT NULL,
    reconciliation_type character varying(50) NOT NULL,
    source_query text,
    target_query text,
    match_keys jsonb,
    tolerance_percent real DEFAULT 0,
    is_active boolean DEFAULT true,
    schedule character varying(50),
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: reconciliation_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reconciliation_results (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    job_id character varying NOT NULL,
    run_id character varying NOT NULL,
    status character varying(20) NOT NULL,
    source_count integer,
    target_count integer,
    matched_count integer,
    mismatched_count integer,
    source_sum real,
    target_sum real,
    variance real,
    variance_percent real,
    details jsonb,
    executed_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: reimbursements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reimbursements (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    category text NOT NULL,
    description text NOT NULL,
    amount integer NOT NULL,
    owed_by text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    due_date timestamp without time zone,
    notes text,
    linked_document_ids text[],
    environment text DEFAULT 'demo'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: retention_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retention_jobs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    policy_id character varying NOT NULL,
    status character varying(30) NOT NULL,
    records_processed integer DEFAULT 0,
    records_archived integer DEFAULT 0,
    records_deleted integer DEFAULT 0,
    error_message text,
    started_at timestamp without time zone DEFAULT now() NOT NULL,
    completed_at timestamp without time zone
);


--
-- Name: retention_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retention_policies (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    table_name character varying(100) NOT NULL,
    data_category character varying(50) NOT NULL,
    retention_period_days integer NOT NULL,
    archive_after_days integer,
    delete_after_days integer,
    purge_mode character varying(30) NOT NULL,
    archive_bucket character varying(200),
    legal_hold_enabled boolean DEFAULT false,
    condition_column character varying(100),
    condition_value text,
    is_active boolean DEFAULT true,
    last_executed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: scheduled_job_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduled_job_runs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    job_name text NOT NULL,
    idempotency_key text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    started_at timestamp without time zone DEFAULT now() NOT NULL,
    completed_at timestamp without time zone,
    duration_ms integer,
    result text,
    error_message text,
    app_mode text DEFAULT 'live'::text NOT NULL
);


--
-- Name: security_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.security_events (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying,
    session_id character varying,
    device_id character varying,
    event_type text NOT NULL,
    event_status text DEFAULT 'success'::text NOT NULL,
    ip_address text,
    user_agent text,
    location text,
    metadata jsonb,
    risk_score integer,
    risk_factors text[],
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: sentiment_report_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sentiment_report_items (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    report_id character varying NOT NULL,
    message_id character varying NOT NULL,
    sender_name text NOT NULL,
    sender_email text NOT NULL,
    message_content text NOT NULL,
    message_timestamp timestamp without time zone NOT NULL,
    sentiment_score real NOT NULL,
    primary_topic text NOT NULL,
    secondary_topics text[],
    ai_analysis text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: sentiment_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sentiment_reports (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    conversation_id character varying NOT NULL,
    generated_by_user_id character varying NOT NULL,
    environment text DEFAULT 'demo'::text NOT NULL,
    title text NOT NULL,
    report_type text DEFAULT 'negative_communication'::text NOT NULL,
    date_range_start timestamp without time zone,
    date_range_end timestamp without time zone,
    total_messages_analyzed integer DEFAULT 0 NOT NULL,
    negative_message_count integer DEFAULT 0 NOT NULL,
    topic_breakdown jsonb,
    participant_breakdown jsonb,
    summary text,
    recommendations text,
    pdf_url text,
    shared_with text[],
    status text DEFAULT 'generated'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: sms_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sms_deliveries (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    challenge_id character varying,
    twilio_message_sid text,
    to_phone_number text NOT NULL,
    from_phone_number text NOT NULL,
    status text DEFAULT 'sent'::text NOT NULL,
    error_code text,
    error_message text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    delivered_at timestamp without time zone
);


--
-- Name: teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teams (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    owner_id character varying NOT NULL,
    tier text DEFAULT 'team'::text NOT NULL,
    stripe_customer_id text,
    stripe_subscription_id text,
    subscription_status text DEFAULT 'active'::text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: tier_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tier_limits (
    tier character varying(20) NOT NULL,
    max_cases integer,
    max_violations_per_month integer,
    max_voice_transcriptions integer,
    max_media_uploads integer,
    ai_classification_enabled boolean DEFAULT false,
    price_monthly real DEFAULT 0
);


--
-- Name: tier_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tier_migrations (
    id character varying NOT NULL,
    user_id character varying NOT NULL,
    from_tier character varying(50) NOT NULL,
    to_tier character varying(50) NOT NULL,
    reason text NOT NULL,
    grace_period_days integer DEFAULT 0,
    migrated_at timestamp without time zone DEFAULT now() NOT NULL,
    effective_at timestamp without time zone NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL
);


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    date text NOT NULL,
    description text NOT NULL,
    amount integer NOT NULL,
    category text NOT NULL,
    type text NOT NULL,
    environment text DEFAULT 'demo'::text NOT NULL,
    vendor text,
    document_id character varying
);


--
-- Name: usage_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usage_audit (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    tier character varying(50) NOT NULL,
    violations_count integer DEFAULT 0,
    storage_used_mb real DEFAULT 0,
    media_count integer DEFAULT 0,
    active_cases integer DEFAULT 0,
    recorded_at timestamp without time zone DEFAULT now() NOT NULL,
    environment text DEFAULT 'demo'::text NOT NULL
);


--
-- Name: user_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_consents (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    purpose_id character varying NOT NULL,
    consent_given boolean NOT NULL,
    consent_method character varying(50) NOT NULL,
    ip_address character varying(45),
    user_agent text,
    consent_version character varying(20),
    expires_at timestamp without time zone,
    revoked_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: user_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_devices (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    device_fingerprint text NOT NULL,
    device_name text,
    user_agent text NOT NULL,
    platform text,
    browser text,
    is_trusted boolean DEFAULT false NOT NULL,
    is_blocked boolean DEFAULT false NOT NULL,
    first_seen_at timestamp without time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp without time zone DEFAULT now() NOT NULL,
    last_ip text,
    last_location text
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    password text NOT NULL,
    full_name text NOT NULL,
    role text DEFAULT 'client'::text NOT NULL,
    environment text DEFAULT 'demo'::text NOT NULL,
    subscription_tier text DEFAULT 'free'::text NOT NULL,
    profile_photo text,
    stripe_customer_id text,
    stripe_subscription_id text,
    subscription_status text DEFAULT 'active'::text,
    cases_count integer DEFAULT 0 NOT NULL,
    violations_count_this_month integer DEFAULT 0 NOT NULL,
    billing_cycle_start date,
    team_id character varying,
    voice_transcriptions_this_month integer DEFAULT 0 NOT NULL,
    media_uploads_this_month integer DEFAULT 0 NOT NULL,
    qb_realm_id character varying(50),
    qb_token_expires_at timestamp without time zone,
    qb_connected boolean DEFAULT false NOT NULL,
    qb_scopes text[],
    qb_company_name text,
    qb_last_sync_at timestamp without time zone,
    qb_access_token_encrypted text,
    qb_refresh_token_encrypted text,
    qb_connected_at timestamp without time zone,
    qb_api_calls_today integer DEFAULT 0 NOT NULL,
    qb_daily_reset_at text,
    qb_access_token_iv text,
    qb_access_token_auth_tag text,
    qb_refresh_token_iv text,
    qb_refresh_token_auth_tag text,
    is_admin boolean DEFAULT false NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    last_login_at timestamp without time zone,
    password_reset_token text,
    password_reset_expires timestamp without time zone,
    phone_number text,
    phone_verified_at timestamp without time zone,
    two_factor_enabled boolean DEFAULT false NOT NULL,
    two_factor_method text DEFAULT 'sms'::text
);


--
-- Name: violations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.violations (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    type text NOT NULL,
    description text NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    location text,
    media_urls text[],
    status text DEFAULT 'pending'::text NOT NULL,
    environment text DEFAULT 'demo'::text NOT NULL,
    photo_count integer DEFAULT 0,
    video_duration integer,
    witnesses text[],
    is_draft boolean DEFAULT false,
    audio_transcript text,
    audio_file_url text,
    ai_classification text,
    ai_confidence_score real,
    voice_notes text,
    media_descriptions jsonb,
    case_id character varying,
    severity_score integer DEFAULT 0
);


--
-- Name: w2_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.w2_records (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    party text NOT NULL,
    tax_year integer NOT NULL,
    employer_name text NOT NULL,
    employer_ein text,
    wages_and_tips integer NOT NULL,
    federal_withheld integer,
    social_security_wages integer,
    social_security_withheld integer,
    medicare_wages integer,
    medicare_withheld integer,
    state_wages integer,
    state_withheld integer,
    other_compensation integer DEFAULT 0,
    notes text,
    document_id character varying,
    verified boolean DEFAULT false,
    environment text DEFAULT 'demo'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: _managed_webhooks; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE stripe._managed_webhooks (
    id text NOT NULL,
    object text,
    url text NOT NULL,
    enabled_events jsonb NOT NULL,
    description text,
    enabled boolean,
    livemode boolean,
    metadata jsonb,
    secret text NOT NULL,
    status text,
    api_version text,
    created integer,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_synced_at timestamp with time zone,
    account_id text NOT NULL
);


--
-- Name: _migrations; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE stripe._migrations (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    hash character varying(40) NOT NULL,
    executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: _sync_status; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE stripe._sync_status (
    id integer NOT NULL,
    resource text NOT NULL,
    status text DEFAULT 'idle'::text,
    last_synced_at timestamp with time zone DEFAULT now(),
    last_incremental_cursor timestamp with time zone,
    error_message text,
    updated_at timestamp with time zone DEFAULT now(),
    account_id text NOT NULL,
    CONSTRAINT _sync_status_status_check CHECK ((status = ANY (ARRAY['idle'::text, 'running'::text, 'complete'::text, 'error'::text])))
);


--
-- Name: _sync_status_id_seq; Type: SEQUENCE; Schema: stripe; Owner: -
--

CREATE SEQUENCE stripe._sync_status_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: _sync_status_id_seq; Type: SEQUENCE OWNED BY; Schema: stripe; Owner: -
--

ALTER SEQUENCE stripe._sync_status_id_seq OWNED BY stripe._sync_status.id;


--
-- Name: accounts; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE stripe.accounts (
    _raw_data jsonb NOT NULL,
    first_synced_at timestamp with time zone DEFAULT now() NOT NULL,
    _last_synced_at timestamp with time zone DEFAULT now() NOT NULL,
    _updated_at timestamp with time zone DEFAULT now() NOT NULL,
    business_name text GENERATED ALWAYS AS (((_raw_data -> 'business_profile'::text) ->> 'name'::text)) STORED,
    email text GENERATED ALWAYS AS ((_raw_data ->> 'email'::text)) STORED,
    type text GENERATED ALWAYS AS ((_raw_data ->> 'type'::text)) STORED,
    charges_enabled boolean GENERATED ALWAYS AS (((_raw_data ->> 'charges_enabled'::text))::boolean) STORED,
    payouts_enabled boolean GENERATED ALWAYS AS (((_raw_data ->> 'payouts_enabled'::text))::boolean) STORED,
    details_submitted boolean GENERATED ALWAYS AS (((_raw_data ->> 'details_submitted'::text))::boolean) STORED,
    country text GENERATED ALWAYS AS ((_raw_data ->> 'country'::text)) STORED,
    default_currency text GENERATED ALWAYS AS ((_raw_data ->> 'default_currency'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    api_key_hashes text[] DEFAULT '{}'::text[],
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


--
-- Name: active_entitlements; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE stripe.active_entitlements (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    feature text GENERATED ALWAYS AS ((_raw_data ->> 'feature'::text)) STORED,
    customer text GENERATED ALWAYS AS ((_raw_data ->> 'customer'::text)) STORED,
    lookup_key text GENERATED ALWAYS AS ((_raw_data ->> 'lookup_key'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


--
-- Name: charges; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE stripe.charges (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    paid boolean GENERATED ALWAYS AS (((_raw_data ->> 'paid'::text))::boolean) STORED,
    "order" text GENERATED ALWAYS AS ((_raw_data ->> 'order'::text)) STORED,
    amount bigint GENERATED ALWAYS AS (((_raw_data ->> 'amount'::text))::bigint) STORED,
    review text GENERATED ALWAYS AS ((_raw_data ->> 'review'::text)) STORED,
    source jsonb GENERATED ALWAYS AS ((_raw_data -> 'source'::text)) STORED,
    status text GENERATED ALWAYS AS ((_raw_data ->> 'status'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    dispute text GENERATED ALWAYS AS ((_raw_data ->> 'dispute'::text)) STORED,
    invoice text GENERATED ALWAYS AS ((_raw_data ->> 'invoice'::text)) STORED,
    outcome jsonb GENERATED ALWAYS AS ((_raw_data -> 'outcome'::text)) STORED,
    refunds jsonb GENERATED ALWAYS AS ((_raw_data -> 'refunds'::text)) STORED,
    updated integer GENERATED ALWAYS AS (((_raw_data ->> 'updated'::text))::integer) STORED,
    captured boolean GENERATED ALWAYS AS (((_raw_data ->> 'captured'::text))::boolean) STORED,
    currency text GENERATED ALWAYS AS ((_raw_data ->> 'currency'::text)) STORED,
    customer text GENERATED ALWAYS AS ((_raw_data ->> 'customer'::text)) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    refunded boolean GENERATED ALWAYS AS (((_raw_data ->> 'refunded'::text))::boolean) STORED,
    shipping jsonb GENERATED ALWAYS AS ((_raw_data -> 'shipping'::text)) STORED,
    application text GENERATED ALWAYS AS ((_raw_data ->> 'application'::text)) STORED,
    description text GENERATED ALWAYS AS ((_raw_data ->> 'description'::text)) STORED,
    destination text GENERATED ALWAYS AS ((_raw_data ->> 'destination'::text)) STORED,
    failure_code text GENERATED ALWAYS AS ((_raw_data ->> 'failure_code'::text)) STORED,
    on_behalf_of text GENERATED ALWAYS AS ((_raw_data ->> 'on_behalf_of'::text)) STORED,
    fraud_details jsonb GENERATED ALWAYS AS ((_raw_data -> 'fraud_details'::text)) STORED,
    receipt_email text GENERATED ALWAYS AS ((_raw_data ->> 'receipt_email'::text)) STORED,
    payment_intent text GENERATED ALWAYS AS ((_raw_data ->> 'payment_intent'::text)) STORED,
    receipt_number text GENERATED ALWAYS AS ((_raw_data ->> 'receipt_number'::text)) STORED,
    transfer_group text GENERATED ALWAYS AS ((_raw_data ->> 'transfer_group'::text)) STORED,
    amount_refunded bigint GENERATED ALWAYS AS (((_raw_data ->> 'amount_refunded'::text))::bigint) STORED,
    application_fee text GENERATED ALWAYS AS ((_raw_data ->> 'application_fee'::text)) STORED,
    failure_message text GENERATED ALWAYS AS ((_raw_data ->> 'failure_message'::text)) STORED,
    source_transfer text GENERATED ALWAYS AS ((_raw_data ->> 'source_transfer'::text)) STORED,
    balance_transaction text GENERATED ALWAYS AS ((_raw_data ->> 'balance_transaction'::text)) STORED,
    statement_descriptor text GENERATED ALWAYS AS ((_raw_data ->> 'statement_descriptor'::text)) STORED,
    payment_method_details jsonb GENERATED ALWAYS AS ((_raw_data -> 'payment_method_details'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


--
-- Name: checkout_session_line_items; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE stripe.checkout_session_line_items (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    amount_discount integer GENERATED ALWAYS AS (((_raw_data ->> 'amount_discount'::text))::integer) STORED,
    amount_subtotal integer GENERATED ALWAYS AS (((_raw_data ->> 'amount_subtotal'::text))::integer) STORED,
    amount_tax integer GENERATED ALWAYS AS (((_raw_data ->> 'amount_tax'::text))::integer) STORED,
    amount_total integer GENERATED ALWAYS AS (((_raw_data ->> 'amount_total'::text))::integer) STORED,
    currency text GENERATED ALWAYS AS ((_raw_data ->> 'currency'::text)) STORED,
    description text GENERATED ALWAYS AS ((_raw_data ->> 'description'::text)) STORED,
    price text GENERATED ALWAYS AS ((_raw_data ->> 'price'::text)) STORED,
    quantity integer GENERATED ALWAYS AS (((_raw_data ->> 'quantity'::text))::integer) STORED,
    checkout_session text GENERATED ALWAYS AS ((_raw_data ->> 'checkout_session'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


--
-- Name: checkout_sessions; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE stripe.checkout_sessions (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    adaptive_pricing jsonb GENERATED ALWAYS AS ((_raw_data -> 'adaptive_pricing'::text)) STORED,
    after_expiration jsonb GENERATED ALWAYS AS ((_raw_data -> 'after_expiration'::text)) STORED,
    allow_promotion_codes boolean GENERATED ALWAYS AS (((_raw_data ->> 'allow_promotion_codes'::text))::boolean) STORED,
    amount_subtotal integer GENERATED ALWAYS AS (((_raw_data ->> 'amount_subtotal'::text))::integer) STORED,
    amount_total integer GENERATED ALWAYS AS (((_raw_data ->> 'amount_total'::text))::integer) STORED,
    automatic_tax jsonb GENERATED ALWAYS AS ((_raw_data -> 'automatic_tax'::text)) STORED,
    billing_address_collection text GENERATED ALWAYS AS ((_raw_data ->> 'billing_address_collection'::text)) STORED,
    cancel_url text GENERATED ALWAYS AS ((_raw_data ->> 'cancel_url'::text)) STORED,
    client_reference_id text GENERATED ALWAYS AS ((_raw_data ->> 'client_reference_id'::text)) STORED,
    client_secret text GENERATED ALWAYS AS ((_raw_data ->> 'client_secret'::text)) STORED,
    collected_information jsonb GENERATED ALWAYS AS ((_raw_data -> 'collected_information'::text)) STORED,
    consent jsonb GENERATED ALWAYS AS ((_raw_data -> 'consent'::text)) STORED,
    consent_collection jsonb GENERATED ALWAYS AS ((_raw_data -> 'consent_collection'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    currency text GENERATED ALWAYS AS ((_raw_data ->> 'currency'::text)) STORED,
    currency_conversion jsonb GENERATED ALWAYS AS ((_raw_data -> 'currency_conversion'::text)) STORED,
    custom_fields jsonb GENERATED ALWAYS AS ((_raw_data -> 'custom_fields'::text)) STORED,
    custom_text jsonb GENERATED ALWAYS AS ((_raw_data -> 'custom_text'::text)) STORED,
    customer text GENERATED ALWAYS AS ((_raw_data ->> 'customer'::text)) STORED,
    customer_creation text GENERATED ALWAYS AS ((_raw_data ->> 'customer_creation'::text)) STORED,
    customer_details jsonb GENERATED ALWAYS AS ((_raw_data -> 'customer_details'::text)) STORED,
    customer_email text GENERATED ALWAYS AS ((_raw_data ->> 'customer_email'::text)) STORED,
    discounts jsonb GENERATED ALWAYS AS ((_raw_data -> 'discounts'::text)) STORED,
    expires_at integer GENERATED ALWAYS AS (((_raw_data ->> 'expires_at'::text))::integer) STORED,
    invoice text GENERATED ALWAYS AS ((_raw_data ->> 'invoice'::text)) STORED,
    invoice_creation jsonb GENERATED ALWAYS AS ((_raw_data -> 'invoice_creation'::text)) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    locale text GENERATED ALWAYS AS ((_raw_data ->> 'locale'::text)) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    mode text GENERATED ALWAYS AS ((_raw_data ->> 'mode'::text)) STORED,
    optional_items jsonb GENERATED ALWAYS AS ((_raw_data -> 'optional_items'::text)) STORED,
    payment_intent text GENERATED ALWAYS AS ((_raw_data ->> 'payment_intent'::text)) STORED,
    payment_link text GENERATED ALWAYS AS ((_raw_data ->> 'payment_link'::text)) STORED,
    payment_method_collection text GENERATED ALWAYS AS ((_raw_data ->> 'payment_method_collection'::text)) STORED,
    payment_method_configuration_details jsonb GENERATED ALWAYS AS ((_raw_data -> 'payment_method_configuration_details'::text)) STORED,
    payment_method_options jsonb GENERATED ALWAYS AS ((_raw_data -> 'payment_method_options'::text)) STORED,
    payment_method_types jsonb GENERATED ALWAYS AS ((_raw_data -> 'payment_method_types'::text)) STORED,
    payment_status text GENERATED ALWAYS AS ((_raw_data ->> 'payment_status'::text)) STORED,
    permissions jsonb GENERATED ALWAYS AS ((_raw_data -> 'permissions'::text)) STORED,
    phone_number_collection jsonb GENERATED ALWAYS AS ((_raw_data -> 'phone_number_collection'::text)) STORED,
    presentment_details jsonb GENERATED ALWAYS AS ((_raw_data -> 'presentment_details'::text)) STORED,
    recovered_from text GENERATED ALWAYS AS ((_raw_data ->> 'recovered_from'::text)) STORED,
    redirect_on_completion text GENERATED ALWAYS AS ((_raw_data ->> 'redirect_on_completion'::text)) STORED,
    return_url text GENERATED ALWAYS AS ((_raw_data ->> 'return_url'::text)) STORED,
    saved_payment_method_options jsonb GENERATED ALWAYS AS ((_raw_data -> 'saved_payment_method_options'::text)) STORED,
    setup_intent text GENERATED ALWAYS AS ((_raw_data ->> 'setup_intent'::text)) STORED,
    shipping_address_collection jsonb GENERATED ALWAYS AS ((_raw_data -> 'shipping_address_collection'::text)) STORED,
    shipping_cost jsonb GENERATED ALWAYS AS ((_raw_data -> 'shipping_cost'::text)) STORED,
    shipping_details jsonb GENERATED ALWAYS AS ((_raw_data -> 'shipping_details'::text)) STORED,
    shipping_options jsonb GENERATED ALWAYS AS ((_raw_data -> 'shipping_options'::text)) STORED,
    status text GENERATED ALWAYS AS ((_raw_data ->> 'status'::text)) STORED,
    submit_type text GENERATED ALWAYS AS ((_raw_data ->> 'submit_type'::text)) STORED,
    subscription text GENERATED ALWAYS AS ((_raw_data ->> 'subscription'::text)) STORED,
    success_url text GENERATED ALWAYS AS ((_raw_data ->> 'success_url'::text)) STORED,
    tax_id_collection jsonb GENERATED ALWAYS AS ((_raw_data -> 'tax_id_collection'::text)) STORED,
    total_details jsonb GENERATED ALWAYS AS ((_raw_data -> 'total_details'::text)) STORED,
    ui_mode text GENERATED ALWAYS AS ((_raw_data ->> 'ui_mode'::text)) STORED,
    url text GENERATED ALWAYS AS ((_raw_data ->> 'url'::text)) STORED,
    wallet_options jsonb GENERATED ALWAYS AS ((_raw_data -> 'wallet_options'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


--
-- Name: coupons; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE stripe.coupons (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    name text GENERATED ALWAYS AS ((_raw_data ->> 'name'::text)) STORED,
    valid boolean GENERATED ALWAYS AS (((_raw_data ->> 'valid'::text))::boolean) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    updated integer GENERATED ALWAYS AS (((_raw_data ->> 'updated'::text))::integer) STORED,
    currency text GENERATED ALWAYS AS ((_raw_data ->> 'currency'::text)) STORED,
    duration text GENERATED ALWAYS AS ((_raw_data ->> 'duration'::text)) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    redeem_by integer GENERATED ALWAYS AS (((_raw_data ->> 'redeem_by'::text))::integer) STORED,
    amount_off bigint GENERATED ALWAYS AS (((_raw_data ->> 'amount_off'::text))::bigint) STORED,
    percent_off double precision GENERATED ALWAYS AS (((_raw_data ->> 'percent_off'::text))::double precision) STORED,
    times_redeemed bigint GENERATED ALWAYS AS (((_raw_data ->> 'times_redeemed'::text))::bigint) STORED,
    max_redemptions bigint GENERATED ALWAYS AS (((_raw_data ->> 'max_redemptions'::text))::bigint) STORED,
    duration_in_months bigint GENERATED ALWAYS AS (((_raw_data ->> 'duration_in_months'::text))::bigint) STORED,
    percent_off_precise double precision GENERATED ALWAYS AS (((_raw_data ->> 'percent_off_precise'::text))::double precision) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


--
-- Name: credit_notes; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE stripe.credit_notes (
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    amount integer GENERATED ALWAYS AS (((_raw_data ->> 'amount'::text))::integer) STORED,
    amount_shipping integer GENERATED ALWAYS AS (((_raw_data ->> 'amount_shipping'::text))::integer) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    currency text GENERATED ALWAYS AS ((_raw_data ->> 'currency'::text)) STORED,
    customer text GENERATED ALWAYS AS ((_raw_data ->> 'customer'::text)) STORED,
    customer_balance_transaction text GENERATED ALWAYS AS ((_raw_data ->> 'customer_balance_transaction'::text)) STORED,
    discount_amount integer GENERATED ALWAYS AS (((_raw_data ->> 'discount_amount'::text))::integer) STORED,
    discount_amounts jsonb GENERATED ALWAYS AS ((_raw_data -> 'discount_amounts'::text)) STORED,
    invoice text GENERATED ALWAYS AS ((_raw_data ->> 'invoice'::text)) STORED,
    lines jsonb GENERATED ALWAYS AS ((_raw_data -> 'lines'::text)) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    memo text GENERATED ALWAYS AS ((_raw_data ->> 'memo'::text)) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    number text GENERATED ALWAYS AS ((_raw_data ->> 'number'::text)) STORED,
    out_of_band_amount integer GENERATED ALWAYS AS (((_raw_data ->> 'out_of_band_amount'::text))::integer) STORED,
    pdf text GENERATED ALWAYS AS ((_raw_data ->> 'pdf'::text)) STORED,
    reason text GENERATED ALWAYS AS ((_raw_data ->> 'reason'::text)) STORED,
    refund text GENERATED ALWAYS AS ((_raw_data ->> 'refund'::text)) STORED,
    shipping_cost jsonb GENERATED ALWAYS AS ((_raw_data -> 'shipping_cost'::text)) STORED,
    status text GENERATED ALWAYS AS ((_raw_data ->> 'status'::text)) STORED,
    subtotal integer GENERATED ALWAYS AS (((_raw_data ->> 'subtotal'::text))::integer) STORED,
    subtotal_excluding_tax integer GENERATED ALWAYS AS (((_raw_data ->> 'subtotal_excluding_tax'::text))::integer) STORED,
    tax_amounts jsonb GENERATED ALWAYS AS ((_raw_data -> 'tax_amounts'::text)) STORED,
    total integer GENERATED ALWAYS AS (((_raw_data ->> 'total'::text))::integer) STORED,
    total_excluding_tax integer GENERATED ALWAYS AS (((_raw_data ->> 'total_excluding_tax'::text))::integer) STORED,
    type text GENERATED ALWAYS AS ((_raw_data ->> 'type'::text)) STORED,
    voided_at text GENERATED ALWAYS AS ((_raw_data ->> 'voided_at'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


--
-- Name: customers; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE stripe.customers (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    address jsonb GENERATED ALWAYS AS ((_raw_data -> 'address'::text)) STORED,
    description text GENERATED ALWAYS AS ((_raw_data ->> 'description'::text)) STORED,
    email text GENERATED ALWAYS AS ((_raw_data ->> 'email'::text)) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    name text GENERATED ALWAYS AS ((_raw_data ->> 'name'::text)) STORED,
    phone text GENERATED ALWAYS AS ((_raw_data ->> 'phone'::text)) STORED,
    shipping jsonb GENERATED ALWAYS AS ((_raw_data -> 'shipping'::text)) STORED,
    balance integer GENERATED ALWAYS AS (((_raw_data ->> 'balance'::text))::integer) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    currency text GENERATED ALWAYS AS ((_raw_data ->> 'currency'::text)) STORED,
    default_source text GENERATED ALWAYS AS ((_raw_data ->> 'default_source'::text)) STORED,
    delinquent boolean GENERATED ALWAYS AS (((_raw_data ->> 'delinquent'::text))::boolean) STORED,
    discount jsonb GENERATED ALWAYS AS ((_raw_data -> 'discount'::text)) STORED,
    invoice_prefix text GENERATED ALWAYS AS ((_raw_data ->> 'invoice_prefix'::text)) STORED,
    invoice_settings jsonb GENERATED ALWAYS AS ((_raw_data -> 'invoice_settings'::text)) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    next_invoice_sequence integer GENERATED ALWAYS AS (((_raw_data ->> 'next_invoice_sequence'::text))::integer) STORED,
    preferred_locales jsonb GENERATED ALWAYS AS ((_raw_data -> 'preferred_locales'::text)) STORED,
    tax_exempt text GENERATED ALWAYS AS ((_raw_data ->> 'tax_exempt'::text)) STORED,
    deleted boolean GENERATED ALWAYS AS (((_raw_data ->> 'deleted'::text))::boolean) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


--
-- Name: disputes; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE stripe.disputes (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    amount bigint GENERATED ALWAYS AS (((_raw_data ->> 'amount'::text))::bigint) STORED,
    charge text GENERATED ALWAYS AS ((_raw_data ->> 'charge'::text)) STORED,
    reason text GENERATED ALWAYS AS ((_raw_data ->> 'reason'::text)) STORED,
    status text GENERATED ALWAYS AS ((_raw_data ->> 'status'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    updated integer GENERATED ALWAYS AS (((_raw_data ->> 'updated'::text))::integer) STORED,
    currency text GENERATED ALWAYS AS ((_raw_data ->> 'currency'::text)) STORED,
    evidence jsonb GENERATED ALWAYS AS ((_raw_data -> 'evidence'::text)) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    evidence_details jsonb GENERATED ALWAYS AS ((_raw_data -> 'evidence_details'::text)) STORED,
    balance_transactions jsonb GENERATED ALWAYS AS ((_raw_data -> 'balance_transactions'::text)) STORED,
    is_charge_refundable boolean GENERATED ALWAYS AS (((_raw_data ->> 'is_charge_refundable'::text))::boolean) STORED,
    payment_intent text GENERATED ALWAYS AS ((_raw_data ->> 'payment_intent'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


--
-- Name: early_fraud_warnings; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE stripe.early_fraud_warnings (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    actionable boolean GENERATED ALWAYS AS (((_raw_data ->> 'actionable'::text))::boolean) STORED,
    charge text GENERATED ALWAYS AS ((_raw_data ->> 'charge'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    fraud_type text GENERATED ALWAYS AS ((_raw_data ->> 'fraud_type'::text)) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    payment_intent text GENERATED ALWAYS AS ((_raw_data ->> 'payment_intent'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


--
-- Name: events; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE stripe.events (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    data jsonb GENERATED ALWAYS AS ((_raw_data -> 'data'::text)) STORED,
    type text GENERATED ALWAYS AS ((_raw_data ->> 'type'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    request text GENERATED ALWAYS AS ((_raw_data ->> 'request'::text)) STORED,
    updated integer GENERATED ALWAYS AS (((_raw_data ->> 'updated'::text))::integer) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    api_version text GENERATED ALWAYS AS ((_raw_data ->> 'api_version'::text)) STORED,
    pending_webhooks bigint GENERATED ALWAYS AS (((_raw_data ->> 'pending_webhooks'::text))::bigint) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


--
-- Name: features; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE stripe.features (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    name text GENERATED ALWAYS AS ((_raw_data ->> 'name'::text)) STORED,
    lookup_key text GENERATED ALWAYS AS ((_raw_data ->> 'lookup_key'::text)) STORED,
    active boolean GENERATED ALWAYS AS (((_raw_data ->> 'active'::text))::boolean) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


--
-- Name: invoices; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE stripe.invoices (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    auto_advance boolean GENERATED ALWAYS AS (((_raw_data ->> 'auto_advance'::text))::boolean) STORED,
    collection_method text GENERATED ALWAYS AS ((_raw_data ->> 'collection_method'::text)) STORED,
    currency text GENERATED ALWAYS AS ((_raw_data ->> 'currency'::text)) STORED,
    description text GENERATED ALWAYS AS ((_raw_data ->> 'description'::text)) STORED,
    hosted_invoice_url text GENERATED ALWAYS AS ((_raw_data ->> 'hosted_invoice_url'::text)) STORED,
    lines jsonb GENERATED ALWAYS AS ((_raw_data -> 'lines'::text)) STORED,
    period_end integer GENERATED ALWAYS AS (((_raw_data ->> 'period_end'::text))::integer) STORED,
    period_start integer GENERATED ALWAYS AS (((_raw_data ->> 'period_start'::text))::integer) STORED,
    status text GENERATED ALWAYS AS ((_raw_data ->> 'status'::text)) STORED,
    total bigint GENERATED ALWAYS AS (((_raw_data ->> 'total'::text))::bigint) STORED,
    account_country text GENERATED ALWAYS AS ((_raw_data ->> 'account_country'::text)) STORED,
    account_name text GENERATED ALWAYS AS ((_raw_data ->> 'account_name'::text)) STORED,
    account_tax_ids jsonb GENERATED ALWAYS AS ((_raw_data -> 'account_tax_ids'::text)) STORED,
    amount_due bigint GENERATED ALWAYS AS (((_raw_data ->> 'amount_due'::text))::bigint) STORED,
    amount_paid bigint GENERATED ALWAYS AS (((_raw_data ->> 'amount_paid'::text))::bigint) STORED,
    amount_remaining bigint GENERATED ALWAYS AS (((_raw_data ->> 'amount_remaining'::text))::bigint) STORED,
    application_fee_amount bigint GENERATED ALWAYS AS (((_raw_data ->> 'application_fee_amount'::text))::bigint) STORED,
    attempt_count integer GENERATED ALWAYS AS (((_raw_data ->> 'attempt_count'::text))::integer) STORED,
    attempted boolean GENERATED ALWAYS AS (((_raw_data ->> 'attempted'::text))::boolean) STORED,
    billing_reason text GENERATED ALWAYS AS ((_raw_data ->> 'billing_reason'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    custom_fields jsonb GENERATED ALWAYS AS ((_raw_data -> 'custom_fields'::text)) STORED,
    customer_address jsonb GENERATED ALWAYS AS ((_raw_data -> 'customer_address'::text)) STORED,
    customer_email text GENERATED ALWAYS AS ((_raw_data ->> 'customer_email'::text)) STORED,
    customer_name text GENERATED ALWAYS AS ((_raw_data ->> 'customer_name'::text)) STORED,
    customer_phone text GENERATED ALWAYS AS ((_raw_data ->> 'customer_phone'::text)) STORED,
    customer_shipping jsonb GENERATED ALWAYS AS ((_raw_data -> 'customer_shipping'::text)) STORED,
    customer_tax_exempt text GENERATED ALWAYS AS ((_raw_data ->> 'customer_tax_exempt'::text)) STORED,
    customer_tax_ids jsonb GENERATED ALWAYS AS ((_raw_data -> 'customer_tax_ids'::text)) STORED,
    default_tax_rates jsonb GENERATED ALWAYS AS ((_raw_data -> 'default_tax_rates'::text)) STORED,
    discount jsonb GENERATED ALWAYS AS ((_raw_data -> 'discount'::text)) STORED,
    discounts jsonb GENERATED ALWAYS AS ((_raw_data -> 'discounts'::text)) STORED,
    due_date integer GENERATED ALWAYS AS (((_raw_data ->> 'due_date'::text))::integer) STORED,
    ending_balance integer GENERATED ALWAYS AS (((_raw_data ->> 'ending_balance'::text))::integer) STORED,
    footer text GENERATED ALWAYS AS ((_raw_data ->> 'footer'::text)) STORED,
    invoice_pdf text GENERATED ALWAYS AS ((_raw_data ->> 'invoice_pdf'::text)) STORED,
    last_finalization_error jsonb GENERATED ALWAYS AS ((_raw_data -> 'last_finalization_error'::text)) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    next_payment_attempt integer GENERATED ALWAYS AS (((_raw_data ->> 'next_payment_attempt'::text))::integer) STORED,
    number text GENERATED ALWAYS AS ((_raw_data ->> 'number'::text)) STORED,
    paid boolean GENERATED ALWAYS AS (((_raw_data ->> 'paid'::text))::boolean) STORED,
    payment_settings jsonb GENERATED ALWAYS AS ((_raw_data -> 'payment_settings'::text)) STORED,
    post_payment_credit_notes_amount integer GENERATED ALWAYS AS (((_raw_data ->> 'post_payment_credit_notes_amount'::text))::integer) STORED,
    pre_payment_credit_notes_amount integer GENERATED ALWAYS AS (((_raw_data ->> 'pre_payment_credit_notes_amount'::text))::integer) STORED,
    receipt_number text GENERATED ALWAYS AS ((_raw_data ->> 'receipt_number'::text)) STORED,
    starting_balance integer GENERATED ALWAYS AS (((_raw_data ->> 'starting_balance'::text))::integer) STORED,
    statement_descriptor text GENERATED ALWAYS AS ((_raw_data ->> 'statement_descriptor'::text)) STORED,
    status_transitions jsonb GENERATED ALWAYS AS ((_raw_data -> 'status_transitions'::text)) STORED,
    subtotal integer GENERATED ALWAYS AS (((_raw_data ->> 'subtotal'::text))::integer) STORED,
    tax integer GENERATED ALWAYS AS (((_raw_data ->> 'tax'::text))::integer) STORED,
    total_discount_amounts jsonb GENERATED ALWAYS AS ((_raw_data -> 'total_discount_amounts'::text)) STORED,
    total_tax_amounts jsonb GENERATED ALWAYS AS ((_raw_data -> 'total_tax_amounts'::text)) STORED,
    transfer_data jsonb GENERATED ALWAYS AS ((_raw_data -> 'transfer_data'::text)) STORED,
    webhooks_delivered_at integer GENERATED ALWAYS AS (((_raw_data ->> 'webhooks_delivered_at'::text))::integer) STORED,
    customer text GENERATED ALWAYS AS ((_raw_data ->> 'customer'::text)) STORED,
    subscription text GENERATED ALWAYS AS ((_raw_data ->> 'subscription'::text)) STORED,
    payment_intent text GENERATED ALWAYS AS ((_raw_data ->> 'payment_intent'::text)) STORED,
    default_payment_method text GENERATED ALWAYS AS ((_raw_data ->> 'default_payment_method'::text)) STORED,
    default_source text GENERATED ALWAYS AS ((_raw_data ->> 'default_source'::text)) STORED,
    on_behalf_of text GENERATED ALWAYS AS ((_raw_data ->> 'on_behalf_of'::text)) STORED,
    charge text GENERATED ALWAYS AS ((_raw_data ->> 'charge'::text)) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


--
-- Name: payment_intents; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE stripe.payment_intents (
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    amount integer GENERATED ALWAYS AS (((_raw_data ->> 'amount'::text))::integer) STORED,
    amount_capturable integer GENERATED ALWAYS AS (((_raw_data ->> 'amount_capturable'::text))::integer) STORED,
    amount_details jsonb GENERATED ALWAYS AS ((_raw_data -> 'amount_details'::text)) STORED,
    amount_received integer GENERATED ALWAYS AS (((_raw_data ->> 'amount_received'::text))::integer) STORED,
    application text GENERATED ALWAYS AS ((_raw_data ->> 'application'::text)) STORED,
    application_fee_amount integer GENERATED ALWAYS AS (((_raw_data ->> 'application_fee_amount'::text))::integer) STORED,
    automatic_payment_methods text GENERATED ALWAYS AS ((_raw_data ->> 'automatic_payment_methods'::text)) STORED,
    canceled_at integer GENERATED ALWAYS AS (((_raw_data ->> 'canceled_at'::text))::integer) STORED,
    cancellation_reason text GENERATED ALWAYS AS ((_raw_data ->> 'cancellation_reason'::text)) STORED,
    capture_method text GENERATED ALWAYS AS ((_raw_data ->> 'capture_method'::text)) STORED,
    client_secret text GENERATED ALWAYS AS ((_raw_data ->> 'client_secret'::text)) STORED,
    confirmation_method text GENERATED ALWAYS AS ((_raw_data ->> 'confirmation_method'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    currency text GENERATED ALWAYS AS ((_raw_data ->> 'currency'::text)) STORED,
    customer text GENERATED ALWAYS AS ((_raw_data ->> 'customer'::text)) STORED,
    description text GENERATED ALWAYS AS ((_raw_data ->> 'description'::text)) STORED,
    invoice text GENERATED ALWAYS AS ((_raw_data ->> 'invoice'::text)) STORED,
    last_payment_error text GENERATED ALWAYS AS ((_raw_data ->> 'last_payment_error'::text)) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    next_action text GENERATED ALWAYS AS ((_raw_data ->> 'next_action'::text)) STORED,
    on_behalf_of text GENERATED ALWAYS AS ((_raw_data ->> 'on_behalf_of'::text)) STORED,
    payment_method text GENERATED ALWAYS AS ((_raw_data ->> 'payment_method'::text)) STORED,
    payment_method_options jsonb GENERATED ALWAYS AS ((_raw_data -> 'payment_method_options'::text)) STORED,
    payment_method_types jsonb GENERATED ALWAYS AS ((_raw_data -> 'payment_method_types'::text)) STORED,
    processing text GENERATED ALWAYS AS ((_raw_data ->> 'processing'::text)) STORED,
    receipt_email text GENERATED ALWAYS AS ((_raw_data ->> 'receipt_email'::text)) STORED,
    review text GENERATED ALWAYS AS ((_raw_data ->> 'review'::text)) STORED,
    setup_future_usage text GENERATED ALWAYS AS ((_raw_data ->> 'setup_future_usage'::text)) STORED,
    shipping jsonb GENERATED ALWAYS AS ((_raw_data -> 'shipping'::text)) STORED,
    statement_descriptor text GENERATED ALWAYS AS ((_raw_data ->> 'statement_descriptor'::text)) STORED,
    statement_descriptor_suffix text GENERATED ALWAYS AS ((_raw_data ->> 'statement_descriptor_suffix'::text)) STORED,
    status text GENERATED ALWAYS AS ((_raw_data ->> 'status'::text)) STORED,
    transfer_data jsonb GENERATED ALWAYS AS ((_raw_data -> 'transfer_data'::text)) STORED,
    transfer_group text GENERATED ALWAYS AS ((_raw_data ->> 'transfer_group'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


--
-- Name: payment_methods; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE stripe.payment_methods (
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    customer text GENERATED ALWAYS AS ((_raw_data ->> 'customer'::text)) STORED,
    type text GENERATED ALWAYS AS ((_raw_data ->> 'type'::text)) STORED,
    billing_details jsonb GENERATED ALWAYS AS ((_raw_data -> 'billing_details'::text)) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    card jsonb GENERATED ALWAYS AS ((_raw_data -> 'card'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


--
-- Name: payouts; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE stripe.payouts (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    date text GENERATED ALWAYS AS ((_raw_data ->> 'date'::text)) STORED,
    type text GENERATED ALWAYS AS ((_raw_data ->> 'type'::text)) STORED,
    amount bigint GENERATED ALWAYS AS (((_raw_data ->> 'amount'::text))::bigint) STORED,
    method text GENERATED ALWAYS AS ((_raw_data ->> 'method'::text)) STORED,
    status text GENERATED ALWAYS AS ((_raw_data ->> 'status'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    updated integer GENERATED ALWAYS AS (((_raw_data ->> 'updated'::text))::integer) STORED,
    currency text GENERATED ALWAYS AS ((_raw_data ->> 'currency'::text)) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    automatic boolean GENERATED ALWAYS AS (((_raw_data ->> 'automatic'::text))::boolean) STORED,
    recipient text GENERATED ALWAYS AS ((_raw_data ->> 'recipient'::text)) STORED,
    description text GENERATED ALWAYS AS ((_raw_data ->> 'description'::text)) STORED,
    destination text GENERATED ALWAYS AS ((_raw_data ->> 'destination'::text)) STORED,
    source_type text GENERATED ALWAYS AS ((_raw_data ->> 'source_type'::text)) STORED,
    arrival_date text GENERATED ALWAYS AS ((_raw_data ->> 'arrival_date'::text)) STORED,
    bank_account jsonb GENERATED ALWAYS AS ((_raw_data -> 'bank_account'::text)) STORED,
    failure_code text GENERATED ALWAYS AS ((_raw_data ->> 'failure_code'::text)) STORED,
    transfer_group text GENERATED ALWAYS AS ((_raw_data ->> 'transfer_group'::text)) STORED,
    amount_reversed bigint GENERATED ALWAYS AS (((_raw_data ->> 'amount_reversed'::text))::bigint) STORED,
    failure_message text GENERATED ALWAYS AS ((_raw_data ->> 'failure_message'::text)) STORED,
    source_transaction text GENERATED ALWAYS AS ((_raw_data ->> 'source_transaction'::text)) STORED,
    balance_transaction text GENERATED ALWAYS AS ((_raw_data ->> 'balance_transaction'::text)) STORED,
    statement_descriptor text GENERATED ALWAYS AS ((_raw_data ->> 'statement_descriptor'::text)) STORED,
    statement_description text GENERATED ALWAYS AS ((_raw_data ->> 'statement_description'::text)) STORED,
    failure_balance_transaction text GENERATED ALWAYS AS ((_raw_data ->> 'failure_balance_transaction'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


--
-- Name: plans; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE stripe.plans (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    name text GENERATED ALWAYS AS ((_raw_data ->> 'name'::text)) STORED,
    tiers jsonb GENERATED ALWAYS AS ((_raw_data -> 'tiers'::text)) STORED,
    active boolean GENERATED ALWAYS AS (((_raw_data ->> 'active'::text))::boolean) STORED,
    amount bigint GENERATED ALWAYS AS (((_raw_data ->> 'amount'::text))::bigint) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    product text GENERATED ALWAYS AS ((_raw_data ->> 'product'::text)) STORED,
    updated integer GENERATED ALWAYS AS (((_raw_data ->> 'updated'::text))::integer) STORED,
    currency text GENERATED ALWAYS AS ((_raw_data ->> 'currency'::text)) STORED,
    "interval" text GENERATED ALWAYS AS ((_raw_data ->> 'interval'::text)) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    nickname text GENERATED ALWAYS AS ((_raw_data ->> 'nickname'::text)) STORED,
    tiers_mode text GENERATED ALWAYS AS ((_raw_data ->> 'tiers_mode'::text)) STORED,
    usage_type text GENERATED ALWAYS AS ((_raw_data ->> 'usage_type'::text)) STORED,
    billing_scheme text GENERATED ALWAYS AS ((_raw_data ->> 'billing_scheme'::text)) STORED,
    interval_count bigint GENERATED ALWAYS AS (((_raw_data ->> 'interval_count'::text))::bigint) STORED,
    aggregate_usage text GENERATED ALWAYS AS ((_raw_data ->> 'aggregate_usage'::text)) STORED,
    transform_usage text GENERATED ALWAYS AS ((_raw_data ->> 'transform_usage'::text)) STORED,
    trial_period_days bigint GENERATED ALWAYS AS (((_raw_data ->> 'trial_period_days'::text))::bigint) STORED,
    statement_descriptor text GENERATED ALWAYS AS ((_raw_data ->> 'statement_descriptor'::text)) STORED,
    statement_description text GENERATED ALWAYS AS ((_raw_data ->> 'statement_description'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


--
-- Name: prices; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE stripe.prices (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    active boolean GENERATED ALWAYS AS (((_raw_data ->> 'active'::text))::boolean) STORED,
    currency text GENERATED ALWAYS AS ((_raw_data ->> 'currency'::text)) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    nickname text GENERATED ALWAYS AS ((_raw_data ->> 'nickname'::text)) STORED,
    recurring jsonb GENERATED ALWAYS AS ((_raw_data -> 'recurring'::text)) STORED,
    type text GENERATED ALWAYS AS ((_raw_data ->> 'type'::text)) STORED,
    unit_amount integer GENERATED ALWAYS AS (((_raw_data ->> 'unit_amount'::text))::integer) STORED,
    billing_scheme text GENERATED ALWAYS AS ((_raw_data ->> 'billing_scheme'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    lookup_key text GENERATED ALWAYS AS ((_raw_data ->> 'lookup_key'::text)) STORED,
    tiers_mode text GENERATED ALWAYS AS ((_raw_data ->> 'tiers_mode'::text)) STORED,
    transform_quantity jsonb GENERATED ALWAYS AS ((_raw_data -> 'transform_quantity'::text)) STORED,
    unit_amount_decimal text GENERATED ALWAYS AS ((_raw_data ->> 'unit_amount_decimal'::text)) STORED,
    product text GENERATED ALWAYS AS ((_raw_data ->> 'product'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


--
-- Name: products; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE stripe.products (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    active boolean GENERATED ALWAYS AS (((_raw_data ->> 'active'::text))::boolean) STORED,
    default_price text GENERATED ALWAYS AS ((_raw_data ->> 'default_price'::text)) STORED,
    description text GENERATED ALWAYS AS ((_raw_data ->> 'description'::text)) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    name text GENERATED ALWAYS AS ((_raw_data ->> 'name'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    images jsonb GENERATED ALWAYS AS ((_raw_data -> 'images'::text)) STORED,
    marketing_features jsonb GENERATED ALWAYS AS ((_raw_data -> 'marketing_features'::text)) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    package_dimensions jsonb GENERATED ALWAYS AS ((_raw_data -> 'package_dimensions'::text)) STORED,
    shippable boolean GENERATED ALWAYS AS (((_raw_data ->> 'shippable'::text))::boolean) STORED,
    statement_descriptor text GENERATED ALWAYS AS ((_raw_data ->> 'statement_descriptor'::text)) STORED,
    unit_label text GENERATED ALWAYS AS ((_raw_data ->> 'unit_label'::text)) STORED,
    updated integer GENERATED ALWAYS AS (((_raw_data ->> 'updated'::text))::integer) STORED,
    url text GENERATED ALWAYS AS ((_raw_data ->> 'url'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


--
-- Name: refunds; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE stripe.refunds (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    amount integer GENERATED ALWAYS AS (((_raw_data ->> 'amount'::text))::integer) STORED,
    balance_transaction text GENERATED ALWAYS AS ((_raw_data ->> 'balance_transaction'::text)) STORED,
    charge text GENERATED ALWAYS AS ((_raw_data ->> 'charge'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    currency text GENERATED ALWAYS AS ((_raw_data ->> 'currency'::text)) STORED,
    destination_details jsonb GENERATED ALWAYS AS ((_raw_data -> 'destination_details'::text)) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    payment_intent text GENERATED ALWAYS AS ((_raw_data ->> 'payment_intent'::text)) STORED,
    reason text GENERATED ALWAYS AS ((_raw_data ->> 'reason'::text)) STORED,
    receipt_number text GENERATED ALWAYS AS ((_raw_data ->> 'receipt_number'::text)) STORED,
    source_transfer_reversal text GENERATED ALWAYS AS ((_raw_data ->> 'source_transfer_reversal'::text)) STORED,
    status text GENERATED ALWAYS AS ((_raw_data ->> 'status'::text)) STORED,
    transfer_reversal text GENERATED ALWAYS AS ((_raw_data ->> 'transfer_reversal'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


--
-- Name: reviews; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE stripe.reviews (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    billing_zip text GENERATED ALWAYS AS ((_raw_data ->> 'billing_zip'::text)) STORED,
    charge text GENERATED ALWAYS AS ((_raw_data ->> 'charge'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    closed_reason text GENERATED ALWAYS AS ((_raw_data ->> 'closed_reason'::text)) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    ip_address text GENERATED ALWAYS AS ((_raw_data ->> 'ip_address'::text)) STORED,
    ip_address_location jsonb GENERATED ALWAYS AS ((_raw_data -> 'ip_address_location'::text)) STORED,
    open boolean GENERATED ALWAYS AS (((_raw_data ->> 'open'::text))::boolean) STORED,
    opened_reason text GENERATED ALWAYS AS ((_raw_data ->> 'opened_reason'::text)) STORED,
    payment_intent text GENERATED ALWAYS AS ((_raw_data ->> 'payment_intent'::text)) STORED,
    reason text GENERATED ALWAYS AS ((_raw_data ->> 'reason'::text)) STORED,
    session text GENERATED ALWAYS AS ((_raw_data ->> 'session'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


--
-- Name: setup_intents; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE stripe.setup_intents (
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    customer text GENERATED ALWAYS AS ((_raw_data ->> 'customer'::text)) STORED,
    description text GENERATED ALWAYS AS ((_raw_data ->> 'description'::text)) STORED,
    payment_method text GENERATED ALWAYS AS ((_raw_data ->> 'payment_method'::text)) STORED,
    status text GENERATED ALWAYS AS ((_raw_data ->> 'status'::text)) STORED,
    usage text GENERATED ALWAYS AS ((_raw_data ->> 'usage'::text)) STORED,
    cancellation_reason text GENERATED ALWAYS AS ((_raw_data ->> 'cancellation_reason'::text)) STORED,
    latest_attempt text GENERATED ALWAYS AS ((_raw_data ->> 'latest_attempt'::text)) STORED,
    mandate text GENERATED ALWAYS AS ((_raw_data ->> 'mandate'::text)) STORED,
    single_use_mandate text GENERATED ALWAYS AS ((_raw_data ->> 'single_use_mandate'::text)) STORED,
    on_behalf_of text GENERATED ALWAYS AS ((_raw_data ->> 'on_behalf_of'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


--
-- Name: subscription_items; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE stripe.subscription_items (
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    billing_thresholds jsonb GENERATED ALWAYS AS ((_raw_data -> 'billing_thresholds'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    deleted boolean GENERATED ALWAYS AS (((_raw_data ->> 'deleted'::text))::boolean) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    quantity integer GENERATED ALWAYS AS (((_raw_data ->> 'quantity'::text))::integer) STORED,
    price text GENERATED ALWAYS AS ((_raw_data ->> 'price'::text)) STORED,
    subscription text GENERATED ALWAYS AS ((_raw_data ->> 'subscription'::text)) STORED,
    tax_rates jsonb GENERATED ALWAYS AS ((_raw_data -> 'tax_rates'::text)) STORED,
    current_period_end integer GENERATED ALWAYS AS (((_raw_data ->> 'current_period_end'::text))::integer) STORED,
    current_period_start integer GENERATED ALWAYS AS (((_raw_data ->> 'current_period_start'::text))::integer) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


--
-- Name: subscription_schedules; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE stripe.subscription_schedules (
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    application text GENERATED ALWAYS AS ((_raw_data ->> 'application'::text)) STORED,
    canceled_at integer GENERATED ALWAYS AS (((_raw_data ->> 'canceled_at'::text))::integer) STORED,
    completed_at integer GENERATED ALWAYS AS (((_raw_data ->> 'completed_at'::text))::integer) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    current_phase jsonb GENERATED ALWAYS AS ((_raw_data -> 'current_phase'::text)) STORED,
    customer text GENERATED ALWAYS AS ((_raw_data ->> 'customer'::text)) STORED,
    default_settings jsonb GENERATED ALWAYS AS ((_raw_data -> 'default_settings'::text)) STORED,
    end_behavior text GENERATED ALWAYS AS ((_raw_data ->> 'end_behavior'::text)) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    phases jsonb GENERATED ALWAYS AS ((_raw_data -> 'phases'::text)) STORED,
    released_at integer GENERATED ALWAYS AS (((_raw_data ->> 'released_at'::text))::integer) STORED,
    released_subscription text GENERATED ALWAYS AS ((_raw_data ->> 'released_subscription'::text)) STORED,
    status text GENERATED ALWAYS AS ((_raw_data ->> 'status'::text)) STORED,
    subscription text GENERATED ALWAYS AS ((_raw_data ->> 'subscription'::text)) STORED,
    test_clock text GENERATED ALWAYS AS ((_raw_data ->> 'test_clock'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


--
-- Name: subscriptions; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE stripe.subscriptions (
    _updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    cancel_at_period_end boolean GENERATED ALWAYS AS (((_raw_data ->> 'cancel_at_period_end'::text))::boolean) STORED,
    current_period_end integer GENERATED ALWAYS AS (((_raw_data ->> 'current_period_end'::text))::integer) STORED,
    current_period_start integer GENERATED ALWAYS AS (((_raw_data ->> 'current_period_start'::text))::integer) STORED,
    default_payment_method text GENERATED ALWAYS AS ((_raw_data ->> 'default_payment_method'::text)) STORED,
    items jsonb GENERATED ALWAYS AS ((_raw_data -> 'items'::text)) STORED,
    metadata jsonb GENERATED ALWAYS AS ((_raw_data -> 'metadata'::text)) STORED,
    pending_setup_intent text GENERATED ALWAYS AS ((_raw_data ->> 'pending_setup_intent'::text)) STORED,
    pending_update jsonb GENERATED ALWAYS AS ((_raw_data -> 'pending_update'::text)) STORED,
    status text GENERATED ALWAYS AS ((_raw_data ->> 'status'::text)) STORED,
    application_fee_percent double precision GENERATED ALWAYS AS (((_raw_data ->> 'application_fee_percent'::text))::double precision) STORED,
    billing_cycle_anchor integer GENERATED ALWAYS AS (((_raw_data ->> 'billing_cycle_anchor'::text))::integer) STORED,
    billing_thresholds jsonb GENERATED ALWAYS AS ((_raw_data -> 'billing_thresholds'::text)) STORED,
    cancel_at integer GENERATED ALWAYS AS (((_raw_data ->> 'cancel_at'::text))::integer) STORED,
    canceled_at integer GENERATED ALWAYS AS (((_raw_data ->> 'canceled_at'::text))::integer) STORED,
    collection_method text GENERATED ALWAYS AS ((_raw_data ->> 'collection_method'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    days_until_due integer GENERATED ALWAYS AS (((_raw_data ->> 'days_until_due'::text))::integer) STORED,
    default_source text GENERATED ALWAYS AS ((_raw_data ->> 'default_source'::text)) STORED,
    default_tax_rates jsonb GENERATED ALWAYS AS ((_raw_data -> 'default_tax_rates'::text)) STORED,
    discount jsonb GENERATED ALWAYS AS ((_raw_data -> 'discount'::text)) STORED,
    ended_at integer GENERATED ALWAYS AS (((_raw_data ->> 'ended_at'::text))::integer) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    next_pending_invoice_item_invoice integer GENERATED ALWAYS AS (((_raw_data ->> 'next_pending_invoice_item_invoice'::text))::integer) STORED,
    pause_collection jsonb GENERATED ALWAYS AS ((_raw_data -> 'pause_collection'::text)) STORED,
    pending_invoice_item_interval jsonb GENERATED ALWAYS AS ((_raw_data -> 'pending_invoice_item_interval'::text)) STORED,
    start_date integer GENERATED ALWAYS AS (((_raw_data ->> 'start_date'::text))::integer) STORED,
    transfer_data jsonb GENERATED ALWAYS AS ((_raw_data -> 'transfer_data'::text)) STORED,
    trial_end jsonb GENERATED ALWAYS AS ((_raw_data -> 'trial_end'::text)) STORED,
    trial_start jsonb GENERATED ALWAYS AS ((_raw_data -> 'trial_start'::text)) STORED,
    schedule text GENERATED ALWAYS AS ((_raw_data ->> 'schedule'::text)) STORED,
    customer text GENERATED ALWAYS AS ((_raw_data ->> 'customer'::text)) STORED,
    latest_invoice text GENERATED ALWAYS AS ((_raw_data ->> 'latest_invoice'::text)) STORED,
    plan text GENERATED ALWAYS AS ((_raw_data ->> 'plan'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


--
-- Name: tax_ids; Type: TABLE; Schema: stripe; Owner: -
--

CREATE TABLE stripe.tax_ids (
    _last_synced_at timestamp with time zone,
    _raw_data jsonb,
    _account_id text NOT NULL,
    object text GENERATED ALWAYS AS ((_raw_data ->> 'object'::text)) STORED,
    country text GENERATED ALWAYS AS ((_raw_data ->> 'country'::text)) STORED,
    customer text GENERATED ALWAYS AS ((_raw_data ->> 'customer'::text)) STORED,
    type text GENERATED ALWAYS AS ((_raw_data ->> 'type'::text)) STORED,
    value text GENERATED ALWAYS AS ((_raw_data ->> 'value'::text)) STORED,
    created integer GENERATED ALWAYS AS (((_raw_data ->> 'created'::text))::integer) STORED,
    livemode boolean GENERATED ALWAYS AS (((_raw_data ->> 'livemode'::text))::boolean) STORED,
    owner jsonb GENERATED ALWAYS AS ((_raw_data -> 'owner'::text)) STORED,
    id text GENERATED ALWAYS AS ((_raw_data ->> 'id'::text)) STORED NOT NULL
);


--
-- Name: _sync_status id; Type: DEFAULT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe._sync_status ALTER COLUMN id SET DEFAULT nextval('stripe._sync_status_id_seq'::regclass);


--
-- Data for Name: admin_mfa_challenges; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.admin_mfa_challenges (id, email, code_hash, phone_number, created_at, expires_at, attempt_count, verified_at) FROM stdin;
\.


--
-- Data for Name: alerts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.alerts (id, user_id, type, severity, title, description, is_read, environment) FROM stdin;
\.


--
-- Data for Name: assets; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.assets (id, user_id, name, category, value, ownership, verified, environment, vendor, document_id, acquired_date) FROM stdin;
\.


--
-- Data for Name: audit_trail; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_trail (id, user_id, session_id, action, resource_type, resource_id, table_name, old_values, new_values, changed_fields, ip_address, user_agent, request_path, request_method, response_status, duration_ms, metadata, created_at) FROM stdin;
\.


--
-- Data for Name: auth_sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.auth_sessions (id, user_id, device_id, refresh_token_hash, ip_address, ip_history, user_agent, is_remember_me, mfa_verified, mfa_verified_at, created_at, expires_at, last_activity_at, revoked_at, revoked_reason) FROM stdin;
7045dbdd-6809-409c-ac82-39802924153b	6ad48cb0-0cae-4e1f-b0a9-1e5a711bc559	a63fcc00-f573-4430-9ac0-e6ba19a4a7a7	78dab5bc789f2bb134e11ad10b76b1ba9924f7ca5075e9ee23ac98221301f303	127.0.0.1	\N	\N	f	f	\N	2026-01-17 21:49:43.568477	2026-02-16 21:49:43.567	2026-01-17 21:49:43.568477	\N	\N
f503f150-cd2e-40f3-a420-371a1cf87116	demo-user	f404c602-7b1f-4b57-a1b9-3b05248aa587	a1ed4e605a4bad690da0e9c448fb31f4eedc4569061e72447fed6b459426072a	127.0.0.1	\N	\N	f	f	\N	2026-01-21 04:39:49.673529	2026-02-20 04:39:49.672	2026-01-21 04:39:49.673529	2026-01-21 07:23:47.045	user_revoke_all
9c6b62b5-5066-4431-ba3e-189b5bf4b6ac	demo-user	f404c602-7b1f-4b57-a1b9-3b05248aa587	59b56572d33037ecea1462ab84e8afcfc6c54cc7ce4ca4e20462c04f8d81f88a	127.0.0.1	\N	\N	f	f	\N	2026-01-21 04:40:07.576625	2026-02-20 04:40:07.575	2026-01-21 04:40:07.576625	2026-01-21 07:23:47.045	user_revoke_all
733ba19f-6602-49b9-8b87-364c516fa6ea	demo-user	ef76c997-646d-4ec6-b49b-b0ce70067b8e	3ce07423da7cd9e572b901673d3ecc7af40eb72ca3247a9df8d815ee51ecdfc7	127.0.0.1	\N	\N	f	f	\N	2026-01-21 04:40:09.002706	2026-02-20 04:40:09.002	2026-01-21 04:40:09.002706	2026-01-21 07:23:47.045	user_revoke_all
6a86688a-3827-4f92-974c-4c08e43355f0	demo-user	1c349e1d-3651-4102-a646-0062b43ab8b7	fbcb1c430e61fd0a799fbbaf0d08e7ad4ccc69d4a995e4bf0c0f2ec4d8deca47	127.0.0.1	\N	\N	f	f	\N	2026-01-21 04:52:37.830596	2026-02-20 04:52:37.829	2026-01-21 04:52:37.830596	2026-01-21 07:23:47.045	user_revoke_all
ab691abd-dad8-4650-8b76-a941cd5ba67a	demo-user	d04847ee-1949-404f-a2ee-7bebae1a6598	4f002a6a87b2f4013a45d7f8b430012b70a577396af7b474d9359c9c62f2e838	127.0.0.1	\N	\N	f	f	\N	2026-01-21 04:52:49.943572	2026-02-20 04:52:49.942	2026-01-21 04:52:49.943572	2026-01-21 07:23:47.045	user_revoke_all
3f2410f6-fb04-4cc2-abd7-e9d54a617122	demo-user	aabd84de-fbb1-42a9-96da-54f46f73a9a5	c1ec864bec3b9027396533819f80a261856c8b92724b19d5e4ea10b1a71fc985	10.82.4.28	\N	\N	f	f	\N	2026-01-18 03:29:30.887687	2026-02-17 03:29:30.886	2026-01-18 04:45:18.723	2026-01-21 07:23:47.045	user_revoke_all
7cda8e62-47b6-43f3-bf39-96a6069b4c1a	demo-user	aff2b961-90da-48f7-b8df-7bbf67f6a796	0822006868fbc0ea6830fa20f6f791f8066752f798e8b21732e8c318097f0534	10.82.9.7	\N	\N	f	f	\N	2026-01-18 18:28:58.440319	2026-02-17 18:28:58.439	2026-01-18 18:32:36.92	2026-01-21 07:23:47.045	user_revoke_all
c7b76abc-c097-499c-bca6-cd8a085bc124	demo-user	aff2b961-90da-48f7-b8df-7bbf67f6a796	ee9af8c153475d4102b99e690193c7c3eea694eca3cd1bbc6fbf60cf2ebaa79b	10.82.5.33	\N	\N	f	f	\N	2026-01-19 01:56:56.980005	2026-02-18 01:56:56.978	2026-01-19 01:57:33.603	2026-01-21 07:23:47.045	user_revoke_all
935ad900-17ab-4e5a-8918-1a6619f91d29	demo-user	d019f00b-361e-4975-84d2-0b321438e186	9921674e21a03b5751a541688f3384958164865de73fe59258cdb387d5163b52	10.82.0.24	\N	\N	f	f	\N	2026-01-19 17:59:38.887928	2026-02-18 17:59:38.886	2026-01-21 07:54:40.54	\N	\N
c592b2a0-4d64-4fd6-a368-ade24542ece8	demo-user	7f1faaca-4d72-4fdc-a566-c776bf1d31ba	b36b43765d53d834fd523bd56dafca04161e7a11593174c333f30d075baf8f57	10.82.9.46	\N	\N	f	f	\N	2026-01-19 13:44:17.575534	2026-02-18 13:44:17.574	2026-01-19 14:12:58.276	2026-01-21 07:23:47.045	user_revoke_all
000327c0-cfbf-46de-be8a-054b4aa27614	demo-user	5cde35e5-3b85-4d3c-a1c8-0924bee859f8	5b0348aad85ee267706789855346966fc1c732a12f3527315fc7a91fc30f3ab6	10.82.9.46	\N	\N	f	f	\N	2026-01-19 17:00:48.296541	2026-02-18 17:00:48.295	2026-01-19 17:00:48.296541	2026-01-21 07:23:47.045	user_revoke_all
\.


--
-- Data for Name: billing_records; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.billing_records (id, user_id, tier, period_start, period_end, violations_recorded, storage_used_mb, amount_cents, status, stripe_invoice_id, created_at) FROM stdin;
billing_demo-user_2026-01	demo-user	pro	2026-01-01 00:00:00	2026-01-31 00:00:00	5	0	4900	pending	\N	2026-01-05 07:54:30.57582
billing_demo-user_2025-12	demo-user	pro	2025-12-01 00:00:00	2025-12-31 00:00:00	0	0	4900	pending	\N	2026-01-05 08:07:55.126184
\.


--
-- Data for Name: business_metrics; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.business_metrics (id, name, display_name, description, category, formula, sql_query, unit, aggregation_type, dimensions, data_source, refresh_frequency, owner, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: calendar_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.calendar_events (id, user_id, title, description, event_type, start_date, end_date, all_day, location, reminder, reminder_minutes, is_recurring, recurring_pattern, status, environment, created_at) FROM stdin;
\.


--
-- Data for Name: cases; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cases (id, user_id, title, case_number, court, opposing_party, status, created_at, environment) FROM stdin;
\.


--
-- Data for Name: chain_of_custody; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.chain_of_custody (id, evidence_id, user_id, action, "timestamp", ip_address, user_agent, previous_hash, entry_hash, environment) FROM stdin;
\.


--
-- Data for Name: child_support_payments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.child_support_payments (id, user_id, payment_type, amount, due_date, paid_date, status, payment_method, reference_number, notes, child_name, court_order_id, environment, created_at) FROM stdin;
\.


--
-- Data for Name: consent_purposes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.consent_purposes (id, code, name, description, lawful_basis, is_required, data_categories, retention_period_days, is_active, created_at) FROM stdin;
\.


--
-- Data for Name: conversation_messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.conversation_messages (id, conversation_id, sender_id, sender_email, sender_name, content, input_type, voice_transcription, sentiment_score, sentiment_label, has_negative_content, negative_topics, is_edited, edited_at, is_deleted, deleted_at, created_at) FROM stdin;
\.


--
-- Data for Name: conversation_participants; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.conversation_participants (id, conversation_id, user_id, email, display_name, role, status, joined_at, left_at) FROM stdin;
\.


--
-- Data for Name: conversations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.conversations (id, creator_user_id, environment, title, type, status, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: data_classifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.data_classifications (id, name, level, description, handling_requirements, encryption_required, masking_required, audit_required, retention_days, created_at) FROM stdin;
\.


--
-- Data for Name: data_lineage_edges; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.data_lineage_edges (id, source_node_id, target_node_id, transformation_type, transformation_logic, is_active, created_at) FROM stdin;
\.


--
-- Data for Name: data_lineage_nodes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.data_lineage_nodes (id, node_type, entity_name, entity_type, description, metadata, source_id, created_at) FROM stdin;
\.


--
-- Data for Name: data_lineage_sources; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.data_lineage_sources (id, name, source_type, connection_details, schema_info, refresh_schedule, last_refreshed_at, is_active, created_at) FROM stdin;
\.


--
-- Data for Name: data_profiles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.data_profiles (id, run_id, table_name, column_name, data_type, total_count, null_count, unique_count, min_value, max_value, mean_value, std_dev_value, percentiles, top_values, profiled_at) FROM stdin;
\.


--
-- Data for Name: data_quality_test_runs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.data_quality_test_runs (id, test_id, status, actual_result, passed, error_message, records_checked, failed_records, execution_time_ms, executed_at) FROM stdin;
\.


--
-- Data for Name: data_quality_tests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.data_quality_tests (id, name, description, test_type, table_name, column_name, test_query, expected_result, threshold, severity, schedule, is_active, last_run_at, last_run_status, created_at) FROM stdin;
\.


--
-- Data for Name: data_subject_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.data_subject_requests (id, user_id, request_type, status, regulation_type, request_details, verification_method, verified_at, deadline_at, processed_at, processed_by, fulfillment_log, export_file_url, notes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: debts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.debts (id, user_id, name, category, amount, ownership, monthly_payment, environment, vendor, document_id, opened_date) FROM stdin;
\.


--
-- Data for Name: demo_meta; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.demo_meta (id, last_reset_at) FROM stdin;
1	2026-01-19 20:24:49.28036
\.


--
-- Data for Name: dim_date; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.dim_date (date_id, date_actual, year, quarter, month, day_of_month, day_of_week, is_weekend, is_holiday, week_of_year, month_name, day_name) FROM stdin;
\.


--
-- Data for Name: dim_subscription; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.dim_subscription (subscription_id, user_id, tier_id, status, start_date_id, end_date_id, billing_cycle, price_at_subscription, dbt_valid_from, dbt_valid_to, is_current) FROM stdin;
\.


--
-- Data for Name: dim_tier; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.dim_tier (tier_id, tier_name, price_usd_monthly, api_limit_daily, storage_gb, max_cases, max_violations_per_month, ai_features, priority_support, effective_from, effective_to) FROM stdin;
\.


--
-- Data for Name: dim_users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.dim_users (user_id, user_name, email, current_tier, tier_start_date, is_active, created_date_id, dbt_valid_from, dbt_valid_to, is_current) FROM stdin;
\.


--
-- Data for Name: document_line_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.document_line_items (id, document_id, user_id, line_item_index, label, category_hint, amount, amount_text, is_credit_or_refund, is_recurring_guess, page_number, surrounding_text_snippet, linked_record_type, linked_record_id, environment, created_at) FROM stdin;
\.


--
-- Data for Name: document_parse_results; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.document_parse_results (id, document_id, user_id, doc_type, parse_status, language, currency, vendor_name, account_number, billing_period_start, billing_period_end, statement_date, due_date, total_amount_due, total_amount_text, customer_name, service_address, mailing_address, raw_llm_response, notes, request_tokens, response_tokens, latency_ms, environment, created_at) FROM stdin;
a8aab28e-e329-4c29-a282-63f4e6625048	b83e3159-0590-4628-8803-a8f2fdd53e91	demo-user	CREDIT_CARD_STATEMENT	no_data	other	USD	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	{"notes": [], "currency": null, "doc_type": "CREDIT_CARD_STATEMENT", "due_date": null, "language": "other", "line_items": [], "vendor_name": null, "parse_status": "no_data", "customer_name": null, "account_number": null, "statement_date": null, "mailing_address": null, "service_address": null, "total_amount_due": null, "total_amount_text": null, "billing_period_end": null, "billing_period_start": null}	{}	1246	130	1460	demo	2026-01-18 18:44:33.478507
78b6da0a-90ee-4414-abd0-5d6ca5a09ec7	550f121c-57b6-4cf3-a19c-07409053f057	demo-user	CREDIT_CARD_STATEMENT	no_data	other	USD	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	{"notes": [], "currency": null, "doc_type": "CREDIT_CARD_STATEMENT", "due_date": null, "language": "other", "line_items": [], "vendor_name": null, "parse_status": "no_data", "customer_name": null, "account_number": null, "statement_date": null, "mailing_address": null, "service_address": null, "total_amount_due": null, "total_amount_text": null, "billing_period_end": null, "billing_period_start": null}	{}	1244	130	1909	demo	2026-01-19 01:57:21.196497
ee3563db-fd9f-4432-be36-391ab15a0768	4fdce7a1-d1fc-4517-b581-bdc962ed505b	demo-user	GENERIC_FINANCIAL_EXPENSE	no_data	other	USD	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	{"notes": [], "currency": null, "doc_type": "GENERIC_FINANCIAL_EXPENSE", "due_date": null, "language": "other", "line_items": [], "vendor_name": null, "parse_status": "no_data", "customer_name": null, "account_number": null, "statement_date": null, "mailing_address": null, "service_address": null, "total_amount_due": null, "total_amount_text": null, "billing_period_end": null, "billing_period_start": null}	{}	1245	132	1932	demo	2026-01-19 22:52:53.490339
505004c7-4a46-477a-a927-fefcd771c66d	7f3dc748-5e30-40cd-a6af-52a774e280f2	demo-user	CREDIT_CARD_STATEMENT	no_data	other	USD	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	{"notes": [], "currency": null, "doc_type": "CREDIT_CARD_STATEMENT", "due_date": null, "language": "other", "line_items": [], "vendor_name": null, "parse_status": "no_data", "customer_name": null, "account_number": null, "statement_date": null, "mailing_address": null, "service_address": null, "total_amount_due": null, "total_amount_text": null, "billing_period_end": null, "billing_period_start": null}	{}	1242	130	1729	demo	2026-01-19 23:18:49.639431
f3632021-c370-496b-bf6e-765905daecbc	b299e968-0492-4e9d-bf48-b0d6587d6355	demo-user	CREDIT_CARD_STATEMENT	no_data	other	USD	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	{"notes": [], "currency": null, "doc_type": "CREDIT_CARD_STATEMENT", "due_date": null, "language": "other", "line_items": [], "vendor_name": null, "parse_status": "no_data", "customer_name": null, "account_number": null, "statement_date": null, "mailing_address": null, "service_address": null, "total_amount_due": null, "total_amount_text": null, "billing_period_end": null, "billing_period_start": null}	{}	1244	130	2423	demo	2026-01-20 20:44:52.988005
8ce5deab-1c3d-4650-92cf-deed95aab17a	2766fb16-cdd0-49d4-84d9-b060a4abc639	demo-user	CREDIT_CARD_STATEMENT	no_data	other	USD	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	{"notes": [], "currency": null, "doc_type": "CREDIT_CARD_STATEMENT", "due_date": null, "language": "other", "line_items": [], "vendor_name": null, "parse_status": "no_data", "customer_name": null, "account_number": null, "statement_date": null, "mailing_address": null, "service_address": null, "total_amount_due": null, "total_amount_text": null, "billing_period_end": null, "billing_period_start": null}	{}	1243	130	2799	demo	2026-01-21 07:29:33.760592
\.


--
-- Data for Name: documents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.documents (id, user_id, title, category, description, file_url, file_name, file_type, file_size, tags, is_confidential, environment, created_at, updated_at, ai_category, ai_confidence, ai_summary, ai_suggested_tags, ai_analysis_status, ai_analyzed_at, mobile_uploaded, ai_extracted_text) FROM stdin;
d69229cc-252f-4e0c-a45f-9018abcc739e	demo-user	Atmos-Apri	financial	[Linked to: Financial Records]	\N	\N	\N	\N	\N	f	demo	2026-01-21 07:25:37.023966	2026-01-21 07:25:37.023966	\N	\N	\N	\N	pending	\N	f	\N
2766fb16-cdd0-49d4-84d9-b060a4abc639	demo-user	Atmos-April	financial	[Linked to: Financial Records]	\N	\N	\N	\N	\N	f	demo	2026-01-21 07:29:30.860869	2026-01-21 07:29:30.860869	debt_statement	0.33333334	CREDIT_CARD_STATEMENT: Unknown - null 0	\N	needs_review	2026-01-21 07:29:33.766	f	\N
df511aaf-1a31-4ed3-a2da-2b2d8746da25	demo-user	April	other	[Linked to: Financial Records]	\N	\N	\N	\N	\N	f	demo	2026-01-21 07:32:46.277462	2026-01-21 07:32:46.277462	\N	\N	\N	\N	pending	\N	f	\N
d4afce7b-4dfa-4907-bbf0-f9dc3623fe87	demo-user	April	other	[Linked to: Financial Records]	\N	\N	\N	\N	\N	f	demo	2026-01-21 07:39:04.224873	2026-01-21 07:39:04.224873	\N	\N	\N	\N	pending	\N	f	\N
a2b6a3fb-ed4e-44cf-b6a7-d4eda9400e2f	demo-user	April	other	[Linked to: Financial Records]	\N	\N	\N	\N	\N	f	demo	2026-01-21 07:51:04.943874	2026-01-21 07:51:04.943874	\N	\N	\N	\N	pending	\N	f	\N
\.


--
-- Data for Name: dq_alerts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.dq_alerts (id, run_id, metric_id, anomaly_id, reconciliation_result_id, alert_type, severity, title, description, affected_table, affected_column, suggested_action, is_resolved, resolved_by, resolved_at, created_at) FROM stdin;
272dda98-bfb8-4e6a-9d57-f0bc6fe85fd1	2ae320fd-60a1-4878-a55f-8ecf67bbcab6	\N	\N	\N	validation_failed	warning	Validation Failed: violations.category_not_null	Error evaluating expectation: column "category" does not exist	violations	category	Review and update records with null values, or adjust data quality rules if nulls are acceptable	f	\N	\N	2026-01-05 10:52:47.857101
d9e05404-977a-482b-a6de-a771676e5be1	2ae320fd-60a1-4878-a55f-8ecf67bbcab6	\N	\N	\N	validation_failed	warning	Validation Failed: violations.severity_score_between	Found 5 values out of range	violations	severity_score	Review the failed validation and correct the underlying data issues	f	\N	\N	2026-01-05 10:52:47.865105
dc1625a0-d8ce-450d-8444-0745d79d7bf2	2ae320fd-60a1-4878-a55f-8ecf67bbcab6	\N	\N	\N	validation_failed	info	Validation Failed: users_freshness	Error evaluating expectation: column "created_at" does not exist	users	created_at	Review the failed validation and correct the underlying data issues	f	\N	\N	2026-01-05 10:52:47.882393
45edd094-0c4f-48fb-a7e2-ce3f3de5d849	9db3f723-6192-41fc-9fd4-4d7c7528beaf	\N	\N	\N	validation_failed	warning	Validation Failed: violations.severity_score_between	Found 5 values out of range	violations	severity_score	Review the failed validation and correct the underlying data issues	f	\N	\N	2026-01-05 10:58:13.28655
\.


--
-- Data for Name: encryption_keys; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.encryption_keys (id, key_alias, key_type, algorithm, purpose, encrypted_key_material, key_version, status, rotation_schedule_days, last_rotated_at, expires_at, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: evidence_files; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.evidence_files (id, violation_id, user_id, file_name, file_type, file_size, object_path, "timestamp", device_id, gps_latitude, gps_longitude, altitude, network_type, exif_data, sha256_hash, is_encrypted, environment, evidence_source, evidence_metadata) FROM stdin;
\.


--
-- Data for Name: expenses; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.expenses (id, user_id, category, description, amount, frequency, owner, environment, vendor, document_id, start_date) FROM stdin;
\.


--
-- Data for Name: fact_financial_summary; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.fact_financial_summary (summary_id, user_id, summary_date_id, case_id, total_assets, total_debts, total_income, total_expenses, net_worth, asset_count, debt_count, income_source_count, expense_count, created_at) FROM stdin;
\.


--
-- Data for Name: fact_transactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.fact_transactions (transaction_id, user_id, transaction_date_id, amount_usd, transaction_type, payment_method, stripe_payment_intent_id, subscription_id, tier_id, currency, status, refund_reason, metadata, created_at) FROM stdin;
\.


--
-- Data for Name: fact_usage_metrics; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.fact_usage_metrics (metric_id, user_id, metric_date_id, metric_type, metric_value, unit, tier_id, quota_limit, percentage_used, created_at) FROM stdin;
\.


--
-- Data for Name: fact_violations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.fact_violations (violation_id, user_id, violation_date_id, violation_type, severity, case_id, description, evidence_count, is_resolved, resolved_date_id, metadata, created_at) FROM stdin;
\.


--
-- Data for Name: firefly_connections; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.firefly_connections (id, user_id, environment, instance_url, access_token, instance_version, is_active, auto_sync_enabled, last_sync_at, last_sync_status, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: firefly_sync_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.firefly_sync_logs (id, connection_id, user_id, environment, sync_type, source_type, source_id, firefly_transaction_id, status, error_message, synced_at) FROM stdin;
\.


--
-- Data for Name: improvement_recommendations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.improvement_recommendations (id, user_id, title, body, input_type, transcription, media_urls, status, environment, created_at, updated_at, user_email, edited_title, edited_body, admin_notes, reviewed_by, reviewed_at, test_user_id, test_user_email, test_feedback, test_approved, tested_at, implemented_at, implemented_by, changelog_entry, changelog_translations) FROM stdin;
\.


--
-- Data for Name: incomes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.incomes (id, user_id, source, amount, frequency, verified, owner, environment, vendor, document_id, start_date) FROM stdin;
\.


--
-- Data for Name: journal_attachments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.journal_attachments (id, journal_entry_id, user_id, file_name, file_type, file_url, file_size_bytes, ai_description, created_at) FROM stdin;
\.


--
-- Data for Name: journal_entries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.journal_entries (id, user_id, environment, title, content, input_type, voice_transcription, mood, tags, is_private, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: legal_documents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.legal_documents (id, user_id, title, document_type, description, file_url, file_name, file_size, status, court_case, filing_date, effective_date, expiration_date, parties, tags, environment, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: message_attachments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.message_attachments (id, message_id, file_name, file_type, file_url, file_size_bytes, created_at) FROM stdin;
\.


--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.messages (id, sender_id, sender_role, sender_name, content, "timestamp", is_read, attachment_url, attachment_name, environment) FROM stdin;
\.


--
-- Data for Name: metadata_catalog; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.metadata_catalog (id, entity_type, entity_name, schema_name, description, business_definition, data_owner, data_steward, tags, custom_properties, documentation, last_updated_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: mfa_challenges; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mfa_challenges (id, user_id, session_id, code_hash, channel, phone_number, attempt_count, max_attempts, created_at, expires_at, verified_at, last_resend_at, resend_count) FROM stdin;
\.


--
-- Data for Name: mobile_violation_reports; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mobile_violation_reports (id, user_id, title, violation_type, description, severity, location, occurred_at, related_document_ids, witnesses, status, environment, created_at, submitted_at, linked_violation_id) FROM stdin;
\.


--
-- Data for Name: pii_catalog; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pii_catalog (id, table_name, column_name, data_type, classification_id, pii_type, sensitivity_level, encryption_key_id, masking_profile, is_encrypted, sample_masked_value, business_owner, notes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: quality_anomalies; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.quality_anomalies (id, run_id, table_name, column_name, anomaly_type, severity, description, expected_baseline, actual_value, deviation_score, detected_at, is_acknowledged, acknowledged_by, acknowledged_at) FROM stdin;
\.


--
-- Data for Name: quality_metrics; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.quality_metrics (id, run_id, rule_id, check_name, table_name, column_name, expectation_type, expected_value, actual_value, passed, severity, message, metadata, checked_at) FROM stdin;
eac0b083-17a9-4acf-8502-ba0bee7de7c2	2ae320fd-60a1-4878-a55f-8ecf67bbcab6	\N	users.email_not_null	users	email	not_null	0	0	t	critical	All values are non-null	{}	2026-01-05 10:52:47.832302
059c535a-2fd4-4a86-92a8-c131d6f5b487	2ae320fd-60a1-4878-a55f-8ecf67bbcab6	\N	users.subscription_tier_not_null	users	subscription_tier	not_null	0	0	t	critical	All values are non-null	{}	2026-01-05 10:52:47.83757
1669751d-3d59-41b0-aa8e-141651353072	2ae320fd-60a1-4878-a55f-8ecf67bbcab6	\N	users.email_unique	users	email	unique	0	0	t	critical	All values are unique	{"duplicates": []}	2026-01-05 10:52:47.84088
29858c98-fdb4-41ac-a6df-5ed32dd4eace	2ae320fd-60a1-4878-a55f-8ecf67bbcab6	\N	users.subscription_tier_in_set	users	subscription_tier	in_set	0	0	t	critical	All values are in the allowed set	{}	2026-01-05 10:52:47.843773
5cdc950d-00a6-4ef6-b47e-77f1612d778d	2ae320fd-60a1-4878-a55f-8ecf67bbcab6	\N	users.role_in_set	users	role	in_set	0	0	t	warning	All values are in the allowed set	{}	2026-01-05 10:52:47.846276
fdbc1a20-1159-4808-b0ad-6102c9c47b58	2ae320fd-60a1-4878-a55f-8ecf67bbcab6	\N	cases.user_id_not_null	cases	user_id	not_null	0	0	t	critical	All values are non-null	{}	2026-01-05 10:52:47.848258
2130f9a5-0456-45fb-b510-6c9c9c0ff13c	2ae320fd-60a1-4878-a55f-8ecf67bbcab6	\N	cases.user_id_ref_users	cases	user_id	referential_integrity	0	0	t	critical	Referential integrity maintained	{}	2026-01-05 10:52:47.850258
462a1262-735f-4cb3-b88f-db107e79ddac	2ae320fd-60a1-4878-a55f-8ecf67bbcab6	\N	violations.category_not_null	violations	category	not_null	success	error	f	warning	Error evaluating expectation: column "category" does not exist	{}	2026-01-05 10:52:47.85286
e23debda-0c71-468b-bf7d-48a9bcf5000e	2ae320fd-60a1-4878-a55f-8ecf67bbcab6	\N	violations.status_in_set	violations	status	in_set	0	0	t	warning	All values are in the allowed set	{}	2026-01-05 10:52:47.86019
9d3d0a80-99ae-4f23-8efe-92111b2b4bed	2ae320fd-60a1-4878-a55f-8ecf67bbcab6	\N	violations.severity_score_between	violations	severity_score	between	0	5	f	warning	Found 5 values out of range	{}	2026-01-05 10:52:47.862661
34e0e077-d248-4a95-992f-84af3577bd37	2ae320fd-60a1-4878-a55f-8ecf67bbcab6	\N	violations.user_id_ref_users	violations	user_id	referential_integrity	0	0	t	critical	Referential integrity maintained	{}	2026-01-05 10:52:47.868048
7c25318e-2b2c-4112-b146-f599056213eb	2ae320fd-60a1-4878-a55f-8ecf67bbcab6	\N	transactions.amount_not_null	transactions	amount	not_null	0	0	t	critical	All values are non-null	{}	2026-01-05 10:52:47.869905
c7c710d1-a3d2-4b50-baf2-430b37b3c015	2ae320fd-60a1-4878-a55f-8ecf67bbcab6	\N	transactions.amount_between	transactions	amount	between	0	0	t	warning	All values are between -1000000000 and 1000000000	{}	2026-01-05 10:52:47.872392
18c9f219-2b83-4349-a9db-033d469a7acd	2ae320fd-60a1-4878-a55f-8ecf67bbcab6	\N	transactions.user_id_ref_users	transactions	user_id	referential_integrity	0	0	t	critical	Referential integrity maintained	{}	2026-01-05 10:52:47.875809
0c8210bf-9537-426e-b149-a62343be32c5	2ae320fd-60a1-4878-a55f-8ecf67bbcab6	\N	users_freshness	users	created_at	freshness	success	error	f	info	Error evaluating expectation: column "created_at" does not exist	{}	2026-01-05 10:52:47.879633
becce68c-a6ce-448e-840c-79ae5fa60167	9db3f723-6192-41fc-9fd4-4d7c7528beaf	\N	users.email_not_null	users	email	not_null	0	0	t	critical	All values are non-null	{}	2026-01-05 10:58:13.249198
1c24e69f-f7e8-46dc-96fb-82845db306fa	9db3f723-6192-41fc-9fd4-4d7c7528beaf	\N	users.subscription_tier_not_null	users	subscription_tier	not_null	0	0	t	critical	All values are non-null	{}	2026-01-05 10:58:13.260211
70797750-2ceb-485c-b7c4-1123667789fb	9db3f723-6192-41fc-9fd4-4d7c7528beaf	\N	users.email_unique	users	email	unique	0	0	t	critical	All values are unique	{"duplicates": []}	2026-01-05 10:58:13.265011
2a466ee7-748e-4914-92c3-5020e7fb26ff	9db3f723-6192-41fc-9fd4-4d7c7528beaf	\N	users.subscription_tier_in_set	users	subscription_tier	in_set	0	0	t	critical	All values are in the allowed set	{}	2026-01-05 10:58:13.268392
67c15342-7f10-44de-a5ad-826aafcdbe91	9db3f723-6192-41fc-9fd4-4d7c7528beaf	\N	users.role_in_set	users	role	in_set	0	0	t	warning	All values are in the allowed set	{}	2026-01-05 10:58:13.271917
fac601b9-ceec-452e-a84e-2b0c683b7a1d	9db3f723-6192-41fc-9fd4-4d7c7528beaf	\N	cases.user_id_not_null	cases	user_id	not_null	0	0	t	critical	All values are non-null	{}	2026-01-05 10:58:13.275382
2afb4617-b863-49fe-b96b-aa5833715266	9db3f723-6192-41fc-9fd4-4d7c7528beaf	\N	cases.user_id_ref_users	cases	user_id	referential_integrity	0	0	t	critical	Referential integrity maintained	{}	2026-01-05 10:58:13.278342
2734ddd5-b333-4c4f-890e-0490df78a6e1	9db3f723-6192-41fc-9fd4-4d7c7528beaf	\N	violations.status_in_set	violations	status	in_set	0	0	t	warning	All values are in the allowed set	{}	2026-01-05 10:58:13.28088
8dd49729-99d4-4160-b0e5-b9acd0175682	9db3f723-6192-41fc-9fd4-4d7c7528beaf	\N	violations.severity_score_between	violations	severity_score	between	0	5	f	warning	Found 5 values out of range	{}	2026-01-05 10:58:13.283685
d3442010-cb14-4eee-8735-08897e9c3b12	9db3f723-6192-41fc-9fd4-4d7c7528beaf	\N	violations.user_id_ref_users	violations	user_id	referential_integrity	0	0	t	critical	Referential integrity maintained	{}	2026-01-05 10:58:13.289235
25314866-e3dc-4249-b743-f31b79fe3619	9db3f723-6192-41fc-9fd4-4d7c7528beaf	\N	transactions.amount_not_null	transactions	amount	not_null	0	0	t	critical	All values are non-null	{}	2026-01-05 10:58:13.292563
903a9f05-f2c6-4bca-9f4f-e2c7d05bacc5	9db3f723-6192-41fc-9fd4-4d7c7528beaf	\N	transactions.amount_between	transactions	amount	between	0	0	t	warning	All values are between -1000000000 and 1000000000	{}	2026-01-05 10:58:13.294568
a8c38b17-c97d-46d2-9493-3d19d186d8b4	9db3f723-6192-41fc-9fd4-4d7c7528beaf	\N	transactions.user_id_ref_users	transactions	user_id	referential_integrity	0	0	t	critical	Referential integrity maintained	{}	2026-01-05 10:58:13.297216
\.


--
-- Data for Name: quality_rules; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.quality_rules (id, name, description, rule_type, target_system, target_table, target_column, expectation_type, parameters, severity, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: quality_runs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.quality_runs (id, run_type, target_system, status, total_checks, passed_checks, failed_checks, warning_checks, started_at, completed_at, metadata) FROM stdin;
2ae320fd-60a1-4878-a55f-8ecf67bbcab6	validation	app	completed	15	12	0	2	2026-01-05 10:52:47.805351	2026-01-05 10:52:47.885009	\N
9db3f723-6192-41fc-9fd4-4d7c7528beaf	validation	app	completed	13	12	0	1	2026-01-05 10:58:13.222694	2026-01-05 10:58:13.299491	\N
\.


--
-- Data for Name: quickbooks_sync_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.quickbooks_sync_log (id, user_id, action, qb_entity_type, qb_entity_id, request_method, request_path, response_status, error_message, metadata, created_at) FROM stdin;
\.


--
-- Data for Name: quota_reset_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.quota_reset_log (id, user_id, reset_at, reset_month, violations_count_before, voice_transcriptions_before, media_uploads_before) FROM stdin;
\.


--
-- Data for Name: reconciliation_jobs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.reconciliation_jobs (id, job_name, source_system, target_system, reconciliation_type, source_query, target_query, match_keys, tolerance_percent, is_active, schedule, created_at) FROM stdin;
\.


--
-- Data for Name: reconciliation_results; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.reconciliation_results (id, job_id, run_id, status, source_count, target_count, matched_count, mismatched_count, source_sum, target_sum, variance, variance_percent, details, executed_at) FROM stdin;
\.


--
-- Data for Name: reimbursements; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.reimbursements (id, user_id, category, description, amount, owed_by, status, due_date, notes, linked_document_ids, environment, created_at) FROM stdin;
\.


--
-- Data for Name: retention_jobs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.retention_jobs (id, policy_id, status, records_processed, records_archived, records_deleted, error_message, started_at, completed_at) FROM stdin;
\.


--
-- Data for Name: retention_policies; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.retention_policies (id, name, table_name, data_category, retention_period_days, archive_after_days, delete_after_days, purge_mode, archive_bucket, legal_hold_enabled, condition_column, condition_value, is_active, last_executed_at, created_at) FROM stdin;
\.


--
-- Data for Name: scheduled_job_runs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.scheduled_job_runs (id, job_name, idempotency_key, status, started_at, completed_at, duration_ms, result, error_message, app_mode) FROM stdin;
\.


--
-- Data for Name: security_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.security_events (id, user_id, session_id, device_id, event_type, event_status, ip_address, user_agent, location, metadata, risk_score, risk_factors, created_at) FROM stdin;
df5bf63b-54ea-4f04-b1b2-0397a52c3280	6ad48cb0-0cae-4e1f-b0a9-1e5a711bc559	7045dbdd-6809-409c-ac82-39802924153b	a63fcc00-f573-4430-9ac0-e6ba19a4a7a7	login_success	success	127.0.0.1	curl/8.14.1	\N	\N	\N	\N	2026-01-17 21:49:43.586242
16f193de-5c8d-4da1-b0fc-e87fb7eecfba	demo-user	3f2410f6-fb04-4cc2-abd7-e9d54a617122	aabd84de-fbb1-42a9-96da-54f46f73a9a5	login_success	success	10.82.4.28	Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Mobile/15E148 Safari/604.1	\N	\N	\N	\N	2026-01-18 03:29:30.894541
df535277-87aa-406d-9e80-927b35256e4c	demo-user	7cda8e62-47b6-43f3-bf39-96a6069b4c1a	aff2b961-90da-48f7-b8df-7bbf67f6a796	login_success	success	10.82.9.7	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36	\N	\N	\N	\N	2026-01-18 18:28:58.44745
545d5a94-79ed-49bb-a563-8137a190acb2	demo-user	c7b76abc-c097-499c-bca6-cd8a085bc124	aff2b961-90da-48f7-b8df-7bbf67f6a796	login_success	success	10.82.5.33	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36	\N	\N	\N	\N	2026-01-19 01:56:56.990682
6a7ae52f-93bc-4cc2-a6d6-cfdec9944772	demo-user	c592b2a0-4d64-4fd6-a368-ade24542ece8	7f1faaca-4d72-4fdc-a566-c776bf1d31ba	login_success	success	10.82.9.46	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36	\N	\N	\N	\N	2026-01-19 13:44:17.582857
c5ed2128-2a82-4fc7-b722-c3e3e27d726f	demo-user	000327c0-cfbf-46de-be8a-054b4aa27614	5cde35e5-3b85-4d3c-a1c8-0924bee859f8	login_success	success	10.82.9.46	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36	\N	\N	\N	\N	2026-01-19 17:00:48.304324
6aecc522-ebad-44ea-8ca3-b0881b84ef3e	demo-user	935ad900-17ab-4e5a-8918-1a6619f91d29	d019f00b-361e-4975-84d2-0b321438e186	login_success	success	10.82.0.24	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36	\N	\N	\N	\N	2026-01-19 17:59:38.897182
3cd09fd0-5782-4bef-87c0-136b34ed040a	demo-user	f503f150-cd2e-40f3-a420-371a1cf87116	f404c602-7b1f-4b57-a1b9-3b05248aa587	login_success	success	127.0.0.1	curl/8.14.1	\N	\N	\N	\N	2026-01-21 04:39:49.678185
9485a136-1bee-4a3d-92e2-80ba20d0eef2	demo-user	9c6b62b5-5066-4431-ba3e-189b5bf4b6ac	f404c602-7b1f-4b57-a1b9-3b05248aa587	login_success	success	127.0.0.1	curl/8.14.1	\N	\N	\N	\N	2026-01-21 04:40:07.581458
d4391396-db43-4104-b39d-c937bcfc58ad	demo-user	733ba19f-6602-49b9-8b87-364c516fa6ea	ef76c997-646d-4ec6-b49b-b0ce70067b8e	login_success	success	127.0.0.1	curl/8.14.1	\N	\N	\N	\N	2026-01-21 04:40:09.006278
687cc1c0-54cd-4d3e-ba25-47b20be129ad	demo-user	6a86688a-3827-4f92-974c-4c08e43355f0	1c349e1d-3651-4102-a646-0062b43ab8b7	login_success	success	127.0.0.1	curl/8.14.1	\N	\N	\N	\N	2026-01-21 04:52:37.835719
99c26e34-5329-4da7-8759-7b59676167f3	demo-user	ab691abd-dad8-4650-8b76-a941cd5ba67a	d04847ee-1949-404f-a2ee-7bebae1a6598	login_success	success	127.0.0.1	curl/8.14.1	\N	\N	\N	\N	2026-01-21 04:52:49.948295
6f85237e-f091-4b7e-aff0-f0227efddf71	demo-user	\N	\N	all_sessions_revoked	success	10.82.4.28	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36	\N	\N	\N	\N	2026-01-21 07:23:47.050489
\.


--
-- Data for Name: sentiment_report_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sentiment_report_items (id, report_id, message_id, sender_name, sender_email, message_content, message_timestamp, sentiment_score, primary_topic, secondary_topics, ai_analysis, created_at) FROM stdin;
\.


--
-- Data for Name: sentiment_reports; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sentiment_reports (id, conversation_id, generated_by_user_id, environment, title, report_type, date_range_start, date_range_end, total_messages_analyzed, negative_message_count, topic_breakdown, participant_breakdown, summary, recommendations, pdf_url, shared_with, status, created_at) FROM stdin;
\.


--
-- Data for Name: sms_deliveries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sms_deliveries (id, user_id, challenge_id, twilio_message_sid, to_phone_number, from_phone_number, status, error_code, error_message, created_at, delivered_at) FROM stdin;
\.


--
-- Data for Name: teams; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.teams (id, name, owner_id, tier, stripe_customer_id, stripe_subscription_id, subscription_status, created_at) FROM stdin;
\.


--
-- Data for Name: tier_limits; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tier_limits (tier, max_cases, max_violations_per_month, max_voice_transcriptions, max_media_uploads, ai_classification_enabled, price_monthly) FROM stdin;
free	1	25	10	5	f	0
individual	1	-1	100	50	t	12
pro	-1	-1	-1	-1	t	49
team	-1	-1	-1	-1	t	149
enterprise	-1	-1	-1	-1	t	399
\.


--
-- Data for Name: tier_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tier_migrations (id, user_id, from_tier, to_tier, reason, grace_period_days, migrated_at, effective_at, status) FROM stdin;
migration_demo-user_1767599866984	demo-user	pro	team	Upgrade test	7	2026-01-05 07:57:46.98599	2026-01-12 07:57:46.984	pending
\.


--
-- Data for Name: transactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.transactions (id, user_id, date, description, amount, category, type, environment, vendor, document_id) FROM stdin;
\.


--
-- Data for Name: usage_audit; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.usage_audit (id, user_id, tier, violations_count, storage_used_mb, media_count, active_cases, recorded_at, environment) FROM stdin;
faf4aa2b-e60a-4072-83cc-6b53efc8bbdf	demo-user	pro	5	0	0	0	2026-01-05 07:48:38.584174	demo
bf575be0-55e1-468f-b548-cf7cc43d68ce	demo-user	pro	5	0	0	0	2026-01-05 07:49:49.843114	demo
\.


--
-- Data for Name: user_consents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_consents (id, user_id, purpose_id, consent_given, consent_method, ip_address, user_agent, consent_version, expires_at, revoked_at, created_at) FROM stdin;
\.


--
-- Data for Name: user_devices; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_devices (id, user_id, device_fingerprint, device_name, user_agent, platform, browser, is_trusted, is_blocked, first_seen_at, last_seen_at, last_ip, last_location) FROM stdin;
a63fcc00-f573-4430-9ac0-e6ba19a4a7a7	6ad48cb0-0cae-4e1f-b0a9-1e5a711bc559	curl/8.14.1-127.0.0.1	Desktop - Unknown	curl/8.14.1	Desktop	Unknown	f	f	2026-01-17 21:48:22.459209	2026-01-17 21:48:22.459209	127.0.0.1	\N
aabd84de-fbb1-42a9-96da-54f46f73a9a5	demo-user	Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Vers	Mobile - Safari	Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Mobile/15E148 Safari/604.1	Mobile	Safari	f	f	2026-01-18 03:29:30.883192	2026-01-18 03:29:30.883192	10.82.4.28	\N
aff2b961-90da-48f7-b8df-7bbf67f6a796	demo-user	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Sa	Desktop - Chrome	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36	Desktop	Chrome	f	f	2026-01-18 18:28:58.259501	2026-01-18 18:28:58.259501	10.82.9.7	\N
7f1faaca-4d72-4fdc-a566-c776bf1d31ba	demo-user	-ndz4g6-mkl7v4tu	Desktop - Chrome	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36	Desktop	Chrome	f	f	2026-01-19 13:44:17.392999	2026-01-19 13:44:17.392999	10.82.9.46	\N
5cde35e5-3b85-4d3c-a1c8-0924bee859f8	demo-user	-ndz4g6-mklevv62	Desktop - Chrome	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36	Desktop	Chrome	f	f	2026-01-19 17:00:48.280402	2026-01-19 17:00:48.280402	10.82.9.46	\N
d019f00b-361e-4975-84d2-0b321438e186	demo-user	-ndz4g6-mklgzihi	Desktop - Chrome	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36	Desktop	Chrome	f	f	2026-01-19 17:59:38.767511	2026-01-19 17:59:38.767511	10.82.0.24	\N
f404c602-7b1f-4b57-a1b9-3b05248aa587	demo-user	test-fingerprint-abc	Desktop - Unknown	curl/8.14.1	Desktop	Unknown	f	f	2026-01-21 04:39:49.668481	2026-01-21 04:39:49.668481	127.0.0.1	\N
ef76c997-646d-4ec6-b49b-b0ce70067b8e	demo-user	new-device-fingerprint-xyz	Desktop - Unknown	curl/8.14.1	Desktop	Unknown	f	f	2026-01-21 04:40:08.999804	2026-01-21 04:40:08.999804	127.0.0.1	\N
1c349e1d-3651-4102-a646-0062b43ab8b7	demo-user	curl/8.14.1-127.0.0.1	Desktop - Unknown	curl/8.14.1	Desktop	Unknown	f	f	2026-01-21 04:52:37.826297	2026-01-21 04:52:37.826297	127.0.0.1	\N
d04847ee-1949-404f-a2ee-7bebae1a6598	demo-user	test-fingerprint-12345	Desktop - Unknown	curl/8.14.1	Desktop	Unknown	f	f	2026-01-21 04:52:49.938687	2026-01-21 04:52:49.938687	127.0.0.1	\N
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, email, password, full_name, role, environment, subscription_tier, profile_photo, stripe_customer_id, stripe_subscription_id, subscription_status, cases_count, violations_count_this_month, billing_cycle_start, team_id, voice_transcriptions_this_month, media_uploads_this_month, qb_realm_id, qb_token_expires_at, qb_connected, qb_scopes, qb_company_name, qb_last_sync_at, qb_access_token_encrypted, qb_refresh_token_encrypted, qb_connected_at, qb_api_calls_today, qb_daily_reset_at, qb_access_token_iv, qb_access_token_auth_tag, qb_refresh_token_iv, qb_refresh_token_auth_tag, is_admin, status, created_at, last_login_at, password_reset_token, password_reset_expires, phone_number, phone_verified_at, two_factor_enabled, two_factor_method) FROM stdin;
6ad48cb0-0cae-4e1f-b0a9-1e5a711bc559	nedpearson@gmail.com	$2b$12$DVM0PFbvnA.R9oUVRnwXX.NzIQME6.OcZsz/BLK9UOMGv7FF.wkaO	Test Admin User	admin	live-1736731909898-admin	free	\N	\N	\N	active	0	0	\N	\N	0	0	\N	\N	f	\N	\N	\N	\N	\N	\N	0	\N	\N	\N	\N	\N	t	active	2026-01-12 02:35:09.898752	2026-01-17 21:49:43.518	2cbd1ad139374a96f903faaf7e1830fb22fed6cc199a74f454f89f296c49d8c0	2026-01-12 04:04:12.836	\N	\N	f	sms
test-user-1	test1@divorcease.ai	$2b$12$npnW6AzhvOlhEajYcv/WTuYw5lWoNgn4E8Tqq3xKKlCBwSIIivRMG	Test User 1	client	demo-test1	pro	\N	\N	\N	active	0	0	\N	\N	0	0	\N	\N	f	\N	\N	\N	\N	\N	\N	0	\N	\N	\N	\N	\N	f	active	2026-01-13 05:44:50.40992	\N	\N	\N	\N	\N	f	sms
test-user-2	test2@divorcease.ai	$2b$12$RJfZf7Sh5XJe.Cgk3GYvAuep0Q9mv/M/BEKYikD/YEJiLLT4kI6JC	Test User 2	client	demo-test2	pro	\N	\N	\N	active	0	0	\N	\N	0	0	\N	\N	f	\N	\N	\N	\N	\N	\N	0	\N	\N	\N	\N	\N	f	active	2026-01-13 05:44:50.814666	\N	\N	\N	\N	\N	f	sms
test-user-3	test3@divorcease.ai	$2b$12$1BE6q08WAj03HI0l.SJu3.fb8D2EtmSrs7WZa9Kfk6jIulBa70sne	Test User 3	client	demo-test3	pro	\N	\N	\N	active	0	0	\N	\N	0	0	\N	\N	f	\N	\N	\N	\N	\N	\N	0	\N	\N	\N	\N	\N	f	active	2026-01-13 05:44:51.184296	\N	\N	\N	\N	\N	f	sms
test-user-4	test4@divorcease.ai	$2b$12$TMRjynRn01szs71qALLxO.Lw4DpZH1ikJ2TeYwF5/HamZImJPW19O	Test User 4	client	demo-test4	pro	\N	\N	\N	active	0	0	\N	\N	0	0	\N	\N	f	\N	\N	\N	\N	\N	\N	0	\N	\N	\N	\N	\N	f	active	2026-01-13 05:44:51.622217	\N	\N	\N	\N	\N	f	sms
test-user-5	test5@divorcease.ai	$2b$12$TLDT1UmJ1vHBIkF8GgeiM.geqX42HhqDmCbLJ6er0axTiB4N3rMey	Test User 5	client	demo-test5	pro	\N	\N	\N	active	0	0	\N	\N	0	0	\N	\N	f	\N	\N	\N	\N	\N	\N	0	\N	\N	\N	\N	\N	f	active	2026-01-13 05:44:51.936394	\N	\N	\N	\N	\N	f	sms
demo-user	demo@divorcease.ai	$2b$12$/rEixedxmN.gH9FvWbNV0.GqS2GfSPbClQ2Cnnu0TX3pdAjpfb0ke	Sarah Johnson	client	demo	pro	\N	\N	\N	active	0	0	\N	\N	0	0	\N	\N	f	\N	\N	\N	\N	\N	\N	0	2026-01-21	\N	\N	\N	\N	f	active	2026-01-13 05:59:33.331257	2026-01-21 07:54:40.575	\N	\N	\N	\N	f	sms
\.


--
-- Data for Name: violations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.violations (id, user_id, type, description, "timestamp", location, media_urls, status, environment, photo_count, video_duration, witnesses, is_draft, audio_transcript, audio_file_url, ai_classification, ai_confidence_score, voice_notes, media_descriptions, case_id, severity_score) FROM stdin;
\.


--
-- Data for Name: w2_records; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.w2_records (id, user_id, party, tax_year, employer_name, employer_ein, wages_and_tips, federal_withheld, social_security_wages, social_security_withheld, medicare_wages, medicare_withheld, state_wages, state_withheld, other_compensation, notes, document_id, verified, environment, created_at) FROM stdin;
\.


--
-- Data for Name: _managed_webhooks; Type: TABLE DATA; Schema: stripe; Owner: -
--

COPY stripe._managed_webhooks (id, object, url, enabled_events, description, enabled, livemode, metadata, secret, status, api_version, created, updated_at, last_synced_at, account_id) FROM stdin;
we_1Sm5LkAT8DyVApjFVAQnYpKC	webhook_endpoint	https://ee4947c9-175f-4738-a0a2-84e81ada56a8-00-2du0derpsr10q.worf.replit.dev/api/stripe/webhook	["charge.captured", "charge.dispute.closed", "charge.dispute.created", "charge.dispute.funds_reinstated", "charge.dispute.funds_withdrawn", "charge.dispute.updated", "charge.expired", "charge.failed", "charge.pending", "charge.refund.updated", "charge.refunded", "charge.succeeded", "charge.updated", "checkout.session.async_payment_failed", "checkout.session.async_payment_succeeded", "checkout.session.completed", "checkout.session.expired", "credit_note.created", "credit_note.updated", "credit_note.voided", "customer.created", "customer.deleted", "customer.subscription.created", "customer.subscription.deleted", "customer.subscription.paused", "customer.subscription.pending_update_applied", "customer.subscription.pending_update_expired", "customer.subscription.resumed", "customer.subscription.trial_will_end", "customer.subscription.updated", "customer.tax_id.created", "customer.tax_id.deleted", "customer.tax_id.updated", "customer.updated", "entitlements.active_entitlement_summary.updated", "invoice.created", "invoice.deleted", "invoice.finalization_failed", "invoice.finalized", "invoice.marked_uncollectible", "invoice.paid", "invoice.payment_action_required", "invoice.payment_failed", "invoice.payment_succeeded", "invoice.sent", "invoice.upcoming", "invoice.updated", "invoice.voided", "payment_intent.amount_capturable_updated", "payment_intent.canceled", "payment_intent.created", "payment_intent.partially_funded", "payment_intent.payment_failed", "payment_intent.processing", "payment_intent.requires_action", "payment_intent.succeeded", "payment_method.attached", "payment_method.automatically_updated", "payment_method.card_automatically_updated", "payment_method.detached", "payment_method.updated", "plan.created", "plan.deleted", "plan.updated", "price.created", "price.deleted", "price.updated", "product.created", "product.deleted", "product.updated", "radar.early_fraud_warning.created", "radar.early_fraud_warning.updated", "refund.created", "refund.failed", "refund.updated", "review.closed", "review.opened", "setup_intent.canceled", "setup_intent.created", "setup_intent.requires_action", "setup_intent.setup_failed", "setup_intent.succeeded", "subscription_schedule.aborted", "subscription_schedule.canceled", "subscription_schedule.completed", "subscription_schedule.created", "subscription_schedule.expiring", "subscription_schedule.released", "subscription_schedule.updated"]	\N	\N	f	{"managed_by": "stripe-sync"}	whsec_SnN6FIAN9myT1j6MyQPMlzgvdrExJkMt	enabled	\N	1767587100	2026-01-05 04:25:00.531996+00	2026-01-05 04:25:00.53+00	acct_1SlvqPAT8DyVApjF
\.


--
-- Data for Name: _migrations; Type: TABLE DATA; Schema: stripe; Owner: -
--

COPY stripe._migrations (id, name, hash, executed_at) FROM stdin;
0	initial_migration	c18983eedaa79cc2f6d92727d70c4f772256ef3d	2026-01-05 04:24:51.01154
1	products	b99ffc23df668166b94156f438bfa41818d4e80c	2026-01-05 04:24:51.020305
2	customers	33e481247ddc217f4e27ad10dfe5430097981670	2026-01-05 04:24:51.034614
3	prices	7d5ff35640651606cc24cec8a73ff7c02492ecdf	2026-01-05 04:24:51.044989
4	subscriptions	2cc6121a943c2a623c604e5ab12118a57a6c329a	2026-01-05 04:24:51.056268
5	invoices	7fbb4ccb4ed76a830552520739aaa163559771b1	2026-01-05 04:24:51.068865
6	charges	fb284ed969f033f5ce19f479b7a7e27871bddf09	2026-01-05 04:24:51.080776
7	coupons	7ed6ec4133f120675fd7888c0477b6281743fede	2026-01-05 04:24:51.089653
8	disputes	29bdb083725efe84252647f043f5f91cd0dabf43	2026-01-05 04:24:51.101319
9	events	b28cb55b5b69a9f52ef519260210cd76eea3c84e	2026-01-05 04:24:51.109587
10	payouts	69d1050b88bba1024cea4a671f9633ce7bfe25ff	2026-01-05 04:24:51.118034
11	plans	fc1ae945e86d1222a59cbcd3ae7e81a3a282a60c	2026-01-05 04:24:51.125551
12	add_updated_at	1d80945ef050a17a26e35e9983a58178262470f2	2026-01-05 04:24:51.138104
13	add_subscription_items	2aa63409bfe910add833155ad7468cdab844e0f1	2026-01-05 04:24:51.14531
14	migrate_subscription_items	8c2a798b44a8a0d83ede6f50ea7113064ecc1807	2026-01-05 04:24:51.15486
15	add_customer_deleted	6886ddfd8c129d3c4b39b59519f92618b397b395	2026-01-05 04:24:51.159503
16	add_invoice_indexes	d6bb9a09d5bdf580986ed14f55db71227a4d356d	2026-01-05 04:24:51.164118
17	drop_charges_unavailable_columns	61cd5adec4ae2c308d2c33d1b0ed203c7d074d6a	2026-01-05 04:24:51.173435
18	setup_intents	1d45d0fa47fc145f636c9e3c1ea692417fbb870d	2026-01-05 04:24:51.177764
19	payment_methods	705bdb15b50f1a97260b4f243008b8a34d23fb09	2026-01-05 04:24:51.188628
20	disputes_payment_intent_created_idx	18b2cecd7c097a7ea3b3f125f228e8790288d5ca	2026-01-05 04:24:51.20001
21	payment_intent	b1f194ff521b373c4c7cf220c0feadc253ebff0b	2026-01-05 04:24:51.209522
22	adjust_plans	e4eae536b0bc98ee14d78e818003952636ee877c	2026-01-05 04:24:51.22804
23	invoice_deleted	78e864c3146174fee7d08f05226b02d931d5b2ae	2026-01-05 04:24:51.231314
24	subscription_schedules	85fa6adb3815619bb17e1dafb00956ff548f7332	2026-01-05 04:24:51.234799
25	tax_ids	3f9a1163533f9e60a53d61dae5e451ab937584d9	2026-01-05 04:24:51.245097
26	credit_notes	e099b6b04ee607ee868d82af5193373c3fc266d2	2026-01-05 04:24:51.2583
27	add_marketing_features_to_products	6ed1774b0a9606c5937b2385d61057408193e8a7	2026-01-05 04:24:51.273655
28	early_fraud_warning	e615b0b73fa13d3b0508a1956d496d516f0ebf40	2026-01-05 04:24:51.27737
29	reviews	dd3f914139725a7934dc1062de4cc05aece77aea	2026-01-05 04:24:51.292072
30	refunds	f76c4e273eccdc96616424d73967a9bea3baac4e	2026-01-05 04:24:51.307286
31	add_default_price	6d10566a68bc632831fa25332727d8ff842caec5	2026-01-05 04:24:51.322032
32	update_subscription_items	e894858d46840ba4be5ea093cdc150728bd1d66f	2026-01-05 04:24:51.328653
33	add_last_synced_at	43124eb65b18b70c54d57d2b4fcd5dae718a200f	2026-01-05 04:24:51.33265
34	remove_foreign_keys	e72ec19f3232cf6e6b7308ebab80341c2341745f	2026-01-05 04:24:51.338117
35	checkout_sessions	dc294f5bb1a4d613be695160b38a714986800a75	2026-01-05 04:24:51.344917
36	checkout_session_line_items	82c8cfce86d68db63a9fa8de973bfe60c91342dd	2026-01-05 04:24:51.368612
37	add_features	c68a2c2b7e3808eed28c8828b2ffd3a2c9bf2bd4	2026-01-05 04:24:51.38601
38	active_entitlement	5b3858e7a52212b01e7f338cf08e29767ab362af	2026-01-05 04:24:51.403511
39	add_paused_to_subscription_status	09012b5d128f6ba25b0c8f69a1203546cf1c9f10	2026-01-05 04:24:51.421892
40	managed_webhooks	1d453dfd0e27ff0c2de97955c4ec03919af0af7f	2026-01-05 04:24:51.426094
41	rename_managed_webhooks	ad7cd1e4971a50790bf997cd157f3403d294484f	2026-01-05 04:24:51.448567
42	convert_to_jsonb_generated_columns	e0703a0e5cd9d97db53d773ada1983553e37813c	2026-01-05 04:24:51.453739
43	add_account_id	9a6beffdd0972e3657b7118b2c5001be1f815faf	2026-01-05 04:24:54.897924
44	make_account_id_required	05c1e9145220e905e0c1ca5329851acaf7e9e506	2026-01-05 04:24:54.910001
45	sync_status	2f88c4883fa885a6eaa23b8b02da958ca77a1c21	2026-01-05 04:24:54.923245
46	sync_status_per_account	b1f1f3d4fdb4b4cf4e489d4b195c7f0f97f9f27c	2026-01-05 04:24:54.935579
47	api_key_hashes	8046e4c57544b8eae277b057d201a28a4529ffe3	2026-01-05 04:24:54.964594
48	rename_reserved_columns	e32290f655550ed308a7f2dcb5b0114e49a0558e	2026-01-05 04:24:54.968948
49	remove_redundant_underscores_from_metadata_tables	96d6f3a54e17d8e19abd022a030a95a6161bf73e	2026-01-05 04:24:59.267214
50	rename_id_to_match_stripe_api	c5300c5a10081c033dab9961f4e3cd6a2440c2b6	2026-01-05 04:24:59.280933
51	remove_webhook_uuid	289bee08167858dbf4d04ca184f42681660ebb66	2026-01-05 04:24:59.575766
52	webhook_url_uniqueness	d02aec1815ce3a108b8a1def1ff24e865b26db70	2026-01-05 04:24:59.580344
\.


--
-- Data for Name: _sync_status; Type: TABLE DATA; Schema: stripe; Owner: -
--

COPY stripe._sync_status (id, resource, status, last_synced_at, last_incremental_cursor, error_message, updated_at, account_id) FROM stdin;
\.


--
-- Data for Name: accounts; Type: TABLE DATA; Schema: stripe; Owner: -
--

COPY stripe.accounts (_raw_data, first_synced_at, _last_synced_at, _updated_at, api_key_hashes) FROM stdin;
{"id": "acct_1SlvqPAT8DyVApjF", "type": "standard", "email": null, "object": "account", "country": "US", "settings": {"payouts": {"schedule": {"interval": "daily", "delay_days": 2}, "statement_descriptor": null, "debit_negative_balances": true}, "branding": {"icon": null, "logo": null, "primary_color": null, "secondary_color": null}, "invoices": {"default_account_tax_ids": null, "hosted_payment_method_save": "offer"}, "payments": {"statement_descriptor": null, "statement_descriptor_kana": null, "statement_descriptor_kanji": null}, "dashboard": {"timezone": "Etc/UTC", "display_name": "Divorce Code Sandbox"}, "card_issuing": {"tos_acceptance": {"ip": null, "date": null}}, "card_payments": {"statement_descriptor_prefix": null, "statement_descriptor_prefix_kana": null, "statement_descriptor_prefix_kanji": null}, "bacs_debit_payments": {"display_name": null, "service_user_number": null}, "sepa_debit_payments": {}}, "controller": {"type": "account"}, "capabilities": {}, "business_type": null, "charges_enabled": false, "payouts_enabled": false, "business_profile": {"mcc": null, "url": null, "name": null, "support_url": null, "support_email": null, "support_phone": null, "annual_revenue": null, "support_address": null, "estimated_worker_count": null, "minority_owned_business_designation": null}, "default_currency": "usd", "details_submitted": false}	2026-01-05 04:25:00.128204+00	2026-01-05 04:25:00.128204+00	2026-01-05 04:25:00.128204+00	{a64199c21c4e88ee544a3d2f888d514eda01d2c6e5a71f841d36246a0f74b21e}
\.


--
-- Data for Name: active_entitlements; Type: TABLE DATA; Schema: stripe; Owner: -
--

COPY stripe.active_entitlements (_updated_at, _last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: charges; Type: TABLE DATA; Schema: stripe; Owner: -
--

COPY stripe.charges (_updated_at, _last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: checkout_session_line_items; Type: TABLE DATA; Schema: stripe; Owner: -
--

COPY stripe.checkout_session_line_items (_updated_at, _last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: checkout_sessions; Type: TABLE DATA; Schema: stripe; Owner: -
--

COPY stripe.checkout_sessions (_updated_at, _last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: coupons; Type: TABLE DATA; Schema: stripe; Owner: -
--

COPY stripe.coupons (_updated_at, _last_synced_at, _raw_data) FROM stdin;
\.


--
-- Data for Name: credit_notes; Type: TABLE DATA; Schema: stripe; Owner: -
--

COPY stripe.credit_notes (_last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: customers; Type: TABLE DATA; Schema: stripe; Owner: -
--

COPY stripe.customers (_updated_at, _last_synced_at, _raw_data, _account_id) FROM stdin;
2026-01-07 16:29:01.562497+00	2026-01-07 16:29:01+00	{"id": "cus_TkUaFcSUi9Nkd4", "name": "Demo User", "email": "demo@divorcease.ai", "phone": null, "object": "customer", "address": null, "balance": 0, "created": 1767803340, "currency": null, "discount": null, "livemode": false, "metadata": {"userId": "demo-user"}, "shipping": null, "delinquent": false, "tax_exempt": "none", "test_clock": null, "description": null, "default_source": null, "invoice_prefix": "1RH1FMPK", "customer_account": null, "invoice_settings": {"footer": null, "custom_fields": null, "rendering_options": null, "default_payment_method": null}, "preferred_locales": [], "next_invoice_sequence": 1}	acct_1SlvqPAT8DyVApjF
\.


--
-- Data for Name: disputes; Type: TABLE DATA; Schema: stripe; Owner: -
--

COPY stripe.disputes (_updated_at, _last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: early_fraud_warnings; Type: TABLE DATA; Schema: stripe; Owner: -
--

COPY stripe.early_fraud_warnings (_updated_at, _last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: events; Type: TABLE DATA; Schema: stripe; Owner: -
--

COPY stripe.events (_updated_at, _last_synced_at, _raw_data) FROM stdin;
\.


--
-- Data for Name: features; Type: TABLE DATA; Schema: stripe; Owner: -
--

COPY stripe.features (_updated_at, _last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: invoices; Type: TABLE DATA; Schema: stripe; Owner: -
--

COPY stripe.invoices (_updated_at, _last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: payment_intents; Type: TABLE DATA; Schema: stripe; Owner: -
--

COPY stripe.payment_intents (_last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: payment_methods; Type: TABLE DATA; Schema: stripe; Owner: -
--

COPY stripe.payment_methods (_last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: payouts; Type: TABLE DATA; Schema: stripe; Owner: -
--

COPY stripe.payouts (_updated_at, _last_synced_at, _raw_data) FROM stdin;
\.


--
-- Data for Name: plans; Type: TABLE DATA; Schema: stripe; Owner: -
--

COPY stripe.plans (_updated_at, _last_synced_at, _raw_data, _account_id) FROM stdin;
2026-01-05 04:26:02.12713+00	2026-01-05 04:26:01+00	{"id": "price_1Sm5MjAT8DyVApjFyOkCj1vj", "meter": null, "active": true, "amount": 1200, "object": "plan", "created": 1767587161, "product": "prod_TjYTLCkY7DfB7a", "currency": "usd", "interval": "month", "livemode": false, "metadata": {"tier": "individual", "interval": "monthly"}, "nickname": null, "tiers_mode": null, "usage_type": "licensed", "amount_decimal": "1200", "billing_scheme": "per_unit", "interval_count": 1, "transform_usage": null, "trial_period_days": null}	acct_1SlvqPAT8DyVApjF
2026-01-05 04:26:02.384571+00	2026-01-05 04:26:01+00	{"id": "price_1Sm5MjAT8DyVApjFrKmiPpnC", "meter": null, "active": true, "amount": 11520, "object": "plan", "created": 1767587161, "product": "prod_TjYTLCkY7DfB7a", "currency": "usd", "interval": "year", "livemode": false, "metadata": {"tier": "individual", "interval": "yearly"}, "nickname": null, "tiers_mode": null, "usage_type": "licensed", "amount_decimal": "11520", "billing_scheme": "per_unit", "interval_count": 1, "transform_usage": null, "trial_period_days": null}	acct_1SlvqPAT8DyVApjF
2026-01-05 04:26:02.963092+00	2026-01-05 04:26:02+00	{"id": "price_1Sm5MkAT8DyVApjFVEpGsSnQ", "meter": null, "active": true, "amount": 4900, "object": "plan", "created": 1767587162, "product": "prod_TjYTW1Otete0iY", "currency": "usd", "interval": "month", "livemode": false, "metadata": {"tier": "pro", "interval": "monthly"}, "nickname": null, "tiers_mode": null, "usage_type": "licensed", "amount_decimal": "4900", "billing_scheme": "per_unit", "interval_count": 1, "transform_usage": null, "trial_period_days": null}	acct_1SlvqPAT8DyVApjF
2026-01-05 04:26:03.268101+00	2026-01-05 04:26:02+00	{"id": "price_1Sm5MkAT8DyVApjFUcCjgiS4", "meter": null, "active": true, "amount": 47040, "object": "plan", "created": 1767587162, "product": "prod_TjYTW1Otete0iY", "currency": "usd", "interval": "year", "livemode": false, "metadata": {"tier": "pro", "interval": "yearly"}, "nickname": null, "tiers_mode": null, "usage_type": "licensed", "amount_decimal": "47040", "billing_scheme": "per_unit", "interval_count": 1, "transform_usage": null, "trial_period_days": null}	acct_1SlvqPAT8DyVApjF
2026-01-05 04:26:03.813591+00	2026-01-05 04:26:03+00	{"id": "price_1Sm5MlAT8DyVApjF6YfUX517", "meter": null, "active": true, "amount": 14900, "object": "plan", "created": 1767587163, "product": "prod_TjYTMxu1ZgheRS", "currency": "usd", "interval": "month", "livemode": false, "metadata": {"tier": "team", "interval": "monthly"}, "nickname": null, "tiers_mode": null, "usage_type": "licensed", "amount_decimal": "14900", "billing_scheme": "per_unit", "interval_count": 1, "transform_usage": null, "trial_period_days": null}	acct_1SlvqPAT8DyVApjF
2026-01-05 04:26:04.028383+00	2026-01-05 04:26:03+00	{"id": "price_1Sm5MlAT8DyVApjFng09ESPr", "meter": null, "active": true, "amount": 143040, "object": "plan", "created": 1767587163, "product": "prod_TjYTMxu1ZgheRS", "currency": "usd", "interval": "year", "livemode": false, "metadata": {"tier": "team", "interval": "yearly"}, "nickname": null, "tiers_mode": null, "usage_type": "licensed", "amount_decimal": "143040", "billing_scheme": "per_unit", "interval_count": 1, "transform_usage": null, "trial_period_days": null}	acct_1SlvqPAT8DyVApjF
2026-01-05 04:26:04.636139+00	2026-01-05 04:26:04+00	{"id": "price_1Sm5MmAT8DyVApjFuT4lkTv5", "meter": null, "active": true, "amount": 39900, "object": "plan", "created": 1767587164, "product": "prod_TjYT6KQyGS00mH", "currency": "usd", "interval": "month", "livemode": false, "metadata": {"tier": "enterprise", "interval": "monthly"}, "nickname": null, "tiers_mode": null, "usage_type": "licensed", "amount_decimal": "39900", "billing_scheme": "per_unit", "interval_count": 1, "transform_usage": null, "trial_period_days": null}	acct_1SlvqPAT8DyVApjF
2026-01-05 04:26:04.874016+00	2026-01-05 04:26:04+00	{"id": "price_1Sm5MmAT8DyVApjF9IUhm6tC", "meter": null, "active": true, "amount": 383040, "object": "plan", "created": 1767587164, "product": "prod_TjYT6KQyGS00mH", "currency": "usd", "interval": "year", "livemode": false, "metadata": {"tier": "enterprise", "interval": "yearly"}, "nickname": null, "tiers_mode": null, "usage_type": "licensed", "amount_decimal": "383040", "billing_scheme": "per_unit", "interval_count": 1, "transform_usage": null, "trial_period_days": null}	acct_1SlvqPAT8DyVApjF
\.


--
-- Data for Name: prices; Type: TABLE DATA; Schema: stripe; Owner: -
--

COPY stripe.prices (_updated_at, _last_synced_at, _raw_data, _account_id) FROM stdin;
2026-01-05 04:26:02.299371+00	2026-01-05 04:26:01+00	{"id": "price_1Sm5MjAT8DyVApjFyOkCj1vj", "type": "recurring", "active": true, "object": "price", "created": 1767587161, "product": "prod_TjYTLCkY7DfB7a", "currency": "usd", "livemode": false, "metadata": {"tier": "individual", "interval": "monthly"}, "nickname": null, "recurring": {"meter": null, "interval": "month", "usage_type": "licensed", "interval_count": 1, "trial_period_days": null}, "lookup_key": null, "tiers_mode": null, "unit_amount": 1200, "tax_behavior": "unspecified", "billing_scheme": "per_unit", "custom_unit_amount": null, "transform_quantity": null, "unit_amount_decimal": "1200"}	acct_1SlvqPAT8DyVApjF
2026-01-05 04:26:02.483469+00	2026-01-05 04:26:01+00	{"id": "price_1Sm5MjAT8DyVApjFrKmiPpnC", "type": "recurring", "active": true, "object": "price", "created": 1767587161, "product": "prod_TjYTLCkY7DfB7a", "currency": "usd", "livemode": false, "metadata": {"tier": "individual", "interval": "yearly"}, "nickname": null, "recurring": {"meter": null, "interval": "year", "usage_type": "licensed", "interval_count": 1, "trial_period_days": null}, "lookup_key": null, "tiers_mode": null, "unit_amount": 11520, "tax_behavior": "unspecified", "billing_scheme": "per_unit", "custom_unit_amount": null, "transform_quantity": null, "unit_amount_decimal": "11520"}	acct_1SlvqPAT8DyVApjF
2026-01-05 04:26:03.065019+00	2026-01-05 04:26:02+00	{"id": "price_1Sm5MkAT8DyVApjFVEpGsSnQ", "type": "recurring", "active": true, "object": "price", "created": 1767587162, "product": "prod_TjYTW1Otete0iY", "currency": "usd", "livemode": false, "metadata": {"tier": "pro", "interval": "monthly"}, "nickname": null, "recurring": {"meter": null, "interval": "month", "usage_type": "licensed", "interval_count": 1, "trial_period_days": null}, "lookup_key": null, "tiers_mode": null, "unit_amount": 4900, "tax_behavior": "unspecified", "billing_scheme": "per_unit", "custom_unit_amount": null, "transform_quantity": null, "unit_amount_decimal": "4900"}	acct_1SlvqPAT8DyVApjF
2026-01-05 04:26:03.248892+00	2026-01-05 04:26:02+00	{"id": "price_1Sm5MkAT8DyVApjFUcCjgiS4", "type": "recurring", "active": true, "object": "price", "created": 1767587162, "product": "prod_TjYTW1Otete0iY", "currency": "usd", "livemode": false, "metadata": {"tier": "pro", "interval": "yearly"}, "nickname": null, "recurring": {"meter": null, "interval": "year", "usage_type": "licensed", "interval_count": 1, "trial_period_days": null}, "lookup_key": null, "tiers_mode": null, "unit_amount": 47040, "tax_behavior": "unspecified", "billing_scheme": "per_unit", "custom_unit_amount": null, "transform_quantity": null, "unit_amount_decimal": "47040"}	acct_1SlvqPAT8DyVApjF
2026-01-05 04:26:03.840045+00	2026-01-05 04:26:03+00	{"id": "price_1Sm5MlAT8DyVApjF6YfUX517", "type": "recurring", "active": true, "object": "price", "created": 1767587163, "product": "prod_TjYTMxu1ZgheRS", "currency": "usd", "livemode": false, "metadata": {"tier": "team", "interval": "monthly"}, "nickname": null, "recurring": {"meter": null, "interval": "month", "usage_type": "licensed", "interval_count": 1, "trial_period_days": null}, "lookup_key": null, "tiers_mode": null, "unit_amount": 14900, "tax_behavior": "unspecified", "billing_scheme": "per_unit", "custom_unit_amount": null, "transform_quantity": null, "unit_amount_decimal": "14900"}	acct_1SlvqPAT8DyVApjF
2026-01-05 04:26:04.076919+00	2026-01-05 04:26:03+00	{"id": "price_1Sm5MlAT8DyVApjFng09ESPr", "type": "recurring", "active": true, "object": "price", "created": 1767587163, "product": "prod_TjYTMxu1ZgheRS", "currency": "usd", "livemode": false, "metadata": {"tier": "team", "interval": "yearly"}, "nickname": null, "recurring": {"meter": null, "interval": "year", "usage_type": "licensed", "interval_count": 1, "trial_period_days": null}, "lookup_key": null, "tiers_mode": null, "unit_amount": 143040, "tax_behavior": "unspecified", "billing_scheme": "per_unit", "custom_unit_amount": null, "transform_quantity": null, "unit_amount_decimal": "143040"}	acct_1SlvqPAT8DyVApjF
2026-01-05 04:26:04.792764+00	2026-01-05 04:26:04+00	{"id": "price_1Sm5MmAT8DyVApjFuT4lkTv5", "type": "recurring", "active": true, "object": "price", "created": 1767587164, "product": "prod_TjYT6KQyGS00mH", "currency": "usd", "livemode": false, "metadata": {"tier": "enterprise", "interval": "monthly"}, "nickname": null, "recurring": {"meter": null, "interval": "month", "usage_type": "licensed", "interval_count": 1, "trial_period_days": null}, "lookup_key": null, "tiers_mode": null, "unit_amount": 39900, "tax_behavior": "unspecified", "billing_scheme": "per_unit", "custom_unit_amount": null, "transform_quantity": null, "unit_amount_decimal": "39900"}	acct_1SlvqPAT8DyVApjF
2026-01-05 04:26:04.959965+00	2026-01-05 04:26:04+00	{"id": "price_1Sm5MmAT8DyVApjF9IUhm6tC", "type": "recurring", "active": true, "object": "price", "created": 1767587164, "product": "prod_TjYT6KQyGS00mH", "currency": "usd", "livemode": false, "metadata": {"tier": "enterprise", "interval": "yearly"}, "nickname": null, "recurring": {"meter": null, "interval": "year", "usage_type": "licensed", "interval_count": 1, "trial_period_days": null}, "lookup_key": null, "tiers_mode": null, "unit_amount": 383040, "tax_behavior": "unspecified", "billing_scheme": "per_unit", "custom_unit_amount": null, "transform_quantity": null, "unit_amount_decimal": "383040"}	acct_1SlvqPAT8DyVApjF
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: stripe; Owner: -
--

COPY stripe.products (_updated_at, _last_synced_at, _raw_data, _account_id) FROM stdin;
2026-01-05 04:26:02.000113+00	2026-01-05 04:26:01+00	{"id": "prod_TjYTLCkY7DfB7a", "url": null, "name": "DivorceASE Individual", "type": "service", "active": true, "images": [], "object": "product", "created": 1767587161, "updated": 1767587161, "livemode": false, "metadata": {"app": "divorceaseai", "tier": "individual"}, "tax_code": null, "shippable": null, "attributes": [], "unit_label": null, "description": "Perfect for individuals managing their own divorce case", "default_price": null, "marketing_features": [], "package_dimensions": null, "statement_descriptor": null}	acct_1SlvqPAT8DyVApjF
2026-01-05 04:26:02.753155+00	2026-01-05 04:26:02+00	{"id": "prod_TjYTW1Otete0iY", "url": null, "name": "DivorceASE Pro", "type": "service", "active": true, "images": [], "object": "product", "created": 1767587162, "updated": 1767587162, "livemode": false, "metadata": {"app": "divorceaseai", "tier": "pro"}, "tax_code": null, "shippable": null, "attributes": [], "unit_label": null, "description": "Advanced features for complex cases with AI pattern detection", "default_price": null, "marketing_features": [], "package_dimensions": null, "statement_descriptor": null}	acct_1SlvqPAT8DyVApjF
2026-01-05 04:26:03.582286+00	2026-01-05 04:26:03+00	{"id": "prod_TjYTMxu1ZgheRS", "url": null, "name": "DivorceASE Team", "type": "service", "active": true, "images": [], "object": "product", "created": 1767587163, "updated": 1767587163, "livemode": false, "metadata": {"app": "divorceaseai", "tier": "team"}, "tax_code": null, "shippable": null, "attributes": [], "unit_label": null, "description": "Collaborate with your legal team on case management", "default_price": null, "marketing_features": [], "package_dimensions": null, "statement_descriptor": null}	acct_1SlvqPAT8DyVApjF
2026-01-05 04:26:04.40726+00	2026-01-05 04:26:03+00	{"id": "prod_TjYT6KQyGS00mH", "url": null, "name": "DivorceASE Enterprise", "type": "service", "active": true, "images": [], "object": "product", "created": 1767587163, "updated": 1767587163, "livemode": false, "metadata": {"app": "divorceaseai", "tier": "enterprise"}, "tax_code": null, "shippable": null, "attributes": [], "unit_label": null, "description": "Full-featured solution for law firms with API access", "default_price": null, "marketing_features": [], "package_dimensions": null, "statement_descriptor": null}	acct_1SlvqPAT8DyVApjF
\.


--
-- Data for Name: refunds; Type: TABLE DATA; Schema: stripe; Owner: -
--

COPY stripe.refunds (_updated_at, _last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: reviews; Type: TABLE DATA; Schema: stripe; Owner: -
--

COPY stripe.reviews (_updated_at, _last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: setup_intents; Type: TABLE DATA; Schema: stripe; Owner: -
--

COPY stripe.setup_intents (_last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: subscription_items; Type: TABLE DATA; Schema: stripe; Owner: -
--

COPY stripe.subscription_items (_last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: subscription_schedules; Type: TABLE DATA; Schema: stripe; Owner: -
--

COPY stripe.subscription_schedules (_last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: subscriptions; Type: TABLE DATA; Schema: stripe; Owner: -
--

COPY stripe.subscriptions (_updated_at, _last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Data for Name: tax_ids; Type: TABLE DATA; Schema: stripe; Owner: -
--

COPY stripe.tax_ids (_last_synced_at, _raw_data, _account_id) FROM stdin;
\.


--
-- Name: quickbooks_sync_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.quickbooks_sync_log_id_seq', 1, false);


--
-- Name: _sync_status_id_seq; Type: SEQUENCE SET; Schema: stripe; Owner: -
--

SELECT pg_catalog.setval('stripe._sync_status_id_seq', 1, false);


--
-- Name: admin_mfa_challenges admin_mfa_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_mfa_challenges
    ADD CONSTRAINT admin_mfa_challenges_pkey PRIMARY KEY (id);


--
-- Name: alerts alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_pkey PRIMARY KEY (id);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: audit_trail audit_trail_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_trail
    ADD CONSTRAINT audit_trail_pkey PRIMARY KEY (id);


--
-- Name: auth_sessions auth_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_pkey PRIMARY KEY (id);


--
-- Name: billing_records billing_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_records
    ADD CONSTRAINT billing_records_pkey PRIMARY KEY (id);


--
-- Name: business_metrics business_metrics_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_metrics
    ADD CONSTRAINT business_metrics_name_unique UNIQUE (name);


--
-- Name: business_metrics business_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_metrics
    ADD CONSTRAINT business_metrics_pkey PRIMARY KEY (id);


--
-- Name: calendar_events calendar_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_pkey PRIMARY KEY (id);


--
-- Name: cases cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_pkey PRIMARY KEY (id);


--
-- Name: chain_of_custody chain_of_custody_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chain_of_custody
    ADD CONSTRAINT chain_of_custody_pkey PRIMARY KEY (id);


--
-- Name: child_support_payments child_support_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.child_support_payments
    ADD CONSTRAINT child_support_payments_pkey PRIMARY KEY (id);


--
-- Name: consent_purposes consent_purposes_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_purposes
    ADD CONSTRAINT consent_purposes_code_unique UNIQUE (code);


--
-- Name: consent_purposes consent_purposes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_purposes
    ADD CONSTRAINT consent_purposes_pkey PRIMARY KEY (id);


--
-- Name: conversation_messages conversation_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_messages
    ADD CONSTRAINT conversation_messages_pkey PRIMARY KEY (id);


--
-- Name: conversation_participants conversation_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: data_classifications data_classifications_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_classifications
    ADD CONSTRAINT data_classifications_name_unique UNIQUE (name);


--
-- Name: data_classifications data_classifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_classifications
    ADD CONSTRAINT data_classifications_pkey PRIMARY KEY (id);


--
-- Name: data_lineage_edges data_lineage_edges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_lineage_edges
    ADD CONSTRAINT data_lineage_edges_pkey PRIMARY KEY (id);


--
-- Name: data_lineage_nodes data_lineage_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_lineage_nodes
    ADD CONSTRAINT data_lineage_nodes_pkey PRIMARY KEY (id);


--
-- Name: data_lineage_sources data_lineage_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_lineage_sources
    ADD CONSTRAINT data_lineage_sources_pkey PRIMARY KEY (id);


--
-- Name: data_profiles data_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_profiles
    ADD CONSTRAINT data_profiles_pkey PRIMARY KEY (id);


--
-- Name: data_quality_test_runs data_quality_test_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_quality_test_runs
    ADD CONSTRAINT data_quality_test_runs_pkey PRIMARY KEY (id);


--
-- Name: data_quality_tests data_quality_tests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_quality_tests
    ADD CONSTRAINT data_quality_tests_pkey PRIMARY KEY (id);


--
-- Name: data_subject_requests data_subject_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_subject_requests
    ADD CONSTRAINT data_subject_requests_pkey PRIMARY KEY (id);


--
-- Name: debts debts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debts
    ADD CONSTRAINT debts_pkey PRIMARY KEY (id);


--
-- Name: demo_meta demo_meta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demo_meta
    ADD CONSTRAINT demo_meta_pkey PRIMARY KEY (id);


--
-- Name: dim_date dim_date_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dim_date
    ADD CONSTRAINT dim_date_pkey PRIMARY KEY (date_id);


--
-- Name: dim_subscription dim_subscription_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dim_subscription
    ADD CONSTRAINT dim_subscription_pkey PRIMARY KEY (subscription_id);


--
-- Name: dim_tier dim_tier_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dim_tier
    ADD CONSTRAINT dim_tier_pkey PRIMARY KEY (tier_id);


--
-- Name: dim_users dim_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dim_users
    ADD CONSTRAINT dim_users_pkey PRIMARY KEY (user_id);


--
-- Name: document_line_items document_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_line_items
    ADD CONSTRAINT document_line_items_pkey PRIMARY KEY (id);


--
-- Name: document_parse_results document_parse_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_parse_results
    ADD CONSTRAINT document_parse_results_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: dq_alerts dq_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dq_alerts
    ADD CONSTRAINT dq_alerts_pkey PRIMARY KEY (id);


--
-- Name: encryption_keys encryption_keys_key_alias_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encryption_keys
    ADD CONSTRAINT encryption_keys_key_alias_unique UNIQUE (key_alias);


--
-- Name: encryption_keys encryption_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encryption_keys
    ADD CONSTRAINT encryption_keys_pkey PRIMARY KEY (id);


--
-- Name: evidence_files evidence_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidence_files
    ADD CONSTRAINT evidence_files_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: fact_financial_summary fact_financial_summary_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fact_financial_summary
    ADD CONSTRAINT fact_financial_summary_pkey PRIMARY KEY (summary_id);


--
-- Name: fact_transactions fact_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fact_transactions
    ADD CONSTRAINT fact_transactions_pkey PRIMARY KEY (transaction_id);


--
-- Name: fact_usage_metrics fact_usage_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fact_usage_metrics
    ADD CONSTRAINT fact_usage_metrics_pkey PRIMARY KEY (metric_id);


--
-- Name: fact_violations fact_violations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fact_violations
    ADD CONSTRAINT fact_violations_pkey PRIMARY KEY (violation_id);


--
-- Name: firefly_connections firefly_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.firefly_connections
    ADD CONSTRAINT firefly_connections_pkey PRIMARY KEY (id);


--
-- Name: firefly_sync_logs firefly_sync_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.firefly_sync_logs
    ADD CONSTRAINT firefly_sync_logs_pkey PRIMARY KEY (id);


--
-- Name: improvement_recommendations improvement_recommendations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.improvement_recommendations
    ADD CONSTRAINT improvement_recommendations_pkey PRIMARY KEY (id);


--
-- Name: incomes incomes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incomes
    ADD CONSTRAINT incomes_pkey PRIMARY KEY (id);


--
-- Name: journal_attachments journal_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_attachments
    ADD CONSTRAINT journal_attachments_pkey PRIMARY KEY (id);


--
-- Name: journal_entries journal_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);


--
-- Name: legal_documents legal_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_documents
    ADD CONSTRAINT legal_documents_pkey PRIMARY KEY (id);


--
-- Name: message_attachments message_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_attachments
    ADD CONSTRAINT message_attachments_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: metadata_catalog metadata_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metadata_catalog
    ADD CONSTRAINT metadata_catalog_pkey PRIMARY KEY (id);


--
-- Name: mfa_challenges mfa_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfa_challenges
    ADD CONSTRAINT mfa_challenges_pkey PRIMARY KEY (id);


--
-- Name: mobile_violation_reports mobile_violation_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mobile_violation_reports
    ADD CONSTRAINT mobile_violation_reports_pkey PRIMARY KEY (id);


--
-- Name: pii_catalog pii_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pii_catalog
    ADD CONSTRAINT pii_catalog_pkey PRIMARY KEY (id);


--
-- Name: quality_anomalies quality_anomalies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quality_anomalies
    ADD CONSTRAINT quality_anomalies_pkey PRIMARY KEY (id);


--
-- Name: quality_metrics quality_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quality_metrics
    ADD CONSTRAINT quality_metrics_pkey PRIMARY KEY (id);


--
-- Name: quality_rules quality_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quality_rules
    ADD CONSTRAINT quality_rules_pkey PRIMARY KEY (id);


--
-- Name: quality_runs quality_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quality_runs
    ADD CONSTRAINT quality_runs_pkey PRIMARY KEY (id);


--
-- Name: quickbooks_sync_log quickbooks_sync_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quickbooks_sync_log
    ADD CONSTRAINT quickbooks_sync_log_pkey PRIMARY KEY (id);


--
-- Name: quota_reset_log quota_reset_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quota_reset_log
    ADD CONSTRAINT quota_reset_log_pkey PRIMARY KEY (id);


--
-- Name: reconciliation_jobs reconciliation_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_jobs
    ADD CONSTRAINT reconciliation_jobs_pkey PRIMARY KEY (id);


--
-- Name: reconciliation_results reconciliation_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_results
    ADD CONSTRAINT reconciliation_results_pkey PRIMARY KEY (id);


--
-- Name: reimbursements reimbursements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reimbursements
    ADD CONSTRAINT reimbursements_pkey PRIMARY KEY (id);


--
-- Name: retention_jobs retention_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retention_jobs
    ADD CONSTRAINT retention_jobs_pkey PRIMARY KEY (id);


--
-- Name: retention_policies retention_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retention_policies
    ADD CONSTRAINT retention_policies_pkey PRIMARY KEY (id);


--
-- Name: scheduled_job_runs scheduled_job_runs_idempotency_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_job_runs
    ADD CONSTRAINT scheduled_job_runs_idempotency_key_unique UNIQUE (idempotency_key);


--
-- Name: scheduled_job_runs scheduled_job_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_job_runs
    ADD CONSTRAINT scheduled_job_runs_pkey PRIMARY KEY (id);


--
-- Name: security_events security_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_events
    ADD CONSTRAINT security_events_pkey PRIMARY KEY (id);


--
-- Name: sentiment_report_items sentiment_report_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sentiment_report_items
    ADD CONSTRAINT sentiment_report_items_pkey PRIMARY KEY (id);


--
-- Name: sentiment_reports sentiment_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sentiment_reports
    ADD CONSTRAINT sentiment_reports_pkey PRIMARY KEY (id);


--
-- Name: sms_deliveries sms_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_deliveries
    ADD CONSTRAINT sms_deliveries_pkey PRIMARY KEY (id);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: tier_limits tier_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_limits
    ADD CONSTRAINT tier_limits_pkey PRIMARY KEY (tier);


--
-- Name: tier_migrations tier_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_migrations
    ADD CONSTRAINT tier_migrations_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: usage_audit usage_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_audit
    ADD CONSTRAINT usage_audit_pkey PRIMARY KEY (id);


--
-- Name: user_consents user_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_consents
    ADD CONSTRAINT user_consents_pkey PRIMARY KEY (id);


--
-- Name: user_devices user_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_devices
    ADD CONSTRAINT user_devices_pkey PRIMARY KEY (id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: violations violations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.violations
    ADD CONSTRAINT violations_pkey PRIMARY KEY (id);


--
-- Name: w2_records w2_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.w2_records
    ADD CONSTRAINT w2_records_pkey PRIMARY KEY (id);


--
-- Name: _migrations _migrations_name_key; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe._migrations
    ADD CONSTRAINT _migrations_name_key UNIQUE (name);


--
-- Name: _migrations _migrations_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe._migrations
    ADD CONSTRAINT _migrations_pkey PRIMARY KEY (id);


--
-- Name: _sync_status _sync_status_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe._sync_status
    ADD CONSTRAINT _sync_status_pkey PRIMARY KEY (id);


--
-- Name: _sync_status _sync_status_resource_account_key; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe._sync_status
    ADD CONSTRAINT _sync_status_resource_account_key UNIQUE (resource, account_id);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: active_entitlements active_entitlements_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.active_entitlements
    ADD CONSTRAINT active_entitlements_pkey PRIMARY KEY (id);


--
-- Name: charges charges_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.charges
    ADD CONSTRAINT charges_pkey PRIMARY KEY (id);


--
-- Name: checkout_session_line_items checkout_session_line_items_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.checkout_session_line_items
    ADD CONSTRAINT checkout_session_line_items_pkey PRIMARY KEY (id);


--
-- Name: checkout_sessions checkout_sessions_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.checkout_sessions
    ADD CONSTRAINT checkout_sessions_pkey PRIMARY KEY (id);


--
-- Name: coupons coupons_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.coupons
    ADD CONSTRAINT coupons_pkey PRIMARY KEY (id);


--
-- Name: credit_notes credit_notes_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.credit_notes
    ADD CONSTRAINT credit_notes_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: disputes disputes_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.disputes
    ADD CONSTRAINT disputes_pkey PRIMARY KEY (id);


--
-- Name: early_fraud_warnings early_fraud_warnings_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.early_fraud_warnings
    ADD CONSTRAINT early_fraud_warnings_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: features features_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.features
    ADD CONSTRAINT features_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: _managed_webhooks managed_webhooks_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe._managed_webhooks
    ADD CONSTRAINT managed_webhooks_pkey PRIMARY KEY (id);


--
-- Name: _managed_webhooks managed_webhooks_url_account_unique; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe._managed_webhooks
    ADD CONSTRAINT managed_webhooks_url_account_unique UNIQUE (url, account_id);


--
-- Name: payment_intents payment_intents_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.payment_intents
    ADD CONSTRAINT payment_intents_pkey PRIMARY KEY (id);


--
-- Name: payment_methods payment_methods_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.payment_methods
    ADD CONSTRAINT payment_methods_pkey PRIMARY KEY (id);


--
-- Name: payouts payouts_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.payouts
    ADD CONSTRAINT payouts_pkey PRIMARY KEY (id);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: prices prices_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.prices
    ADD CONSTRAINT prices_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: refunds refunds_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.refunds
    ADD CONSTRAINT refunds_pkey PRIMARY KEY (id);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- Name: setup_intents setup_intents_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.setup_intents
    ADD CONSTRAINT setup_intents_pkey PRIMARY KEY (id);


--
-- Name: subscription_items subscription_items_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.subscription_items
    ADD CONSTRAINT subscription_items_pkey PRIMARY KEY (id);


--
-- Name: subscription_schedules subscription_schedules_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.subscription_schedules
    ADD CONSTRAINT subscription_schedules_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: tax_ids tax_ids_pkey; Type: CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.tax_ids
    ADD CONSTRAINT tax_ids_pkey PRIMARY KEY (id);


--
-- Name: active_entitlements_lookup_key_key; Type: INDEX; Schema: stripe; Owner: -
--

CREATE UNIQUE INDEX active_entitlements_lookup_key_key ON stripe.active_entitlements USING btree (lookup_key) WHERE (lookup_key IS NOT NULL);


--
-- Name: features_lookup_key_key; Type: INDEX; Schema: stripe; Owner: -
--

CREATE UNIQUE INDEX features_lookup_key_key ON stripe.features USING btree (lookup_key) WHERE (lookup_key IS NOT NULL);


--
-- Name: idx_accounts_api_key_hashes; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX idx_accounts_api_key_hashes ON stripe.accounts USING gin (api_key_hashes);


--
-- Name: idx_accounts_business_name; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX idx_accounts_business_name ON stripe.accounts USING btree (business_name);


--
-- Name: idx_sync_status_resource_account; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX idx_sync_status_resource_account ON stripe._sync_status USING btree (resource, account_id);


--
-- Name: stripe_active_entitlements_customer_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX stripe_active_entitlements_customer_idx ON stripe.active_entitlements USING btree (customer);


--
-- Name: stripe_active_entitlements_feature_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX stripe_active_entitlements_feature_idx ON stripe.active_entitlements USING btree (feature);


--
-- Name: stripe_checkout_session_line_items_price_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX stripe_checkout_session_line_items_price_idx ON stripe.checkout_session_line_items USING btree (price);


--
-- Name: stripe_checkout_session_line_items_session_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX stripe_checkout_session_line_items_session_idx ON stripe.checkout_session_line_items USING btree (checkout_session);


--
-- Name: stripe_checkout_sessions_customer_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX stripe_checkout_sessions_customer_idx ON stripe.checkout_sessions USING btree (customer);


--
-- Name: stripe_checkout_sessions_invoice_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX stripe_checkout_sessions_invoice_idx ON stripe.checkout_sessions USING btree (invoice);


--
-- Name: stripe_checkout_sessions_payment_intent_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX stripe_checkout_sessions_payment_intent_idx ON stripe.checkout_sessions USING btree (payment_intent);


--
-- Name: stripe_checkout_sessions_subscription_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX stripe_checkout_sessions_subscription_idx ON stripe.checkout_sessions USING btree (subscription);


--
-- Name: stripe_credit_notes_customer_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX stripe_credit_notes_customer_idx ON stripe.credit_notes USING btree (customer);


--
-- Name: stripe_credit_notes_invoice_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX stripe_credit_notes_invoice_idx ON stripe.credit_notes USING btree (invoice);


--
-- Name: stripe_dispute_created_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX stripe_dispute_created_idx ON stripe.disputes USING btree (created);


--
-- Name: stripe_early_fraud_warnings_charge_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX stripe_early_fraud_warnings_charge_idx ON stripe.early_fraud_warnings USING btree (charge);


--
-- Name: stripe_early_fraud_warnings_payment_intent_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX stripe_early_fraud_warnings_payment_intent_idx ON stripe.early_fraud_warnings USING btree (payment_intent);


--
-- Name: stripe_invoices_customer_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX stripe_invoices_customer_idx ON stripe.invoices USING btree (customer);


--
-- Name: stripe_invoices_subscription_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX stripe_invoices_subscription_idx ON stripe.invoices USING btree (subscription);


--
-- Name: stripe_managed_webhooks_enabled_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX stripe_managed_webhooks_enabled_idx ON stripe._managed_webhooks USING btree (enabled);


--
-- Name: stripe_managed_webhooks_status_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX stripe_managed_webhooks_status_idx ON stripe._managed_webhooks USING btree (status);


--
-- Name: stripe_payment_intents_customer_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX stripe_payment_intents_customer_idx ON stripe.payment_intents USING btree (customer);


--
-- Name: stripe_payment_intents_invoice_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX stripe_payment_intents_invoice_idx ON stripe.payment_intents USING btree (invoice);


--
-- Name: stripe_payment_methods_customer_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX stripe_payment_methods_customer_idx ON stripe.payment_methods USING btree (customer);


--
-- Name: stripe_refunds_charge_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX stripe_refunds_charge_idx ON stripe.refunds USING btree (charge);


--
-- Name: stripe_refunds_payment_intent_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX stripe_refunds_payment_intent_idx ON stripe.refunds USING btree (payment_intent);


--
-- Name: stripe_reviews_charge_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX stripe_reviews_charge_idx ON stripe.reviews USING btree (charge);


--
-- Name: stripe_reviews_payment_intent_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX stripe_reviews_payment_intent_idx ON stripe.reviews USING btree (payment_intent);


--
-- Name: stripe_setup_intents_customer_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX stripe_setup_intents_customer_idx ON stripe.setup_intents USING btree (customer);


--
-- Name: stripe_tax_ids_customer_idx; Type: INDEX; Schema: stripe; Owner: -
--

CREATE INDEX stripe_tax_ids_customer_idx ON stripe.tax_ids USING btree (customer);


--
-- Name: _managed_webhooks handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe._managed_webhooks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_metadata();


--
-- Name: _sync_status handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe._sync_status FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_metadata();


--
-- Name: accounts handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: active_entitlements handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.active_entitlements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: charges handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.charges FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: checkout_session_line_items handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.checkout_session_line_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: checkout_sessions handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.checkout_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: coupons handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.coupons FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: customers handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: disputes handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.disputes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: early_fraud_warnings handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.early_fraud_warnings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: events handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: features handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.features FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: invoices handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: payouts handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.payouts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: plans handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: prices handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.prices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: products handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: refunds handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.refunds FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: reviews handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.reviews FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: subscriptions handle_updated_at; Type: TRIGGER; Schema: stripe; Owner: -
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stripe.subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: active_entitlements fk_active_entitlements_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.active_entitlements
    ADD CONSTRAINT fk_active_entitlements_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: charges fk_charges_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.charges
    ADD CONSTRAINT fk_charges_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: checkout_session_line_items fk_checkout_session_line_items_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.checkout_session_line_items
    ADD CONSTRAINT fk_checkout_session_line_items_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: checkout_sessions fk_checkout_sessions_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.checkout_sessions
    ADD CONSTRAINT fk_checkout_sessions_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: credit_notes fk_credit_notes_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.credit_notes
    ADD CONSTRAINT fk_credit_notes_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: customers fk_customers_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.customers
    ADD CONSTRAINT fk_customers_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: disputes fk_disputes_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.disputes
    ADD CONSTRAINT fk_disputes_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: early_fraud_warnings fk_early_fraud_warnings_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.early_fraud_warnings
    ADD CONSTRAINT fk_early_fraud_warnings_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: features fk_features_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.features
    ADD CONSTRAINT fk_features_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: invoices fk_invoices_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.invoices
    ADD CONSTRAINT fk_invoices_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: _managed_webhooks fk_managed_webhooks_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe._managed_webhooks
    ADD CONSTRAINT fk_managed_webhooks_account FOREIGN KEY (account_id) REFERENCES stripe.accounts(id);


--
-- Name: payment_intents fk_payment_intents_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.payment_intents
    ADD CONSTRAINT fk_payment_intents_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: payment_methods fk_payment_methods_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.payment_methods
    ADD CONSTRAINT fk_payment_methods_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: plans fk_plans_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.plans
    ADD CONSTRAINT fk_plans_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: prices fk_prices_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.prices
    ADD CONSTRAINT fk_prices_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: products fk_products_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.products
    ADD CONSTRAINT fk_products_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: refunds fk_refunds_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.refunds
    ADD CONSTRAINT fk_refunds_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: reviews fk_reviews_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.reviews
    ADD CONSTRAINT fk_reviews_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: setup_intents fk_setup_intents_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.setup_intents
    ADD CONSTRAINT fk_setup_intents_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: subscription_items fk_subscription_items_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.subscription_items
    ADD CONSTRAINT fk_subscription_items_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: subscription_schedules fk_subscription_schedules_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.subscription_schedules
    ADD CONSTRAINT fk_subscription_schedules_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: subscriptions fk_subscriptions_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.subscriptions
    ADD CONSTRAINT fk_subscriptions_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- Name: _sync_status fk_sync_status_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe._sync_status
    ADD CONSTRAINT fk_sync_status_account FOREIGN KEY (account_id) REFERENCES stripe.accounts(id);


--
-- Name: tax_ids fk_tax_ids_account; Type: FK CONSTRAINT; Schema: stripe; Owner: -
--

ALTER TABLE ONLY stripe.tax_ids
    ADD CONSTRAINT fk_tax_ids_account FOREIGN KEY (_account_id) REFERENCES stripe.accounts(id);


--
-- PostgreSQL database dump complete
--

\unrestrict ns7Gaxyf7Eb0AP5oq79DOkIqsOCs4MYPWeOg6dtrGNXnkTG7KTa7ca5I8u3QtMj

