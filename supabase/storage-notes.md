# Supabase Storage - Usage Patterns & Best Practices

## Bucket Overview

| Bucket | Purpose | Max File Size | Public | Retention |
|--------|---------|---------------|--------|-----------|
| `documents_raw` | Original uploaded documents | 50MB | No | Permanent |
| `documents_processed` | Converted/processed documents | 100MB | No | Permanent |
| `thumbnails` | Document preview images | 5MB | No | Permanent |
| `voice_notes` | Audio recordings | 20MB | No | 90 days |
| `exports` | Generated reports/exports | 100MB | No | 30 days auto-cleanup |

## Upload Patterns

### Pattern 1: Direct Upload from Frontend

**Use case**: User uploads document directly to Supabase Storage from browser

```typescript
// Frontend code
async function uploadDocument(file: File, userId: string, documentId: string) {
  const filePath = `${userId}/${documentId}/${file.name}`;
  
  const { data, error } = await supabase.storage
    .from('documents_raw')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false
    });
  
  if (error) throw error;
  
  // Notify backend about the upload
  await fetch('/api/documents', {
    method: 'POST',
    body: JSON.stringify({
      document_id: documentId,
      storage_path: data.path,
      file_size: file.size,
      mime_type: file.type
    })
  });
}
```

### Pattern 2: Server-Side Upload (Backend/Edge Function)

**Use case**: Backend processes and stores converted documents

```typescript
// Backend/Edge Function code
async function storeProcessedDocument(
  userId: string,
  documentId: string,
  processedData: Uint8Array,
  filename: string
) {
  const filePath = `${userId}/${documentId}/${filename}`;
  
  const { data, error } = await supabaseServiceRole.storage
    .from('documents_processed')
    .upload(filePath, processedData, {
      contentType: 'application/pdf',
      cacheControl: '3600',
      upsert: true
    });
  
  if (error) throw error;
  return data.path;
}
```

### Pattern 3: Resumable Uploads (Large Files)

**Use case**: Upload large files with progress tracking and resume capability

```typescript
// Frontend code with resumable upload
async function uploadLargeDocument(file: File, userId: string, documentId: string) {
  const filePath = `${userId}/${documentId}/${file.name}`;
  const chunkSize = 6 * 1024 * 1024; // 6MB chunks
  
  // TUS protocol for resumable uploads
  const upload = await supabase.storage
    .from('documents_raw')
    .uploadToSignedUrl(filePath, token, file, {
      onUploadProgress: (progress) => {
        const percent = (progress.loaded / progress.total) * 100;
        updateProgressBar(percent);
      }
    });
}
```

## Download Patterns

### Pattern 1: Signed URLs (Time-Limited Access)

**Use case**: Provide temporary access to private documents

```typescript
// Backend generates signed URL
async function getDocumentDownloadUrl(
  userId: string,
  documentId: string,
  storagePath: string
) {
  // Verify user owns this document
  const { data: document } = await supabase
    .from('documents')
    .select('user_id')
    .eq('id', documentId)
    .single();
  
  if (document.user_id !== userId) {
    throw new Error('Unauthorized');
  }
  
  // Generate signed URL (valid for 1 hour)
  const { data, error } = await supabaseServiceRole.storage
    .from('documents_raw')
    .createSignedUrl(storagePath, 3600);
  
  if (error) throw error;
  return data.signedUrl;
}
```

### Pattern 2: Direct Download (Frontend)

**Use case**: Download file directly in browser

```typescript
// Frontend code
async function downloadDocument(storagePath: string, originalFilename: string) {
  const { data, error } = await supabase.storage
    .from('documents_raw')
    .download(storagePath);
  
  if (error) throw error;
  
  // Create download link
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = originalFilename;
  a.click();
  URL.revokeObjectURL(url);
}
```

### Pattern 3: Streaming Download (Large Files)

**Use case**: Stream large files to avoid memory issues

```typescript
// Backend code
async function streamDocument(storagePath: string, response: Response) {
  const { data, error } = await supabaseServiceRole.storage
    .from('documents_raw')
    .download(storagePath);
  
  if (error) throw error;
  
  // Stream to response
  return new Response(data, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  });
}
```

## Folder Structure Convention

All files follow this structure:
```
{bucket}/{user_id}/{document_id}/{filename}
```

Example:
```
documents_raw/
  └── 550e8400-e29b-41d4-a716-446655440000/  (user_id)
      └── abc123-def456-789/  (document_id)
          ├── contract.pdf
          ├── contract_v2.pdf
          └── contract_final.pdf

thumbnails/
  └── 550e8400-e29b-41d4-a716-446655440000/
      └── abc123-def456-789/
          └── thumbnail.jpg
```

## Storage Quota Management

### Check User's Current Usage

```typescript
async function getUserStorageUsage(userId: string) {
  const { data, error } = await supabase
    .rpc('get_user_storage_usage', { target_user_id: userId });
  
  // Returns:
  // [
  //   { bucket_name: 'documents_raw', file_count: 45, total_bytes: 125829120 },
  //   { bucket_name: 'voice_notes', file_count: 12, total_bytes: 45678901 }
  // ]
  
  return data;
}
```

### Enforce Quota Before Upload

```typescript
async function checkQuotaBeforeUpload(userId: string, fileSize: number) {
  const { data: user } = await supabase
    .from('users')
    .select('storage_quota_bytes, storage_used_bytes')
    .eq('id', userId)
    .single();
  
  if (user.storage_used_bytes + fileSize > user.storage_quota_bytes) {
    throw new Error('Storage quota exceeded');
  }
  
  return true;
}
```

## Cleanup Strategies

### Auto-Cleanup Old Exports

Set up a scheduled edge function or backend cron job:

