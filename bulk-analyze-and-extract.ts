/**
 * bulk-analyze-and-extract.ts
 *
 * Backfill: runs analyzeAndPersist on ALL documents for the live user.
 * Use this to fix documents that were classified but never had financial records created.
 *
 * Usage: npx tsx --import dotenv/config bulk-analyze-and-extract.ts
 */
import { db } from './server/db';
import { documents } from './shared/schema';
import { eq, and, or } from 'drizzle-orm';
import { analyzeAndPersist } from './server/services/analyzeAndPersist';

const USER_ID = 'd21c3b35-2a34-49cd-9016-8b7d9f1a331f';

// Non-financial categories — skip these (no dollar amounts expected)
const SKIP_CATEGORIES = new Set([
  'legal_document', 'custody_document', 'property_document', 'evidence', 'custody',
]);

async function main() {
  console.log('\n══════════════════════════════════════════');
  console.log('   BULK ANALYZE + EXPENSE EXTRACTION (BACKFILL)');
  console.log('══════════════════════════════════════════\n');

  // Fetch ALL documents for the live user (both legacy and canonical env values)
  const allDocs = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.userId, USER_ID),
        or(
          eq(documents.environment, 'live'),
          eq(documents.environment, 'live-prod')
        )
      )
    );

  console.log(`Found ${allDocs.length} documents\n`);

  let processed = 0;
  let skipped = 0;
  let recordsCreated = 0;
  let errors = 0;

  for (const doc of allDocs) {
    const label = (doc as any).fileName || doc.title || doc.id;
    const category = (doc as any).aiCategory || doc.category || 'other';

    // Skip non-financial documents
    if (SKIP_CATEGORIES.has(category)) {
      console.log(`  ⏭  ${label} (${category}) — non-financial, skipping`);
      skipped++;
      continue;
    }

    // Skip text-only captures (no real file attached)
    if (!(doc as any).fileUrl || !(doc as any).fileSize) {
      console.log(`  ⏭  ${label} — no file attached, skipping`);
      skipped++;
      continue;
    }

    process.stdout.write(`  ▶  ${label.slice(0, 45).padEnd(47)} `);

    try {
      const result = await analyzeAndPersist(doc.id, { createRecords: true, forceReparse: true });

      if (result.financialRecordsCreated.length > 0) {
        const summary = result.financialRecordsCreated
          .map(r => `${r.type}:$${(r.record.amount / 100).toFixed(2)}`)
          .join(', ');
        console.log(`✅  ${summary}`);
        recordsCreated += result.financialRecordsCreated.length;
      } else {
        console.log(`⚠   No records — parseStatus=${result.parseStatus} err=${result.error || 'none'}`);
      }
      processed++;
    } catch (err: any) {
      console.log(`❌  ${err.message?.slice(0, 70)}`);
      errors++;
    }
  }

  console.log('\n══════════════════════════════════════════');
  console.log(`✅ Processed:         ${processed}/${allDocs.length} documents`);
  console.log(`💰 Financial records: ${recordsCreated}`);
  console.log(`⏭  Skipped:          ${skipped}`);
  console.log(`❌ Errors:           ${errors}`);
  console.log('══════════════════════════════════════════\n');
  console.log('👉 Refresh your dashboard to see updated financials!\n');
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
