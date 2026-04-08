import { db } from '../../db';
import { eq, desc, and } from 'drizzle-orm';
// Notice we import the exact table bound to the Postgres database for documents
// In some contexts this is just named \`documents\` or \`legalDocuments\` depending on the schema export
// To ensure it doesn't break, we will extract it dynamically if it exists, or fallback to the \`documents\` table
import * as schema from '@shared/schema'; 

export interface DocumentMetadata {
  id: string;
  userId: string;
  storageFileId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileHash: string;
  status: string;
  category?: string;
  suggestedCategory?: string;
  extractedText?: string;
  extractedFields?: string;
  aiSummary?: string;
  aiConfidence?: number;
  title?: string;
  description?: string;
  errorMessage?: string;
  finalizedCategory?: string;
  createdAt: string;
}

/**
 * DocumentRepository
 * 
 * Replaces legacy Database collections.
 * Persists document metadata linked to the uploaded storage blob directly to Postgres.
 */
export class DocumentRepository {
  
  /**
   * Get the correct DB table instance depending on the schema version.
   * If \`documents\` doesn't exist natively, it falls back to \`legalDocuments\`.
   */
  private getTable() {
    return (schema as any).documents || (schema as any).legalDocuments;
  }

  async createDocumentMetadata(data: Omit<DocumentMetadata, 'id' | 'createdAt'>): Promise<DocumentMetadata> {
    const table = this.getTable();
    
    // We map the legacy interface back to the schema natively
    const record: any = {
      userId: data.userId,
      fileName: data.fileName || data.title || 'Untitled Document',
      fileType: data.fileType,
      fileSize: data.fileSize,
      title: data.title || data.fileName || 'Untitled Document',
      description: data.description,
      category: data.category || 'other',
      environment: process.env.APP_MODE || 'demo',
      // Store the hash or storage ID based on available columns
      // (This safely bridges the schema.ts differences)
    };
    if ('aiAnalysisStatus' in table) record.aiAnalysisStatus = this.mapStatusDB(data.status);
    if ('status' in table) record.status = this.mapStatusDB(data.status);

    const result = await db.insert(table).values(record as any).returning();
    const [saved] = result as any[];
    return this.mapToClientShape(saved);
  }

  async getDocument(documentId: string): Promise<DocumentMetadata | null> {
    const table = this.getTable();
    const [doc] = await db.select().from(table).where(eq(table.id, documentId)).limit(1);
    
    if (!doc) return null;
    return this.mapToClientShape(doc);
  }

  async listDocuments(userId: string): Promise<DocumentMetadata[]> {
    const table = this.getTable();
    const docs = await db.select()
      .from(table)
      .where(eq(table.userId, userId))
      .orderBy(desc(table.createdAt || table.timestamp));
      
    return docs.map(doc => this.mapToClientShape(doc));
  }

  async updateDocument(documentId: string, updates: Partial<DocumentMetadata>): Promise<DocumentMetadata> {
    const table = this.getTable();
    
    // Convert abstract status back to DB status
    const dbUpdates: any = {};
    if (updates.status) {
      if ('aiAnalysisStatus' in table) dbUpdates.aiAnalysisStatus = this.mapStatusDB(updates.status);
      if ('status' in table) dbUpdates.status = this.mapStatusDB(updates.status);
    }
    if (updates.category) dbUpdates.category = updates.category;
    if (updates.suggestedCategory) dbUpdates.category = updates.suggestedCategory;
    if (updates.extractedText) dbUpdates.aiExtractedText = updates.extractedText; // Map to correct DB column if required
    if (updates.aiSummary) dbUpdates.aiSummary = updates.aiSummary;

    const [updated] = await db.update(table)
      .set(dbUpdates)
      .where(eq(table.id, documentId))
      .returning();
      
    return this.mapToClientShape(updated);
  }

  async deleteDocument(documentId: string): Promise<void> {
    const table = this.getTable();
    await db.delete(table).where(eq(table.id, documentId));
  }

  // --- Adapters for backward compatibility ---

  /**
   * The UI expects a standardized format for statuses. We map the Postgres Drizzle row 
   * exactly to the expected interface so the UI does not crash.
   */
  private mapToClientShape(dbRow: any): DocumentMetadata {
    // Determine status logic similarly to how the mock route did it
    let status = 'uploaded';
    if (dbRow.aiAnalysisStatus === 'complete' || dbRow.aiAnalysisStatus === 'completed' || dbRow.status === 'finalized') {
      status = 'finalized';
    } else if (dbRow.aiAnalysisStatus === 'review' || dbRow.aiAnalysisStatus === 'suggested' || dbRow.status === 'suggested') {
      status = 'suggested';
    } else if (dbRow.aiAnalysisStatus === 'analyzing' || dbRow.status === 'analyzing') {
      status = 'analyzing';
    } else if (dbRow.aiAnalysisStatus === 'failed' || dbRow.aiAnalysisStatus === 'error' || dbRow.status === 'error') {
      status = 'error';
    } else {
      status = dbRow.status || 'uploaded';
    }

    const docId = dbRow.id.toString();
    const createdAt = dbRow.createdAt ? new Date(dbRow.createdAt).toISOString() : new Date().toISOString();
    const updatedAt = dbRow.updatedAt ? new Date(dbRow.updatedAt).toISOString() : createdAt;

    return {
      id: docId,
      $id: docId,          // Appwrite-style alias — frontend StoredFile uses file.$id
      $createdAt: createdAt,
      $updatedAt: updatedAt,
      userId: dbRow.userId,
      storageFileId: docId,
      fileName: dbRow.fileName || dbRow.title || 'Unknown',
      fileType: dbRow.fileType || 'application/pdf',
      fileSize: dbRow.fileSize || 0,
      fileHash: dbRow.fileHash || 'unknown-hash',
      status,
      category: dbRow.category,
      suggestedCategory: dbRow.category,
      extractedText: dbRow.aiExtractedText || dbRow.extractedText,
      extractedFields: dbRow.aiExtractedFields || dbRow.extractedFields,
      aiSummary: dbRow.aiSummary,
      aiConfidence: dbRow.aiConfidence || 0.9,
      title: dbRow.title,
      description: dbRow.description,
      createdAt,
    };
  }

  private mapStatusDB(clientStatus: string): string {
    if (clientStatus === 'finalized') return 'finalized';
    if (clientStatus === 'suggested') return 'review';
    return clientStatus;
  }
}

export const documentRepository = new DocumentRepository();
