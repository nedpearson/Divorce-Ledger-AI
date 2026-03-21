import { db } from './server/db.js';
import { sql } from 'drizzle-orm';

async function main() {
  const res = await db.execute(sql`
    SELECT table_name, column_name, data_type 
    FROM information_schema.columns 
    WHERE data_type = 'integer' 
    AND (
      column_name LIKE '%user_id%' 
      OR column_name LIKE '%owner%' 
      OR column_name LIKE '%sender_id%' 
      OR column_name = 'id'
    )
    AND table_schema = 'public'
  `);
  console.log(JSON.stringify(res, null, 2));
  process.exit(0);
}

main().catch(console.error);
