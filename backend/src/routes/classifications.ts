import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { classificationService } from '../services/ClassificationService.js';
import { logger } from '../logging/logger.js';
import { ValidationError } from '../errors/AppError.js';

export async function classificationRoutes(fastify: FastifyInstance) {
  /**
   * GET /classifications
   * List classifications for current user
   */
  fastify.get('/classifications', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest<{
    Querystring: { limit?: string; offset?: string };
  }>, reply: FastifyReply) => {
    const userId = request.user!.id;
    const limit = request.query.limit ? parseInt(request.query.limit) : 20;
    const offset = request.query.offset ? parseInt(request.query.offset) : 0;

    if (isNaN(limit) || limit < 1 || limit > 100) {
      throw new ValidationError('Limit must be between 1 and 100');
    }

    if (isNaN(offset) || offset < 0) {
      throw new ValidationError('Offset must be non-negative');
    }

    const classifications = await classificationService.listUserClassifications(userId, {
      limit,
      offset,
    });

    return reply.send({
      success: true,
      data: classifications,
      pagination: {
        limit,
        offset,
        count: classifications.length,
      },
    });
  });

  /**
   * GET /classifications/document/:documentId
   * Get classification for a specific document
   */
  fastify.get('/classifications/document/:documentId', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest<{
    Params: { documentId: string };
  }>, reply: FastifyReply) => {
    const userId = request.user!.id;
    const { documentId } = request.params;

    if (!documentId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId)) {
      throw new ValidationError('Invalid document ID');
    }

    const classification = await classificationService.getDocumentClassification(userId, documentId);

    return reply.send({
      success: true,
      data: classification,
    });
  });

  /**
   * GET /classifications/stats
   * Get classification statistics for current user
   */
  fastify.get('/classifications/stats', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.id;

    const stats = await classificationService.getUserClassificationStats(userId);

    return reply.send({
      success: true,
      data: stats,
    });
  });

  /**
   * GET /classifications/search
   * Search classifications by text
   */
  fastify.get('/classifications/search', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest<{
    Querystring: { q?: string; limit?: string; offset?: string };
  }>, reply: FastifyReply) => {
    const userId = request.user!.id;
    const searchText = request.query.q || '';
    const limit = request.query.limit ? parseInt(request.query.limit) : 20;
    const offset = request.query.offset ? parseInt(request.query.offset) : 0;

    if (!searchText) {
      throw new ValidationError('Search query is required');
    }

    if (isNaN(limit) || limit < 1 || limit > 100) {
      throw new ValidationError('Limit must be between 1 and 100');
    }

    if (isNaN(offset) || offset < 0) {
      throw new ValidationError('Offset must be non-negative');
    }

    const results = await classificationService.searchClassifications(userId, searchText, {
      limit,
      offset,
    });

    return reply.send({
      success: true,
      data: results,
      pagination: {
        limit,
        offset,
        count: results.length,
      },
    });
  });
}
