import { db } from './server/db.js';
import { sql } from 'drizzle-orm';

async function main() {
  console.log("Dropping public schema...");
  await db.execute(sql`DROP SCHEMA public CASCADE;`);
  console.log("Recreating public schema...");
  await db.execute(sql`CREATE SCHEMA public;`);
  
  console.log("Setting grants...");
  await db.execute(sql`GRANT ALL ON SCHEMA public TO postgres;`);
  await db.execute(sql`GRANT ALL ON SCHEMA public TO public;`);
  
  console.log("Done! Run db:push now.");
  process.exit(0);
}

main().catch(err => {
  console.error("Failed:", err);
  process.exit(1);
});
