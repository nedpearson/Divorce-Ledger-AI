/**
 * force-reanalyze.ts
 *
 * Clears old parse results and placeholder expenses, then runs analyzeAndPersist
 * with the real OpenAI key to extract actual dollar amounts from the documents.
 */
import { db } from './server/db';
import { sql } from 'drizzle-orm';
import { analyzeAndPersist } from './server/services/analyzeAndPersist';

const USER_ID = 'd21c3b35-2a34-49cd-9016-8b7d9f1a331f';

(async () => {
  console.log('\n=== Step 1: Clear placeholder expenses and old parse results ===\n');

  // Delete placeholder expenses (amount = 0, document-linked)
  const delExp = await db.execute(sql.raw(`
    DELETE FROM expenses
    WHERE user_id = '${USER_ID}' AND environment = 'live' AND document_id IS NOT NULL AND amount = 0
    RETURNING id, vendor
  `));
  console.log(`  Cleared ${(delExp as any).rowCount} placeholder expenses`);

  // Get all live doc IDs
  const docs = await db.execute(sql.raw(`
    SELECT id, file_name, ai_category, file_url FROM documents
    WHERE user_id = '${USER_ID}' AND environment = 'live'
    ORDER BY created_at DESC
  `));
  const rows = (delExp as any).rows;
  const allDocs = (docs as any).rows;
  console.log(`  Found ${allDocs.length} live documents\n`);

  // Clear existing parse results so forceReparse actually re-runs
  for (const doc of allDocs) {
    await db.execute(sql.raw(`DELETE FROM document_parse_results WHERE document_id = '${doc.id}'`));
    await db.execute(sql.raw(`DELETE FROM document_line_items WHERE document_id = '${doc.id}'`));
  }
  console.log(`  Cleared parse results for ${allDocs.length} documents\n`);

  console.log('=== Step 2: Analyze each document with OpenAI ===\n');

  let created = 0;
  const SKIP = new Set(['legal_document', 'custody_document', 'evidence']);

  for (const doc of allDocs) {
    const cat = doc.ai_category || 'other';
    if (SKIP.has(cat)) {
      console.log(`  ⏭  ${doc.file_name} (${cat}) — skipping`);
      continue;
    }

    process.stdout.write(`  ▶  ${(doc.file_name||'?').padEnd(40)} `);
    try {
      const result = await analyzeAndPersist(doc.id, { createRecords: true, forceReparse: true });
      if (result.financialRecordsCreated.length > 0) {
        const s = result.financialRecordsCreated
          .map((r: any) => `${r.type}:$${(r.record.amount / 100).toFixed(2)}`)
          .join(', ');
        console.log(`✅ ${s}`);
        created += result.financialRecordsCreated.length;
      } else {
        console.log(`⚠  parseStatus=${result.parseStatus} err=${(result.error||'').slice(0,60)}`);
      }
    } catch (e: any) {
      console.log(`❌ ${e.message?.slice(0, 60)}`);
    }
  }

  console.log(`\n✅ Done — created ${created} financial records from ${allDocs.length} documents`);
  console.log('👉 Refresh the dashboard!\n');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
