import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  const pool = new Pool({
      connectionString: connectionString,
      ssl: connectionString?.includes('supabase') ? { rejectUnauthorized: false } : undefined,
  });

  const client = await pool.connect();
  try {
    await client.query(`ALTER TABLE obligation_instances ADD COLUMN IF NOT EXISTS rule_id VARCHAR;`);
    await client.query(`ALTER TABLE obligation_instances ADD COLUMN IF NOT EXISTS insurance_covered_amount INTEGER DEFAULT 0;`);

    console.log('Successfully patched final missing columns natively!');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    client.release();
    pool.end();
  }
}

main();
