require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  const r = await pool.query(`SELECT environment, category, amount_gross, remaining_balance, due_date, status, review_status, direction FROM obligation_instances LIMIT 10`);
  console.log('Instances:', r.rows);
  pool.end();
}
check().catch(console.error);
