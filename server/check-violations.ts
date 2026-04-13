import { db } from './db.js';
import { violations, transactions } from '../shared/schema.js';

async function main() {
  const v = await db.select().from(violations);
  const badV = v.filter(val => isNaN(new Date(val.timestamp).getTime()));
  console.log('INVALID VIOLATION DATES:', badV.length);

  const t = await db.select().from(transactions);
  const badT = t.filter(val => isNaN(new Date(val.date).getTime()));
  console.log('INVALID TRANSACTION DATES:', badT);

  process.exit(0);
}

main().catch(console.error);
