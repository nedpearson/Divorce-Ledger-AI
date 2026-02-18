import {
  databases,
  storage,
  DATABASE_ID,
  STORAGE_BUCKET_ID,
  COLLECTIONS,
  FILE_STATUS,
  ID,
  Query,
  Permission,
  Role,
  initializeAppwrite,
  type FileStatus
} from './client';
import crypto from 'crypto';

export const ALLOWED_TRANSITIONS: Record<FileStatus, FileStatus[]> = {
  [FILE_STATUS.UPLOADED]: [FILE_STATUS.QUEUED, FILE_STATUS.EXTRACTING, FILE_STATUS.ERROR],
  [FILE_STATUS.QUEUED]: [FILE_STATUS.EXTRACTING, FILE_STATUS.ERROR],
  [FILE_STATUS.EXTRACTING]: [FILE_STATUS.ANALYZING, FILE_STATUS.ERROR],
  [FILE_STATUS.ANALYZING]: [FILE_STATUS.SUGGESTED, FILE_STATUS.FINALIZED, FILE_STATUS.ERROR],
  [FILE_STATUS.SUGGESTED]: [FILE_STATUS.FINALIZED, FILE_STATUS.AWAITING_USER, FILE_STATUS.ANALYZING, FILE_STATUS.ERROR],
  [FILE_STATUS.AWAITING_USER]: [FILE_STATUS.FINALIZED, FILE_STATUS.ANALYZING, FILE_STATUS.ERROR],
  [FILE_STATUS.FINALIZED]: [],
  [FILE_STATUS.ERROR]: [FILE_STATUS.UPLOADED, FILE_STATUS.QUEUED],
};

export class InvalidTransitionError extends Error {
  constructor(
    public readonly fromStatus: FileStatus,
    public readonly toStatus: FileStatus
  ) {
    super(`Invalid state transition: ${fromStatus} → ${toStatus}`);
    this.name = 'InvalidTransitionError';
  }
}

