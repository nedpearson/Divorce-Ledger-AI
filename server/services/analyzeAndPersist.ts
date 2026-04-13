import { db } from '../db';
import { storage } from '../storage';
import { eq, and } from 'drizzle-orm';
import { documentLineItems, documentParseResults, expenses, incomes, debts, users, obligationRules, obligationInstances, legalDocuments } from '@shared/schema';
import { normalizeEnv } from '../lib/normalizeEnv';
import {
  parseFinancialDocument,
  validateParseResult,
  mapDocTypeToFinanceCategory,
  mapDocTypeToRecordType,
  type ExpenseDocument,
} from './parseDocument';
import { FireflyIIIService } from './firefly-iii.service';
import { decryptToken } from '../lib/encryption';
import { createTransactionFromParsedDocument, type ParsedDocument } from './documentToTransaction';
import { analyzeDocumentImage } from './ai-capture.service';

interface AnalyzeAndPersistOptions {
  provider?: 'openai' | 'gemini';
  createRecords?: boolean;
  forceReparse?: boolean;
  preExtractedText?: string;
  fireflyAccountIds?: {
    sourceAccountId: string;
    destinationAccountId: string;
  };
}

interface AnalyzeAndPersistResult {
  success: boolean;
  parseStatus: string;
  documentId: string;
  parseResultId?: string;
  lineItemsCreated: number;
  financialRecordsCreated: Array<{ type: string; record: any }>;
  validation: { isValid: boolean; errors: string[]; warnings: string[] };
  latencyMs: number;
  error?: string;
  fireflySyncResult?: {
    success: boolean;
    fireflyTransactionId?: string;
    error?: string;
  };
}

