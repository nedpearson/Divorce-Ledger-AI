# Data Import/Export Strategy

## Overview

This document defines production-ready strategies for importing data into Supabase and exporting data for backups, compliance, and migrations.

## Data Import Strategies

### Strategy 1: Bulk Import via COPY Command (Recommended for Large Datasets)

**Use case**: Initial data migration, bulk user uploads

```bash
# 1. Prepare CSV file with exact column headers
# Format: users.csv
id,email,full_name,subscription_tier,created_at
550e8400-e29b-41d4-a716-446655440000,user@example.com,John Doe,premium,2026-01-15 10:30:00

# 2. Connect to Supabase database
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"

# 3. Temporarily disable RLS for import
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

# 4. Import data
\\COPY public.users FROM '/path/to/users.csv' WITH (FORMAT csv, HEADER true, DELIMITER ',');

# 5. Re-enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

# 6. Verify import
SELECT COUNT(*) FROM public.users;
```

**Performance**: ~10,000 rows/second

### Strategy 2: Batch Insert via Service Role API

**Use case**: Medium-sized datasets with transformation logic

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function batchImport(data: any[], tableName: string) {
  const BATCH_SIZE = 1000;
  let imported = 0;
  let errors = 0;

  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);

    try {
      const { data: result, error } = await supabase.from(tableName).insert(batch);

      if (error) throw error;

      imported += batch.length;
      console.log(`Imported ${imported}/${data.length} records`);
    } catch (error) {
      console.error(`Batch ${i}-${i + BATCH_SIZE} failed:`, error);
      errors += batch.length;
    }
  }

  return { imported, errors };
}

// Usage
const usersData = await loadUsersFromFile('users.json');
const result = await batchImport(usersData, 'users');
console.log(`Import complete: ${result.imported} success, ${result.errors} errors`);
```

**Performance**: ~1,000 rows/second

### Strategy 3: Streaming Import for Very Large Datasets

**Use case**: Multi-GB datasets that don't fit in memory

```typescript
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { Transform } from 'stream';

async function streamingImport(filePath: string, tableName: string) {
  const parser = parse({ columns: true });
  const batchSize = 500;
  let batch: any[] = [];
  let totalImported = 0;

  const transformer = new Transform({
    objectMode: true,
    async transform(record, encoding, callback) {
      batch.push(record);

      if (batch.length >= batchSize) {
        const currentBatch = [...batch];
        batch = [];

        try {
          await supabase.from(tableName).insert(currentBatch);
          totalImported += currentBatch.length;
          console.log(`Imported ${totalImported} records`);
        } catch (error) {
          console.error('Batch insert failed:', error);
        }
      }

      callback();
    },
    async flush(callback) {
      if (batch.length > 0) {
        await supabase.from(tableName).insert(batch);
        totalImported += batch.length;
      }
      console.log(`Total imported: ${totalImported}`);
      callback();
    },
  });

  return new Promise((resolve, reject) => {
    createReadStream(filePath)
      .pipe(parser)
      .pipe(transformer)
      .on('finish', () => resolve(totalImported))
      .on('error', reject);
  });
}
```

**Performance**: Memory-efficient for any size dataset

## Data Export Strategies

### Strategy 1: Full Database Export via pg_dump

**Use case**: Complete backups, disaster recovery

```bash
# Export entire database
pg_dump "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" \
  --no-owner \
  --no-privileges \
  --schema=public \
  --file=supabase_backup_$(date +%Y%m%d_%H%M%S).sql

# Export schema only
pg_dump --schema-only \
  --no-owner \
  --no-privileges \
  "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" \
  > schema_only.sql

# Export data only (specific tables)
pg_dump --data-only \
  --table=public.users \
  --table=public.documents \
  "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" \
  > data_only.sql
