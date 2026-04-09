import { db } from './server/db';
import { documents, expenses, incomes, assets, debts } from './shared/schema';
import { eq, desc } from 'drizzle-orm';
async function run() {
  const docs = await db.select().from(documents).where(eq(documents.userId, 'd21c3b35-2a34-49cd-9016-8b7d9f1a331f')).orderBy(desc(documents.createdAt)).limit(10);
  console.log('Recent 10 Docs:');
  docs.forEach(d => console.log(d.id, '|', d.fileName, '| status:', d.status, '| aiStatus:', d.aiAnalysisStatus, '| Extracted:', !!d.extractedData));
  
  if (docs.length > 0) {
     const latestId = docs[0].id;
     console.log('\nExpenses for latest doc:');
     const e = await db.select().from(expenses).where(eq(expenses.documentId, latestId));
     console.log(e);
  }
}
run();
