require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  const ids = ['24d60d1e-de2e-4131-9eaa-2fd0499baed1', 'f81ce851-9c7c-4b4d-9845-4284c44f8378'];
  const r = await pool.query("SELECT id, file_name, environment FROM documents WHERE id IN ('24d60d1e-de2e-4131-9eaa-2fd0499baed1', 'f81ce851-9c7c-4b4d-9845-4284c44f8378')");
  console.log('Docs match:', r.rows);
  pool.end();
}
check().catch(console.error);
