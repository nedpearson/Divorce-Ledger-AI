const pg = require('pg');
const pw = '26-DivoreceLedgerAI$';
const ref = 'ntkegkbhvgltdcfoakyk';
const regions = [
  'aws-0-us-east-1',
  'aws-0-us-east-2',
  'aws-0-us-west-1',
  'aws-0-us-west-2',
  'aws-0-eu-west-1',
  'aws-0-eu-west-2',
  'aws-0-eu-central-1',
  'aws-0-ap-southeast-1',
  'aws-0-ap-northeast-1',
  'aws-0-ap-south-1',
];

let found = false;

function tryNext(i) {
  if (i >= regions.length || found) {
    if (!found) console.log('❌ No region matched');
    return;
  }
  const r = regions[i];
  const connStr = `postgresql://postgres.${ref}:${pw}@${r}.pooler.supabase.com:6543/postgres`;
  const pool = new pg.Pool({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
    max: 1,
  });
  pool
    .query('SELECT 1')
    .then(() => {
      found = true;
      console.log('✅ FOUND region:', r);
      console.log('   DATABASE_URL:', connStr);
      pool.end();
    })
    .catch((e) => {
      console.log(`  ${r}: ${e.message}`);
      pool.end().then(() => tryNext(i + 1));
    });
}

tryNext(0);
