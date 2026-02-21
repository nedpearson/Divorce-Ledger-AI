import { supabaseServiceRole } from '../supabase/clientServiceRole.js';
import { logger } from '../logging/logger.js';
import { ValidationError, ForbiddenError } from '../errors/AppError.js';
import { documentService } from './DocumentService.js';
import { classificationService } from './ClassificationService.js';
import { auditService } from './AuditService.js';
import { UploadMetadata, validateFileTypeAndSize } from '../validators/uploadValidators.js';

export class UploadService {
  /**
   * Generate signed upload URL for direct client upload
   */
  async generateUploadUrl(
    userId: string,
    metadata: UploadMetadata
  ): Promise<{ uploadUrl: string; filePath: string }> {
    const { filename, mimeType, fileSize, documentType } = metadata;

    // Validate file type and size
    const validation = validateFileTypeAndSize(mimeType, fileSize);
    if (!validation.valid) {
      throw new ValidationError(validation.error!);
    }

    // Check user storage quota
    const { data: user } = await supabaseServiceRole
      .from('users')
      .select('storage_used, storage_limit')
      .eq('id', userId)
      .single();

    if (!user) {
      throw new ValidationError('User not found');
    }

    if (user.storage_used + fileSize > user.storage_limit) {
      throw new ForbiddenError('Storage quota exceeded');
    }

    // Generate unique file path: {user_id}/{document_id}/{filename}
    const documentId = crypto.randomUUID();
    const sanitizedFilename = this.sanitizeFilename(filename);
    const filePath = `${userId}/${documentId}/${sanitizedFilename}`;

    // Create signed upload URL (valid for 5 minutes)
    const { data, error } = await supabaseServiceRole.storage
      .from('documents_raw')
      .createSignedUploadUrl(filePath);

    if (error || !data) {
      logger.error({ userId, filePath, error }, 'Failed to generate upload URL');
      throw new ValidationError('Failed to generate upload URL', { originalError: error });
    }

    logger.info({ userId, filePath, documentId }, 'Upload URL generated');

    return {
      uploadUrl: data.signedUrl,
      filePath,
    };
  }

  /**
   * Complete upload and create document record
   */
  async completeUpload(userId: string, metadata: UploadMetadata, filePath: string): Promise<any> {
    const { filename, mimeType, fileSize, documentType, metadata: additionalMetadata } = metadata;

    // Verify file exists in storage
    const { data: fileData, error: fileError } = await supabaseServiceRole.storage
      .from('documents_raw')
      .list(filePath.split('/').slice(0, -1).join('/'));

    if (fileError || !fileData || fileData.length === 0) {
      logger.error({ userId, filePath, error: fileError }, 'File not found in storage after upload');
      throw new ValidationError('File not found in storage');
    }

    // Create document record
    const document = await documentService.createDocument(userId, {
      storage_path: filePath,
      original_filename: filename,
      file_size: fileSize,
      mime_type: mimeType,
      document_type: documentType,
      metadata: additionalMetadata,
    });

    // Create classification job
    await classificationService.createClassificationJob(userId, document.id);

    // Create thumbnail job if image or PDF
    if (mimeType.startsWith('image/') || mimeType === 'application/pdf') {
      await this.createThumbnailJob(userId, document.id);
    }

    // Log audit event
    await auditService.log({
      user_id: userId,
      action: 'document_uploaded',
      resource_type: 'document',
      resource_id: document.id,
      severity: 'info',
      metadata: {
        filename,
        file_size: fileSize,
        mime_type: mimeType,
      },
    });

    logger.info({ userId, documentId: document.id }, 'Upload completed successfully');

    return document;
  }

  /**
   * Upload file directly from server (alternative to signed URL)
   */
  async uploadFile(
    userId: string,
    file: Buffer,
    metadata: UploadMetadata
  ): Promise<any> {
    const { filename, mimeType, fileSize, documentType } = metadata;

    // Validate file type and size
    const validation = validateFileTypeAndSize(mimeType, fileSize);
    if (!validation.valid) {
      throw new ValidationError(validation.error!);
    }

    // Check user storage quota
    const { data: user } = await supabaseServiceRole
      .from('users')
      .select('storage_used, storage_limit')
      .eq('id', userId)
      .single();

    if (!user) {
      throw new ValidationError('User not found');
    }

    if (user.storage_used + fileSize > user.storage_limit) {
      throw new ForbiddenError('Storage quota exceeded');
    }

    // Generate unique file path
    const documentId = crypto.randomUUID();
    const sanitizedFilename = this.sanitizeFilename(filename);
    const filePath = `${userId}/${documentId}/${sanitizedFilename}`;

    // Upload file to storage
    const { data, error } = await supabaseServiceRole.storage
      .from('documents_raw')
      .upload(filePath, file, {
        contentType: mimeType,
        upsert: false,
      });

    if (error || !data) {
      logger.error({ userId, filePath, error }, 'Failed to upload file');
      throw new ValidationError('Failed to upload file', { originalError: error });
    }

    // Complete upload (create document, jobs, audit log)
    return await this.completeUpload(userId, metadata, filePath);
  }

  /**
   * Get user storage usage
   */
  async getStorageUsage(userId: string): Promise<{
    used: number;
    limit: number;
    percentage: number;
    by_bucket: Record<string, number>;
  }> {
    const { data: user } = await supabaseServiceRole
      .from('users')
      .select('storage_used, storage_limit')
      .eq('id', userId)
      .single();

    if (!user) {
      throw new ValidationError('User not found');
    }

    // Get detailed usage by bucket
    const { data: usage } = await supabaseServiceRole.rpc('get_user_storage_usage', {
      target_user_id: userId,
    });

    const byBucket: Record<string, number> = {};
    if (usage && Array.isArray(usage)) {
      usage.forEach((row: any) => {
        byBucket[row.bucket] = row.total_size;
      });
    }

    return {
      used: user.storage_used,
      limit: user.storage_limit,
      percentage: (user.storage_used / user.storage_limit) * 100,
      by_bucket: byBucket,
    };
  }

  /**
   * Create thumbnail generation job
   */
  private async createThumbnailJob(userId: string, documentId: string): Promise<any> {
    const { data, error } = await supabaseServiceRole
      .from('jobs')
      .insert({
        user_id: userId,
        job_type: 'thumbnail',
        status: 'queued',
        priority: 7,
        input_data: { document_id: documentId },
      })
      .select()
      .single();

    if (error || !data) {
      logger.error({ userId, documentId, error }, 'Failed to create thumbnail job');
      // Don't throw - thumbnail generation is non-critical
      return null;
    }

    logger.info({ userId, documentId, jobId: data.id }, 'Thumbnail job created');

    return data;
  }

  /**
   * Sanitize filename for storage
   */
  private sanitizeFilename(filename: string): string {
    // Remove special characters, keep alphanumeric, dash, underscore, dot
    return filename
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .toLowerCase()
      .substring(0, 255);
  }

  /**
   * Delete uploaded file from storage
   */
  async deleteUploadedFile(userId: string, filePath: string): Promise<void> {
    const { error } = await supabaseServiceRole.storage.from('documents_raw').remove([filePath]);

    if (error) {
      logger.error({ userId, filePath, error }, 'Failed to delete uploaded file');
      throw new ValidationError('Failed to delete uploaded file', { originalError: error });
    }

    logger.info({ userId, filePath }, 'Uploaded file deleted');
  }
}

export const uploadService = new UploadService();
