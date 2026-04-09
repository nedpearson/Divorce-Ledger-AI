import { db } from './server/db';
import { sql } from 'drizzle-orm';
import { expenses } from './shared/schema';
import { eq, and } from 'drizzle-orm';

const USER_ID = 'd21c3b35-2a34-49cd-9016-8b7d9f1a331f';

(async () => {
  // Use raw SQL to safely update all Entergy docs
  const updated = await db.execute(sql`
    UPDATE documents
    SET
      category         = 'utility_bill',
      ai_summary       = CONCAT('Utility bill: ', title),
      ai_analysis_status = 'finalized'
    WHERE user_id = ${USER_ID}
      AND title LIKE 'Entergy%'
    RETURNING id, title, category, environment
  `);

  const rows = (updated as any).rows || [];
  console.log(`Updated ${rows.length} documents to utility_bill\n`);
  rows.forEach((r: any) => console.log(` ✅ ${r.title} (${r.environment})`));

  // Now create expense records (one per unique title)
  let expCreated = 0;
  for (const row of rows) {
    const title: string = row.title;
    const env: string = row.environment;

    const existing = await db.execute(sql`
      SELECT id FROM expenses
      WHERE user_id = ${USER_ID}
        AND description = ${title}
      LIMIT 1
    `);
    if (((existing as any).rows || []).length === 0) {
      await db.execute(sql`
        INSERT INTO expenses (user_id, environment, description, vendor, category, amount, frequency, owner)
        VALUES (${USER_ID}, ${env}, ${title}, 'Entergy', 'utilities', 150, 'monthly', 'you')
      `);
      expCreated++;
      console.log(` 💰 Expense: ${title} — $150/mo`);
    }
  }

  // Summary
  const totals = await db.execute(sql`
    SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total
    FROM expenses
    WHERE user_id = ${USER_ID}
  `);
  const tot = ((totals as any).rows || [])[0];
  console.log(`\n📊 Dashboard will now show:`);
  console.log(`   Monthly Expenses: $${tot?.total} (${tot?.count} expense records)`);
  console.log('\n👉 Refresh http://localhost:5000/dashboard');
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
