const pg = require('pg');
const ref = 'ntkegkbhvgltdcfoakyk';
const pw = '26-DivoreceLedgerAI$';

const attempts = [
  // Newer format: project-specific pooler host
  { host: `${ref}.pooler.supabase.com`, port: 6543, user: `postgres.${ref}`, label: 'project-pooler-txn' },
  { host: `${ref}.pooler.supabase.com`, port: 5432, user: `postgres.${ref}`, label: 'project-pooler-session' },
  { host: `${ref}.pooler.supabase.com`, port: 6543, user: 'postgres', label: 'project-pooler-txn-plain' },
  // Session-mode on standard host port 5432
  { host: 'aws-0-us-east-1.pooler.supabase.com', port: 5432, user: `postgres.${ref}`, label: 'regional-session-5432' },
  // Try without project ref in user
  { host: 'aws-0-us-east-1.pooler.supabase.com', port: 6543, user: 'postgres', label: 'regional-plain-user' },
];

async function tryAll() {
  for (const { host, port, user, label } of attempts) {
    let pool;
    try {
      pool = new pg.Pool({ host, port, user, password: pw, database: 'postgres', ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000, max: 1 });
      const r = await pool.query('SELECT current_database() as db');
      console.log(`✅ SUCCESS [${label}] user=${user} host=${host}:${port}`);
      console.log('   DB:', r.rows[0].db);
      await pool.end();
      return { host, port, user };
    } catch (e) {
      console.log(`  [${label}] user=${user}: ${e.message}`);
      try { await pool?.end(); } catch {}
    }
  }
  console.log('\n❌ All failed. Please paste the connection string from:');
  console.log('   Supabase Dashboard → Project Settings → Database → Connection string → URI');
}
tryAll();
