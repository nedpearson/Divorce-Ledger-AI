import { documentRepository } from './documentRepository';
import { fileStorageService } from './fileStorageService';

/**
 * FileAccessService
 * 
 * Replaces legacy implicit Object permissions model.
 * Provides explicit Access Control enforcement between the Tenant (userId) 
 * and the requested Document or Blob.
 */
export class FileAccessService {
  
  /**
   * Verifies if a user is authorized to interact with a specific document
   */
  async canAccessDocument(userId: string, documentId: string): Promise<boolean> {
    const doc = await documentRepository.getDocument(documentId);
    
    if (!doc) return false;
    
    // Simplest tenant validation: document strictly belongs to this user ID
    // Later, this can expand to teamId or attorney sharing grants
    return doc.userId === userId;
  }

  /**
   * Generates a securely signed expiring URL for frontend previews
   * Assumes Azure Blob SAS or Replit Signed URLs are generated off the Blob client
   */
  async generatePreviewUrl(userId: string, documentId: string): Promise<string> {
    const hasAccess = await this.canAccessDocument(userId, documentId);
    if (!hasAccess) {
      throw new Error(`User ${userId} does not have access to document ${documentId}`);
    }

    const doc = await documentRepository.getDocument(documentId);
    if (!doc || !doc.storageFileId) {
      throw new Error('Document mapping corruped or storage reference missing');
    }

    // Usually we would sign a SAS token via the azure client or objectStorageService here
    // For this mock interface, we'll route to a secure node intermediary:
    return `/api/storage/files/${documentId}/preview?t=${Date.now()}`;
  }

  /**
   * Serves the raw bytes back strictly governed by ACL checks
   */
  async securelyServeFile(userId: string, documentId: string): Promise<{ buffer: Buffer, mimeType: string, fileName: string }> {
    const hasAccess = await this.canAccessDocument(userId, documentId);
    if (!hasAccess) {
      throw new Error('Unauthorized Access Blocked');
    }
    
    const doc = await documentRepository.getDocument(documentId);
    if (!doc || !doc.storageFileId) {
        throw new Error('Storage mapping missing or unassociated');
    }

    const buffer = await fileStorageService.getFileBuffer(doc.storageFileId);

    return {
      buffer,
      mimeType: doc.fileType,
      fileName: doc.fileName
    };
  }
}

export const fileAccessService = new FileAccessService();
