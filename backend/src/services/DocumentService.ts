import { supabaseServiceRole } from '../supabase/clientServiceRole.js';
import { createUserSupabaseClient } from '../supabase/clientAnon.js';
import { logger } from '../logging/logger.js';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} from '../errors/AppError.js';
import {
  CreateDocumentInput,
  UpdateDocumentInput,
  ListDocumentsQuery,
} from '../validators/documentValidators.js';

export class DocumentService {
  /**
   * Create a new document
   */
  async createDocument(userId: string, input: CreateDocumentInput): Promise<any> {
    const { storage_path, original_filename, file_size, mime_type, document_type, metadata } =
      input;

    // Check user storage quota
    const { data: user } = await supabaseServiceRole
      .from('users')
      .select('storage_used, storage_limit')
      .eq('id', userId)
      .single();

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    if (user.storage_used + file_size > user.storage_limit) {
      throw new ForbiddenError('Storage quota exceeded');
    }

    // Create document record
    const { data, error } = await supabaseServiceRole
      .from('documents')
      .insert({
        user_id: userId,
        storage_path,
        original_filename,
        file_size,
        mime_type,
        document_type: document_type || 'other',
        status: 'pending',
        metadata: metadata || {},
      })
      .select()
      .single();

    if (error || !data) {
      logger.error({ userId, input, error }, 'Failed to create document');
      throw new ValidationError('Failed to create document', { originalError: error });
    }

    logger.info({ userId, documentId: data.id }, 'Document created successfully');

    return data;
  }

  /**
   * Get document by ID
   */
  async getDocumentById(userId: string, documentId: string): Promise<any> {
    const { data, error } = await supabaseServiceRole
      .from('documents')
      .select(
        `
        *,
        classifications (
          id,
          primary_category,
          confidence_score,
          entities,
          sentiment,
          created_at
        )
      `
      )
      .eq('id', documentId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      logger.error({ userId, documentId, error }, 'Document not found');
      throw new NotFoundError('Document', documentId);
    }

    return data;
  }

  /**
   * List documents for a user
   */
  async listDocuments(userId: string, query: ListDocumentsQuery): Promise<{
    documents: any[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page, limit, document_type, status, search, sort_by, sort_order } = query;
    const offset = (page - 1) * limit;

    // Build query
    let queryBuilder = supabaseServiceRole
      .from('documents')
      .select('*, classifications(id, primary_category, confidence_score)', { count: 'exact' })
      .eq('user_id', userId)
      .is('deleted_at', null);

    // Apply filters
    if (document_type) {
      queryBuilder = queryBuilder.eq('document_type', document_type);
    }
    if (status) {
      queryBuilder = queryBuilder.eq('status', status);
    }
    if (search) {
      queryBuilder = queryBuilder.or(
        `original_filename.ilike.%${search}%,metadata->>description.ilike.%${search}%`
      );
    }

    // Apply sorting
    queryBuilder = queryBuilder.order(sort_by, { ascending: sort_order === 'asc' });

    // Apply pagination
    queryBuilder = queryBuilder.range(offset, offset + limit - 1);

    const { data, error, count } = await queryBuilder;

    if (error) {
      logger.error({ userId, query, error }, 'Failed to list documents');
      throw new ValidationError('Failed to list documents', { originalError: error });
    }

    return {
      documents: data || [],
      total: count || 0,
      page,
      limit,
    };
  }

  /**
   * Update document
   */
  async updateDocument(
    userId: string,
    documentId: string,
    updates: UpdateDocumentInput
  ): Promise<any> {
    // Verify ownership
    await this.getDocumentById(userId, documentId);

    const { data, error } = await supabaseServiceRole
      .from('documents')
      .update(updates)
      .eq('id', documentId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !data) {
      logger.error({ userId, documentId, updates, error }, 'Failed to update document');
      throw new ValidationError('Failed to update document', { originalError: error });
    }

    logger.info({ userId, documentId }, 'Document updated successfully');

    return data;
  }

