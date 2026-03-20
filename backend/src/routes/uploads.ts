import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { uploadService } from '../services/UploadService.js';
import { auditService } from '../services/AuditService.js';
import { logger } from '../logging/logger.js';
import {
  uploadMetadataSchema,
  storageUsageQuerySchema,
  UploadMetadata,
} from '../validators/uploadValidators.js';
import { ValidationError } from '../errors/AppError.js';

export async function uploadRoutes(fastify: FastifyInstance) {
  /**
   * POST /uploads/generate-url
   * Generate signed upload URL for direct client upload
   */
  fastify.post(
    '/uploads/generate-url',
    {
      onRequest: [fastify.authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;

      const result = uploadMetadataSchema.safeParse(request.body);
      if (!result.success) {
        throw new ValidationError('Invalid upload metadata', { errors: result.error.errors });
      }

      const { uploadUrl, filePath } = await uploadService.generateUploadUrl(userId, result.data);

      return reply.send({
        success: true,
        data: {
          upload_url: uploadUrl,
          file_path: filePath,
          expires_in: 300, // 5 minutes
        },
      });
    }
  );

  /**
   * POST /uploads/complete
   * Complete upload and create document record
   */
  fastify.post(
    '/uploads/complete',
    {
      onRequest: [fastify.authenticate],
    },
    async (
      request: FastifyRequest<{
        Body: { metadata: UploadMetadata; filePath: string };
      }>,
      reply: FastifyReply
    ) => {
      const userId = request.user!.id;
      const { metadata, filePath } = request.body;

      const metadataResult = uploadMetadataSchema.safeParse(metadata);
      if (!metadataResult.success) {
        throw new ValidationError('Invalid upload metadata', {
          errors: metadataResult.error.errors,
        });
      }

      if (!filePath || typeof filePath !== 'string') {
        throw new ValidationError('Invalid file path');
      }

      const document = await uploadService.completeUpload(userId, metadataResult.data, filePath);

      return reply.code(201).send({
        success: true,
        data: document,
      });
    }
  );

  /**
   * POST /uploads
   * Direct file upload (multipart/form-data)
   */
  fastify.post(
    '/uploads',
    {
      onRequest: [fastify.authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;

      // Get uploaded file from multipart
      const data = await request.file();

      if (!data) {
        throw new ValidationError('No file uploaded');
      }

      const fileBuffer = await data.toBuffer();
      const filename = data.filename;
      const mimeType = data.mimetype;
      const fileSize = fileBuffer.length;

      // Parse metadata from fields
      const metadataFields = data.fields;
      const documentType = (metadataFields.documentType as any)?.value;
      const additionalMetadata = metadataFields.metadata
        ? JSON.parse((metadataFields.metadata as any).value)
        : {};

      const metadata: UploadMetadata = {
        filename,
        mimeType,
        fileSize,
        documentType,
        metadata: additionalMetadata,
      };

      const metadataResult = uploadMetadataSchema.safeParse(metadata);
      if (!metadataResult.success) {
        throw new ValidationError('Invalid upload metadata', {
          errors: metadataResult.error.errors,
        });
      }

      const document = await uploadService.uploadFile(userId, fileBuffer, metadataResult.data);

      return reply.code(201).send({
        success: true,
        data: document,
      });
    }
  );

  /**
   * GET /uploads/storage
   * Get storage usage for current user
   */
  fastify.get(
    '/uploads/storage',
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

      const result = storageUsageQuerySchema.safeParse(request.query);
      if (!result.success) {
        throw new ValidationError('Invalid query parameters', { errors: result.error.errors });
      }

      const usage = await uploadService.getStorageUsage(userId);

      return reply.send({
        success: true,
        data: usage,
      });
    }
  );

  /**
   * DELETE /uploads/:filePath
   * Delete uploaded file (admin only - typically not exposed)
   */
  fastify.delete(
    '/uploads/:filePath',
    {
      onRequest: [fastify.authenticate],
    },
    async (
      request: FastifyRequest<{
        Params: { filePath: string };
      }>,
      reply: FastifyReply
    ) => {
      const userId = request.user!.id;
      const { filePath } = request.params;

      if (!filePath) {
        throw new ValidationError('File path is required');
      }

      // Verify the file path belongs to this user
      if (!filePath.startsWith(userId)) {
        throw new ValidationError('Unauthorized: File does not belong to this user');
      }

      await uploadService.deleteUploadedFile(userId, filePath);

      return reply.send({
        success: true,
        message: 'File deleted successfully',
      });
    }
  );
}
