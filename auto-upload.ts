import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { db } from './server/db';
import * as schema from '@shared/schema';

// We must manually construct the multipart form-data payload since we are sending from native Node.js
async function executeUpload() {
  const users = await db.select().from(schema.users);
  const liveUser = users.find(u => u.email === 'nedpearson@gmail.com');
  
  if (!liveUser) {
    console.log("No live user found.");
    process.exit(1);
  }

  const userId = liveUser.id;
  const targetUrl = 'https://divorce-ledger-ai-production-6b2e.up.railway.app/api/batch-ingest/upload';
  
  const documentsDir = 'C:\\Users\\nedpe\\Desktop\\House Bills\\Entergy';
  const files = fs.readdirSync(documentsDir).filter(f => f.endsWith('.pdf'));

  console.log(`Starting automated upload of ${files.length} documents for ${liveUser.email}...`);

  let successCount = 0;

  for (const filename of files) {
    const filePath = path.join(documentsDir, filename);
    const fileBuffer = fs.readFileSync(filePath);

    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    const postData = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`),
      fileBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    console.log(`Uploading ${filename}...`);
    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'x-user-id': userId,
          'x-environment': 'live',
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': postData.length.toString()
        },
        body: postData
      });

      if (response.ok) {
        console.log(` -> SUCCESS on ${filename}`);
        successCount++;
      } else {
        const errText = await response.text();
        console.log(` -> FAILED on ${filename}: ${response.status} ${errText}`);
      }
    } catch (err) {
      console.log(` -> CRASH on ${filename}:`, err);
    }
    
    // Slight delay to not overwhelm the orchestrated pipeline
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log(`Completed ${successCount}/${files.length} file uploads!`);
  process.exit(0);
}

executeUpload().catch(console.error);
