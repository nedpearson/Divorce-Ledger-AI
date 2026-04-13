require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  const r1 = await pool.query("SELECT category FROM assets");
  const r2 = await pool.query("SELECT category FROM debts");
  console.log('Asset cats:', new Set(r1.rows.map(r => r.category)));
  console.log('Debt cats:', new Set(r2.rows.map(r => r.category)));
  pool.end();
}
check().catch(console.error);
