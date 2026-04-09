/**
 * bulk-reanalyze.ts
 * Re-runs analyzeAndPersist on all existing financial documents for the live user.
 * This backfills expense records that were never created due to the orchestrator bug.
 */
import { db } from './server/db';
import { documents } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { analyzeAndPersist } from './server/services/analyzeAndPersist';

const USER_ID = 'd21c3b35-2a34-49cd-9016-8b7d9f1a331f';
const FINANCIAL_CATEGORIES = new Set([
  'utility_bill', 'bank_statement', 'financial_statement', 'debt_statement',
  'financial_document', 'paystub', 'receipt', 'insurance', 'tax_return',
  'mortgage', 'loan', 'other', // include 'other' since some Entergy bills may be categorized that way
]);

(async () => {
  // Fetch all the user's live documents
  const allDocs = await db
    .select()
    .from(documents)
    .where(and(eq(documents.userId, USER_ID), eq(documents.environment, 'live')));

  console.log(`\nFound ${allDocs.length} documents for user in live environment`);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of allDocs) {
    // Skip legal/evidence/custody documents — they don't generate financial records
    if (['legal_document', 'custody_document', 'property_document', 'evidence'].includes(doc.aiCategory || doc.category || '')) {
      console.log(`  ⏭  ${doc.title} (${doc.aiCategory || doc.category}) — skipping non-financial`);
      skipped++;
      continue;
    }

    // Skip if no file (text-only captures)
    if (!doc.fileUrl || !doc.fileSize) {
      console.log(`  ⏭  ${doc.title} — no file, skipping`);
      skipped++;
      continue;
    }

    console.log(`  ▶  ${doc.title} (category=${doc.aiCategory || doc.category || 'unknown'}) ...`);
    try {
      const result = await analyzeAndPersist(doc.id, { createRecords: true, forceReparse: true });
      if (result.financialRecordsCreated.length > 0) {
        console.log(`     ✅ Created ${result.financialRecordsCreated.length} record(s) — ${result.financialRecordsCreated.map(r => r.type + ':$' + (r.record.amount/100).toFixed(2)).join(', ')}`);
        created += result.financialRecordsCreated.length;
      } else {
        console.log(`     ⚠  No records created — parseStatus=${result.parseStatus} error=${result.error || 'none'}`);
      }
    } catch (e: any) {
      console.error(`     ❌ Failed: ${e.message}`);
      failed++;
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`  Financial records created: ${created}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${failed}`);

  // Final DB check
  const expCount = await db.execute({ sql: `SELECT COUNT(*) FROM expenses WHERE user_id='${USER_ID}' AND environment='live'`, params:[] } as any);
  console.log(`\n  Expenses in DB now: ${(expCount as any).rows[0].count}`);

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
