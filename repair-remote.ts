import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { db } from './server/db';
import * as schema from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { azureDocumentIntelligenceProvider } from './server/services/ai/providers/AzureDocumentIntelligenceProvider';
import { parseFinancialDocument } from './server/services/parseDocument';

async function repairAllPlaceholders() {
  const users = await db.select().from(schema.users);
  const liveUser = users.find(u => u.email === 'nedpearson@gmail.com');
  const userId = liveUser!.id;

  // Clean the zombie batch
  console.log("Cleaning up zombie batch...");
  await db.update(schema.uploadBatches)
    .set({ status: 'completed' })
    .where(and(eq(schema.uploadBatches.status, 'created'), eq(schema.uploadBatches.totalFiles, 0)));
  
  // Find all $0 expenses
  const placeholders = await db.query.expenses.findMany({
    where: and(eq(schema.expenses.userId, userId), eq(schema.expenses.amount, 0), eq(schema.expenses.environment, 'live'))
  });
  
  console.log(`Found ${placeholders.length} placeholder $0 expenses. Fetching corresponding documents from Railway...`);

  let count = 0;
  for (const exp of placeholders) {
    count++;
    if (!exp.documentId) {
      console.log(`[${count}/${placeholders.length}] Expense has no documentId, skipping.`);
      continue;
    }
    
    // Find the associated document
    const doc = await db.query.documents.findFirst({
      where: eq(schema.documents.id, exp.documentId)
    });
    
    if (!doc || !doc.fileUrl) {
      console.log(`[${count}/${placeholders.length}] Document not found or has no fileUrl.`);
      continue;
    }

    const url = `https://divorce-ledger-ai-production-6b2e.up.railway.app/${doc.fileUrl}`;
    console.log(`[${count}/${placeholders.length}] Downloading: ${doc.title}...`);

    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`Failed to download from ${url}: ${resp.status}`);
      }
      const arrayBuffer = await resp.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      console.log(`  -> Analyzing locally with Azure AI...`);
      const { text } = await azureDocumentIntelligenceProvider.analyzeDocumentBuffer(buffer, 'application/pdf');
      
      console.log(`  -> Classifying with OpenAI...`);
      const aiResult = await parseFinancialDocument(text, doc.title);
      const val = aiResult.document.total_amount_due;
      const statementDate = aiResult.document.statement_date || aiResult.document.billing_period_end;
      const vendorSafe = aiResult.document.vendor_name || 'Generic Vendor';
      
      if (val !== null) {
        const cents = Math.round(val * 100);
        await db.update(schema.expenses)
          .set({ 
            amount: cents, 
            vendor: vendorSafe,
            description: doc.title,
            startDate: statementDate
          })
          .where(eq(schema.expenses.id, exp.id));
        
        await db.update(schema.documents)
          .set({ status: 'completed' })
          .where(eq(schema.documents.id, doc.id));

        console.log(`  -> SUCCESS: Recovered $${val} and updated!`);
      } else {
        console.log(`  -> NOTE: OpenAI extraction failed to find total_amount_due for ${doc.title}`);
      }
    } catch(err: any) {
      console.log(`  -> ERROR: ${err.message}`);
    }
  }

  console.log(`All operations completed.`);
  process.exit(0);
}

repairAllPlaceholders().catch(console.error);
