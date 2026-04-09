import { db } from './server/db';
import { sql } from 'drizzle-orm';

(async () => {
  const USER_ID = 'd21c3b35-2a34-49cd-9016-8b7d9f1a331f';

  const r = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM assets  WHERE user_id=${USER_ID}) as asset_count,
      (SELECT COUNT(*) FROM debts   WHERE user_id=${USER_ID}) as debt_count,
      (SELECT COUNT(*) FROM incomes WHERE user_id=${USER_ID}) as income_count,
      (SELECT COUNT(*) FROM expenses WHERE user_id=${USER_ID}) as expense_count,
      (SELECT COALESCE(SUM(value::numeric),0)  FROM assets  WHERE user_id=${USER_ID}) as total_assets,
      (SELECT COALESCE(SUM(amount::numeric),0) FROM debts   WHERE user_id=${USER_ID}) as total_debts,
      (SELECT COALESCE(SUM(amount::numeric),0) FROM incomes WHERE user_id=${USER_ID}) as total_income,
      (SELECT COALESCE(SUM(amount::numeric),0) FROM expenses WHERE user_id=${USER_ID}) as total_expenses
  `);
  const row = (r as any).rows[0];
  console.log('\n=== DB State for nedpearson@gmail.com ===');
  console.log('Assets:   ', row.asset_count,  'rows  total $', row.total_assets);
  console.log('Debts:    ', row.debt_count,   'rows  total $', row.total_debts);
  console.log('Incomes:  ', row.income_count,  'rows  total $', row.total_income);
  console.log('Expenses: ', row.expense_count, 'rows  total $', row.total_expenses);

  // Check environment column values
  const envs = await db.execute(sql`
    SELECT 'assets' as tbl, environment FROM assets WHERE user_id=${USER_ID}
    UNION ALL
    SELECT 'debts', environment FROM debts WHERE user_id=${USER_ID}
    UNION ALL
    SELECT 'incomes', environment FROM incomes WHERE user_id=${USER_ID}
    UNION ALL
    SELECT 'expenses', environment FROM expenses WHERE user_id=${USER_ID}
  `);
  const byEnv: Record<string,number> = {};
  (envs as any).rows.forEach((r: any) => {
    const k = `${r.tbl}:${r.environment}`;
    byEnv[k] = (byEnv[k]||0)+1;
  });
  console.log('\n=== Environment breakdown ===');
  Object.entries(byEnv).forEach(([k,v]) => console.log(' ', k, '->', v, 'rows'));

  // Simulate exactly what getDashboardStats does
  const sim = await db.execute(sql`
    SELECT
      (SELECT COALESCE(SUM(value::numeric),0) FROM assets WHERE user_id=${USER_ID} AND environment='live-prod') as assets,
      (SELECT COALESCE(SUM(amount::numeric),0) FROM debts  WHERE user_id=${USER_ID} AND environment='live-prod') as debts,
      (SELECT COALESCE(SUM(amount::numeric),0) FROM incomes WHERE user_id=${USER_ID} AND environment='live-prod') as income,
      (SELECT COALESCE(SUM(amount::numeric),0) FROM expenses WHERE user_id=${USER_ID} AND environment='live-prod') as expenses
  `);
  const s = (sim as any).rows[0];
  console.log('\n=== Simulated getDashboardStats(live-prod) ===');
  console.log('  totalAssets:    $', s.assets);
  console.log('  totalDebts:     $', s.debts);
  console.log('  monthlyIncome:  $', s.income);
  console.log('  monthlyExpenses:$', s.expenses);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
