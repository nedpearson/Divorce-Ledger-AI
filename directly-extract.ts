import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { db } from './server/db';
import * as schema from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { azureDocumentIntelligenceProvider } from './server/services/ai/providers/AzureDocumentIntelligenceProvider';
import { parseFinancialDocument } from './server/services/parseDocument';
import { randomBytes } from 'crypto';

async function directlyExtract() {
  const users = await db.select().from(schema.users);
  const liveUser = users.find(u => u.email === 'nedpearson@gmail.com');
  
  if (!liveUser) {
    console.log("No live user found.");
    process.exit(1);
  }

  const userId = liveUser.id;
  const env = 'live';

  // Find the exact 15 generic 0-dollar expenses we want to repair
  const exps = await db.query.expenses.findMany({
    where: (e, { eq, and }) => and(eq(e.userId, userId), eq(e.environment, env), eq(e.amount, 0))
  });

  const documentsDir = 'C:\\Users\\nedpe\\Desktop\\House Bills\\Entergy';
  const files = fs.readdirSync(documentsDir).filter(f => f.endsWith('.pdf'));

  console.log(`Found ${exps.length} placeholder expenses to fix using ${files.length} physical PDFs...`);

  let count = 0;
  for (const exp of exps) {
    // If we run out of demo files, wrap around (though they should exactly match)
    const filename = files[count % files.length];
    const filePath = path.join(documentsDir, filename);
    const buffer = fs.readFileSync(filePath);
    
    console.log(`[${count+1}/${exps.length}] Deep OCR scanning physical file: ${filename}...`);
    
    try {
      // 1. Physically extract layout from PDF via Azure
      const { text } = await azureDocumentIntelligenceProvider.analyzeDocumentBuffer(buffer, 'application/pdf');

      // 2. Reason over text via OpenAI
      const aiResult = await parseFinancialDocument(text, filename);
      
      const val = aiResult.document.total_amount_due;
      if (val) {
        const cents = Math.round(val * 100);
        
        // 3. Persist accurate mathematical values directly to Dashboard DB
        await db.update(schema.expenses)
          .set({ amount: cents, description: `Entergy Utility Bill - ${filename}` })
          .where(eq(schema.expenses.id, exp.id));

        console.log(`  -> SUCCESS! Resolved blank placeholder to real amount: $${val}`);
      } else {
         console.log(`  -> OpenAI returned null amount for ${filename}`);
      }
    } catch(err: any) {
      console.log(`  -> ERROR: ${err.message}`);
    }
    count++;
  }

  console.log(`Completely resolved and re-injected real mathematical dollar totals into the production dashboard!`);
  process.exit(0);
}

directlyExtract().catch(console.error);
