import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function run() {
  console.log('Cleaning old mock users...');
  try { await db.execute(sql`TRUNCATE TABLE session CASCADE`); } catch(e){}
  try { await db.execute(sql`TRUNCATE TABLE sessions CASCADE`); } catch(e){}
  console.log('Wiped active sessions.');
  process.exit(0);
}

run().catch(console.error);
