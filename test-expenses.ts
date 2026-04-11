import 'dotenv/config';
import { db } from './server/db';
import * as schema from '@shared/schema';
import { storage } from './server/storage';

async function testApi() {
  const users = await db.select().from(schema.users);
  const liveUser = users.find(u => u.email === 'nedpearson@gmail.com');
  
  try {
    const expenses = await storage.getExpenses(liveUser!.id, 'live');
    console.log(`Successfully fetched ${expenses.length} expenses.`);
  } catch (err: any) {
    console.error(`CRASH in getExpenses: ${err.message}`);
  }

  process.exit(0);
}

testApi().catch(console.error);
