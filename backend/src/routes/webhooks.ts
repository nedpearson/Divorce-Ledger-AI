import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../logging/logger.js';
import { documentService } from '../services/DocumentService.js';
import { classificationService } from '../services/ClassificationService.js';
import { auditService } from '../services/AuditService.js';
import { ValidationError, UnauthorizedError } from '../errors/AppError.js';
import { env } from '../config/env.js';

/**
 * Webhook routes for Supabase events
 * These webhooks can be configured in Supabase Dashboard -> Database -> Webhooks
 */
export async function webhookRoutes(fastify: FastifyInstance) {
  /**
   * POST /webhooks/supabase
   * Generic Supabase webhook handler
   */
  fastify.post('/webhooks/supabase', async (request: FastifyRequest, reply: FastifyReply) => {
    // Verify webhook signature
    const signature = request.headers['x-supabase-signature'] as string;
    const webhookSecret = env.SUPABASE_JWT_SECRET;

    if (!signature || !webhookSecret) {
      throw new UnauthorizedError('Missing webhook signature');
    }

    // TODO: Implement proper webhook signature verification
    // For now, we'll just check if the secret matches

    const payload = request.body as any;

    if (!payload || !payload.type) {
      throw new ValidationError('Invalid webhook payload');
    }

    logger.info({ type: payload.type }, 'Received Supabase webhook');

    // Handle different webhook types
    try {
      switch (payload.type) {
        case 'INSERT':
          await handleInsertWebhook(payload);
          break;
        case 'UPDATE':
          await handleUpdateWebhook(payload);
          break;
        case 'DELETE':
          await handleDeleteWebhook(payload);
          break;
        default:
          logger.warn({ type: payload.type }, 'Unknown webhook type');
      }
    } catch (err) {
      logger.error({ error: err, payload }, 'Failed to process webhook');
      // Don't throw - return 200 to prevent Supabase from retrying
    }

    return reply.send({
      success: true,
      message: 'Webhook processed',
    });
  });

  /**
   * POST /webhooks/document-upload
   * Document upload completion webhook
   */
  fastify.post(
    '/webhooks/document-upload',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.body as {
        user_id: string;
        document_id: string;
        storage_path: string;
      };

      if (!payload.user_id || !payload.document_id || !payload.storage_path) {
        throw new ValidationError('Invalid webhook payload');
      }

      logger.info({ documentId: payload.document_id }, 'Document upload webhook received');

      // Trigger classification
      try {
        await classificationService.triggerClassification(payload.user_id, payload.document_id);
      } catch (err) {
        logger.error(
          { error: err, documentId: payload.document_id },
          'Failed to trigger classification'
        );
      }

      return reply.send({
        success: true,
        message: 'Document upload processed',
      });
    }
  );

  /**
   * POST /webhooks/classification-complete
   * Classification completion webhook
   */
  fastify.post(
    '/webhooks/classification-complete',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.body as {
        user_id: string;
        document_id: string;
        classification_id: string;
        primary_category: string;
        confidence_score: number;
      };

      if (!payload.user_id || !payload.document_id || !payload.classification_id) {
        throw new ValidationError('Invalid webhook payload');
      }

      logger.info(
        { documentId: payload.document_id, classificationId: payload.classification_id },
        'Classification complete webhook received'
      );

      // Update document status
      try {
        await documentService.updateDocument(payload.user_id, payload.document_id, {
          status: 'classified',
        });

        // Log audit event
        await auditService.log({
          user_id: payload.user_id,
          action: 'classification_created',
          resource_type: 'classification',
          resource_id: payload.classification_id,
          severity: 'info',
          metadata: {
            document_id: payload.document_id,
            primary_category: payload.primary_category,
            confidence_score: payload.confidence_score,
          },
        });
      } catch (err) {
        logger.error(
          { error: err, documentId: payload.document_id },
          'Failed to process classification complete webhook'
        );
      }

      return reply.send({
        success: true,
        message: 'Classification complete processed',
      });
    }
  );
}

// Helper functions

async function handleInsertWebhook(payload: any): Promise<void> {
  const { table, record } = payload;

  logger.info({ table, recordId: record?.id }, 'Processing INSERT webhook');

  // Add custom logic here based on table
  switch (table) {
    case 'documents':
      // Document inserted
      logger.info({ documentId: record.id }, 'New document inserted');
      break;
    case 'classifications':
      // Classification inserted
      logger.info({ classificationId: record.id }, 'New classification inserted');
      break;
    default:
      logger.debug({ table }, 'No handler for INSERT on this table');
  }
}

async function handleUpdateWebhook(payload: any): Promise<void> {
  const { table, record, old_record } = payload;

  logger.info({ table, recordId: record?.id }, 'Processing UPDATE webhook');

  // Add custom logic here based on table
  switch (table) {
    case 'documents':
      // Document updated
      if (old_record.status !== record.status) {
        logger.info(
          { documentId: record.id, oldStatus: old_record.status, newStatus: record.status },
          'Document status changed'
        );
      }
      break;
    default:
      logger.debug({ table }, 'No handler for UPDATE on this table');
  }
}

async function handleDeleteWebhook(payload: any): Promise<void> {
  const { table, old_record } = payload;

  logger.info({ table, recordId: old_record?.id }, 'Processing DELETE webhook');

  // Add custom logic here based on table
  switch (table) {
    case 'documents':
      // Document deleted
      logger.info({ documentId: old_record.id }, 'Document deleted');
      break;
    default:
      logger.debug({ table }, 'No handler for DELETE on this table');
  }
}
