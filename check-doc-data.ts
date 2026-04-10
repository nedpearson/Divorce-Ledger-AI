import 'dotenv/config';
import { db } from './server/db';
import * as schema from '@shared/schema';

async function checkDocData() {
  const users = await db.select().from(schema.users);
  const liveUser = users.find(u => u.email === 'nedpearson@gmail.com');
  
  if (!liveUser) {
    console.log("No live user found.");
    process.exit(1);
  }

  const docs = await db.query.documents.findMany({
    where: (d, { eq, and }) => and(eq(d.userId, liveUser.id), eq(d.environment, 'live')),
    limit: 1,
  });

  const doc = docs[0];
  console.log("Title:", doc.title);
  console.log("Content extracted preview:", doc.content?.substring(0, 300));
  console.log("Metadata:", JSON.stringify(doc.metadata, null, 2));

  process.exit(0);
}

checkDocData().catch(console.error);
