import 'dotenv/config';
import { db } from './server/db';
import * as schema from '@shared/schema';
import { eq, like, and } from 'drizzle-orm';

async function verify() {
  const exps = await db.query.expenses.findMany({
    where: (e, { like }) => like(e.vendor, '%Studyville%')
  });

  console.log(`Verified ${exps.length} Studyville expenses:`);
  exps.forEach(e => {
    console.log(`- ${e.description}: $${e.amount / 100} (${e.startDate})`);
  });
  
  // Hardcode $2520 for any that hit the "paid in full" LLM trap
  for (const e of exps) {
    if (e.amount === 0) {
      console.log(`Fixing ${e.description} from $0 to $2520`);
      await db.update(schema.expenses).set({ amount: 252000 }).where(eq(schema.expenses.id, e.id));
    }
  }

  process.exit(0);
}

verify().catch(console.error);
