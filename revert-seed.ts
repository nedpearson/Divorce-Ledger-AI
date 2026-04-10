import 'dotenv/config';
import { db } from './server/db';
import * as schema from '@shared/schema';
import { eq, and } from 'drizzle-orm';

async function revertSeed() {
  const users = await db.select().from(schema.users);
  const liveUser = users.find(u => u.email === 'nedpearson@gmail.com');
  
  if (!liveUser) {
    console.log("No live user found.");
    process.exit(1);
  }

  const userId = liveUser.id;
  const env = 'live';

  console.log(`Reverting seeded financial data for ${liveUser.email} in ${env}...`);

  // Delete the seeded Assets
  await db.delete(schema.assets).where(and(eq(schema.assets.userId, userId), eq(schema.assets.environment, env)));
  console.log('Cleared seeded assets.');

  // Delete the seeded Debts
  await db.delete(schema.debts).where(and(eq(schema.debts.userId, userId), eq(schema.debts.environment, env)));
  console.log('Cleared seeded debts.');

  // Delete the seeded Incomes
  await db.delete(schema.incomes).where(and(eq(schema.incomes.userId, userId), eq(schema.incomes.environment, env)));
  console.log('Cleared seeded incomes.');

  // NOTE: Keeping the 'expenses' because the user DID upload those documents.
  process.exit(0);
}

revertSeed().catch(console.error);
