require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  const r = await pool.query("SELECT * FROM documents WHERE id IN ('d1d6d056-0de9-4e12-adc2-379fcc9c924b', '505d642f-a9f3-4c13-aac1-c69e1f4d1424')");
  console.log('Docs match:', r.rows);
  pool.end();
}
check().catch(console.error);
