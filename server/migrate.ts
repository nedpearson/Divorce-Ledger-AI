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
      CREATE TABLE IF NOT EXISTS "mobile_pairing_tokens" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "token" varchar NOT NULL,
        "expires_at" timestamp NOT NULL,
        "used" boolean DEFAULT false NOT NULL,
        "environment" varchar DEFAULT 'demo' NOT NULL,
        CONSTRAINT "mobile_pairing_tokens_token_unique" UNIQUE("token")
      );
    `;
    await client.query(query);
    console.log('Mobile pairing token table verified/created successfully.');
  } catch (err) {
    console.error('Failed to execute query:', err);
  } finally {
    client.release();
    pool.end();
  }
}

main();
