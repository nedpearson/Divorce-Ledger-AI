import 'dotenv/config';
import { db } from './server/db';
import * as schema from '@shared/schema';

async function checkDocs() {
  const users = await db.select().from(schema.users);
  const liveUser = users.find(u => u.email === 'nedpearson@gmail.com');
  
  if (!liveUser) {
    console.log("No live user found.");
    process.exit(1);
  }

  const docs = await db.query.documents.findMany({
    where: (d, { eq, and }) => and(eq(d.userId, liveUser.id), eq(d.environment, 'live')),
    limit: 5,
  });

  for (const doc of docs) {
    console.log(`Document: ${doc.title} | Status: ${doc.processingStatus}`);
  }

  process.exit(0);
}

checkDocs().catch(console.error);