export async function analyzeAndPersist(
  documentId: string,
  options: AnalyzeAndPersistOptions = {}
): Promise<AnalyzeAndPersistResult> {
  const {
    provider = 'openai',
    createRecords = true,
    forceReparse = false,
    fireflyAccountIds,
  } = options;

  const startTime = Date.now();

  try {
    const doc = await storage.getDocument(documentId);
    if (!doc) {
      return {
        success: false,
        parseStatus: 'error',
        documentId,
        lineItemsCreated: 0,
        financialRecordsCreated: [],
        validation: { isValid: false, errors: ['Document not found'], warnings: [] },
        latencyMs: Date.now() - startTime,
        error: 'Document not found',
      };
    }

    const userId = doc.userId;
    const environment = normalizeEnv(doc.environment);

    const existingResults = await db
      .select()
      .from(documentParseResults)
      .where(eq(documentParseResults.documentId, documentId))
      .limit(1);

    if (
      !forceReparse &&
      existingResults.length > 0 &&
      existingResults[0].parseStatus === 'success'
    ) {
      return {
        success: true,
        parseStatus: 'already_parsed',
        documentId,
        parseResultId: existingResults[0].id,
        lineItemsCreated: 0,
        financialRecordsCreated: [],
        validation: { isValid: true, errors: [], warnings: ['Document already parsed'] },
        latencyMs: Date.now() - startTime,
      };
    }

    await db.delete(documentLineItems).where(eq(documentLineItems.documentId, documentId));
    await db.delete(expenses).where(eq(expenses.documentId, documentId));
    await db.delete(incomes).where(eq(incomes.documentId, documentId));
    await db.delete(debts).where(eq(debts.documentId, documentId));

    if (existingResults.length > 0) {
      await db.delete(documentParseResults).where(eq(documentParseResults.documentId, documentId));
    }

    let extractedText = options.preExtractedText || doc.aiExtractedText || doc.description || '';
    if (doc.title) {
      extractedText = `Title: ${doc.title}\n\n${extractedText}`;
    }
    let imageBase64: string | undefined;
    let imageMimeType: string | undefined;

    // Fetch file from object storage or URL
    let ocrExtractedText = '';
    if (!options.preExtractedText && doc.fileUrl && doc.fileType) {
      try {
        console.log(`[analyzeAndPersist] Fetching file: ${doc.fileUrl}, type: ${doc.fileType}`);

        if (doc.fileUrl.startsWith('/objects/')) {
          // Fetch from Replit object storage
          const { ObjectStorageService } =
            await import('../replit_integrations/object_storage/objectStorage');
          const storageService = new ObjectStorageService();
          const objectFile = await storageService.getObjectEntityFile(doc.fileUrl);
          const [buffer] = await objectFile.download();
          imageBase64 = buffer.toString('base64');
          imageMimeType = doc.fileType;
          console.log(
            `[analyzeAndPersist] Successfully fetched ${buffer.length} bytes from object storage`
          );
        } else if (doc.fileUrl.startsWith('http')) {
          // Fetch from external URL
          const response = await fetch(doc.fileUrl);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            imageBase64 = Buffer.from(arrayBuffer).toString('base64');
            imageMimeType = doc.fileType;
            console.log(`[analyzeAndPersist] Successfully fetched from URL`);
          }
        } else if (doc.fileUrl.startsWith('/uploads/')) {
          // Fetch from Local Filesystem (Pipeline Fallback)
          const fs = await import('fs');
          const path = await import('path');
          const localPath = path.join(process.cwd(), doc.fileUrl.startsWith('/') ? doc.fileUrl.slice(1) : doc.fileUrl);
          if (fs.existsSync(localPath)) {
            const buffer = await fs.promises.readFile(localPath);
            imageBase64 = buffer.toString('base64');
            imageMimeType = doc.fileType;
            console.log(`[analyzeAndPersist] Successfully fetched ${buffer.length} bytes from local filesystem`);
          } else {
            console.warn(`[analyzeAndPersist] Local file missing: ${localPath}`);
          }
        }

        // Run OCR/text extraction based on file type
        if (imageBase64 && imageMimeType) {
          const isImageType = imageMimeType.startsWith('image/');
          const isPdfType = imageMimeType === 'application/pdf';
          const isDocxType = doc.fileName?.toLowerCase().endsWith('.docx') || imageMimeType.includes('wordprocessingml.document');

          try {
            if (isImageType) {
              console.log(`[analyzeAndPersist] Running OCR on document image...`);
              const ocrResult = await analyzeDocumentImage(
                imageBase64,
                imageMimeType,
                doc.fileName || 'document'
              );
              ocrExtractedText = ocrResult.extractedText || '';
              console.log(
                `[analyzeAndPersist] OCR extracted ${ocrExtractedText.length} characters`
              );
            } else if (isPdfType) {
              console.log(`[analyzeAndPersist] Attempting text extraction from PDF using pdf-parse...`);
              try {
                const pdfParseModule = await import('pdf-parse');
                const pdfParse = (pdfParseModule as any).default || pdfParseModule;
                const pdfBuffer = Buffer.from(imageBase64, 'base64');
                
                const userObj = await db.query.users.findFirst({ where: eq(users.id, doc.userId) });
                const pdfOptions: any = {};
                if (userObj?.email === 'nedpearson@gmail.com') {
                  pdfOptions.password = '70809';
                  console.log(`[analyzeAndPersist] Automatically applying PDF passport bypass for nedpearson@gmail.com`);
                }
                
                const pdfData = await pdfParse(pdfBuffer, pdfOptions);
                ocrExtractedText = pdfData.text || '';
                console.log(
                  `[analyzeAndPersist] PDF extraction got ${ocrExtractedText.length} characters`
                );
              } catch (pdfErr: any) {
                if (pdfErr?.name === 'PasswordException' || String(pdfErr).includes('Password')) {
                  console.warn(`[analyzeAndPersist] Encrypted PDF detected: ${doc.fileName}`);
                  return {
                    success: false,
                    parseStatus: 'error',
                    documentId,
                    lineItemsCreated: 0,
                    financialRecordsCreated: [],
                    validation: { isValid: false, errors: ['Document Encrypted / Unreadable'], warnings: [] },
                    latencyMs: Date.now() - startTime,
                    error: 'Document Encrypted / Unreadable'
                  };
                }
                console.warn(
                  `[analyzeAndPersist] PDF extraction failed, will rely on parsing: ${pdfErr}`
                );
              }
            } else if (isDocxType) {
              console.log(`[analyzeAndPersist] Attempting text extraction from DOCX using mammoth...`);
              try {
                const mammoth = (await import('mammoth')).default || await import('mammoth');
                const docxBuffer = Buffer.from(imageBase64, 'base64');
                const result = await mammoth.extractRawText({ buffer: docxBuffer });
                ocrExtractedText = result.value || '';
                console.log(`[analyzeAndPersist] mammoth extracted ${ocrExtractedText.length} characters`);
              } catch (docxErr: any) {
                console.warn(`[analyzeAndPersist] mammoth failed, will rely on parsing: ${docxErr.message}`);
              }
            }

            // Combine extracted text with existing description for better parsing
            if (ocrExtractedText) {
              extractedText = `${extractedText}\n\n[OCR Extracted Text]\n${ocrExtractedText}`;
            }
          } catch (ocrErr) {
            console.error('[analyzeAndPersist] Text extraction failed:', ocrErr);
          }
        }
      } catch (fetchErr) {
        console.error('[analyzeAndPersist] Failed to fetch document file:', fetchErr);
      }
    }

    const parseResult = await parseFinancialDocument(extractedText, doc.fileName || 'document', {
      provider,
      ...(imageMimeType && imageMimeType.startsWith('image/') ? { imageBase64, imageMimeType } : {})
    });

    if (parseResult.document.parse_status !== 'success') {
      // Throwing an error forces execution into the catch block, which executes
      // the No-AI Fallback behavior (creating an empty placeholder expense).
      throw new Error(`Parse failed with status: ${parseResult.document.parse_status}`);
    }

    const validation = validateParseResult(parseResult.document);

    const parseResultRecord = await db
      .insert(documentParseResults)
      .values({
        documentId: doc.id,
        userId,
        docType: parseResult.document.doc_type,
        parseStatus: parseResult.document.parse_status,
        language: parseResult.document.language,
        currency: parseResult.document.currency || 'USD',
        vendorName: parseResult.document.vendor_name,
        accountNumber: parseResult.document.account_number,
        billingPeriodStart: parseResult.document.billing_period_start,
        billingPeriodEnd: parseResult.document.billing_period_end,
        statementDate: parseResult.document.statement_date,
        dueDate: parseResult.document.due_date,
        totalAmountDue: parseResult.document.total_amount_due
          ? Math.round(parseResult.document.total_amount_due * 100)
          : null,
        totalAmountText: parseResult.document.total_amount_text,
        customerName: parseResult.document.customer_name,
        serviceAddress: parseResult.document.service_address,
        mailingAddress: parseResult.document.mailing_address,
        rawLlmResponse: parseResult.document as any,
        notes: parseResult.document.notes,
        requestTokens: parseResult.usage.requestTokens,
        responseTokens: parseResult.usage.responseTokens,
        latencyMs: parseResult.latencyMs,
        environment,
      })
      .returning();

    const createdLineItems: any[] = [];
    for (let i = 0; i < parseResult.document.line_items.length; i++) {
      const item = parseResult.document.line_items[i];
      const lineItem = await db
        .insert(documentLineItems)
        .values({
          documentId: doc.id,
          userId,
          lineItemIndex: i,
          label: item.label,
          categoryHint: item.category_hint,
          amount: Math.round(item.amount * 100),
          amountText: item.amount_text,
          isCreditOrRefund: item.is_credit_or_refund,
          isRecurringGuess: item.is_recurring_guess,
          pageNumber: item.page_number,
          surroundingTextSnippet: item.surrounding_text_snippet,
          environment,
        })
        .returning();
      createdLineItems.push(lineItem[0]);
    }

    const createdLegalObligations: any[] = [];
    if (parseResult.document.legal_obligations && parseResult.document.legal_obligations.length > 0) {
      console.log(`[analyzeAndPersist] Found ${parseResult.document.legal_obligations.length} legal obligations to persist.`);
      
      // Auto-populate the user's explicit Legal Documents view so they don't lose track of it structurally
      await db.insert(legalDocuments)
        .values({
           userId,
           title: doc.fileName || 'Consent Judgment Extraction',
           documentType: 'court_order',
           status: 'pending',
           description: 'Auto-ingested via AI Financial Extraction pipeline',
           fileUrl: doc.fileUrl,
           fileName: doc.fileName,
           fileSize: doc.fileSize,
           environment
        });

      
      for (const obs of parseResult.document.legal_obligations) {
        // If this looks like an overarching rule (e.g. from a Court Order), generate a rule.
        // Even for bills, we create an instance, but optionally attach it to a rule if provided.
        // For now, we will create an instance representing this specific calculation.
        
        let amountGross = parseResult.document.total_amount_due ? Math.round(parseResult.document.total_amount_due * 100) : 0;
        if (obs.fixed_amount) {
           amountGross = Math.round(obs.fixed_amount * 100);
        }

        // Calculate owed amounts based on percentages
        let partyAOwed = null;
        let partyBOwed = null;
        if (obs.party_a_percentage && amountGross > 0) {
           partyAOwed = Math.round(amountGross * (obs.party_a_percentage / 100));
        }
        if (obs.party_b_percentage && amountGross > 0) {
           partyBOwed = Math.round(amountGross * (obs.party_b_percentage / 100));
        }

        const instance = await db.insert(obligationInstances).values({
           caseId: 'pending-assignment', // Could be inferred from doc.caseId if available
           documentId: doc.id,
           category: obs.category || mapDocTypeToFinanceCategory(parseResult.document.doc_type),
           vendor: parseResult.document.vendor_name || null,
           amountGross: amountGross,
           partyAOwed: partyAOwed,
           partyBOwed: partyBOwed,
           dueDate: parseResult.document.due_date,
           isAiComputed: true,
           confidenceScore: parseResult.classification.confidence, // approximate
           reviewStatus: 'needs_review',
           environment
        }).returning();
        
        createdLegalObligations.push(instance[0]);
      }
    }

    const createdFinancialRecords: Array<{ type: string; record: any }> = [];

    console.log('[analyzeAndPersist] Checking conditions for financial record creation:', {
      documentId,
      createRecords,
      validationIsValid: validation.isValid,
      validationErrors: validation.errors,
      parseStatus: parseResult.document.parse_status,
      docType: parseResult.document.doc_type,
      totalAmountDue: parseResult.document.total_amount_due,
      userId,
      environment,
    });

    const isFinancial = parseResult.document.doc_type !== 'NON_FINANCIAL';
    const hasData =
      (parseResult.document.total_amount_due !== null &&
        parseResult.document.total_amount_due > 0) ||
      (parseResult.document.line_items && parseResult.document.line_items.length > 0);

    if (createRecords && isFinancial && hasData) {
      const recordType = mapDocTypeToRecordType(parseResult.document.doc_type);
      const financeCategory = mapDocTypeToFinanceCategory(parseResult.document.doc_type);

      console.log('[analyzeAndPersist] Creating financial record:', {
        recordType,
        financeCategory,
      });

      // Fallback amount if total_amount_due is null but we have line items
      let amountInCents = parseResult.document.total_amount_due
        ? Math.round(parseResult.document.total_amount_due * 100)
        : 0;

      if (amountInCents === 0 && parseResult.document.line_items.length > 0) {
        amountInCents = parseResult.document.line_items.reduce(
          (sum, li) => sum + Math.round(li.amount * 100),
          0
        );
      }

      if (amountInCents > 0) {
        const date =
          parseResult.document.statement_date ||
          parseResult.document.due_date ||
          new Date().toISOString().split('T')[0];

        try {
          let record = null;
          switch (recordType) {
            case 'expense':
              record = await storage.createExpense({
                userId,
                environment,
                category: financeCategory,
                description: `${parseResult.document.vendor_name || 'Unknown'} - Parsed from document`,
                amount: amountInCents,
                frequency: parseResult.document.line_items.some((li) => li.is_recurring_guess)
                  ? 'monthly'
                  : 'one-time',
                owner: 'self',
                vendor: parseResult.document.vendor_name || null,
                documentId: doc.id,
                startDate: date,
              });
              break;
            case 'income':
              record = await storage.createIncome({
                userId,
                environment,
                source: parseResult.document.vendor_name || 'Unknown',
                amount: amountInCents,
                frequency: 'one-time',
                owner: 'self',
                vendor: parseResult.document.vendor_name || null,
                documentId: doc.id,
                startDate: date,
              });
              break;
            case 'debt':
              record = await storage.createDebt({
                userId,
                environment,
                name: parseResult.document.vendor_name || 'Unknown Debt',
                category: financeCategory,
                amount: amountInCents,
                ownership: 'self',
                monthlyPayment: null,
                vendor: parseResult.document.vendor_name || null,
                documentId: doc.id,
                openedDate: date,
              });
              break;
          }

          if (record) {
            console.log(`[analyzeAndPersist] ✅ Created ${recordType} record:`, {
              recordId: record.id,
              amount: amountInCents,
              documentId: doc.id,
              userId,
              environment,
            });
            createdFinancialRecords.push({ type: recordType, record });

            for (const lineItemRecord of createdLineItems) {
              await db
                .update(documentLineItems)
                .set({
                  linkedRecordType: recordType,
                  linkedRecordId: record.id,
                })
                .where(eq(documentLineItems.id, lineItemRecord.id));
            }

            try {
              const fireflyConnection = await storage.getFireflyConnection(userId, environment);
              if (fireflyConnection && fireflyConnection.autoSyncEnabled) {
                console.log(`[analyzeAndPersist] Auto-syncing ${recordType} to Firefly III`);
                const decryptedToken = decryptToken(fireflyConnection.accessToken);
                const fireflyService = new FireflyIIIService({
                  baseUrl: fireflyConnection.instanceUrl,
                  accessToken: decryptedToken,
                });

                if (recordType === 'expense') {
                  const syncResult = await fireflyService.syncExpense({
                    id: record.id,
                    documentId: doc.id,
                    description: `${parseResult.document.vendor_name || 'Unknown'} - Parsed from document`,
                    amountCents: amountInCents,
                    date: date,
                    vendor: parseResult.document.vendor_name || null,
                    category: financeCategory,
                  });
                  await storage.createFireflySyncLog({
                    connectionId: fireflyConnection.id,
                    userId,
                    environment,
                    syncType: 'auto',
                    sourceType: 'expense',
                    sourceId: record.id,
                    fireflyTransactionId: syncResult.data.id,
                    status: 'success',
                  });
                  console.log(
                    `[analyzeAndPersist] ✅ Auto-synced expense to Firefly III: ${syncResult.data.id}`
                  );
                } else if (recordType === 'income') {
                  const syncResult = await fireflyService.syncIncome({
                    id: record.id,
                    documentId: doc.id,
                    source: parseResult.document.vendor_name || 'Unknown',
                    amountCents: amountInCents,
                    date: date,
                    description: parseResult.document.vendor_name || 'Income',
                  });
                  await storage.createFireflySyncLog({
                    connectionId: fireflyConnection.id,
                    userId,
                    environment,
                    syncType: 'auto',
                    sourceType: 'income',
                    sourceId: record.id,
                    fireflyTransactionId: syncResult.data.id,
                    status: 'success',
                  });
                  console.log(
                    `[analyzeAndPersist] ✅ Auto-synced income to Firefly III: ${syncResult.data.id}`
                  );
                }

                await storage.updateFireflyConnection(fireflyConnection.id, {
                  lastSyncAt: new Date(),
                  lastSyncStatus: 'success',
                });
              }
            } catch (fireflyErr) {
              console.error(`[analyzeAndPersist] Firefly III auto-sync failed:`, fireflyErr);
            }
          }
        } catch (createErr) {
          console.error('[analyzeAndPersist] Failed to create financial record:', createErr);
        }
      }
    }

    // Build a comprehensive extracted text for display
    const displayExtractedText =
      ocrExtractedText ||
      (parseResult.document.line_items.length > 0
        ? parseResult.document.line_items
            .map((li) => `${li.label}: ${li.amount_text || li.amount}`)
            .join('\n')
        : null);

    await storage.updateDocument(doc.id, {
      aiCategory: mapDocTypeToFinanceCategory(parseResult.document.doc_type),
      aiConfidence: parseResult.classification.confidence,
      aiSummary: `${parseResult.document.doc_type}: ${parseResult.document.vendor_name || 'Unknown'} - ${parseResult.document.currency} ${parseResult.document.total_amount_due || 0}`,
      aiAnalysisStatus:
        parseResult.document.parse_status === 'success' ? 'completed' : 'needs_review',
      aiAnalyzedAt: new Date(),
      aiExtractedText: displayExtractedText,
    });

    let fireflySyncResult:
      | { success: boolean; fireflyTransactionId?: string; error?: string }
      | undefined;

    if (fireflyAccountIds && parseResult.document.parse_status === 'success' && doc.fileUrl) {
      try {
        console.log(`[analyzeAndPersist] Direct Firefly sync with provided account IDs`);
        fireflySyncResult = await createTransactionFromParsedDocument(
          {
            documentId: doc.id,
            documentUrl: doc.fileUrl,
            date:
              parseResult.document.statement_date ||
              parseResult.document.billing_period_end ||
              new Date().toISOString().split('T')[0],
            amount: parseResult.document.total_amount_due || 0,
            currencyCode: parseResult.document.currency || 'USD',
            merchantName: parseResult.document.vendor_name || undefined,
            categoryName: mapDocTypeToFinanceCategory(parseResult.document.doc_type),
            description: `${parseResult.document.vendor_name || 'Document'} - ${parseResult.document.doc_type}`,
            sourceAccountId: fireflyAccountIds.sourceAccountId,
            destinationAccountId: fireflyAccountIds.destinationAccountId,
            notes: 'Created automatically from OCR; awaiting user review.',
          },
          userId,
          environment
        );

        if (fireflySyncResult.success) {
          console.log(
            `[analyzeAndPersist] ✅ Direct Firefly sync: ${fireflySyncResult.fireflyTransactionId}`
          );
        } else {
          console.warn(
            `[analyzeAndPersist] Direct Firefly sync failed: ${fireflySyncResult.error}`
          );
        }
      } catch (syncErr) {
        console.error('[analyzeAndPersist] Direct Firefly sync error:', syncErr);
        fireflySyncResult = { success: false, error: (syncErr as Error).message };
      }
    }

    console.log(`[analyzeAndPersist] Document ${documentId} analyzed:`, {
      parseStatus: parseResult.document.parse_status,
      docType: parseResult.document.doc_type,
      totalAmount: parseResult.document.total_amount_due,
      lineItems: parseResult.document.line_items.length,
      financialRecordsCreated: createdFinancialRecords.length,
      fireflySynced: fireflySyncResult?.success || false,
    });

    return {
      success: true,
      parseStatus: parseResult.document.parse_status,
      documentId,
      parseResultId: parseResultRecord[0]?.id,
      lineItemsCreated: createdLineItems.length,
      financialRecordsCreated: createdFinancialRecords,
      validation,
      latencyMs: Date.now() - startTime,
      fireflySyncResult,
    };
  } catch (error) {
    console.error('[analyzeAndPersist] Error:', error);

    // ── No-AI Fallback ──────────────────────────────────────────────────────
    // If the primary pipeline fails (e.g. missing OpenAI key), create a minimal
    // expense record from document metadata so it appears in Finances.
    // The user can correct the amount manually.
    if (options.createRecords !== false) {
      try {
        const docFallback = await storage.getDocument(documentId);
        if (docFallback) {
          const userId = docFallback.userId;
          const environment = normalizeEnv(docFallback.environment);
          const category = (docFallback as any).aiCategory || docFallback.category || 'utility_bill';
          const fileName = (docFallback as any).fileName || docFallback.title || 'Document';

          // Infer billing date from filename (e.g. Entergy_Sep_2025 → 2025-09-01)
          const MONTH_MAP: Record<string, string> = {
            jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
            jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12'
          };
          let billDate = new Date().toISOString().split('T')[0];
          const monthMatch = fileName.toLowerCase().match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[_\s-]?(\d{4})/);
          if (monthMatch) {
            billDate = `${monthMatch[2]}-${MONTH_MAP[monthMatch[1]]}-01`;
          }

          // Extract vendor from filename (Entergy_Sep_2025 → "Entergy")
          const vendor = fileName.replace(/[_\s-].*/,'').replace(/\.pdf$/i,'') || 'Unknown Vendor';

          // Create a $0 placeholder expense — user will correct amount
          const record = await storage.createExpense({
            userId,
            environment,
            category: category === 'utility_bill' ? 'utilities' : 'other',
            description: `${vendor} — imported from document (amount needs review)`,
            amount: 0, // placeholder until AI key is configured
            frequency: 'monthly',
            owner: 'self',
            vendor,
            documentId,
            startDate: billDate,
          });
          
          let createdObligations = 0;
          const isLegal = category === 'legal_document' || category === 'custody_document' || 
                         fileName.toLowerCase().includes('order') || 
                         fileName.toLowerCase().includes('consent') ||
                         fileName.toLowerCase().includes('decree');

          if (isLegal) {
             console.log(`[analyzeAndPersist] Fallback: creating placeholder obligation for legal document: ${fileName}`);
             await db.insert(obligationInstances).values({
               caseId: 'pending-assignment',
               documentId: documentId,
               category: 'child_support',
               vendor: vendor,
               amountGross: 0, // Placeholder
               partyAOwed: 0,
               partyBOwed: 0,
               dueDate: billDate,
               isAiComputed: false,
               confidenceScore: 0.1,
               reviewStatus: 'needs_review',
               environment
             });
             createdObligations = 1;
          }

          console.log(`[analyzeAndPersist] Fallback: created placeholder expense for ${fileName}`);
          return {
            success: false,
            parseStatus: 'error',
            documentId,
            lineItemsCreated: 0,
            financialRecordsCreated: [{ type: 'expense', record }],
            validation: { isValid: false, errors: [(error as Error).message], warnings: ['Created placeholder record — amount requires review'] },
            latencyMs: Date.now() - startTime,
            error: (error as Error).message,
          };
        }
      } catch (fallbackErr) {
        console.error('[analyzeAndPersist] Fallback also failed:', fallbackErr);
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    return {
      success: false,
      parseStatus: 'error',
      documentId,
      lineItemsCreated: 0,
      financialRecordsCreated: [],
      validation: { isValid: false, errors: [(error as Error).message], warnings: [] },
      latencyMs: Date.now() - startTime,
      error: (error as Error).message,
    };
  }
}

