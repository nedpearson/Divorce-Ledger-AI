import { db } from './server/db';
import { sql } from 'drizzle-orm';

const USER_ID = 'd21c3b35-2a34-49cd-9016-8b7d9f1a331f';

(async () => {
  // Get all live doc columns — find where the file is stored
  const r = await db.execute(sql.raw(`
    SELECT id, file_name, file_url, storage_path, file_hash, ai_analysis_status, ai_category, description
    FROM documents
    WHERE user_id = '${USER_ID}' AND environment = 'live'
    ORDER BY created_at DESC LIMIT 5
  `));
  console.log('\nDoc storage details:');
  (r as any).rows.forEach((row: any) => {
    console.log(`\n  ${row.file_name}`);
    console.log(`    file_url:     ${row.file_url || 'NULL'}`);
    console.log(`    storage_path: ${row.storage_path || 'NULL'}`);
    console.log(`    file_hash:    ${row.file_hash || 'NULL'}`);
    console.log(`    ai_status:    ${row.ai_analysis_status}`);
    console.log(`    ai_category:  ${row.ai_category}`);
    console.log(`    description:  ${(row.description || '').substring(0, 80)}`);
  });
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
