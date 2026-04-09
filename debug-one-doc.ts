/**
 * debug-one-doc.ts — analyze a single doc and see the full GPT response
 */
import { db } from './server/db';
import { sql } from 'drizzle-orm';
import { parseFinancialDocument } from './server/services/parseDocument';

const USER_ID = 'd21c3b35-2a34-49cd-9016-8b7d9f1a331f';

(async () => {
  // Get first live doc
  const docs = await db.execute(sql.raw(`
    SELECT id, file_name, file_url, file_type, file_size, description
    FROM documents
    WHERE user_id = '${USER_ID}' AND environment = 'live'
    ORDER BY created_at DESC LIMIT 1
  `));
  const doc = (docs as any).rows[0];
  console.log('\nDocument:', doc);

  // Try parsing with just filename as text
  const text = `Title: ${doc.file_name}\n\n${doc.description || ''}`;
  console.log('\nText being sent to GPT:\n', text);

  const result = await parseFinancialDocument(text, doc.file_name, { provider: 'openai' });
  console.log('\nGPT parse result:');
  console.log('  parse_status:', result.document.parse_status);
  console.log('  doc_type:', result.document.doc_type);
  console.log('  vendor_name:', result.document.vendor_name);
  console.log('  total_amount_due:', result.document.total_amount_due);
  console.log('  line_items:', result.document.line_items?.length);
  console.log('  notes:', result.document.notes);

  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
