import { db } from './server/db';
import { sql } from 'drizzle-orm';

(async () => {
  const USER_ID = 'd21c3b35-2a34-49cd-9016-8b7d9f1a331f';

  // Move Entergy expenses from demo → live-prod so they show on dashboard
  const r = await db.execute(sql`
    UPDATE expenses
    SET environment = 'live-prod'
    WHERE user_id = ${USER_ID}
      AND description LIKE 'Entergy%'
  `);
  console.log('Moved expenses to live-prod:', (r as any).rowCount);

  // Verify final state
  const check = await db.execute(sql`
    SELECT environment, COUNT(*) as count, SUM(amount) as total
    FROM expenses
    WHERE user_id = ${USER_ID}
    GROUP BY environment
  `);
  console.log('\nExpenses by environment:');
  (check as any).rows.forEach((row: any) =>
    console.log(`  ${row.environment}: ${row.count} records, $${row.total}/mo`)
  );

  const dashCheck = await db.execute(sql`
    SELECT
      (SELECT COALESCE(SUM(value),0)  FROM assets  WHERE user_id=${USER_ID} AND environment='live-prod') as assets,
      (SELECT COALESCE(SUM(amount),0) FROM debts   WHERE user_id=${USER_ID} AND environment='live-prod') as debts,
      (SELECT COALESCE(SUM(amount),0) FROM incomes WHERE user_id=${USER_ID} AND environment='live-prod') as income,
      (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE user_id=${USER_ID} AND environment='live-prod') as expenses
  `);
  const d = (dashCheck as any).rows[0];
  console.log('\n=== Dashboard will show ===');
  console.log(`  Total Assets:     $${Number(d.assets).toLocaleString()}`);
  console.log(`  Total Debts:      $${Number(d.debts).toLocaleString()}`);
  console.log(`  Monthly Income:   $${Number(d.income).toLocaleString()}/mo`);
  console.log(`  Monthly Expenses: $${Number(d.expenses).toLocaleString()}/mo`);
  console.log('\n👉 Refresh http://localhost:5000/dashboard\n');
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
