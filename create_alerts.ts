import { db } from './server/db.js';
import { sql } from 'drizzle-orm';

async function main() {
  console.log("Creating security_alerts on the fly...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS security_alerts (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id varchar NOT NULL,
      type text NOT NULL,
      severity text NOT NULL DEFAULT 'medium',
      message text NOT NULL,
      is_resolved boolean DEFAULT false,
      resolved_at timestamp,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);
  console.log("Creation completely successful!");
  process.exit(0);
}

main().catch(err => {
  console.error("Failed:", err);
  process.exit(1);
});
