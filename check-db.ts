import { db } from './server/db';
import { sql } from 'drizzle-orm';

(async () => {
  const r = await db.execute(sql.raw(`SELECT COUNT(*) as cnt FROM documents`));
  console.log('Total docs in DB:', (r as any).rows[0].cnt);

  const r2 = await db.execute(sql.raw(`SELECT id, user_id, environment, file_name, ai_category FROM documents ORDER BY created_at DESC LIMIT 5`));
  console.log('Last 5 docs:');
  (r2 as any).rows.forEach((row: any) => {
    console.log(`  ${row.id} | user=${row.user_id} | env=${row.environment} | file=${row.file_name} | cat=${row.ai_category}`);
  });
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
