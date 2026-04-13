import { db } from './server/db';
import { documents, obligationInstances, uploadBatches } from './shared/schema';

async function purgeStuckDocs() {
  console.log("Purging stuck documents...");
  await db.delete(obligationInstances);
  await db.delete(documents);
  await db.delete(uploadBatches);
  console.log("Done.");
  process.exit(0);
}
purgeStuckDocs();
