import { z } from 'zod';

// Allowed MIME types
const allowedMimeTypes = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'audio/mpeg', // .mp3
  'audio/wav',
  'audio/webm',
] as const;

// Maximum file sizes by type (in bytes)
export const MAX_FILE_SIZES = {
  document: 50 * 1024 * 1024, // 50MB for documents
  image: 10 * 1024 * 1024, // 10MB for images
  audio: 20 * 1024 * 1024, // 20MB for audio
};

// Upload metadata schema
export const uploadMetadataSchema = z.object({
  filename: z.string().min(1, 'Filename is required').max(255),
  mimeType: z.string().refine((val) => allowedMimeTypes.includes(val as any), {
    message: `MIME type must be one of: ${allowedMimeTypes.join(', ')}`,
  }),
  fileSize: z
    .number()
    .int()
    .positive('File size must be positive')
    .refine(
      (size) => {
        // Check against maximum allowed size
        return size <= Math.max(...Object.values(MAX_FILE_SIZES));
      },
      { message: 'File size exceeds maximum allowed size' }
    ),
  documentType: z
    .enum(['financial', 'legal', 'custody', 'property', 'communication', 'other'])
    .optional(),
  metadata: z.record(z.any()).optional(),
});

export type UploadMetadata = z.infer<typeof uploadMetadataSchema>;

// Multipart upload initiation schema
export const initiateMultipartUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string(),
  fileSize: z.number().int().positive(),
  chunkSize: z
    .number()
    .int()
    .positive()
    .default(5 * 1024 * 1024), // 5MB chunks
  documentType: z
    .enum(['financial', 'legal', 'custody', 'property', 'communication', 'other'])
    .optional(),
});

export type InitiateMultipartUploadInput = z.infer<typeof initiateMultipartUploadSchema>;

// Upload chunk schema
export const uploadChunkSchema = z.object({
  uploadId: z.string().uuid('Invalid upload ID'),
  chunkIndex: z.number().int().min(0),
  totalChunks: z.number().int().positive(),
  checksum: z.string().optional(), // MD5 or SHA-256 checksum
});

export type UploadChunkInput = z.infer<typeof uploadChunkSchema>;

// Complete multipart upload schema
export const completeMultipartUploadSchema = z.object({
  uploadId: z.string().uuid('Invalid upload ID'),
  checksums: z.array(z.string()).optional(), // Array of chunk checksums
});

export type CompleteMultipartUploadInput = z.infer<typeof completeMultipartUploadSchema>;

// Storage usage query schema
export const storageUsageQuerySchema = z.object({
  bucket: z
    .enum(['documents_raw', 'documents_processed', 'thumbnails', 'voice_notes', 'exports'])
    .optional(),
});

export type StorageUsageQuery = z.infer<typeof storageUsageQuerySchema>;

// Helper function to validate file type and size
export function validateFileTypeAndSize(
  mimeType: string,
  fileSize: number
): {
  valid: boolean;
  error?: string;
} {
  // Check MIME type
  if (!allowedMimeTypes.includes(mimeType as any)) {
    return {
      valid: false,
      error: `File type '${mimeType}' is not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`,
    };
  }

  // Determine category and check size
  let maxSize: number;
  if (mimeType.startsWith('image/')) {
    maxSize = MAX_FILE_SIZES.image;
  } else if (mimeType.startsWith('audio/')) {
    maxSize = MAX_FILE_SIZES.audio;
  } else {
    maxSize = MAX_FILE_SIZES.document;
  }

  if (fileSize > maxSize) {
    return {
      valid: false,
      error: `File size ${fileSize} exceeds maximum allowed size ${maxSize} bytes for type '${mimeType}'`,
    };
  }

  return { valid: true };
}
