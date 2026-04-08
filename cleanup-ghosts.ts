import { db } from './server/db';
import { documents } from './shared/schema';
import { eq, like, or } from 'drizzle-orm';

// Delete all test/ghost documents
async function cleanup() {
  const result = await db.delete(documents).where(
    or(
      like(documents.title, 'Test%'),
      like(documents.title, 'Consent Judgment%'),
      eq(documents.fileName as any, 'package.json')
    )
  ).returning({ id: documents.id, title: documents.title });

  console.log(`Deleted ${result.length} ghost document(s):`);
  result.forEach(r => console.log(`  - ${r.id}: ${r.title}`));
  process.exit(0);
}

cleanup().catch(e => {
  console.error(e);
  process.exit(1);
});
