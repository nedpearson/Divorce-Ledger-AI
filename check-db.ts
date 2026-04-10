import 'dotenv/config';
import { db } from './server/db';
import * as schema from '@shared/schema';
import { eq, and } from 'drizzle-orm';

async function checkStatus() {
  const users = await db.select().from(schema.users);
  const liveUser = users.find(u => u.email === 'nedpearson@gmail.com');
  const userId = liveUser!.id;

  const exps = await db.query.expenses.findMany({
    where: (e, { eq, and }) => and(eq(e.userId, userId), eq(e.environment, 'live'))
  });
  
  console.log('--- EXPENSES ---');
  exps.forEach(e => {
    console.log(`Expense: ${e.description} | ${e.vendor} | $${e.amount/100} | ${e.startDate}`);
  });

  const docs = await db.query.documents.findMany({
    where: (d, { eq, and }) => and(eq(d.userId, userId), eq(d.environment, 'live'))
  });

  console.log('--- DOCUMENTS ---');
  docs.forEach(d => {
    if(d.status === 'error' || d.processingStatus === 'error') {
       console.log(`ERROR DOC: ${d.title} | ${d.processingStatus} | ${d.status}`);
    }
  });

  process.exit(0);
}

checkStatus().catch(console.error);
