import { db } from '../../db';
import { eq, desc } from 'drizzle-orm';
import * as schema from '@shared/schema';
import { fileStorageService } from './fileStorageService';

export interface EvidenceRecord {
  id: string;
  violationId: string;
  userId: string;
  storageFileId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  hash: string;
  timestamp: string;
  deviceId?: string;
  gps?: { latitude: string, longitude: string };
}

/**
 * EvidenceStorageService
 * 
 * Secure wrapper specializing in evidentiary tracking natively in Postgres 
 * maintaining the chain of custody required for legal validity while decoupling from Appwrite.
 */
export class EvidenceStorageService {
  
  async depositEvidence(params: {
    userId: string;
    violationId: string;
    buffer: Buffer;
    fileName: string;
    mimeType: string;
    deviceId?: string;
  }): Promise<EvidenceRecord> {
    
    // 1. Safe secure object upload
    const storageRef = await fileStorageService.uploadBuffer(
       params.buffer, 
       params.fileName, 
       params.mimeType, 
       { evidenceSource: 'API_UPLOAD' }
    );

    // 2. Persist to Postgres evidenceFiles strictly
    const record = {
      violationId: params.violationId,
      userId: params.userId,
      fileName: params.fileName,
      fileType: params.mimeType,
      fileSize: params.buffer.length,
      objectPath: storageRef.storageId,
      sha256Hash: storageRef.hash,
      deviceId: params.deviceId,
      environment: process.env.APP_MODE || 'demo'
    };

    const result = await db.insert(schema.evidenceFiles).values(record as any).returning();
    const [saved] = result as any[];
    
    // 3. Initiate native Chain of Custody entry
    await db.insert(schema.chainOfCustody).values({
      evidenceId: saved.id,
      userId: params.userId,
      action: 'EVIDENCE_DEPOSITED',
      entryHash: storageRef.hash,
      environment: process.env.APP_MODE || 'demo'
    });

    return this.mapToEvidenceShape(saved);
  }

  async retrieveEvidence(evidenceId: string): Promise<Buffer> {
    const [evidence] = await db.select()
      .from(schema.evidenceFiles)
      .where(eq(schema.evidenceFiles.id, evidenceId))
      .limit(1);

    if (!evidence) {
      throw new Error("Evidence record not found");
    }

    return fileStorageService.getFileBuffer(evidence.objectPath);
  }

  private mapToEvidenceShape(row: any): EvidenceRecord {
    return {
      id: row.id,
      violationId: row.violationId,
      userId: row.userId,
      storageFileId: row.objectPath,
      fileName: row.fileName,
      fileType: row.fileType,
      fileSize: row.fileSize,
      hash: row.sha256Hash,
      timestamp: row.timestamp?.toISOString() || new Date().toISOString(),
      deviceId: row.deviceId,
      gps: (row.gpsLatitude && row.gpsLongitude) ? { 
        latitude: row.gpsLatitude, 
        longitude: row.gpsLongitude 
      } : undefined
    };
  }
}

export const evidenceStorageService = new EvidenceStorageService();
