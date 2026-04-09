/**
 * debug-dashboard.ts
 *
 * Directly queries Supabase to show what the dashboard will display.
 * Checks both legacy 'live-prod' and canonical 'live' environments.
 *
 * Usage: npx tsx --import dotenv/config debug-dashboard.ts
 */
import { db } from './server/db';
import { sql } from 'drizzle-orm';

const USER_ID = 'd21c3b35-2a34-49cd-9016-8b7d9f1a331f';

(async () => {
  // Check both envs so we can detect leftover legacy data
  for (const ENV of ['live', 'live-prod'] as const) {
    const check = await db.execute(sql`
      SELECT
        (SELECT COALESCE(SUM(value::numeric),0)  FROM assets  WHERE user_id=${USER_ID} AND environment=${ENV}) as assets,
        (SELECT COALESCE(SUM(amount::numeric),0) FROM debts   WHERE user_id=${USER_ID} AND environment=${ENV}) as debts,
        (SELECT COALESCE(SUM(amount::numeric),0) FROM incomes WHERE user_id=${USER_ID} AND environment=${ENV}) as income,
        (SELECT COALESCE(SUM(amount::numeric),0) FROM expenses WHERE user_id=${USER_ID} AND environment=${ENV}) as expenses
    `);
    const d = (check as any).rows[0];
    console.log(`\n=== Simulated getDashboardStats(${ENV}) ===`);
    console.log(`  Total Assets:     $${Number(d.assets).toLocaleString()}`);
    console.log(`  Total Debts:      $${Number(d.debts).toLocaleString()}`);
    console.log(`  Monthly Income:   $${Number(d.income).toLocaleString()}/mo`);
    console.log(`  Monthly Expenses: $${Number(d.expenses).toLocaleString()}/mo`);
    console.log(`  Net Position:     $${(Number(d.assets) - Number(d.debts)).toLocaleString()}`);
  }

  // Check user record
  const userCheck = await db.execute(sql`
    SELECT id, email, environment FROM users WHERE id = ${USER_ID}
  `);
  console.log('\n=== User DB record ===');
  (userCheck as any).rows.forEach((u: any) =>
    console.log(`  ${u.email} | environment=${u.environment}`)
  );

  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
