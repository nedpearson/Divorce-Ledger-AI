const pg = require('pg');
const ref = 'ntkegkbhvgltdcfoakyk';
// URL-encode the password ($ -> %24)
const pw_raw = '26-DivoreceLedgerAI$';
const pw = encodeURIComponent(pw_raw);

console.log('Password encoded:', pw);

const hosts = [
  // Pooler transaction mode (port 6543) - encoded password
  {
    url: `postgresql://postgres.${ref}:${pw}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
    label: 'pooler-txn-encoded',
  },
  // Pooler session mode (port 5432) - encoded password
  {
    url: `postgresql://postgres.${ref}:${pw}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
    label: 'pooler-session-encoded',
  },
  // Direct - encoded
  {
    url: `postgresql://postgres:${pw}@db.${ref}.supabase.co:5432/postgres`,
    label: 'direct-encoded',
  },
  // Pooler with just postgres username
  {
    url: `postgresql://postgres:${pw}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
    label: 'pooler-plain-user',
  },
];

let i = 0;
function tryNext() {
  if (i >= hosts.length) {
    console.log('All tried');
    return;
  }
  const { url, label } = hosts[i++];
  const masked = url.replace(/:([^:@]+)@/, ':***@');
  const pool = new pg.Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
    max: 1,
  });
  pool
    .query('SELECT current_database() as db')
    .then((r) => {
      console.log(`✅ SUCCESS [${label}]:`, r.rows[0].db);
      console.log('   URL:', masked);
      pool.end();
    })
    .catch((e) => {
      console.log(`  [${label}]: ${e.message}`);
      pool.end().then(tryNext);
    });
}
tryNext();