```typescript
// Run daily
async function cleanupOldExports() {
  const { data: oldFiles } = await supabaseServiceRole.storage
    .from('exports')
    .list('', {
      limit: 1000,
      sortBy: { column: 'created_at', order: 'asc' }
    });
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 30); // 30 days old
  
  const filesToDelete = oldFiles
    .filter(file => new Date(file.created_at) < cutoffDate)
    .map(file => file.name);
  
  if (filesToDelete.length > 0) {
    await supabaseServiceRole.storage
      .from('exports')
      .remove(filesToDelete);
  }
  
  return filesToDelete.length;
}
```

### Delete Document and Associated Files

```typescript
async function deleteDocumentCompletely(documentId: string, userId: string) {
  // 1. Get all storage paths associated with document
  const { data: document } = await supabase
    .from('documents')
    .select('storage_path, thumbnail_path')
    .eq('id', documentId)
    .single();
  
  const { data: versions } = await supabase
    .from('document_versions')
    .select('storage_path')
    .eq('document_id', documentId);
  
  // 2. Delete from all buckets
  const filesToDelete = [
    { bucket: 'documents_raw', path: document.storage_path },
    { bucket: 'thumbnails', path: document.thumbnail_path },
    ...versions.map(v => ({ bucket: 'documents_raw', path: v.storage_path }))
  ].filter(f => f.path);
  
  for (const file of filesToDelete) {
    await supabaseServiceRole.storage
      .from(file.bucket)
      .remove([file.path]);
  }
  
  // 3. Soft delete database records
  await supabase
    .from('documents')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', documentId);
}
```

## Thumbnail Generation

### Generate Thumbnail After Upload

```typescript
// Edge function: generate-thumbnail
async function generateThumbnail(documentId: string, storagePath: string) {
  // 1. Download original from documents_raw
  const { data: originalFile } = await supabaseServiceRole.storage
    .from('documents_raw')
    .download(storagePath);
  
  // 2. Generate thumbnail (using Sharp, ImageMagick, or similar)
  const thumbnailBuffer = await createThumbnail(originalFile, {
    width: 300,
    height: 400,
    format: 'jpeg',
    quality: 80
  });
  
  // 3. Upload to thumbnails bucket
  const thumbnailPath = storagePath.replace(/\.[^.]+$/, '_thumb.jpg');
  
  const { data, error } = await supabaseServiceRole.storage
    .from('thumbnails')
    .upload(thumbnailPath, thumbnailBuffer, {
      contentType: 'image/jpeg',
      cacheControl: '86400'
    });
  
  // 4. Update document record
  await supabase
    .from('documents')
    .update({ thumbnail_path: data.path })
    .eq('id', documentId);
}
```

## Security Best Practices

1. **Always validate user ownership** before generating signed URLs
2. **Use signed URLs** for all downloads to prevent direct access
3. **Implement rate limiting** on upload endpoints
4. **Scan uploaded files** for malware before processing
5. **Validate file types** and sizes on server-side, not just client
6. **Set appropriate CORS policies** in bucket settings
7. **Use HTTPS only** (Railway provides this automatically)
8. **Encrypt sensitive files** at rest (Supabase does this by default)
9. **Log all storage operations** to audit_logs table
10. **Implement file retention policies** per compliance requirements

## Performance Optimization

### CDN Configuration

Supabase Storage includes CDN by default. Optimize with:

```typescript
// Set appropriate cache headers
await supabase.storage.from('thumbnails').upload(path, file, {
  cacheControl: '86400', // 24 hours for thumbnails
  upsert: false
});

await supabase.storage.from('documents_raw').upload(path, file, {
  cacheControl: '3600', // 1 hour for documents
  upsert: false
});
```

### Lazy Loading & Progressive Images

```typescript
// Frontend: Load thumbnail first, then full document
async function loadDocumentWithThumbnail(documentId: string) {
  // 1. Load thumbnail immediately
  const thumbnailUrl = await getSignedUrl(document.thumbnail_path, 'thumbnails');
  displayThumbnail(thumbnailUrl);
  
  // 2. Load full document in background
  const fullUrl = await getSignedUrl(document.storage_path, 'documents_raw');
  preloadDocument(fullUrl);
}
```

### Batch Operations

```typescript
// Upload multiple files efficiently
async function uploadBatch(files: File[], userId: string, documentId: string) {
  const uploads = files.map(file => {
    const path = `${userId}/${documentId}/${file.name}`;
    return supabase.storage.from('documents_raw').upload(path, file);
  });
  
  const results = await Promise.all(uploads);
  return results;
}
```

## Monitoring & Alerts

### Track Storage Metrics

Create a dashboard to monitor:
- Total storage used per user
- Storage usage by bucket
- Upload/download rate
- Failed uploads
- Quota violations
- Average file sizes

### Set Up Alerts

Configure alerts for:
- Users approaching storage quota (90% threshold)
- Unusual upload patterns (potential abuse)
- Failed uploads spike
- Storage bucket approaching capacity

## Troubleshooting

### Issue: Upload fails with 403 Forbidden
- Check RLS policies allow user to upload to that path
- Verify user is authenticated
- Ensure folder structure matches `{user_id}/{document_id}/`

### Issue: File not found after upload
- Verify file path matches exactly (case-sensitive)
- Check RLS policies allow reading
- Ensure file wasn't deleted by cleanup job

### Issue: Downloads are slow
- Use CDN URLs (automatic with Supabase)
- Generate signed URLs with appropriate expiry
- Consider using image transformation for thumbnails

### Issue: Storage quota not updating
- Check trigger on documents table is active
- Verify file_size_bytes is set correctly on insert
- Run manual recalculation if needed
