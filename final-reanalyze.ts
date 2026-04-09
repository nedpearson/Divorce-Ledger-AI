import { db } from './server/db';
import { sql } from 'drizzle-orm';
import { analyzeAndPersist } from './server/services/analyzeAndPersist';

const USER_ID = 'd21c3b35-2a34-49cd-9016-8b7d9f1a331f';

(async () => {
  // Show all docs
  const all = await db.execute(sql.raw(`
    SELECT id, file_name, ai_category, environment, file_url, file_size 
    FROM documents 
    WHERE user_id = '${USER_ID}'
    ORDER BY created_at DESC
  `));
  const rows = (all as any).rows;
  console.log(`\nAll documents (${rows.length} total):`);
  rows.forEach((r: any) => console.log(`  env=${r.environment} | cat=${r.ai_category || '?'} | file=${r.file_name} | url=${r.file_url ? r.file_url.substring(0,50) : 'NULL'}`));

  // Now run analyzeAndPersist on all live docs
  const liveDocs = rows.filter((r: any) => r.environment === 'live');
  console.log(`\nRunning analyzeAndPersist on ${liveDocs.length} live documents:\n`);
  let created = 0;
  for (const doc of liveDocs) {
    process.stdout.write(`  ▶  ${(doc.file_name||'?').padEnd(40)} `);
    try {
      const result = await analyzeAndPersist(doc.id, { createRecords: true, forceReparse: true });
      if (result.financialRecordsCreated.length > 0) {
        console.log(`✅ ${result.financialRecordsCreated.map((r:any) => `${r.type}:$${(r.record.amount/100).toFixed(2)}`).join(', ')}`);
        created += result.financialRecordsCreated.length;
      } else {
        console.log(`⚠  parseStatus=${result.parseStatus}`);
      }
    } catch(e:any) {
      console.log(`❌ ${e.message?.slice(0,60)}`);
    }
  }
  console.log(`\nDone. Created ${created} records.`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
