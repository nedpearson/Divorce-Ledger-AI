import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';
import * as schema from './shared/schema';

async function run() {
  console.log('Checking database state...');
  
  const users = await db.select({
    id: schema.users.id,
    email: schema.users.email,
  }).from(schema.users).where(sql`environment = 'demo'`);

  console.log('Demo Users:', users);

  const stats = await db.execute(sql`
    SELECT
      u.email,
      (SELECT count(*) FROM transactions t WHERE t.user_id = u.id) as trans_count,
      (SELECT count(*) FROM incomes i WHERE i.user_id = u.id) as inc_count,
      (SELECT count(*) FROM expenses e WHERE e.user_id = u.id) as exp_count,
      (SELECT count(*) FROM assets a WHERE a.user_id = u.id) as ast_count,
      (SELECT count(*) FROM documents d WHERE d.user_id = u.id) as doc_count
    FROM users u
    WHERE u.environment = 'demo';
  `);

  console.log('Stats:', stats.rows);
  process.exit(0);
}

run().catch(console.error);
