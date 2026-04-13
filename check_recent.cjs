require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  const r = await pool.query("SELECT id, file_name, created_at, environment FROM documents ORDER BY created_at DESC LIMIT 10");
  console.log('Recent 10 docs:', r.rows);
  pool.end();
}
check().catch(console.error);
