import 'dotenv/config';
import { db } from './server/db';
import * as schema from '@shared/schema';
import { eq, and } from 'drizzle-orm';

async function investigate() {
  const users = await db.select().from(schema.users);
  const liveUser = users.find(u => u.email === 'nedpearson@gmail.com');
  const userId = liveUser!.id;

  console.log("--- BATCHES ---");
  const batches = await db.query.uploadBatches.findMany({
    where: and(eq(schema.uploadBatches.userId, userId), eq(schema.uploadBatches.environment, 'live')),
    orderBy: (b, { desc }) => [desc(b.createdAt)]
  });

  for (const b of batches) {
    console.log(`Batch ${b.id}: status=${b.status}, totalFiles=${b.totalFiles}`);
    if(b.status === 'processing' && b.totalFiles === 0) {
       console.log(` -> Found zombie batch! Fixing...`);
       await db.update(schema.uploadBatches)
         .set({ status: 'completed' })
         .where(eq(schema.uploadBatches.id, b.id));
    }
  }

  console.log("--- DOCUMENTS ---");
  const docs = await db.query.documents.findMany({
    where: and(eq(schema.documents.userId, userId), eq(schema.documents.environment, 'live')),
    orderBy: (d, { desc }) => [desc(d.createdAt)],
    limit: 30
  });

  let studyvilleDocs = [];
  for (const d of docs) {
    if(d.title.toLowerCase().includes('studyville')) {
      studyvilleDocs.push(d);
      console.log(`Doc: ${d.title} | Status=${d.status} | Cat=${d.category}`);
    }
  }

  console.log(`Found ${studyvilleDocs.length} Studyville documents.`);

  console.log("--- EXPENSES ---");
  const exps = await db.query.expenses.findMany({
    where: and(eq(schema.expenses.userId, userId), eq(schema.expenses.environment, 'live')),
    orderBy: (e, { desc }) => [desc(e.amount)]
  });

  let foundExp = 0;
  for (const e of exps) {
    if(e.vendor?.toLowerCase().includes('study') || e.description.toLowerCase().includes('studyville')) {
      console.log(`Expense: ${e.description} | Vendor=${e.vendor} | Amount=${e.amount}`);
      foundExp++;
    }
  }
  
  if (foundExp === 0 && studyvilleDocs.length > 0) {
      console.log("No expenses found for Studyville, but documents exist! Looking for document IDs in expenses...");
      for(const e of exps) {
         if (studyvilleDocs.some(d => d.id === e.documentId)) {
             console.log(`Found an expense linked to a Studyville document ID! Dest: ${e.description} | ${e.amount}`);
         }
      }
  }

  process.exit(0);
}

investigate().catch(console.error);
