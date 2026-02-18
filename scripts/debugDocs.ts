import { db } from "../server/db";
import { documents, documentParseResults } from "../shared/schema";
import { desc, sql } from "drizzle-orm";

async function debugDocs() {
  console.log("=== DEBUG: Recent Documents ===\n");
  
  try {
    const recentDocs = await db
      .select({
        id: documents.id,
        userId: documents.userId,
        fileName: documents.fileName,
        category: documents.category,
        aiCategory: documents.aiCategory,
        aiAnalysisStatus: documents.aiAnalysisStatus,
        environment: documents.environment,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .orderBy(desc(documents.createdAt))
      .limit(5);

    console.log("Recent Documents (5 most recent):");
    console.log("─".repeat(80));
    
    for (const doc of recentDocs) {
      console.log(`ID: ${doc.id}`);
      console.log(`  User ID: ${doc.userId}`);
      console.log(`  File Name: ${doc.fileName}`);
      console.log(`  Category: ${doc.category}`);
      console.log(`  AI Category: ${doc.aiCategory}`);
      console.log(`  Analysis Status: ${doc.aiAnalysisStatus}`);
      console.log(`  Environment: ${doc.environment}`);
      console.log(`  Created At: ${doc.createdAt}`);
      console.log("");
    }

    console.log("\n=== DEBUG: Recent Parse Results ===\n");
    
    const recentParseResults = await db
      .select({
        id: documentParseResults.id,
        documentId: documentParseResults.documentId,
        userId: documentParseResults.userId,
        docType: documentParseResults.docType,
        parseStatus: documentParseResults.parseStatus,
        totalAmountDue: documentParseResults.totalAmountDue,
        vendorName: documentParseResults.vendorName,
        currency: documentParseResults.currency,
        environment: documentParseResults.environment,
        createdAt: documentParseResults.createdAt,
      })
      .from(documentParseResults)
      .orderBy(desc(documentParseResults.createdAt))
      .limit(5);

    console.log("Recent Parse Results (5 most recent):");
    console.log("─".repeat(80));
    
    for (const result of recentParseResults) {
      console.log(`ID: ${result.id}`);
      console.log(`  Document ID: ${result.documentId}`);
      console.log(`  User ID: ${result.userId}`);
      console.log(`  Doc Type: ${result.docType}`);
      console.log(`  Parse Status: ${result.parseStatus}`);
      console.log(`  Total Amount Due: ${result.totalAmountDue ? (result.totalAmountDue / 100).toFixed(2) : "null"} (cents: ${result.totalAmountDue})`);
      console.log(`  Vendor Name: ${result.vendorName}`);
      console.log(`  Currency: ${result.currency}`);
      console.log(`  Environment: ${result.environment}`);
      console.log(`  Created At: ${result.createdAt}`);
      console.log("");
    }

  } catch (error) {
    console.error("Error querying database:", error);
  }
  
  process.exit(0);
}

debugDocs();
