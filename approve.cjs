require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function approveInstances() {
  const result = await pool.query(`UPDATE obligation_instances SET review_status = 'approved' WHERE review_status = 'needs_review'`);
  console.log(`Approved ${result.rowCount} obligation instances.`);
  pool.end();
}
approveInstances().catch(console.error);
