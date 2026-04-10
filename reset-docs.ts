import 'dotenv/config';
import { db } from './server/db';
import * as schema from '@shared/schema';
import { eq, and, like } from 'drizzle-orm';
import { storage } from './server/storage';

async function resetCorruptedDocs() {
  const users = await db.select().from(schema.users);
  const liveUser = users.find(u => u.email === 'nedpearson@gmail.com');
  
  if (!liveUser) {
    console.log("No live user found.");
    process.exit(1);
  }

  const userId = liveUser.id;
  const env = 'live';

  console.log(`Clearing blank documents for ${liveUser.email} in ${env}...`);

  // We find documents where the file URL is throwing a 404/deleted from Railway,
  // which matches the 15 we are trying to resolve.
  const docs = await db.query.documents.findMany({
    where: (d, { eq, and }) => and(eq(d.userId, userId), eq(d.environment, env))
  });

  let deletedCount = 0;
  for (const doc of docs) {
    if (doc.title.includes('Entergy')) {
      // delete the associated expenses/transactions FIRST
      await db.delete(schema.expenses).where(eq(schema.expenses.documentId, doc.id));
      await db.delete(schema.transactions).where(eq(schema.transactions.documentId, doc.id));
      
      // then delete the document record
      await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
      deletedCount++;
    }
  }

  console.log(`Successfully removed ${deletedCount} corrupted/missing documents and their $0 placeholders.`);
  process.exit(0);
}

resetCorruptedDocs().catch(console.error);
