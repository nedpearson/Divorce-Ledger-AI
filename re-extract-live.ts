import 'dotenv/config';
import { db } from './server/db';
import * as schema from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { analysisOrchestrator } from './server/services/ai/AnalysisOrchestrator';
import { documentRepository } from './server/services/storage/documentRepository';

async function run() {
  const users = await db.select().from(schema.users);
  const liveUser = users.find(u => u.email === 'nedpearson@gmail.com');
  if (!liveUser) return console.log('No user');

  const docs = await db.query.documents.findMany({
    where: (d, { eq, and }) => and(eq(d.userId, liveUser.id), eq(d.environment, 'live'))
  });
  
  if (!docs.length) {
    console.log('No documents found for user');
    return;
  }
  
  console.log(`Re-extracting ${docs.length} documents for nedpearson@gmail.com in live...`);

  // First we need to delete existing expenses for these documents to avoid duplicates 
  // (actually there are none right now, but just in case)
  for (const doc of docs) {
    await db.delete(schema.expenses).where(eq(schema.expenses.documentId, doc.id));
  }

  for (const doc of docs) {
    console.log(`Processing: ${doc.title}`);
    try {
      await documentRepository.updateDocument(doc.id, { processingStatus: 'processing' });
      await analysisOrchestrator.processDocument(doc.id);
      await documentRepository.updateDocument(doc.id, { processingStatus: 'completed' });
    } catch (err) {
      console.error(`Error on doc ${doc.id}:`, err);
    }
  }

  console.log('Re-extraction complete!');
  process.exit(0);
}

run().catch(console.error);
