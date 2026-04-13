require('dotenv').config();
const { getDashboardStats } = require('./server/storage.ts'); // Can't easily require ts without ts-node

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  const assets = await pool.query(`SELECT SUM(value) as total FROM assets WHERE environment = 'live'`);
  console.log('Live assets sum:', assets.rows[0].total);
  pool.end();
}
check().catch(console.error);
