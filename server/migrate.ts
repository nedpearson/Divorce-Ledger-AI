import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

async function main() {
  console.log('Running raw table creation...');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is missing in environment variables');
    process.exit(1);
  }
  
  const pool = new Pool({
      connectionString: connectionString,
      connectionTimeoutMillis: 30000,
      idleTimeoutMillis: 30000,
      max: 1,
      ssl: connectionString.includes('supabase') ? { rejectUnauthorized: false } : undefined,
  });

  const client = await pool.connect();
  
  try {
    const query = `
      CREATE TABLE IF NOT EXISTS "obligation_instances" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "case_id" varchar NOT NULL,
        "document_id" varchar,
        "category" varchar NOT NULL,
        "vendor" varchar,
        "amount_gross" integer NOT NULL,
        "party_a_owed" integer,
        "party_b_owed" integer,
        "due_date" varchar,
        "status" varchar DEFAULT 'pending' NOT NULL,
        "review_status" varchar DEFAULT 'needs_review' NOT NULL,
        "is_ai_computed" boolean DEFAULT false NOT NULL,
        "confidence_score" real,
        "metadata" jsonb,
        "notes" text,
        "environment" varchar DEFAULT 'demo' NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS "obligation_rules" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "case_id" varchar NOT NULL,
        "document_id" varchar,
        "category" varchar NOT NULL,
        "rule_type" varchar NOT NULL,
        "party_a_percentage" integer,
        "party_b_percentage" integer,
        "fixed_amount" integer,
        "trigger_event" varchar,
        "effective_start_date" timestamp,
        "effective_end_date" timestamp,
        "status" varchar DEFAULT 'active' NOT NULL,
        "ai_rationale" text,
        "environment" varchar DEFAULT 'demo' NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        "created_by" varchar
      );
      
      CREATE TABLE IF NOT EXISTS "extracted_entities" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "document_id" varchar NOT NULL,
        "entity_type" varchar NOT NULL,
        "raw_text" text NOT NULL,
        "normalized_value" text,
        "confidence" real NOT NULL,
        "bounding_box" jsonb,
        "page_number" integer,
        "created_at" timestamp DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS "source_citations" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "target_table" varchar NOT NULL,
        "target_id" varchar NOT NULL,
        "document_id" varchar NOT NULL,
        "extracted_entity_id" varchar,
        "description" text NOT NULL,
        "bounding_box" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "created_by" varchar
      );

      CREATE TABLE IF NOT EXISTS "ai_extraction_runs" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "document_id" varchar NOT NULL,
        "status" varchar NOT NULL,
        "started_at" timestamp DEFAULT now() NOT NULL,
        "completed_at" timestamp,
        "provider" varchar NOT NULL,
        "model" varchar NOT NULL,
        "prompt_tokens" integer,
        "completion_tokens" integer,
        "error" text,
        "environment" varchar DEFAULT 'demo' NOT NULL
      );
    `;
    await client.query(query);
    console.log('Tables verified/created successfully.');
  } catch (err) {
    console.error('Failed to execute query:', err);
  } finally {
    client.release();
    pool.end();
  }
}

main();
