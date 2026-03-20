import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { documentService } from '../services/DocumentService.js';
import { classificationService } from '../services/ClassificationService.js';
import { auditService } from '../services/AuditService.js';
import { logger } from '../logging/logger.js';
import {
  createDocumentSchema,
  updateDocumentSchema,
  listDocumentsQuerySchema,
  documentIdParamSchema,
  classifyDocumentSchema,
  deleteDocumentSchema,
  CreateDocumentInput,
  UpdateDocumentInput,
  ListDocumentsQuery,
} from '../validators/documentValidators.js';
import { ValidationError } from '../errors/AppError.js';

export async function documentRoutes(fastify: FastifyInstance) {
  /**
   * GET /documents
   * List documents for current user
   */
  fastify.get(
    '/documents',
    {
      onRequest: [fastify.authenticate],
    },
    async (
      request: FastifyRequest<{
        Querystring: any;
      }>,
      reply: FastifyReply
    ) => {
      const userId = request.user!.id;

      const result = listDocumentsQuerySchema.safeParse(request.query);
      if (!result.success) {
        throw new ValidationError('Invalid query parameters', { errors: result.error.errors });
      }

      const response = await documentService.listDocuments(userId, result.data);

      return reply.send({
        success: true,
        data: response.documents,
        pagination: {
          total: response.total,
          page: response.page,
          limit: response.limit,
          total_pages: Math.ceil(response.total / response.limit),
        },
      });
    }
  );

  /**
   * GET /documents/:id
   * Get document by ID
   */
  fastify.get(
    '/documents/:id',
    {
      onRequest: [fastify.authenticate],
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply
    ) => {
      const userId = request.user!.id;
      const { id } = request.params;

      const paramResult = documentIdParamSchema.safeParse({ id });
      if (!paramResult.success) {
        throw new ValidationError('Invalid document ID', { errors: paramResult.error.errors });
      }

      const document = await documentService.getDocumentById(userId, id);

      // Log audit event
      await auditService.logDocumentAction(userId, id, 'document_viewed');

      return reply.send({
        success: true,
        data: document,
      });
    }
  );

  /**
   * POST /documents
   * Create a new document (internal use - typically called by upload service)
   */
  fastify.post(
    '/documents',
    {
      onRequest: [fastify.authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;

      const result = createDocumentSchema.safeParse(request.body);
      if (!result.success) {
        throw new ValidationError('Invalid document data', { errors: result.error.errors });
      }

      const document = await documentService.createDocument(userId, result.data);

      return reply.code(201).send({
        success: true,
        data: document,
      });
    }
  );

  /**
   * PATCH /documents/:id
   * Update document
   */
  fastify.patch(
    '/documents/:id',
    {
      onRequest: [fastify.authenticate],
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply
    ) => {
      const userId = request.user!.id;
      const { id } = request.params;

      const paramResult = documentIdParamSchema.safeParse({ id });
      if (!paramResult.success) {
        throw new ValidationError('Invalid document ID', { errors: paramResult.error.errors });
      }

      const result = updateDocumentSchema.safeParse(request.body);
      if (!result.success) {
        throw new ValidationError('Invalid update data', { errors: result.error.errors });
      }

      const document = await documentService.updateDocument(userId, id, result.data);

      // Log audit event
      await auditService.logDocumentAction(userId, id, 'document_updated', result.data);

      return reply.send({
        success: true,
        data: document,
      });
    }
  );

  /**
   * DELETE /documents/:id
   * Delete document (soft delete by default)
   */
  fastify.delete(
    '/documents/:id',
    {
      onRequest: [fastify.authenticate],
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { permanent?: string };
      }>,
      reply: FastifyReply
    ) => {
      const userId = request.user!.id;
      const { id } = request.params;
      const permanent = request.query.permanent === 'true';

      const paramResult = documentIdParamSchema.safeParse({ id });
      if (!paramResult.success) {
        throw new ValidationError('Invalid document ID', { errors: paramResult.error.errors });
      }

      await documentService.deleteDocument(userId, id, permanent);

      // Log audit event
      await auditService.logDocumentAction(userId, id, 'document_deleted', { permanent });

      return reply.send({
        success: true,
        message: permanent ? 'Document permanently deleted' : 'Document deleted',
      });
    }
  );

  /**
   * POST /documents/:id/classify
   * Trigger classification for a document
   */
  fastify.post(
    '/documents/:id/classify',
    {
      onRequest: [fastify.authenticate],
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply
    ) => {
      const userId = request.user!.id;
      const { id } = request.params;

      const paramResult = documentIdParamSchema.safeParse({ id });
      if (!paramResult.success) {
        throw new ValidationError('Invalid document ID', { errors: paramResult.error.errors });
      }

      const bodyResult = classifyDocumentSchema.safeParse(request.body || {});
      if (!bodyResult.success) {
        throw new ValidationError('Invalid classification options', {
          errors: bodyResult.error.errors,
        });
      }

      await classificationService.triggerClassification(userId, id);

      return reply.send({
        success: true,
        message: 'Classification triggered',
      });
    }
  );

  /**
   * GET /documents/:id/versions
   * Get document version history
   */
  fastify.get(
    '/documents/:id/versions',
    {
      onRequest: [fastify.authenticate],
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply
    ) => {
      const userId = request.user!.id;
      const { id } = request.params;

      const paramResult = documentIdParamSchema.safeParse({ id });
      if (!paramResult.success) {
        throw new ValidationError('Invalid document ID', { errors: paramResult.error.errors });
      }

      const versions = await documentService.getDocumentVersions(userId, id);

      return reply.send({
        success: true,
        data: versions,
      });
    }
  );

  /**
   * GET /documents/stats
   * Get document statistics for current user
   */
  fastify.get(
    '/documents/stats',
    {
      onRequest: [fastify.authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;

      const stats = await documentService.getUserDocumentStats(userId);

      return reply.send({
        success: true,
        data: stats,
      });
    }
  );
}
