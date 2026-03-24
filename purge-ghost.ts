import 'dotenv/config';
import { db } from './server/db';
import { sql, eq } from 'drizzle-orm';
import * as schema from './shared/schema';

async function run() {
  console.log('Purging ghost legacy users...');
  
  const ghostIds = ['demo-user', 'demo-firm-admin', 'demo-client-user'];
  
  for (const gid of ghostIds) {
    try {
      await db.delete(schema.users).where(eq(schema.users.id, gid));
      console.log(`Deleted ghost user: ${gid}`);
    } catch (e) {
      console.error(`Could not delete ${gid} due to constraints. Taking fallback approach.`);
      // If foreign keys prevent deletion, scramble the password hash so remember-me tokens fail!
      await db.update(schema.users)
        .set({ password: 'scrambled_to_force_logout_' + Date.now(), status: 'suspended' })
        .where(eq(schema.users.id, gid));
      console.log(`Scrambled password and suspended: ${gid}`);
    }
  }

  // Also truncate all sessions again just to be 100% sure
  try { await db.execute(sql`TRUNCATE TABLE session CASCADE`); } catch(e){}
  try { await db.execute(sql`TRUNCATE TABLE sessions CASCADE`); } catch(e){}

  console.log('Purge complete.');
  process.exit(0);
}

run().catch(console.error);
