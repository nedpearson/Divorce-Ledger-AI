/**
 * cleanup-ghosts.ts
 * 
 * Run manually to purge test/ghost documents left over from debugging.
 * Usage: npx tsx --import dotenv/config cleanup-ghosts.ts
 */
import { db } from './server/db';
import { documents } from './shared/schema';
import { eq, like, or } from 'drizzle-orm';

async function cleanup() {
  const result = await db.delete(documents).where(
    or(
      like(documents.title, 'Test%'),
      like(documents.title, 'Consent Judgment%'),
      eq(documents.fileName as any, 'package.json'),
      like(documents.title, 'Debug%'),
      like(documents.fileName, 'test%')
    )
  ).returning({ id: documents.id, title: documents.title, fileName: documents.fileName });

  if (result.length === 0) {
    console.log('No ghost documents found. Database is clean.');
  } else {
    console.log(`Deleted ${result.length} ghost document(s):`);
    result.forEach(r => console.log(`  - ${r.id}: ${r.title || r.fileName}`));
  }
  process.exit(0);
}

cleanup().catch(e => {
  console.error(e);
  process.exit(1);
});
