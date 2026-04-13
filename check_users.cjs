require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  const r = await pool.query(`SELECT id, username FROM users LIMIT 10`);
  console.log('Users:', r.rows);
  const assets = await pool.query(`SELECT user_id, value, environment FROM assets WHERE environment = 'live'`);
  console.log('Live assets:', assets.rows);
  const debts = await pool.query(`SELECT user_id, amount, environment FROM debts WHERE environment = 'live'`);
  console.log('Live debts:', debts.rows);
  pool.end();
}
check().catch(console.error);