```

### Strategy 2: Selective Export via Supabase API

**Use case**: User data exports, GDPR compliance

```typescript
async function exportUserData(userId: string) {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Fetch all user-related data
  const [user, documents, classifications, jobs, auditLogs] = await Promise.all([
    supabase.from('users').select('*').eq('id', userId).single(),
    supabase.from('documents').select('*').eq('user_id', userId),
    supabase
      .from('classifications')
      .select('*')
      .eq(
        'document_id',
        documents.data?.map((d) => d.id)
      ),
    supabase.from('jobs').select('*').eq('user_id', userId),
    supabase.from('audit_logs').select('*').eq('user_id', userId),
  ]);

  // Package as structured export
  const exportData = {
    exported_at: new Date().toISOString(),
    user_id: userId,
    data: {
      profile: user.data,
      documents: documents.data,
      classifications: classifications.data,
      jobs: jobs.data,
      audit_logs: auditLogs.data,
    },
  };

  // Save to exports bucket
  const exportPath = `${userId}/export_${Date.now()}.json`;
  await supabase.storage.from('exports').upload(exportPath, JSON.stringify(exportData, null, 2), {
    contentType: 'application/json',
  });

  // Generate signed URL for download
  const { data: signedUrl } = await supabase.storage
    .from('exports')
    .createSignedUrl(exportPath, 86400); // 24 hours

  return signedUrl.signedUrl;
}
```

### Strategy 3: Incremental Export for Backups

**Use case**: Daily/weekly incremental backups

```typescript
async function incrementalBackup(sinceTimestamp: string) {
  const tables = ['users', 'documents', 'classifications', 'jobs'];
  const backupData: Record<string, any[]> = {};

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .gte('updated_at', sinceTimestamp)
      .order('updated_at', { ascending: true });

    if (error) throw error;

    backupData[table] = data;
    console.log(`Backed up ${data.length} records from ${table}`);
  }

  // Save to backup storage
  const backupPath = `backups/incremental_${Date.now()}.json`;
  await fs.writeFile(backupPath, JSON.stringify(backupData, null, 2));

  return backupPath;
}

// Run daily
const lastBackup = await getLastBackupTimestamp();
await incrementalBackup(lastBackup);
```

## Large Table Handling

### Chunked Export for Multi-Million Row Tables

```typescript
async function exportLargeTable(tableName: string, outputPath: string, chunkSize: number = 10000) {
  let offset = 0;
  let hasMore = true;
  let totalExported = 0;

  const writeStream = createWriteStream(outputPath);
  writeStream.write('[');

  while (hasMore) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .range(offset, offset + chunkSize - 1);

    if (error) throw error;

    if (data.length === 0) {
      hasMore = false;
      break;
    }

    // Write chunk to file
    const chunk = data.map((row) => JSON.stringify(row)).join(',\n');
    if (totalExported > 0) writeStream.write(',\n');
    writeStream.write(chunk);

    totalExported += data.length;
    offset += chunkSize;

    console.log(`Exported ${totalExported} records from ${tableName}`);

    if (data.length < chunkSize) {
      hasMore = false;
    }
  }

  writeStream.write(']');
  writeStream.end();

  return totalExported;
}
```

## Referential Integrity Validation

### Pre-Import Validation

```typescript
async function validateReferentialIntegrity(dataToImport: {
  users: any[];
  documents: any[];
  document_versions: any[];
}) {
  const errors: string[] = [];

  // Check all document user_ids exist in users
  const userIds = new Set(dataToImport.users.map((u) => u.id));
  for (const doc of dataToImport.documents) {
    if (!userIds.has(doc.user_id)) {
      errors.push(`Document ${doc.id} references non-existent user ${doc.user_id}`);
    }
  }

  // Check all document_versions reference existing documents
  const documentIds = new Set(dataToImport.documents.map((d) => d.id));
  for (const version of dataToImport.document_versions) {
    if (!documentIds.has(version.document_id)) {
      errors.push(`Version ${version.id} references non-existent document ${version.document_id}`);
    }
  }

  if (errors.length > 0) {
    console.error('Referential integrity errors:', errors);
    throw new Error(`Validation failed with ${errors.length} errors`);
  }

  console.log('✅ Referential integrity validation passed');
}
```

### Post-Import Validation

```sql
-- Check for orphaned documents (user doesn't exist)
SELECT d.id, d.title, d.user_id
FROM public.documents d
LEFT JOIN public.users u ON d.user_id = u.id
WHERE u.id IS NULL;

-- Check for orphaned document versions
SELECT dv.id, dv.document_id
FROM public.document_versions dv
LEFT JOIN public.documents d ON dv.document_id = d.id
WHERE d.id IS NULL;

-- Check for orphaned classifications
SELECT c.id, c.document_id
FROM public.classifications c
LEFT JOIN public.documents d ON c.document_id = d.id
WHERE d.id IS NULL;

-- Verify storage paths exist
SELECT d.id, d.storage_path
FROM public.documents d
WHERE d.storage_path IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM storage.objects o
    WHERE o.name = d.storage_path
      AND o.bucket_id = 'documents_raw'
  );
```

## Automated Backup Strategy

### Daily Backup Cron Job

```typescript
// scripts/daily-backup.ts
import { CronJob } from 'cron';