export function isValidTransition(from: FileStatus, to: FileStatus): boolean {
  const allowed = ALLOWED_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

import { InputFile } from 'node-appwrite/file';
import { emitFileStatusChange, createStatusChangeEvent } from './realtimeService';

export interface AppwriteFile {
  $id: string;
  userId: string;
  storageFileId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileHash: string;
  status: FileStatus;
  category?: string;
  suggestedCategory?: string;
  latestAnalysisRunId?: string;
  extractedText?: string;
  extractedFields?: string;
  aiSummary?: string;
  aiConfidence?: number;
  isConfidential?: boolean;
  title?: string;
  description?: string;
  errorMessage?: string;
  retryCount?: number;
  analyzedAt?: string;
  finalizedCategory?: string;
  finalizedFields?: string;
  finalizedBy?: string;
  finalizedAt?: string;
  finalizedFromAnalysisRunId?: string;
  $createdAt: string;
  $updatedAt: string;
}

export interface CreateFileInput {
  userId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  storageFileId: string;
  title?: string;
  description?: string;
  isConfidential?: boolean;
  category?: string;
}

export interface UpdateFileInput {
  status?: FileStatus;
  category?: string;
  suggestedCategory?: string;
  latestAnalysisRunId?: string;
  extractedText?: string;
  extractedFields?: string;
  aiSummary?: string;
  aiConfidence?: number;
  errorMessage?: string;
  retryCount?: number;
  analyzedAt?: string;
  finalizedCategory?: string;
  finalizedFields?: string;
  finalizedBy?: string;
  finalizedAt?: string;
  finalizedFromAnalysisRunId?: string;
}

export async function uploadFile(
  userId: string,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  options?: {
    title?: string;
    description?: string;
    isConfidential?: boolean;
    category?: string;
  }
): Promise<AppwriteFile> {
  initializeAppwrite();

  const fileHash = computeFileHash(fileBuffer);
  
  const storageFile = await storage.createFile(
    STORAGE_BUCKET_ID,
    ID.unique(),
    InputFile.fromBuffer(fileBuffer, fileName),
    [
      Permission.read(Role.user(userId)),
      Permission.update(Role.user(userId)),
      Permission.delete(Role.user(userId)),
    ]
  );

  const fileDoc = await databases.createDocument(
    DATABASE_ID,
    COLLECTIONS.FILES,
    ID.unique(),
    {
      userId,
      storageFileId: storageFile.$id,
      fileName,
      fileType: mimeType,
      fileSize: fileBuffer.length,
      fileHash,
      status: FILE_STATUS.UPLOADED,
      title: options?.title || fileName,
      description: options?.description || null,
      isConfidential: options?.isConfidential || false,
      category: options?.category || null,
      retryCount: 0,
    },
    [
      Permission.read(Role.user(userId)),
      Permission.update(Role.user(userId)),
      Permission.delete(Role.user(userId)),
    ]
  );

  return fileDoc as unknown as AppwriteFile;
}

export async function getFile(fileId: string): Promise<AppwriteFile | null> {
  initializeAppwrite();
  try {
    const doc = await databases.getDocument(DATABASE_ID, COLLECTIONS.FILES, fileId);
    return doc as unknown as AppwriteFile;
  } catch {
    return null;
  }
}

export async function listFiles(
  userId: string,
  options?: {
    status?: FileStatus;
    category?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ files: AppwriteFile[]; total: number }> {
  initializeAppwrite();

  const queries: string[] = [Query.equal('userId', userId)];

  if (options?.status) {
    queries.push(Query.equal('status', options.status));
  }
  if (options?.category) {
    queries.push(Query.equal('category', options.category));
  }

  queries.push(Query.orderDesc('$createdAt'));
  queries.push(Query.limit(options?.limit || 25));
  queries.push(Query.offset(options?.offset || 0));

  const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.FILES, queries);

  return {
    files: result.documents as unknown as AppwriteFile[],
    total: result.total,
  };
}

export async function updateFile(fileId: string, data: UpdateFileInput): Promise<AppwriteFile> {
  initializeAppwrite();
  const doc = await databases.updateDocument(DATABASE_ID, COLLECTIONS.FILES, fileId, data);
  return doc as unknown as AppwriteFile;
}

export async function deleteFile(fileId: string): Promise<{ success: boolean; error?: string }> {
  initializeAppwrite();
  const file = await getFile(fileId);
  
  if (!file) {
    return { success: true }; // Already deleted or doesn't exist
  }

  // Step 1: Delete from Appwrite Storage FIRST
  // Storage deletion must succeed before we delete the DB record to prevent orphaned files
  try {
    await storage.deleteFile(STORAGE_BUCKET_ID, file.storageFileId);
    console.log(`[Appwrite] Storage file deleted: ${file.storageFileId}`);
  } catch (storageError: any) {
    // Check if it's a 404 (file already gone) - that's acceptable
    if (storageError?.code === 404 || storageError?.message?.includes('not found')) {
      console.log(`[Appwrite] Storage file already deleted: ${file.storageFileId}`);
    } else {
      // Storage deletion failed - do NOT delete DB record to avoid orphaning data
      const errorMsg = storageError instanceof Error ? storageError.message : String(storageError);
      console.error(`[Appwrite] Failed to delete storage file ${file.storageFileId}: ${errorMsg}`);
      return { 
        success: false, 
        error: `Failed to delete file from storage: ${errorMsg}. Database record preserved to prevent orphaned data.` 
      };
    }
  }

  // Step 2: Delete from Appwrite Database only after storage is confirmed deleted
  try {
    await databases.deleteDocument(DATABASE_ID, COLLECTIONS.FILES, fileId);
    console.log(`[Appwrite] Database record deleted: ${fileId}`);
    return { success: true };
  } catch (dbError: any) {
    const errorMsg = dbError instanceof Error ? dbError.message : String(dbError);
    console.error(`[Appwrite] Failed to delete database record ${fileId}: ${errorMsg}`);
    // Storage was deleted but DB wasn't - log for manual cleanup
    console.error(`[Appwrite] ORPHAN WARNING: Storage file ${file.storageFileId} was deleted but DB record ${fileId} remains`);
    return { 
      success: false, 
      error: `Storage deleted but database record deletion failed: ${errorMsg}` 
    };
  }
}

export async function getFileBuffer(storageFileId: string): Promise<Buffer> {
  initializeAppwrite();
  const result = await storage.getFileDownload(STORAGE_BUCKET_ID, storageFileId);
  return Buffer.from(result);
}

export async function getFileUrl(storageFileId: string): Promise<string> {
  initializeAppwrite();
  const result = await storage.getFileView(STORAGE_BUCKET_ID, storageFileId);
  return result.toString();
}

export async function getQueuedFiles(limit: number = 10): Promise<AppwriteFile[]> {
  initializeAppwrite();

  const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.FILES, [
    Query.equal('status', FILE_STATUS.UPLOADED),
    Query.orderAsc('$createdAt'),
    Query.limit(limit),
  ]);

  return result.documents as unknown as AppwriteFile[];
}

export async function transitionFileStatus(
  fileId: string,
  fromStatus: FileStatus,
  toStatus: FileStatus,
  additionalData?: Partial<UpdateFileInput>,
  options?: { skipValidation?: boolean }
): Promise<AppwriteFile | null> {
  initializeAppwrite();

  if (!options?.skipValidation && !isValidTransition(fromStatus, toStatus)) {
    throw new InvalidTransitionError(fromStatus, toStatus);
  }

  const file = await getFile(fileId);
  if (!file || file.status !== fromStatus) {
    return null;
  }

  const updateData: UpdateFileInput = {
    status: toStatus,
    ...additionalData,
  };

  const updatedFile = await updateFile(fileId, updateData);
  
  emitFileStatusChange(createStatusChangeEvent(
    fileId,
    file.userId,
    fromStatus,
    toStatus,
    {
      analysisRunId: additionalData?.latestAnalysisRunId,
      confidence: additionalData?.aiConfidence,
    }
  ));

  return updatedFile;
}

export function computeInputHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function computeFileHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
