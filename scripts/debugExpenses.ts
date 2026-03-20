import { db } from '../server/db';
import { expenses } from '../shared/schema';
import { desc, sql, count, sum } from 'drizzle-orm';

async function debugExpenses() {
  console.log('=== DEBUG: Expenses Table ===\n');

  try {
    const totalCount = await db.select({ count: count() }).from(expenses);

    console.log(`Total expenses in database: ${totalCount[0].count}`);
    console.log('');

    const recentExpenses = await db.select().from(expenses).orderBy(desc(expenses.id)).limit(10);

    console.log('Recent Expenses (10 most recent):');
    console.log('─'.repeat(100));

    if (recentExpenses.length === 0) {
      console.log('  ⚠️  NO EXPENSES FOUND IN DATABASE');
      console.log('');
      console.log('  Possible issues:');
      console.log('  1. Document analysis is not creating expense records');
      console.log('  2. Document type is not being detected as a financial document');
      console.log("  3. parse_status is not 'success'");
      console.log('  4. total_amount_due is null or 0');
      console.log('');
    } else {
      for (const exp of recentExpenses) {
        console.log(`ID: ${exp.id}`);
        console.log(`  User ID: ${exp.userId}`);
        console.log(`  Document ID: ${exp.documentId || 'null'}`);
        console.log(`  Category: ${exp.category}`);
        console.log(`  Description: ${exp.description}`);
        console.log(`  Amount: $${(exp.amount / 100).toFixed(2)} (cents: ${exp.amount})`);
        console.log(`  Frequency: ${exp.frequency}`);
        console.log(`  Owner: ${exp.owner}`);
        console.log(`  Vendor: ${exp.vendor}`);
        console.log(`  Environment: ${exp.environment}`);
        console.log(`  Start Date: ${exp.startDate}`);
        console.log('');
      }
    }

    console.log('\n=== Expenses by Environment ===\n');

    const byEnvironment = await db
      .select({
        environment: expenses.environment,
        count: count(),
        totalAmount: sum(expenses.amount),
      })
      .from(expenses)
      .groupBy(expenses.environment);

    for (const env of byEnvironment) {
      console.log(`Environment: ${env.environment}`);
      console.log(`  Count: ${env.count}`);
      console.log(
        `  Total Amount: $${env.totalAmount ? (Number(env.totalAmount) / 100).toFixed(2) : '0.00'}`
      );
      console.log('');
    }

    console.log('\n=== Expenses by User ID ===\n');

    const byUserId = await db
      .select({
        userId: expenses.userId,
        count: count(),
        totalAmount: sum(expenses.amount),
      })
      .from(expenses)
      .groupBy(expenses.userId)
      .limit(10);

    for (const user of byUserId) {
      console.log(`User ID: ${user.userId}`);
      console.log(`  Count: ${user.count}`);
      console.log(
        `  Total Amount: $${user.totalAmount ? (Number(user.totalAmount) / 100).toFixed(2) : '0.00'}`
      );
      console.log('');
    }
  } catch (error) {
    console.error('Error querying database:', error);
  }

  process.exit(0);
}

debugExpenses();
