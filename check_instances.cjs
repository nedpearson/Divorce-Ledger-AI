require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  const r = await pool.query("SELECT * FROM obligation_instances WHERE rule_id = '8d39331f-4a51-44a0-8b3b-1d990fe827a5'");
  console.log('Instances for Utilities Rule:', r.rows);
  pool.end();
}
check().catch(console.error);
