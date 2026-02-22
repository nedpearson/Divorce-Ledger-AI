const pg = require('pg');
const ref = 'ntkegkbhvgltdcfoakyk';

const passwords = [
  '26-DivoreceLedgerAI$',      // as typed
  '26-DivorceLedgerAI$',       // corrected spelling
  '26-DivoreceLedgerAI$',      // original
  '26-DivoreceLedgerAI',       // without $
  '26-DivorceLedgerAI',        // corrected, no $
];

const hosts = [
  { host: `aws-0-us-east-1.pooler.supabase.com`, port: 6543, user: `postgres.${ref}`, label: 'pooler-us-east-1' },
  { host: `aws-0-us-east-2.pooler.supabase.com`, port: 6543, user: `postgres.${ref}`, label: 'pooler-us-east-2' },
  { host: `aws-0-eu-west-2.pooler.supabase.com`, port: 6543, user: `postgres.${ref}`, label: 'pooler-eu-west-2' },
];

async function tryAll() {
  for (const { host, port, user, label } of hosts) {
    for (const pw of passwords) {
      const pool = new pg.Pool({
        host, port, user, password: pw, database: 'postgres',
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000, max: 1
      });
      try {
        await pool.query('SELECT 1');
        console.log(`✅ SUCCESS [${label}] password: [REDACTED]`);
        await pool.end();
        return;
      } catch (e) {
        console.log(`  [${label}] pw=[REDACTED]: ${e.message}`);
        try { await pool.end(); } catch {}
      }
    }
  }
  console.log('❌ All combinations failed');
}

tryAll();
