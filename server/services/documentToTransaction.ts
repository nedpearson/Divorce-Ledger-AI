import { storage } from '../storage';
import { FireflyIIIService, FireflyAPIError } from './firefly-iii.service';
import { decryptToken } from '../lib/encryption';

export interface ParsedDocument {
  documentId: string;
  documentUrl: string;
  date: string; // ISO
  amount: number;
  currencyCode: string;
  merchantName?: string;
  categoryName?: string;
  description?: string;
  sourceAccountId: string;
  destinationAccountId: string;
  notes?: string;
}

export interface CreateTransactionResult {
  success: boolean;
  fireflyTransactionId?: string;
  syncLogId?: string;
  error?: string;
  errorDetails?: any;
}

export async function createTransactionFromParsedDocument(
  input: ParsedDocument,
  userId: string,
  environment: string = 'demo'
): Promise<CreateTransactionResult> {
  try {
    if (!input.documentId || !input.date || input.amount === undefined || input.amount === null) {
      return {
        success: false,
        error: 'Missing required fields: documentId, date, and amount are required',
      };
    }

    if (!input.sourceAccountId || !input.destinationAccountId) {
      return {
        success: false,
        error: 'Missing required fields: sourceAccountId and destinationAccountId are required',
      };
    }

    const connection = await storage.getFireflyConnection(userId, environment);
    if (!connection) {
      return {
        success: false,
        error: 'Firefly III not connected. Please connect to Firefly III first in Settings.',
      };
    }

    if (!connection.autoSyncEnabled) {
      console.log(`[documentToTransaction] Auto-sync disabled for user ${userId}, skipping`);
      return {
        success: false,
        error: 'Auto-sync is disabled. Enable it in Settings to automatically sync documents.',
      };
    }

    const decryptedToken = decryptToken(connection.accessToken);
    const fireflyService = new FireflyIIIService({
      baseUrl: connection.instanceUrl,
      accessToken: decryptedToken,
    });

    const chainOfCustodyNote = [
      input.notes || '',
      '',
      '--- Chain of Custody ---',
      `Source: Divorce Ledger Document Intake`,
      `Document ID: ${input.documentId}`,
      `Document URL: ${input.documentUrl}`,
      `Imported: ${new Date().toISOString()}`,
    ]
      .filter(Boolean)
      .join('\n');

    const transactionPayload: any = {
      type: 'withdrawal',
      date: input.date,
      amount: input.amount.toFixed(2),
      description: input.description || `Document ${input.documentId}`,
      currency_code: input.currencyCode,
      category_name: input.categoryName || undefined,
      notes: chainOfCustodyNote,
      external_id: `divorce-ledger-doc-${input.documentId}`,
      tags: ['divorce-ledger', 'document-intake', 'auto-sync'],
      source_id: input.sourceAccountId,
      destination_id: input.destinationAccountId,
    };

    if (input.merchantName) {
      transactionPayload.destination_name = input.merchantName;
    }

    console.log(
      `[documentToTransaction] Creating Firefly transaction for document ${input.documentId}`
    );

    const result = await fireflyService.createTransaction(transactionPayload);

    const syncLog = await storage.createFireflySyncLog({
      connectionId: connection.id,
      userId,
      environment,
      syncType: 'document-intake',
      sourceType: 'document',
      sourceId: input.documentId,
      fireflyTransactionId: result.data.id,
      status: 'success',
    });

    await storage.updateFireflyConnection(connection.id, {
      lastSyncAt: new Date(),
      lastSyncStatus: 'success',
    });

    console.log(
      `[documentToTransaction] ✅ Created Firefly transaction ${result.data.id} for document ${input.documentId}`
    );

    return {
      success: true,
      fireflyTransactionId: result.data.id,
      syncLogId: syncLog.id,
    };
  } catch (error) {
    console.error('[documentToTransaction] Failed to create transaction:', error);

    if (error instanceof FireflyAPIError) {
      return {
        success: false,
        error: `Firefly III API error (${error.status})`,
        errorDetails: error.responseBody,
      };
    }

    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

export async function createTransactionFromParsedDocumentIfEnabled(
  input: ParsedDocument,
  userId: string,
  environment: string = 'demo'
): Promise<CreateTransactionResult | null> {
  try {
    const connection = await storage.getFireflyConnection(userId, environment);
    if (!connection || !connection.autoSyncEnabled) {
      return null;
    }
    return await createTransactionFromParsedDocument(input, userId, environment);
  } catch (error) {
    console.error('[documentToTransaction] Error checking connection:', error);
    return null;
  }
}
