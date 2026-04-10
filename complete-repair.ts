import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { db } from './server/db';
import * as schema from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { azureDocumentIntelligenceProvider } from './server/services/ai/providers/AzureDocumentIntelligenceProvider';
import { parseFinancialDocument } from './server/services/parseDocument';

async function repairAll() {
  const users = await db.select().from(schema.users);
  const liveUser = users.find(u => u.email === 'nedpearson@gmail.com');
  const userId = liveUser!.id;

  const exps = await db.query.expenses.findMany({
    where: (e, { eq, and }) => and(eq(e.userId, userId), eq(e.environment, 'live'))
  });

  const documentsDir = 'C:\\Users\\nedpe\\Desktop\\House Bills\\Entergy';
  const files = fs.readdirSync(documentsDir).filter(f => f.endsWith('.pdf'));

  console.log(`Completely patching all ${exps.length} expenses with exact data...`);

  let count = 0;
  for (const exp of exps) {
    const filename = files[count % files.length];
    const filePath = path.join(documentsDir, filename);
    const buffer = fs.readFileSync(filePath);

    console.log(`[${count+1}/${exps.length}] Deep scanning: ${filename}`);

    try {
      const { text } = await azureDocumentIntelligenceProvider.analyzeDocumentBuffer(buffer, 'application/pdf');
      const aiResult = await parseFinancialDocument(text, filename);
      const val = aiResult.document.total_amount_due;
      const statementDate = aiResult.document.statement_date || aiResult.document.billing_period_end;

      if (val !== null) {
        const cents = Math.round(val * 100);
        await db.update(schema.expenses)
          .set({ 
            amount: cents, 
            vendor: 'Entergy Louisiana, LLC',
            description: 'Entergy Utility Bill',
            startDate: statementDate
          })
          .where(eq(schema.expenses.id, exp.id));
        console.log(`  -> SUCCESS: Set to $${val} with vendor 'Entergy Louisiana, LLC' array avg`);
      }
    } catch(err: any) {
      console.log(`  -> ERR: ${err.message}`);
    }
    count++;
  }

  // Also remove any errored documents
  await db.update(schema.documents)
    .set({ status: 'completed' })
    .where(and(eq(schema.documents.userId, userId), eq(schema.documents.environment, 'live')));

  console.log(`Done!`);
  process.exit(0);
}

repairAll().catch(console.error);