export async function syncParsedDocumentToFirefly(
  documentId: string,
  parseResult: ExpenseDocument,
  userId: string,
  environment: string = 'demo',
  documentUrl: string,
  sourceAccountId: string,
  destinationAccountId: string
): Promise<{ success: boolean; fireflyTransactionId?: string; error?: string }> {
  if (parseResult.parse_status !== 'success') {
    return { success: false, error: 'Document not successfully parsed' };
  }

  if (parseResult.total_amount_due === null || parseResult.total_amount_due === undefined) {
    return { success: false, error: 'Document missing amount' };
  }

  const parsedDoc: ParsedDocument = {
    documentId,
    documentUrl,
    date:
      parseResult.statement_date ||
      parseResult.billing_period_end ||
      new Date().toISOString().split('T')[0],
    amount: parseResult.total_amount_due,
    currencyCode: parseResult.currency || 'USD',
    merchantName: parseResult.vendor_name || undefined,
    categoryName: mapDocTypeToFinanceCategory(parseResult.doc_type),
    description: `${parseResult.vendor_name || 'Document'} - ${parseResult.doc_type}`,
    sourceAccountId,
    destinationAccountId,
    notes: parseResult.notes?.join('\n') || undefined,
  };

  return await createTransactionFromParsedDocument(parsedDoc, userId, environment);
}

export function isFinancialDocumentType(category: string | null, fileName: string | null): boolean {
  const financialCategories = [
    'financial_statement',
    'bank_statement',
    'debt_statement',
    'credit_card',
    'utility_bill',
    'mortgage',
    'loan',
    'pay_stub',
    'tax_document',
    'insurance',
    'receipt',
  ];

  if (category && financialCategories.some((fc) => category.toLowerCase().includes(fc))) {
    return true;
  }

  if (fileName) {
    const fnLower = fileName.toLowerCase();
    const financialKeywords = [
      'bill',
      'statement',
      'invoice',
      'receipt',
      'payment',
      'bank',
      'credit',
      'mortgage',
      'loan',
      'tax',
      'w2',
      '1099',
      'utility',
      'electric',
      'gas',
      'water',
      'phone',
      'internet',
      'insurance',
      'medical',
      'health',
    ];
    if (financialKeywords.some((kw) => fnLower.includes(kw))) {
      return true;
    }
  }

  return false;
}
