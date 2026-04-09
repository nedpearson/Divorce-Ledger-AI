import { db } from './server/db';
import { sql } from 'drizzle-orm';

(async () => {
  // 1. Check all users
  const users = await db.execute(sql`SELECT id, email, role FROM users ORDER BY created_at`);
  console.log('\n=== USERS ===');
  (users as any).rows.forEach((u: any) => console.log(`  ${u.email} | ${u.id} | role=${u.role}`));

  // 2. Check what's in expenses
  const exp = await db.execute(sql`SELECT user_id, environment, COUNT(*) as count, SUM(amount) as total FROM expenses GROUP BY user_id, environment`);
  console.log('\n=== EXPENSES (grouped) ===');
  (exp as any).rows.forEach((r: any) => console.log(`  user_id=${r.user_id} | env=${r.environment} | count=${r.count} | total=$${r.total}`));

  // 3. Check what's in assets/debts/incomes
  const assets = await db.execute(sql`SELECT user_id, environment, COUNT(*) as count, SUM(value) as total FROM assets GROUP BY user_id, environment`);
  console.log('\n=== ASSETS (grouped) ===');
  (assets as any).rows.forEach((r: any) => console.log(`  user_id=${r.user_id} | env=${r.environment} | count=${r.count} | total=$${r.total}`));

  const incomes = await db.execute(sql`SELECT user_id, environment, COUNT(*) as count, SUM(amount) as total FROM incomes GROUP BY user_id, environment`);
  console.log('\n=== INCOMES (grouped) ===');
  (incomes as any).rows.forEach((r: any) => console.log(`  user_id=${r.user_id} | env=${r.environment} | count=${r.count} | total=$${r.total}`));

  // 4. Check the /api/dashboard/stats using the actual session logic
  console.log('\n=== checking getDashboardStats for demo-client-user env=demo ===');
  const r = await db.execute(sql`SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id='demo-client-user' AND environment='demo'`);
  console.log('  expenses for demo-client-user/demo:', (r as any).rows[0]?.total);

  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
