/**
 * cleanup-duplicates.ts
 * One-time script: removes the duplicate Entergy_June_2025 document and its linked expense.
 * Usage: npx tsx --import dotenv/config scripts/cleanup-duplicates.ts
 */
import { db } from '../server/db';
import { documents, expenses } from '../shared/schema';
import { eq, and } from 'drizzle-orm';

const USER_ID = 'd21c3b35-2a34-49cd-9016-8b7d9f1a331f';

async function run() {
  // Find duplicate Entergy_June_2025 docs
  const juneDocs = await db
    .select()
    .from(documents)
    .where(and(eq(documents.userId, USER_ID), eq(documents.title, 'Entergy_June_2025')));

  console.log(`Found ${juneDocs.length} Entergy_June_2025 documents`);

  if (juneDocs.length <= 1) {
    console.log('No duplicates to remove.');
    process.exit(0);
  }

  // Keep the first, delete the rest
  const [keep, ...dupes] = juneDocs;
  console.log(`Keeping doc ${keep.id}, removing ${dupes.length} duplicate(s)`);

  for (const dupe of dupes) {
    // Delete linked expense
    const deletedExpenses = await db
      .delete(expenses)
      .where(eq(expenses.documentId, dupe.id))
      .returning();
    console.log(`  Deleted ${deletedExpenses.length} expense(s) linked to doc ${dupe.id}`);

    // Delete the document
    await db.delete(documents).where(eq(documents.id, dupe.id));
    console.log(`  Deleted duplicate document ${dupe.id} (${dupe.title})`);
  }

  // Verify
  const remaining = await db.select().from(expenses).where(eq(expenses.userId, USER_ID));
  console.log(`\n✅ Done. ${remaining.length} expenses remain.`);
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
