import { supabaseServiceRole } from '../supabase/clientServiceRole.js';
import { logger } from '../logging/logger.js';
import { NotFoundError, ValidationError } from '../errors/AppError.js';
import { documentService } from './DocumentService.js';

export class ClassificationService {
  /**
   * Create a classification job for a document
   */
  async createClassificationJob(
    userId: string,
    documentId: string,
    priority: number = 5
  ): Promise<any> {
    // Verify document exists and user owns it
    await documentService.getDocumentById(userId, documentId);

    // Create job
    const { data, error } = await supabaseServiceRole
      .from('jobs')
      .insert({
        user_id: userId,
        job_type: 'classification',
        status: 'queued',
        priority,
        input_data: { document_id: documentId },
      })
      .select()
      .single();

    if (error || !data) {
      logger.error({ userId, documentId, error }, 'Failed to create classification job');
      throw new ValidationError('Failed to create classification job', { originalError: error });
    }

    logger.info({ userId, documentId, jobId: data.id }, 'Classification job created');

    return data;
  }

  /**
   * Get classification for a document
   */
  async getDocumentClassification(userId: string, documentId: string): Promise<any> {
    // Verify document exists and user owns it
    await documentService.getDocumentById(userId, documentId);

    const { data, error } = await supabaseServiceRole
      .from('classifications')
      .select('*')
      .eq('document_id', documentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      logger.error({ userId, documentId, error }, 'Classification not found');
      throw new NotFoundError('Classification', documentId);
    }

    return data;
  }

  /**
   * List all classifications for a user
   */
  async listUserClassifications(
    userId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<any[]> {
    const { limit = 20, offset = 0 } = options;

    const { data, error } = await supabaseServiceRole
      .from('classifications')
      .select(
        `
        *,
        documents (
          id,
          original_filename,
          document_type
        )
      `
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error({ userId, error }, 'Failed to list classifications');
      throw new ValidationError('Failed to list classifications', { originalError: error });
    }

    return data || [];
  }

  /**
   * Update classification (typically called by worker)
   */
  async updateClassification(classificationId: string, updates: Record<string, any>): Promise<any> {
    const { data, error } = await supabaseServiceRole
      .from('classifications')
      .update(updates)
      .eq('id', classificationId)
      .select()
      .single();

    if (error || !data) {
      logger.error({ classificationId, updates, error }, 'Failed to update classification');
      throw new ValidationError('Failed to update classification', { originalError: error });
    }

    logger.info({ classificationId }, 'Classification updated');

    return data;
  }

  /**
   * Trigger classification for a document (calls Supabase Edge Function)
   */
  async triggerClassification(userId: string, documentId: string): Promise<void> {
    // Verify document exists and user owns it
    await documentService.getDocumentById(userId, documentId);

    try {
      // Update document status to processing
      await documentService.updateDocument(userId, documentId, { status: 'processing' });

      // Invoke Supabase Edge Function
      const { data, error } = await supabaseServiceRole.functions.invoke('classify-document', {
        body: { document_id: documentId },
      });

      if (error) {
        logger.error({ userId, documentId, error }, 'Failed to trigger classification function');
        throw new ValidationError('Failed to trigger classification', { originalError: error });
      }

      logger.info({ userId, documentId }, 'Classification triggered successfully');
    } catch (err) {
      // Mark document as failed
      await documentService.updateDocument(userId, documentId, { status: 'failed' });
      throw err;
    }
  }

  /**
   * Get classification statistics for a user
   */
  async getUserClassificationStats(userId: string): Promise<any> {
    const { data, error } = await supabaseServiceRole
      .from('classifications')
      .select('primary_category, confidence_score')
      .eq('user_id', userId);

    if (error) {
      logger.error({ userId, error }, 'Failed to fetch classification stats');
      throw new ValidationError('Failed to fetch classification stats', { originalError: error });
    }

    // Aggregate stats
    const stats = {
      total: data?.length || 0,
      by_category: {} as Record<string, number>,
      avg_confidence: 0,
      high_confidence: 0, // > 0.8
      medium_confidence: 0, // 0.5 - 0.8
      low_confidence: 0, // < 0.5
    };

    let totalConfidence = 0;

    data?.forEach((classification) => {
      // Count by category
      stats.by_category[classification.primary_category] =
        (stats.by_category[classification.primary_category] || 0) + 1;

      // Count by confidence
      const conf = classification.confidence_score;
      if (conf >= 0.8) stats.high_confidence++;
      else if (conf >= 0.5) stats.medium_confidence++;
      else stats.low_confidence++;

      totalConfidence += conf;
    });

    stats.avg_confidence = stats.total > 0 ? totalConfidence / stats.total : 0;

    return stats;
  }

  /**
   * Search classifications by text
   */
  async searchClassifications(
    userId: string,
    searchText: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<any[]> {
    const { limit = 20, offset = 0 } = options;

    const { data, error } = await supabaseServiceRole
      .from('classifications')
      .select(
        `
        *,
        documents (
          id,
          original_filename,
          document_type
        )
      `
      )
      .eq('user_id', userId)
      .or(`summary.ilike.%${searchText}%,entities.cs.{"${searchText}"}`)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error({ userId, searchText, error }, 'Failed to search classifications');
      throw new ValidationError('Failed to search classifications', { originalError: error });
    }

    return data || [];
  }
}

export const classificationService = new ClassificationService();
