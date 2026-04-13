import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function verify() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "recurring_bill_templates" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      "case_id" varchar NOT NULL,
      "user_id" varchar NOT NULL,
      "environment" text NOT NULL DEFAULT 'demo',
      "vendor_name" text NOT NULL,
      "bill_name" text NOT NULL,
      "category" text NOT NULL,
      "subcategory" text,
      "expected_frequency" text NOT NULL DEFAULT 'monthly',
      "expected_day_of_month" integer,
      "due_day_of_month" integer,
      "upload_window_start_offset" integer DEFAULT -14,
      "upload_window_end_offset" integer DEFAULT 14,
      "split_type" text NOT NULL DEFAULT 'custom',
      "split_percentage_spouse" numeric NOT NULL DEFAULT '0',
      "linked_obligation_type" text,
      "court_order_related" boolean NOT NULL DEFAULT false,
      "required_for_reporting" boolean NOT NULL DEFAULT false,
      "active" boolean NOT NULL DEFAULT true,
      "notes" text,
      "created_at" timestamp NOT NULL DEFAULT now(),
      "updated_at" timestamp NOT NULL DEFAULT now()
    );
    
    CREATE TABLE IF NOT EXISTS "recurring_bill_cycles" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      "recurring_bill_template_id" varchar NOT NULL REFERENCES "recurring_bill_templates"("id") ON DELETE cascade,
      "cycle_month" integer NOT NULL,
      "cycle_year" integer NOT NULL,
      "expected_start_date" timestamp NOT NULL,
      "expected_end_date" timestamp NOT NULL,
      "due_date" timestamp,
      "status" text NOT NULL DEFAULT 'pending',
      "matched_document_id" varchar,
      "match_confidence" numeric,
      "missing_flag" boolean NOT NULL DEFAULT false,
      "waived_flag" boolean NOT NULL DEFAULT false,
      "snoozed_until" timestamp,
      "impact_flags_json" jsonb,
      "created_at" timestamp NOT NULL DEFAULT now(),
      "updated_at" timestamp NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "recurring_bill_notifications" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      "recurring_bill_cycle_id" varchar NOT NULL REFERENCES "recurring_bill_cycles"("id") ON DELETE cascade,
      "user_id" varchar NOT NULL,
      "notification_type" text NOT NULL,
      "severity" text NOT NULL DEFAULT 'info',
      "status" text NOT NULL DEFAULT 'unread',
      "sent_at" timestamp NOT NULL DEFAULT now(),
      "read_at" timestamp,
      "snoozed_until" timestamp,
      "created_at" timestamp NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "notification_preferences" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" varchar NOT NULL UNIQUE,
      "enable_in_app" boolean NOT NULL DEFAULT true,
      "enable_email_future_ready" boolean NOT NULL DEFAULT false,
      "default_pre_due_days" integer NOT NULL DEFAULT 3,
      "default_on_due" boolean NOT NULL DEFAULT true,
      "default_post_due_days" integer NOT NULL DEFAULT 1,
      "created_at" timestamp NOT NULL DEFAULT now(),
      "updated_at" timestamp NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "recurring_bill_match_events" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      "recurring_bill_cycle_id" varchar NOT NULL REFERENCES "recurring_bill_cycles"("id") ON DELETE cascade,
      "document_id" varchar NOT NULL,
      "match_reason" text NOT NULL,
      "confidence_score" numeric NOT NULL,
      "was_auto_applied" boolean NOT NULL DEFAULT false,
      "created_at" timestamp NOT NULL DEFAULT now()
    );
  `);
  console.log("Migration applied.");
  process.exit(0);
}
verify().catch(e => { console.error(e); process.exit(1); });
