import 'dotenv/config';
import { db } from './server/db';
import * as schema from '@shared/schema';
import { eq, and, like } from 'drizzle-orm';

async function revertExpenses() {
  const users = await db.select().from(schema.users);
  const liveUser = users.find(u => u.email === 'nedpearson@gmail.com');
  
  if (!liveUser) {
    console.log("No live user found.");
    process.exit(1);
  }

  const userId = liveUser.id;
  const env = 'live';

  console.log(`Reverting seeded expense amounts for ${liveUser.email} in ${env}...`);

  // Reset the amounts back to 0 for all placeholder expenses
  const res = await db.update(schema.expenses)
    .set({ amount: 0 })
    .where(and(
      eq(schema.expenses.userId, userId), 
      eq(schema.expenses.environment, env),
      like(schema.expenses.description, '%imported from document (amount needs review)%')
    ));

  console.log(`Reset expenses back to 0 placeholders.`);
  process.exit(0);
}

revertExpenses().catch(console.error);
