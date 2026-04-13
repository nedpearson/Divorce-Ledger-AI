require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query("ALTER TABLE obligation_rules ADD COLUMN IF NOT EXISTS keywords text;")
  .then(res => {
    console.log("Added keywords column");
    pool.end();
  }).catch(e => console.error(e));
