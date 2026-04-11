import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { db } from './server/db';
import * as schema from '@shared/schema';
import { eq, and, ilike } from 'drizzle-orm';
import { azureDocumentIntelligenceProvider } from './server/services/ai/providers/AzureDocumentIntelligenceProvider';
import { parseFinancialDocument } from './server/services/parseDocument';

async function repairAtmosAi() {
  const users = await db.select().from(schema.users);
  const liveUser = users.find(u => u.email === 'nedpearson@gmail.com');
  const userId = liveUser!.id;

  const docs = await db.query.documents.findMany({
    where: (d, { ilike, and, eq }) => and(
        ilike(d.title, '%Atmos%'), 
        eq(d.userId, userId),
        eq(d.environment, 'live')
    )
  });

  const documentsDir = 'C:\\Users\\nedpe\\Desktop\\House Bills\\Atmos';
  
  console.log(`Starting deep AI analysis on ${docs.length} Atmos documents...`);

  let count = 0;
  for (const doc of docs) {
    // Find the matching expense for this document
    const [expense] = await db.select().from(schema.expenses).where(eq(schema.expenses.documentId, doc.id));
    if (!expense) {
        console.log(`ERROR: Document ${doc.title} has no linked expense! Run fallback repair script first.`);
        continue;
    }

    const filePath = path.join(documentsDir, doc.title);
    if (!fs.existsSync(filePath)) {
        console.log(`ERROR: Local file missing for ${doc.title} at ${filePath}`);
        continue;
    }
    
    const buffer = fs.readFileSync(filePath);
    console.log(`[${count+1}/${docs.length}] Running deep AI scan on: ${doc.title}`);

    try {
      // 1. Analyze with Azure
      const { text } = await azureDocumentIntelligenceProvider.analyzeDocumentBuffer(buffer, 'application/pdf');
      
      // 2. Extract structured financial data with OpenAI
      const aiResult = await parseFinancialDocument(text, doc.title);
      const val = aiResult.document.total_amount_due;
      const statementDate = aiResult.document.statement_date || aiResult.document.billing_period_end;

      if (val !== null && val !== undefined) {
        const cents = Math.round(val * 100);
        await db.update(schema.expenses)
          .set({ 
            amount: cents, 
            vendor: 'Atmos Energy',
            description: 'Atmos Energy Gas Bill',
            startDate: statementDate || expense.startDate,
            notes: 'AI extracted explicitly'
          })
          .where(eq(schema.expenses.id, expense.id));
        console.log(`  -> SUCCESS: Applied structural patch! Set amount to $${val} and date to ${statementDate || expense.startDate}`);
      } else {
          console.log(`  -> FAILED: AI did not find a total_amount_due in ${doc.title}.`);
      }
    } catch(err: any) {
      console.log(`  -> ERR querying Azure/OpenAI: ${err.message}`);
    }
    count++;
  }

  console.log(`\nFinished complete Atmos synchronization!`);
  process.exit(0);
}

repairAtmosAi().catch(console.error);
