import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function verify() {
  await db.execute(sql`
    ALTER TABLE "recurring_bill_cycles" ADD CONSTRAINT "cycle_template_month_year_unq" UNIQUE ("recurring_bill_template_id", "cycle_month", "cycle_year");
  `);
  console.log("Unique constraint applied.");
  process.exit(0);
}
verify().catch(e => { console.error(e); process.exit(1); });
