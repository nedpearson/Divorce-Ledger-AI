require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  try {
    const res = await pool.query(`SELECT * FROM conversations`);
    console.log('Conversations:', res.rows.length);
  } catch (err) {
    console.error('Error fetching conversations:', err);
  }
  pool.end();
}
check();
