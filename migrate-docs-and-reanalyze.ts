/**
 * migrate-docs-and-reanalyze.ts
 * 
 * 1. Moves all Entergy/utility bill documents from 'demo' to 'live' environment
 * 2. Runs analyzeAndPersist on each to create expense records
 */
import { db } from './server/db';
import { sql } from 'drizzle-orm';
import { analyzeAndPersist } from './server/services/analyzeAndPersist';

const USER_ID = 'd21c3b35-2a34-49cd-9016-8b7d9f1a331f';

(async () => {
  console.log('\n=== Step 1: Move utility docs from demo → live ===\n');

  // Move all utility bill docs for this user from demo to live
  const moved = await db.execute(sql.raw(`
    UPDATE documents
    SET environment = 'live'
    WHERE user_id = '${USER_ID}'
      AND environment = 'demo'
      AND (ai_category = 'utility_bill' OR file_name ILIKE '%entergy%' OR file_name ILIKE '%utility%')
    RETURNING id, file_name, ai_category
  `));

  const movedRows = (moved as any).rows;
  console.log(`Moved ${movedRows.length} documents to live:`);
  movedRows.forEach((r: any) => console.log(`  ✅ ${r.file_name} (${r.ai_category})`));

  if (movedRows.length === 0) {
    console.log('No documents moved. Checking what docs exist in demo...');
    const check = await db.execute(sql.raw(`
      SELECT id, file_name, ai_category, environment FROM documents 
      WHERE user_id = '${USER_ID}' 
      ORDER BY created_at DESC LIMIT 20
    `));
    (check as any).rows.forEach((r: any) => console.log(`  ${r.file_name} | env=${r.environment} | cat=${r.ai_category}`));
    process.exit(0);
  }

  console.log('\n=== Step 2: Run analyzeAndPersist on each moved document ===\n');

  let created = 0;
  for (const row of movedRows) {
    process.stdout.write(`  ▶  ${row.file_name.padEnd(40)} `);
    try {
      const result = await analyzeAndPersist(row.id, { createRecords: true, forceReparse: true });
      if (result.financialRecordsCreated.length > 0) {
        const s = result.financialRecordsCreated.map((r: any) => `${r.type}:$${(r.record.amount/100).toFixed(2)}`).join(', ');
        console.log(`✅ ${s}`);
        created += result.financialRecordsCreated.length;
      } else {
        console.log(`⚠  parseStatus=${result.parseStatus} err=${result.error || 'none'}`);
      }
    } catch (e: any) {
      console.log(`❌ ${e.message?.slice(0, 60)}`);
    }
  }

  console.log(`\n✅ Done — created ${created} financial records`);
  console.log('👉 Refresh the dashboard to see the expenses!\n');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
