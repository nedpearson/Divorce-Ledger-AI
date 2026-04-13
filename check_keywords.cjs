require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  const r = await pool.query("SELECT file_name FROM documents WHERE ai_extracted_text ILIKE '%atmos%' OR ai_extracted_text ILIKE '%entergy%' OR ai_extracted_text ILIKE '%br water%'");
  console.log('Keyword match docs:', r.rows.map(row => row.file_name));
  pool.end();
}
check().catch(console.error);
