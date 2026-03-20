import { z } from 'zod';

// Document type enum
export const documentTypeEnum = z.enum([
  'financial',
  'legal',
  'custody',
  'property',
  'communication',
  'other',
]);

// Document status enum
export const documentStatusEnum = z.enum(['pending', 'processing', 'classified', 'failed']);

// Create document schema
export const createDocumentSchema = z.object({
  storage_path: z.string().min(1, 'Storage path is required'),
  original_filename: z.string().min(1, 'Original filename is required'),
  file_size: z.number().int().positive('File size must be positive'),
  mime_type: z.string().min(1, 'MIME type is required'),
  document_type: documentTypeEnum.optional(),
  metadata: z.record(z.any()).optional(),
});

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

// Update document schema
export const updateDocumentSchema = z.object({
  document_type: documentTypeEnum.optional(),
  metadata: z.record(z.any()).optional(),
  tags: z.array(z.string()).optional(),
});

export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;

// List documents query schema
export const listDocumentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  document_type: documentTypeEnum.optional(),
  status: documentStatusEnum.optional(),
  search: z.string().optional(),
  sort_by: z.enum(['created_at', 'updated_at', 'original_filename']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;

// Document ID param schema
export const documentIdParamSchema = z.object({
  id: z.string().uuid('Invalid document ID format'),
});

export type DocumentIdParam = z.infer<typeof documentIdParamSchema>;

// Classify document request schema
export const classifyDocumentSchema = z.object({
  priority: z.number().int().min(1).max(10).default(5),
  force: z.boolean().default(false), // Force re-classification
});

export type ClassifyDocumentInput = z.infer<typeof classifyDocumentSchema>;

// Delete document schema (soft delete options)
export const deleteDocumentSchema = z.object({
  permanent: z.boolean().default(false), // Permanent delete (removes from storage)
});

export type DeleteDocumentInput = z.infer<typeof deleteDocumentSchema>;
