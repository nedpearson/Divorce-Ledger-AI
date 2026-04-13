import { db } from './server/db';
import { documents } from './shared/schema';
import { desc } from 'drizzle-orm';
import "dotenv/config";

async function run() {
  console.log("Fetching last document...");
  const docs = await db.query.documents.findMany({
    orderBy: desc(documents.createdAt),
    limit: 1,
  });
  
  if (docs.length > 0) {
    const doc = docs[0];
    console.log("Found document ID:", doc.id);
    console.log("File Name:", doc.fileName);
    console.log("Extracted Text Length:", doc.aiExtractedText?.length || 0);
    console.log("=== BEGIN EXTRACTED TEXT ===\n", doc.aiExtractedText?.substring(0, 1500), "\n=== END EXTRACTED TEXT ===");
  } else {
    console.log("No documents found in production DB.");
  }
  process.exit(0);
}

run().catch(console.error);
