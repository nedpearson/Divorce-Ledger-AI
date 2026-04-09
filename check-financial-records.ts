/**
 * check-financial-records.ts
 * Audit what financial records exist and whether they're document-linked
 */
import { db } from './server/db';
import { sql } from 'drizzle-orm';

const USER_ID = 'd21c3b35-2a34-49cd-9016-8b7d9f1a331f';

(async () => {
  const r = await db.execute(sql`
    SELECT 'assets'   AS tbl, COUNT(*)::int AS total, COUNT(document_id)::int AS doc_linked FROM assets   WHERE user_id = ${USER_ID} AND environment = 'live'
    UNION ALL
    SELECT 'debts',          COUNT(*)::int, COUNT(document_id)::int             FROM debts    WHERE user_id = ${USER_ID} AND environment = 'live'
    UNION ALL
    SELECT 'incomes',        COUNT(*)::int, COUNT(document_id)::int             FROM incomes  WHERE user_id = ${USER_ID} AND environment = 'live'
    UNION ALL
    SELECT 'expenses',       COUNT(*)::int, COUNT(document_id)::int             FROM expenses WHERE user_id = ${USER_ID} AND environment = 'live'
  `);
  console.log('\n=== Financial Records (live) ===');
  (r as any).rows.forEach((row: any) =>
    console.log(`  ${row.tbl.padEnd(10)}: total=${row.total}  doc_linked=${row.doc_linked}  seeded_orphans=${Number(row.total) - Number(row.doc_linked)}`)
  );
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
