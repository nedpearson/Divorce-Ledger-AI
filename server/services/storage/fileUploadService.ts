import { fileStorageService } from './fileStorageService';
import { documentRepository, DocumentMetadata } from './documentRepository';

export interface FileUploadParams {
  userId: string;
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  size: number;
  title?: string;
  description?: string;
  category?: string;
  isConfidential?: boolean;
}

/**
 * FileUploadService
 * 
 * Replaces the remote cloud \`uploadFile()\` flow.
 * 1. Takes the Buffer and saves it via FileStorageService (Azure/GCP).
 * 2. Takes the layout references and inserts a row via DocumentRepository (Postgres).
 */
export class FileUploadService {
  
  async handleUpload(params: FileUploadParams): Promise<DocumentMetadata> {
    
    // 1. Persist the raw file binary securely
    const storageRef = await fileStorageService.uploadBuffer(
      params.buffer,
      params.originalName,
      params.mimeType,
      {
        userId: params.userId,
        title: params.title || '',
        category: params.category || ''
      }
    );

    // 2. Persist the metadata correctly to the DB
    const docMeta = await documentRepository.createDocumentMetadata({
      userId: params.userId,
      storageFileId: storageRef.storageId,
      fileName: params.originalName,
      fileType: params.mimeType,
      fileSize: params.size,
      fileHash: storageRef.hash,
      status: 'uploaded',
      category: params.category,
      title: params.title,
      description: params.description
    });

    return docMeta;
  }
}

export const fileUploadService = new FileUploadService();