const dailyBackup = new CronJob('0 2 * * *', async () => {
  console.log('Starting daily backup at', new Date());

  try {
    // 1. Incremental database backup
    const lastBackup = await getLastBackupTimestamp();
    const backupPath = await incrementalBackup(lastBackup);

    // 2. Upload to external storage (S3, Google Cloud Storage, etc.)
    await uploadToExternalStorage(backupPath);

    // 3. Verify backup integrity
    await verifyBackupIntegrity(backupPath);

    // 4. Update backup metadata
    await saveBackupMetadata({
      timestamp: new Date(),
      path: backupPath,
      status: 'success',
    });

    console.log('✅ Daily backup completed successfully');
  } catch (error) {
    console.error('❌ Daily backup failed:', error);
    await notifyAdmins('Backup failed', error);
  }
});

dailyBackup.start();
```

### Weekly Full Backup

```bash
#!/bin/bash
# scripts/weekly-backup.sh

# Configuration
PROJECT_REF="your-project-ref"
PASSWORD="your-password"
BACKUP_DIR="/backups/weekly"
DATE=$(date +%Y%m%d)

# Full database export
pg_dump "postgresql://postgres:${PASSWORD}@db.${PROJECT_REF}.supabase.co:5432/postgres" \
  --no-owner \
  --no-privileges \
  --schema=public \
  --file="${BACKUP_DIR}/full_backup_${DATE}.sql"

# Compress
gzip "${BACKUP_DIR}/full_backup_${DATE}.sql"

# Upload to S3
aws s3 cp "${BACKUP_DIR}/full_backup_${DATE}.sql.gz" \
  "s3://your-backup-bucket/weekly/${DATE}/"

# Keep only last 8 weeks
find "${BACKUP_DIR}" -name "full_backup_*.sql.gz" -mtime +56 -delete

echo "Weekly backup completed: full_backup_${DATE}.sql.gz"
```

## Disaster Recovery

### Restore from Backup

```bash
# 1. Download latest backup
aws s3 cp s3://your-backup-bucket/weekly/latest.sql.gz ./restore.sql.gz
gunzip restore.sql.gz

# 2. Create new Supabase project (if needed)
# Use Supabase Dashboard

# 3. Restore database
psql "postgresql://postgres:[PASSWORD]@db.[NEW_PROJECT_REF].supabase.co:5432/postgres" \
  -f restore.sql

# 4. Verify restoration
psql "postgresql://postgres:[PASSWORD]@db.[NEW_PROJECT_REF].supabase.co:5432/postgres" \
  -c "SELECT COUNT(*) FROM public.users;"

# 5. Re-apply RLS policies
psql "postgresql://postgres:[PASSWORD]@db.[NEW_PROJECT_REF].supabase.co:5432/postgres" \
  -f supabase/rls.sql
```

## Compliance & GDPR

### Right to Data Portability

```typescript
async function generateGDPRExport(userId: string) {
  const exportData = await exportUserData(userId);

  // Format as standardized JSON
  const gdprExport = {
    version: '1.0',
    export_date: new Date().toISOString(),
    user_id: userId,
    data_categories: {
      personal_information: exportData.profile,
      documents: exportData.documents.map(doc => ({
        id: doc.id,
        title: doc.title,
        type: doc.document_type,
        created_at: doc.created_at,
        // Include download link for actual file
        download_url: await getSignedDownloadUrl(doc.storage_path)
      })),
      activity_logs: export Data.audit_logs
    }
  };

  return gdprExport;
}
```

### Right to Erasure (Right to be Forgotten)

```typescript
async function eraseUserData(userId: string) {
  // 1. Export data for compliance record
  const exportPath = await generateGDPRExport(userId);
  await archiveExport(exportPath);

  // 2. Delete storage files
  await deleteUserFiles(userId);

  // 3. Soft delete database records
  await supabase.rpc('soft_delete_user', { target_user_id: userId });

  // 4. Anonymize audit logs (keep for compliance)
  await supabase
    .from('audit_logs')
    .update({
      user_id: null,
      metadata: supabase.functions.anonymize_pii('metadata'),
    })
    .eq('user_id', userId);

  // 5. Log erasure request
  await supabase.from('audit_logs').insert({
    action: 'user_data_erased',
    resource_type: 'user',
    resource_id: userId,
    severity: 'info',
    metadata: { reason: 'gdpr_request' },
  });
}
```

## Best Practices

1. **Always test restore procedures** - Backups are useless if you can't restore
2. **Encrypt backups at rest** - Use encryption for all backup storage
3. **Store backups in multiple locations** - Geographic redundancy
4. **Version control your schema** - Track all schema changes in git
5. **Validate after import** - Always run integrity checks
6. **Document your process** - Keep runbooks updated
7. **Automate backups** - Never rely on manual processes
8. **Monitor backup jobs** - Alert on failures immediately
9. **Test disaster recovery** - Run DR drills quarterly
10. **Keep audit trail** - Log all import/export operations
