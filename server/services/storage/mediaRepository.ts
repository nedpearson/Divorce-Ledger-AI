import { db } from '../../db';
import { eq, desc } from 'drizzle-orm';
import * as schema from '@shared/schema';

export interface MediaMetadata {
  id: string;
  userId: string;
  storageFileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  hash: string;
  mediaType: 'image' | 'video' | 'audio' | 'unknown';
  captureDate?: string;
  duration?: number;
  exifData?: string;
  thumbnailUrl?: string;
  status: string;
  createdAt: string;
}

/**
 * MediaRepository
 * 
 * Replaces legacy media buckets.
 * Persists rich media explicitly (photos, videos, audio) bridging Azure blob references 
 * to Postgres structured data natively.
 */
export class MediaRepository {
  
  private getTable() {
    // Bridges to natively available media tables, defaults to evidenceFiles or documents 
    // depending on the exact schema structure in the application
    return (schema as any).evidenceFiles || (schema as any).documents || (schema as any).legalDocuments;
  }

  async createMediaRecord(data: Omit<MediaMetadata, 'id' | 'createdAt'>): Promise<MediaMetadata> {
    const table = this.getTable();
    
    // Map abstract Media architecture to Postgres
    const record = {
      userId: data.userId,
      fileName: data.fileName,
      fileType: data.mimeType,
      fileSize: data.size,
      objectPath: data.storageFileId,
      sha256Hash: data.hash,
      exifData: data.exifData,
      environment: process.env.APP_MODE || 'demo',
      // Dynamic keys based on schema target
      ...(table === (schema as any).documents ? {
        category: 'media',
        title: data.fileName,
        status: data.status,
      } as any : {})
    };

    const result = await db.insert(table).values(record as any).returning();
    const [saved] = result as any[];
    return this.mapToMediaShape(saved);
  }

  async getMedia(mediaId: string): Promise<MediaMetadata | null> {
    const table = this.getTable();
    const [media] = await db.select().from(table).where(eq(table.id, mediaId)).limit(1);
    
    if (!media) return null;
    return this.mapToMediaShape(media);
  }

  async listUserMedia(userId: string): Promise<MediaMetadata[]> {
    const table = this.getTable();
    const records = await db.select()
      .from(table)
      .where(eq(table.userId, userId))
      .orderBy(desc(table.timestamp || table.createdAt));
      
    return records.map(record => this.mapToMediaShape(record));
  }

  async updateMedia(mediaId: string, updates: Partial<MediaMetadata>): Promise<MediaMetadata> {
    const table = this.getTable();
    
    const dbUpdates: any = {};
    if (updates.status) dbUpdates.status = updates.status;
    if (updates.fileName) dbUpdates.fileName = updates.fileName;
    if (updates.exifData) dbUpdates.exifData = updates.exifData;

    const [updated] = await db.update(table)
      .set(dbUpdates)
      .where(eq(table.id, mediaId))
      .returning();
      
    return this.mapToMediaShape(updated);
  }

  private mapToMediaShape(dbRow: any): MediaMetadata {
    return {
      id: dbRow.id.toString(),
      userId: dbRow.userId,
      storageFileId: dbRow.objectPath || dbRow.id.toString(),
      fileName: dbRow.fileName || dbRow.title || 'Unknown Media',
      mimeType: dbRow.fileType || 'application/octet-stream',
      size: dbRow.fileSize || 0,
      hash: dbRow.sha256Hash || dbRow.fileHash || 'unknown-hash',
      mediaType: dbRow.fileType?.startsWith('image') ? 'image' 
               : dbRow.fileType?.startsWith('video') ? 'video' 
               : dbRow.fileType?.startsWith('audio') ? 'audio' : 'unknown',
      captureDate: dbRow.timestamp || dbRow.createdAt,
      exifData: dbRow.exifData,
      status: dbRow.status || 'uploaded',
      createdAt: dbRow.createdAt || dbRow.timestamp || new Date().toISOString()
    };
  }
}

export const mediaRepository = new MediaRepository();
