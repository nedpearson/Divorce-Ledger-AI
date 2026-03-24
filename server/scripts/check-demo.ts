import 'dotenv/config';
import { db } from '../db';
import * as schema from '@shared/schema';
import { eq } from 'drizzle-orm';

async function check() {
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, 'alex.client@demo.com') });
  if (!user) {
    console.log("USER NOT FOUND");
    process.exit(1);
  }
  
  const docs = await db.query.documents.findMany({ where: eq(schema.documents.userId, user.id) });
  const trans = await db.query.transactions.findMany({ where: eq(schema.transactions.userId, user.id) });
  console.log(`Found ${docs.length} documents for ${user.email}`);
  console.log(`Found ${trans.length} transactions for ${user.email}`);
  
  process.exit(0);
}

check().catch(console.error);
