require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkAssets() {
  const r = await pool.query(`SELECT value, environment FROM assets`);
  console.log('Assets:', r.rows);
  pool.end();
}
checkAssets().catch(console.error);
