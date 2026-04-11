import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { db } from './server/db';
import * as schema from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { azureDocumentIntelligenceProvider } from './server/services/ai/providers/AzureDocumentIntelligenceProvider';
import { parseFinancialDocument } from './server/services/parseDocument';

async function repairStudyville() {
  const users = await db.select().from(schema.users);
  const liveUser = users.find(u => u.email === 'nedpearson@gmail.com');
  const userId = liveUser!.id;

  console.log("Cleaning up zombie batch...");
  await db.update(schema.uploadBatches)
    .set({ status: 'completed' })
    .where(and(eq(schema.uploadBatches.status, 'created'), eq(schema.uploadBatches.totalFiles, 0)));

  // Identify all Studyville documents
  const docs = await db.query.documents.findMany({
    where: and(eq(schema.documents.userId, userId), eq(schema.documents.environment, 'live'))
  });
  const studyvilleDocs = docs.filter(d => d.title.toLowerCase().includes('studyville'));
  
  if (studyvilleDocs.length === 0) {
     console.log("No studyville documents found in DB.");
     process.exit(1);
  }

  // Find all $0 placeholder expenses
  const placeholders = await db.query.expenses.findMany({
    where: and(eq(schema.expenses.userId, userId), eq(schema.expenses.amount, 0), eq(schema.expenses.environment, 'live'))
  });

  const localDir = 'C:\\Users\\nedpe\\Desktop\\House Bills\\School (StudyVille)';
  const localFiles = fs.readdirSync(localDir).filter(f => f.toLowerCase().includes('.pdf'));

  console.log(`Found ${studyvilleDocs.length} Studyville documents in DB and ${localFiles.length} physical files.`);

  let count = 0;
  for (const doc of studyvilleDocs) {
    count++;
    
    // Find matching placeholder
    const exp = placeholders.find(e => e.documentId === doc.id);
    if (!exp) {
      console.log(`[${count}/${studyvilleDocs.length}] No $0 expense found for document ${doc.title}.`);
      continue;
    }

    // Try to find physical file that matches the Title exactly, or just fallback by index
    let localFile = localFiles.find(f => f === doc.title) || localFiles[count % localFiles.length];
    const physicalPath = path.join(localDir, localFile);

    console.log(`[${count}/${studyvilleDocs.length}] Processing ${doc.title} using local file ${localFile}...`);

    try {
      const buffer = fs.readFileSync(physicalPath);
      
      console.log(`  -> Analyzing locally with Azure AI...`);
      const { text } = await azureDocumentIntelligenceProvider.analyzeDocumentBuffer(buffer, 'application/pdf');
      
      console.log(`  -> Classifying with OpenAI...`);
      const aiResult = await parseFinancialDocument(text, doc.title);
      const val = aiResult.document.total_amount_due;
      const statementDate = aiResult.document.statement_date || aiResult.document.billing_period_end;
      const vendorSafe = aiResult.document.vendor_name || 'Studyville';
      
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
        console.log(`  -> NOTE: OpenAI failed to extract amount for ${doc.title}`);
      }
    } catch(err: any) {
      console.log(`  -> ERROR: ${err.message}`);
    }
  }

  process.exit(0);
}

repairStudyville().catch(console.error);
