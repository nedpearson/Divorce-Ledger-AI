/**
 * fix-expenses-env.ts
 *
 * One-time migration: move all expenses/financial records tagged 'live-prod'
 * to the canonical 'live' environment so they appear on the dashboard.
 *
 * Usage: npx tsx --import dotenv/config fix-expenses-env.ts
 */
import { db } from './server/db';
import { sql } from 'drizzle-orm';

(async () => {
  const USER_ID = 'd21c3b35-2a34-49cd-9016-8b7d9f1a331f';

  const TABLES = ['expenses', 'incomes', 'assets', 'debts', 'transactions',
                  'documents', 'violations', 'cases', 'alerts'];

  console.log('\n=== Migrating live-prod → live for all tables ===\n');

  for (const table of TABLES) {
    try {
      const r = await db.execute(sql.raw(`
        UPDATE ${table}
        SET environment = 'live'
        WHERE user_id = '${USER_ID}'
          AND environment = 'live-prod'
      `));
      const count = (r as any).rowCount ?? 0;
      if (count > 0) {
        console.log(`  ✅ ${table}: moved ${count} rows`);
      } else {
        console.log(`  ⏭️  ${table}: no rows to move`);
      }
    } catch (err: any) {
      // Table may not have user_id column — skip gracefully
      console.log(`  ⚠️  ${table}: skipped (${err.message?.slice(0, 60)})`);
    }
  }

  // Verify final state for expenses
  const check = await db.execute(sql`
    SELECT environment, COUNT(*) as count, COALESCE(SUM(amount),0) as total
    FROM expenses
    WHERE user_id = ${USER_ID}
    GROUP BY environment
    ORDER BY environment
  `);
  console.log('\nExpenses by environment after migration:');
  (check as any).rows.forEach((row: any) =>
    console.log(`  ${row.environment}: ${row.count} records, $${Number(row.total).toFixed(2)}`)
  );

  const dashCheck = await db.execute(sql`
    SELECT
      (SELECT COALESCE(SUM(value::numeric),0)  FROM assets  WHERE user_id=${USER_ID} AND environment='live') as assets,
      (SELECT COALESCE(SUM(amount::numeric),0) FROM debts   WHERE user_id=${USER_ID} AND environment='live') as debts,
      (SELECT COALESCE(SUM(amount::numeric),0) FROM incomes WHERE user_id=${USER_ID} AND environment='live') as income,
      (SELECT COALESCE(SUM(amount::numeric),0) FROM expenses WHERE user_id=${USER_ID} AND environment='live') as expenses
  `);
  const d = (dashCheck as any).rows[0];
  console.log('\n=== Dashboard will show (live) ===');
  console.log(`  Total Assets:     $${Number(d.assets).toLocaleString()}`);
  console.log(`  Total Debts:      $${Number(d.debts).toLocaleString()}`);
  console.log(`  Monthly Income:   $${Number(d.income).toLocaleString()}/mo`);
  console.log(`  Monthly Expenses: $${Number(d.expenses).toLocaleString()}/mo`);
  console.log('\n👉 Refresh http://localhost:5000/dashboard\n');
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
