import 'dotenv/config';
import { db } from './server/db';
import * as schema from '@shared/schema';
import { eq } from 'drizzle-orm';

async function rm() {
  await db.delete(schema.uploadBatches).where(eq(schema.uploadBatches.totalFiles, 0));
  console.log('Orphan batch deleted');
  process.exit(0);
}

rm().catch(console.error);
