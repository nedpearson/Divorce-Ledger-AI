import { db } from './server/db.js';
import { sql } from 'drizzle-orm';

async function main() {
  console.log("Dropping FK constraints...");
  await db.execute(sql`ALTER TABLE workspace_members DROP CONSTRAINT IF EXISTS workspace_members_user_id_users_id_fk`);
  await db.execute(sql`ALTER TABLE matter_members DROP CONSTRAINT IF EXISTS matter_members_user_id_users_id_fk`);
  
  console.log("Altering columns to varchar...");
  await db.execute(sql`ALTER TABLE workspace_members ALTER COLUMN user_id TYPE varchar(100) USING user_id::varchar`);
  await db.execute(sql`ALTER TABLE matter_members ALTER COLUMN user_id TYPE varchar(100) USING user_id::varchar`);
  
  console.log("Fix complete! The columns are now varchar(100).");
  process.exit(0);
}

main().catch(err => {
  console.error("Failed:", err);
  process.exit(1);
});
