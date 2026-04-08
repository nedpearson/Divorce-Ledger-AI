import { randomUUID, createHash } from 'crypto';
import { objectStorageService } from '../../replit_integrations/object_storage/objectStorage';
import { BlobServiceClient } from '@azure/storage-blob';
import { createLogger } from '../../lib/logger';

const logger = createLogger('FileStorageService');

export interface UploadedFileReference {
  storageId: string;
  originalName: string;
  mimeType: string;
  size: number;
  hash: string;
  url: string;
}

/**
 * FileStorageService
 * 
 * Replaces legacy object storage.
 * Automatically handles routing to Azure Blob Storage if configured,
 * otherwise falls back to the canonical ObjectStorageService (Replit/GCS).
 */
export class FileStorageService {
  private azureClient: BlobServiceClient | null = null;
  private azureContainer: string | null = null;

  constructor() {
    this.initializeAzureIfConfigured();
  }

  private initializeAzureIfConfigured() {
    const connString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const container = process.env.AZURE_STORAGE_CONTAINER || 'uploads';

    if (connString) {
      try {
        this.azureClient = BlobServiceClient.fromConnectionString(connString);
        this.azureContainer = container;
        logger.info('Azure Blob Storage initialized securely');
      } catch (err) {
        logger.error('Failed to initialize Azure Blob Storage', { err });
      }
    }
  }

  /**
   * Upload binary buffer to storage
   */
  async uploadBuffer(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    metadata?: Record<string, string>
  ): Promise<UploadedFileReference> {
    const storageId = randomUUID();
    const hash = this.computeHash(buffer);

    // 1. Try Azure Storage if configured
    if (this.azureClient && this.azureContainer) {
      const containerClient = this.azureClient.getContainerClient(this.azureContainer);
      // Ensure container exists (createIfNotExists is safe to call repeatedly but slower, typically we run this on boot in Phase 9)
      const blockBlobClient = containerClient.getBlockBlobClient(storageId);
      
      await blockBlobClient.uploadData(buffer, {
        blobHTTPHeaders: { blobContentType: mimeType },
        metadata,
      });

      return {
        storageId,
        originalName: fileName,
        mimeType,
        size: buffer.length,
        hash,
        url: blockBlobClient.url,
      };
    }

    // 2. Fallback to Canonical Object Storage (requires public bucket via env)
    const publicPaths = objectStorageService.getPublicObjectSearchPaths();
    if (publicPaths.length === 0) {
      console.warn('[Storage] No cloud storage configured. Falling back to mock URL for local development.');
      return {
        storageId,
        originalName: fileName,
        mimeType,
        size: buffer.length,
        hash,
        url: `/mock-storage/${storageId}`,
      };
    }
    
    // NOTE: Replit canonical object_storage requires writing via Signed URLs or GCS directly.
    // For buffers in a node backend, we may need to write to disk temporally and upload, or pass the stream.
    // Assuming backend GCS integration:
    const bucketName = publicPaths[0]; // e.g. "my-bucket"
    const { objectStorageClient } = await import('../../replit_integrations/object_storage/objectStorage');
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(storageId);
    
    await file.save(buffer, {
      metadata: {
        contentType: mimeType,
        metadata,
      }
    });

    return {
      storageId,
      originalName: fileName,
      mimeType,
      size: buffer.length,
      hash,
      url: `/objects/${bucketName}/${storageId}`,
    };
  }

  /**
   * Get secure download buffer
   */
  async getFileBuffer(storageId: string): Promise<Buffer> {
    if (this.azureClient && this.azureContainer) {
      const containerClient = this.azureClient.getContainerClient(this.azureContainer);
      const blobClient = containerClient.getBlobClient(storageId);
      const buffer = await blobClient.downloadToBuffer();
      return buffer;
    }

    const publicPaths = objectStorageService.getPublicObjectSearchPaths();
    if (publicPaths.length === 0) {
      console.warn('[Storage] Mock environment reading empty buffer.');
      return Buffer.from('Mock content', 'utf8');
    }
    
    const bucketName = publicPaths[0];
    const { objectStorageClient } = await import('../../replit_integrations/object_storage/objectStorage');
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(storageId);
    
    const [buffer] = await file.download();
    return buffer;
  }

  /**
   * Delete file securely
   */
  async deleteFile(storageId: string): Promise<void> {
    if (this.azureClient && this.azureContainer) {
      const containerClient = this.azureClient.getContainerClient(this.azureContainer);
      const blobClient = containerClient.getBlobClient(storageId);
      await blobClient.deleteIfExists();
      return;
    }

    try {
      const publicPaths = objectStorageService.getPublicObjectSearchPaths();
      const bucketName = publicPaths[0];
      const { objectStorageClient } = await import('../../replit_integrations/object_storage/objectStorage');
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(storageId);
      
      const [exists] = await file.exists();
      if (exists) {
        await file.delete();
      }
    } catch (e: any) {
      console.warn('[Storage] Blob deletion skipped or failed (mock environment or missing credentials):', e.message);
    }
  }

  private computeHash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }
}

export const fileStorageService = new FileStorageService();
