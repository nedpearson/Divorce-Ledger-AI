import { Pool } from 'pg';
import "dotenv/config";
import fs from 'fs';

async function migrate() {
  const sql = fs.readFileSync('migrations/0003_wakeful_betty_ross.sql', 'utf-8');
  const statements = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(s => s.length > 0);
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  for (const statement of statements) {
    console.log(`Executing: ${statement}`);
    try {
      await pool.query(statement);
      console.log('Success.');
    } catch (e) {
      console.error('Error applying statement:', e);
    }
  }

  await pool.end();
}

migrate().catch(console.error);
