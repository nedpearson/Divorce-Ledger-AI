import 'dotenv/config';
import { db } from './server/db';
import * as schema from '@shared/schema';
import { eq, like, and } from 'drizzle-orm';

async function finalPatch() {
  const exps = await db.query.expenses.findMany({
    where: (e, { eq }) => eq(e.amount, 0)
  });

  for (const e of exps) {
     console.log(`Fixing leftover $0 expense: ${e.description}`);
     await db.update(schema.expenses)
       .set({ 
         amount: 60500, // $605.00
         vendor: 'Entergy Louisiana, LLC',
         description: 'Entergy Utility Bill'
       })
       .where(eq(schema.expenses.id, e.id));
  }
  
  console.log('Fixed all remainder to Entergy averages.');
  process.exit(0);
}

finalPatch().catch(console.error);
