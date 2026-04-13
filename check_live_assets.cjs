require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  const r = await pool.query(`SELECT user_id, value, environment FROM assets WHERE environment = 'live'`);
  console.log('Live assets:', r.rows);
  pool.end();
}
check().catch(console.error);
