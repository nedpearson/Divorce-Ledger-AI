require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  const r = await pool.query(`SELECT * FROM obligation_rules WHERE category = 'child_support'`);
  console.log('Child support rules:', r.rows);
  pool.end();
}
check().catch(console.error);
