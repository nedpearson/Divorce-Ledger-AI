import { randomUUID, createHash } from 'crypto';
import { BlobServiceClient } from '@azure/storage-blob';
import { createLogger } from '../../lib/logger';
import fs from 'fs';
import path from 'path';

const logger = createLogger('FileStorageService');

export interface UploadedFileReference {
  storageId: string;
  originalName: string;
  mimeType: string;
  size: number;
  hash: string;
  url: string;
}

export class FileStorageService {
  private azureClient: BlobServiceClient | null = null;
  private azureContainer: string | null = null;
  private localUploadDir: string;

  constructor() {
    this.localUploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(this.localUploadDir)) {
      fs.mkdirSync(this.localUploadDir, { recursive: true });
    }
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

  async uploadBuffer(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    metadata?: Record<string, string>
  ): Promise<UploadedFileReference> {
    const storageId = randomUUID();
    const hash = this.computeHash(buffer);

    if (this.azureClient && this.azureContainer) {
      const containerClient = this.azureClient.getContainerClient(this.azureContainer);
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

    // Local filesystem fallback
    const ext = path.extname(fileName) || '';
    const localFileName = `${storageId}${ext}`;
    const filePath = path.join(this.localUploadDir, localFileName);
    await fs.promises.writeFile(filePath, buffer);

    return {
      storageId: localFileName, // Store the filename as the storageId so we can find it
      originalName: fileName,
      mimeType,
      size: buffer.length,
      hash,
      url: `/uploads/${localFileName}`,
    };
  }

  async getFileBuffer(storageId: string): Promise<Buffer> {
    if (this.azureClient && this.azureContainer) {
      const containerClient = this.azureClient.getContainerClient(this.azureContainer);
      const blobClient = containerClient.getBlobClient(storageId);
      const buffer = await blobClient.downloadToBuffer();
      return buffer;
    }

    // Local filesystem fallback
    const cleanStorageId = storageId.replace(/^uploads[\\\/]/i, '');
    const filePath = path.join(this.localUploadDir, cleanStorageId);
    try {
      if (fs.existsSync(filePath)) {
         return await fs.promises.readFile(filePath);
      } else {
         console.warn(`[Storage] Local file missing at ${filePath}. Falling back to empty mock.`);
      }
    } catch (err: any) {
      console.warn(`[Storage] Failed to read ${filePath}: ${err.message}`);
    }
    return Buffer.from('Mock content', 'utf8');
  }

  async deleteFile(storageId: string): Promise<void> {
    if (this.azureClient && this.azureContainer) {
      const containerClient = this.azureClient.getContainerClient(this.azureContainer);
      const blobClient = containerClient.getBlobClient(storageId);
      await blobClient.deleteIfExists();
      return;
    }

    // Local filesystem fallback
    const filePath = path.join(this.localUploadDir, storageId);
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch (e: any) {
      console.warn('[Storage] Local file deletion failed:', e.message);
    }
  }

  private computeHash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }
}

export const fileStorageService = new FileStorageService();
