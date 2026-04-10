import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { db } from './server/db';
import * as schema from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { batchIngestionService } from './server/services/batch-ingestion.service';

async function processLocally() {
  const users = await db.select().from(schema.users);
  const liveUser = users.find(u => u.email === 'nedpearson@gmail.com');
  
  if (!liveUser) {
    console.log("No live user found.");
    process.exit(1);
  }

  const userId = liveUser.id;
  const env = 'live';

  console.log(`Phase 1: Scrubbing failed AI extraction data from Railway...`);
  const existingDocs = await db.query.documents.findMany({
    where: (d, { eq, and }) => and(eq(d.userId, userId), eq(d.environment, env))
  });
  
  for (const doc of existingDocs) {
    if (doc.title.includes('Entergy')) {
      await db.delete(schema.expenses).where(eq(schema.expenses.documentId, doc.id));
      await db.delete(schema.transactions).where(eq(schema.transactions.documentId, doc.id));
      await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
    }
  }

  console.log(`Phase 2: Local AI pipeline execution pushing to Production DB...`);
  const documentsDir = 'C:\\Users\\nedpe\\Desktop\\House Bills\\Entergy';
  const files = fs.readdirSync(documentsDir).filter(f => f.endsWith('.pdf'));

  const batch = await batchIngestionService.createBatch({ userId, environment: env });
  const batchId = batch.id;
  
  for (const filename of files) {
    const filePath = path.join(documentsDir, filename);
    const buffer = fs.readFileSync(filePath);
    
    // Simulate express-multer file
    const fileObj = {
      fieldname: 'file',
      originalName: filename,
      encoding: '7bit',
      mimeType: 'application/pdf',
      buffer: buffer,
      size: buffer.length,
      destination: '',
      filename: '',
      path: '',
      stream: null as any
    };

    console.log(`Locally uploading & hashing ${filename}...`);
    await batchIngestionService.addFileToBatch(batchId, userId, env, fileObj as any, '127.0.0.1');
  }

  console.log(`Starting massive AI processing task locally...`);
  await batchIngestionService.startBatchProcessing(batchId, userId);

  console.log(`Done!`);
  process.exit(0);
}

processLocally().catch(console.error);
