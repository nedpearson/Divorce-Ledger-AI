import 'dotenv/config';
import { db } from './server/db';
import * as schema from '@shared/schema';
import { storage } from './server/storage';

async function checkTxs() {
  const users = await db.select().from(schema.users);
  const liveUser = users.find(u => u.email === 'nedpearson@gmail.com');
  
  if (!liveUser) {
    console.log("No live user found.");
    process.exit(1);
  }

  console.log('--- USER nedpearson@gmail.com RECENTS IN LIVE ---');
  const recentTxs = await storage.getRecentTransactions(liveUser.id, 'live', 10);
  console.log(recentTxs.map(t => ({ id: t.id, desc: t.description, amount: t.amount, type: t.type })));

  process.exit(0);
}

checkTxs().catch(console.error);
