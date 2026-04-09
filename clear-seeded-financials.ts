/**
 * clear-seeded-financials.ts
 * Removes all manually seeded (document_id IS NULL) financial records for the live user.
 * Document-linked records are intentionally left alone (but there are none right now).
 */
import { db } from './server/db';
import { sql } from 'drizzle-orm';

const USER_ID = 'd21c3b35-2a34-49cd-9016-8b7d9f1a331f';

(async () => {
  console.log('\n=== Clearing seeded financial records (live, document_id IS NULL) ===\n');

  const tables = ['expenses', 'incomes', 'assets', 'debts'] as const;
  for (const tbl of tables) {
    const r = await db.execute(sql.raw(`
      DELETE FROM ${tbl}
      WHERE user_id = '${USER_ID}'
        AND environment = 'live'
        AND document_id IS NULL
    `));
    const count = (r as any).rowCount ?? 0;
    console.log(`  ✅ ${tbl}: removed ${count} records`);
  }

  // Verify
  const check = await db.execute(sql.raw(`
    SELECT
      (SELECT COUNT(*) FROM assets   WHERE user_id='${USER_ID}' AND environment='live') AS assets,
      (SELECT COUNT(*) FROM debts    WHERE user_id='${USER_ID}' AND environment='live') AS debts,
      (SELECT COUNT(*) FROM incomes  WHERE user_id='${USER_ID}' AND environment='live') AS incomes,
      (SELECT COUNT(*) FROM expenses WHERE user_id='${USER_ID}' AND environment='live') AS expenses
  `));
  const d = (check as any).rows[0];
  console.log('\n=== Remaining records (should all be 0) ===');
  console.log(`  assets=${d.assets}  debts=${d.debts}  incomes=${d.incomes}  expenses=${d.expenses}`);
  console.log('\n👉 Dashboard will now show $0 until documents are uploaded and analyzed.\n');
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
