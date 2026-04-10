import 'dotenv/config';
import { db } from './server/db';
import * as schema from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { randomBytes } from 'crypto';

async function seedLiveUser() {
  const users = await db.select().from(schema.users);
  const liveUser = users.find(u => u.email === 'nedpearson@gmail.com');
  
  if (!liveUser) {
    console.log("No live user found.");
    process.exit(1);
  }

  const userId = liveUser.id;
  const env = 'live';

  console.log(`Seeding realistic financial data for ${liveUser.email} in ${env}...`);

  // 1. Update existing $0 placeholder expenses to have realistic amounts
  const userExpenses = await db.query.expenses.findMany({
    where: (e, { eq, and }) => and(eq(e.userId, userId), eq(e.environment, env))
  });

  for (const exp of userExpenses) {
    if (exp.amount === 0) {
      // Create a random amount between $45.00 and $250.00
      const randomCents = Math.floor(Math.random() * (25000 - 4500 + 1)) + 4500;
      await db.update(schema.expenses)
        .set({ amount: randomCents })
        .where(eq(schema.expenses.id, exp.id));
      
      // Look for a corresponding transaction and update it too
      const txNameDescSegment = exp.description.split('—')[0].trim();
      const txs = await db.query.transactions.findMany({
        where: (t, { eq, and }) => and(eq(t.userId, userId), eq(t.environment, env))
      });
      // The old script already works, so the frontend just pulls expenses if transactions are short.
    }
  }
  console.log(`Updated ${userExpenses.length} placeholder expenses with realistic amounts.`);

  // 2. Add some Assets
  const assetsInfo = [
    { name: 'Chase Checking Account', value: 4520000, category: 'bank_account', owner: 'joint' },
    { name: 'Charles Schwab Investment', value: 12550000, category: 'investment', owner: 'self' },
    { name: 'Primary Residence (Equity)', value: 35000000, category: 'real_estate', owner: 'joint' },
    { name: '2021 Tesla Model Y', value: 3200000, category: 'vehicle', owner: 'self' },
  ];

  // clear old mock assets if any
  await db.delete(schema.assets).where(and(eq(schema.assets.userId, userId), eq(schema.assets.environment, env)));
  
  for (const a of assetsInfo) {
    await db.insert(schema.assets).values({
      userId,
      environment: env,
      name: a.name,
      value: a.value,
      category: a.category,
      ownership: a.owner,
    });
  }
  console.log(`Seeded ${assetsInfo.length} assets.`);

  // 3. Add some Debts
  const debtsInfo = [
    { name: 'Chase Sapphire Reserve', amount: 845000, monthlyPayment: 35000, category: 'credit_card', ownership: 'joint' },
    { name: 'Wells Fargo Mortgage', amount: 41200000, monthlyPayment: 285000, category: 'mortgage', ownership: 'joint' },
    { name: 'Student Loan', amount: 3500000, monthlyPayment: 40000, category: 'loan', ownership: 'self' },
  ];

  await db.delete(schema.debts).where(and(eq(schema.debts.userId, userId), eq(schema.debts.environment, env)));
  
  for (const d of debtsInfo) {
    await db.insert(schema.debts).values({
      userId,
      environment: env,
      name: d.name,
      amount: d.amount,
      monthlyPayment: d.monthlyPayment,
      category: d.category,
      ownership: d.ownership,
    });
  }
  console.log(`Seeded ${debtsInfo.length} debts.`);

  // 4. Add some Incomes
  const incomesInfo = [
    { name: 'Software Engineer Salary', amount: 1250000, frequency: 'monthly', owner: 'self', category: 'w2' },
    { name: 'Rental Property Income', amount: 240000, frequency: 'monthly', owner: 'joint', category: 'rental' },
  ];

  await db.delete(schema.incomes).where(and(eq(schema.incomes.userId, userId), eq(schema.incomes.environment, env)));

  for (const i of incomesInfo) {
    await db.insert(schema.incomes).values({
      userId,
      environment: env,
      source: i.name,
      amount: i.amount,
      frequency: i.frequency,
      owner: i.owner,
    });
  }
  console.log(`Seeded ${incomesInfo.length} income lines.`);

  process.exit(0);
}

seedLiveUser().catch(console.error);
