require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  const r = await pool.query(`SELECT * FROM obligation_instances WHERE category = 'child_support'`);
  console.log('CS instances:', r.rows);
  pool.end();
}
check().catch(console.error);