  /**
   * Delete document (soft delete by default)
   */
  async deleteDocument(
    userId: string,
    documentId: string,
    permanent: boolean = false
  ): Promise<void> {
    // Verify ownership
    const document = await this.getDocumentById(userId, documentId);

    if (permanent) {
      // Permanent delete: remove from database and storage
      const { error: deleteError } = await supabaseServiceRole
        .from('documents')
        .delete()
        .eq('id', documentId)
        .eq('user_id', userId);

      if (deleteError) {
        logger.error({ userId, documentId, error: deleteError }, 'Failed to delete document');
        throw new ValidationError('Failed to delete document', { originalError: deleteError });
      }

      // Delete from storage
      if (document.storage_path) {
        const { error: storageError } = await supabaseServiceRole.storage
          .from('documents_raw')
          .remove([document.storage_path]);

        if (storageError) {
          logger.warn(
            { userId, documentId, storagePath: document.storage_path, error: storageError },
            'Failed to delete file from storage'
          );
        }
      }

      logger.info({ userId, documentId }, 'Document permanently deleted');
    } else {
      // Soft delete: set deleted_at timestamp
      const { error } = await supabaseServiceRole
        .from('documents')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', documentId)
        .eq('user_id', userId);

      if (error) {
        logger.error({ userId, documentId, error }, 'Failed to soft delete document');
        throw new ValidationError('Failed to delete document', { originalError: error });
      }

      logger.info({ userId, documentId }, 'Document soft deleted');
    }
  }

  /**
   * Get document versions
   */
  async getDocumentVersions(userId: string, documentId: string): Promise<any[]> {
    // Verify ownership
    await this.getDocumentById(userId, documentId);

    const { data, error } = await supabaseServiceRole
      .from('document_versions')
      .select('*')
      .eq('document_id', documentId)
      .order('version_number', { ascending: false });

    if (error) {
      logger.error({ userId, documentId, error }, 'Failed to fetch document versions');
      throw new ValidationError('Failed to fetch document versions', { originalError: error });
    }

    return data || [];
  }

  /**
   * Create new document version
   */
  async createDocumentVersion(
    userId: string,
    documentId: string,
    versionData: {
      storage_path: string;
      file_size: number;
      mime_type: string;
      checksum: string;
      changes?: string;
    }
  ): Promise<any> {
    // Verify ownership
    await this.getDocumentById(userId, documentId);

    // Get the latest version number
    const { data: latestVersion } = await supabaseServiceRole
      .from('document_versions')
      .select('version_number')
      .eq('document_id', documentId)
      .order('version_number', { ascending: false })
      .limit(1)
      .single();

    const newVersionNumber = latestVersion ? latestVersion.version_number + 1 : 1;

    // Create new version
    const { data, error } = await supabaseServiceRole
      .from('document_versions')
      .insert({
        document_id: documentId,
        version_number: newVersionNumber,
        ...versionData,
      })
      .select()
      .single();

    if (error || !data) {
      logger.error({ userId, documentId, error }, 'Failed to create document version');
      throw new ValidationError('Failed to create document version', { originalError: error });
    }

    logger.info({ userId, documentId, versionNumber: newVersionNumber }, 'Document version created');

    return data;
  }

  /**
   * Get document statistics for user
   */
  async getUserDocumentStats(userId: string): Promise<any> {
    const { data, error } = await supabaseServiceRole
      .from('documents')
      .select('document_type, status')
      .eq('user_id', userId)
      .is('deleted_at', null);

    if (error) {
      logger.error({ userId, error }, 'Failed to fetch document stats');
      throw new ValidationError('Failed to fetch document stats', { originalError: error });
    }

    // Aggregate stats
    const stats = {
      total: data?.length || 0,
      by_type: {} as Record<string, number>,
      by_status: {} as Record<string, number>,
    };

    data?.forEach((doc) => {
      stats.by_type[doc.document_type] = (stats.by_type[doc.document_type] || 0) + 1;
      stats.by_status[doc.status] = (stats.by_status[doc.status] || 0) + 1;
    });

    return stats;
  }
}

export const documentService = new DocumentService();
