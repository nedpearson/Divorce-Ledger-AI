import { 
  databases, 
  storage, 
  DATABASE_ID, 
  STORAGE_BUCKET_ID, 
  COLLECTIONS,
  initializeAppwrite,
  isAppwriteConfigured
} from './client';
import { Permission, Role, IndexType, Compression, Query, ID } from 'node-appwrite';

async function waitForAttributes(collectionId: string, maxWaitMs = 30000): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    const attrs = await databases.listAttributes(DATABASE_ID, collectionId);
    const allAvailable = attrs.attributes.every((attr: any) => attr.status === 'available');
    if (allAvailable && attrs.attributes.length > 0) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.log(`[Appwrite Setup] Warning: Attributes may still be processing for '${collectionId}'`);
}

async function createDatabaseIfNotExists() {
  try {
    await databases.get(DATABASE_ID);
    console.log(`[Appwrite Setup] Database '${DATABASE_ID}' already exists`);
  } catch {
    await databases.create(DATABASE_ID, 'Divorce Ledger Database');
    console.log(`[Appwrite Setup] Created database '${DATABASE_ID}'`);
  }
}

async function createStorageBucketIfNotExists() {
  try {
    await storage.getBucket(STORAGE_BUCKET_ID);
    console.log(`[Appwrite Setup] Bucket '${STORAGE_BUCKET_ID}' already exists`);
  } catch {
    await storage.createBucket(
      STORAGE_BUCKET_ID,
      'Document Files',
      [Permission.read(Role.users()), Permission.create(Role.users())],
      false,
      true,
      50000000,
      ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt'],
      Compression.Gzip,
      true,
      true
    );
    console.log(`[Appwrite Setup] Created bucket '${STORAGE_BUCKET_ID}'`);
  }
}

async function ensureFileHashAttribute() {
  const collectionId = COLLECTIONS.FILES;
  try {
    await databases.getAttribute(DATABASE_ID, collectionId, 'fileHash');
    console.log(`[Appwrite Setup] Attribute 'fileHash' already exists in '${collectionId}'`);
  } catch {
    try {
      await databases.createStringAttribute(DATABASE_ID, collectionId, 'fileHash', 64, false);
      console.log(`[Appwrite Setup] Added 'fileHash' attribute to '${collectionId}'`);
      await waitForAttributes(collectionId);
    } catch (error) {
      console.log(`[Appwrite Setup] Could not add 'fileHash': ${(error as Error).message}`);
    }
  }
}

async function ensureFilesApprovalAttributes() {
  const collectionId = COLLECTIONS.FILES;
  const newAttributes = [
    { name: 'extractedFields', type: 'string', size: 10000 },
    { name: 'finalizedCategory', type: 'string', size: 100 },
    { name: 'finalizedFields', type: 'string', size: 10000 },
    { name: 'approvedAt', type: 'datetime' },
    { name: 'approvedBy', type: 'string', size: 255 },
  ];
  
  for (const attr of newAttributes) {
    try {
      await databases.getAttribute(DATABASE_ID, collectionId, attr.name);
      console.log(`[Appwrite Setup] Attribute '${attr.name}' already exists in '${collectionId}'`);
    } catch {
      try {
        if (attr.type === 'string') {
          await databases.createStringAttribute(DATABASE_ID, collectionId, attr.name, attr.size!, false);
        } else if (attr.type === 'datetime') {
          await databases.createDatetimeAttribute(DATABASE_ID, collectionId, attr.name, false);
        }
        console.log(`[Appwrite Setup] Added '${attr.name}' attribute to '${collectionId}'`);
        await waitForAttributes(collectionId);
      } catch (error) {
        console.log(`[Appwrite Setup] Could not add '${attr.name}': ${(error as Error).message}`);
      }
    }
  }
}

async function createFilesCollection() {
  const collectionId = COLLECTIONS.FILES;
  try {
    await databases.getCollection(DATABASE_ID, collectionId);
    console.log(`[Appwrite Setup] Collection '${collectionId}' already exists`);
    await ensureFileHashAttribute();
    await ensureFilesApprovalAttributes();
    return;
  } catch {
    await databases.createCollection(
      DATABASE_ID,
      collectionId,
      'Files',
      [Permission.read(Role.users()), Permission.create(Role.users())],
      true
    );
    console.log(`[Appwrite Setup] Created collection '${collectionId}'`);
  }

  await databases.createStringAttribute(DATABASE_ID, collectionId, 'userId', 255, true);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'storageFileId', 255, true);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'fileName', 500, true);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'fileType', 100, true);
  await databases.createIntegerAttribute(DATABASE_ID, collectionId, 'fileSize', true);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'fileHash', 64, false);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'status', 50, true);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'category', 100, false);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'suggestedCategory', 100, false);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'latestAnalysisRunId', 255, false);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'extractedText', 50000, false);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'aiSummary', 2000, false);
  await databases.createFloatAttribute(DATABASE_ID, collectionId, 'aiConfidence', false);
  await databases.createBooleanAttribute(DATABASE_ID, collectionId, 'isConfidential', false);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'title', 500, false);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'description', 5000, false);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'errorMessage', 2000, false);
  await databases.createIntegerAttribute(DATABASE_ID, collectionId, 'retryCount', false);
  await databases.createDatetimeAttribute(DATABASE_ID, collectionId, 'analyzedAt', false);

  await waitForAttributes(collectionId);

  await databases.createIndex(DATABASE_ID, collectionId, 'idx_userId', IndexType.Key, ['userId']);
  await databases.createIndex(DATABASE_ID, collectionId, 'idx_status', IndexType.Key, ['status']);
  await databases.createIndex(DATABASE_ID, collectionId, 'idx_category', IndexType.Key, ['category']);
  await databases.createIndex(DATABASE_ID, collectionId, 'idx_userId_status', IndexType.Key, ['userId', 'status']);

  console.log(`[Appwrite Setup] Created attributes and indexes for '${collectionId}'`);
}

async function ensureAnalysisRunsAttributes() {
  const collectionId = COLLECTIONS.ANALYSIS_RUNS;
  const newAttributes = [
    { name: 'normalizedOutput', type: 'string', size: 50000 },
    { name: 'estimatedCost', type: 'float' },
  ];
  
  for (const attr of newAttributes) {
    try {
      await databases.getAttribute(DATABASE_ID, collectionId, attr.name);
      console.log(`[Appwrite Setup] Attribute '${attr.name}' already exists in '${collectionId}'`);
    } catch {
      try {
        if (attr.type === 'string') {
          await databases.createStringAttribute(DATABASE_ID, collectionId, attr.name, attr.size!, false);
        } else if (attr.type === 'float') {
          await databases.createFloatAttribute(DATABASE_ID, collectionId, attr.name, false);
        }
        console.log(`[Appwrite Setup] Added '${attr.name}' attribute to '${collectionId}'`);
        await waitForAttributes(collectionId);
      } catch (error) {
        console.log(`[Appwrite Setup] Could not add '${attr.name}': ${(error as Error).message}`);
      }
    }
  }
}

async function createAnalysisRunsCollection() {
  const collectionId = COLLECTIONS.ANALYSIS_RUNS;
  try {
    await databases.getCollection(DATABASE_ID, collectionId);
    console.log(`[Appwrite Setup] Collection '${collectionId}' already exists`);
    await ensureAnalysisRunsAttributes();
    return;
  } catch {
    await databases.createCollection(
      DATABASE_ID,
      collectionId,
      'Analysis Runs',
      [Permission.read(Role.users())],
      true
    );
    console.log(`[Appwrite Setup] Created collection '${collectionId}'`);
  }

  await databases.createStringAttribute(DATABASE_ID, collectionId, 'fileId', 255, true);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'userId', 255, true);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'runType', 50, true);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'modelProvider', 100, true);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'modelVersion', 100, true);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'inputHash', 64, true);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'rawOutput', 50000, true);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'normalizedOutput', 50000, false);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'suggestedCategory', 100, false);
  await databases.createFloatAttribute(DATABASE_ID, collectionId, 'confidence', false);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'status', 50, true);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'errorMessage', 2000, false);
  await databases.createIntegerAttribute(DATABASE_ID, collectionId, 'latencyMs', false);
  await databases.createIntegerAttribute(DATABASE_ID, collectionId, 'requestTokens', false);
  await databases.createIntegerAttribute(DATABASE_ID, collectionId, 'responseTokens', false);
  await databases.createFloatAttribute(DATABASE_ID, collectionId, 'estimatedCost', false);

  await waitForAttributes(collectionId);

  await databases.createIndex(DATABASE_ID, collectionId, 'idx_fileId', IndexType.Key, ['fileId']);
  await databases.createIndex(DATABASE_ID, collectionId, 'idx_userId', IndexType.Key, ['userId']);
  await databases.createIndex(DATABASE_ID, collectionId, 'idx_status', IndexType.Key, ['status']);

  console.log(`[Appwrite Setup] Created attributes and indexes for '${collectionId}'`);
}

async function createCategoriesCollection() {
  const collectionId = COLLECTIONS.CATEGORIES;
  try {
    await databases.getCollection(DATABASE_ID, collectionId);
    console.log(`[Appwrite Setup] Collection '${collectionId}' already exists`);
    return;
  } catch {
    await databases.createCollection(
      DATABASE_ID,
      collectionId,
      'Categories',
      [Permission.read(Role.any())],
      true
    );
    console.log(`[Appwrite Setup] Created collection '${collectionId}'`);
  }

  await databases.createStringAttribute(DATABASE_ID, collectionId, 'name', 100, true);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'displayName', 200, true);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'description', 1000, false);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'parentId', 255, false);
  await databases.createBooleanAttribute(DATABASE_ID, collectionId, 'isSystem', true);
  await databases.createBooleanAttribute(DATABASE_ID, collectionId, 'isActive', true);
  await databases.createIntegerAttribute(DATABASE_ID, collectionId, 'sortOrder', false);

  await waitForAttributes(collectionId);

  await databases.createIndex(DATABASE_ID, collectionId, 'idx_name', IndexType.Unique, ['name']);
  await databases.createIndex(DATABASE_ID, collectionId, 'idx_isActive', IndexType.Key, ['isActive']);

  console.log(`[Appwrite Setup] Created attributes and indexes for '${collectionId}'`);
}

async function createUserOverridesCollection() {
  const collectionId = COLLECTIONS.USER_OVERRIDES;
  try {
    await databases.getCollection(DATABASE_ID, collectionId);
    console.log(`[Appwrite Setup] Collection '${collectionId}' already exists`);
    return;
  } catch {
    await databases.createCollection(
      DATABASE_ID,
      collectionId,
      'User Overrides',
      [Permission.read(Role.users())],
      true
    );
    console.log(`[Appwrite Setup] Created collection '${collectionId}'`);
  }

  await databases.createStringAttribute(DATABASE_ID, collectionId, 'userId', 255, true);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'fileId', 255, true);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'analysisRunId', 255, true);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'overrideType', 50, true);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'originalValue', 1000, true);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'newValue', 1000, true);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'reason', 2000, false);

  await waitForAttributes(collectionId);

  await databases.createIndex(DATABASE_ID, collectionId, 'idx_userId', IndexType.Key, ['userId']);
  await databases.createIndex(DATABASE_ID, collectionId, 'idx_fileId', IndexType.Key, ['fileId']);
  await databases.createIndex(DATABASE_ID, collectionId, 'idx_overrideType', IndexType.Key, ['overrideType']);

  console.log(`[Appwrite Setup] Created attributes and indexes for '${collectionId}'`);
}

async function seedDefaultCategories() {
  await waitForAttributes(COLLECTIONS.CATEGORIES);
  
  const defaultCategories = [
    { name: 'financial', displayName: 'Financial Documents', description: 'Bank statements, tax returns, pay stubs', sortOrder: 1 },
    { name: 'legal', displayName: 'Legal Documents', description: 'Court orders, agreements, contracts', sortOrder: 2 },
    { name: 'medical', displayName: 'Medical Records', description: 'Health records, insurance claims', sortOrder: 3 },
    { name: 'property', displayName: 'Property Documents', description: 'Deeds, appraisals, mortgage statements', sortOrder: 4 },
    { name: 'correspondence', displayName: 'Correspondence', description: 'Emails, letters, communications', sortOrder: 5 },
    { name: 'evidence', displayName: 'Evidence', description: 'Photos, screenshots, recordings', sortOrder: 6 },
    { name: 'receipt', displayName: 'Receipts', description: 'Purchase receipts, expense documentation', sortOrder: 7 },
    { name: 'other', displayName: 'Other', description: 'Miscellaneous documents', sortOrder: 99 },
  ];

  for (const cat of defaultCategories) {
    try {
      const existing = await databases.listDocuments(DATABASE_ID, COLLECTIONS.CATEGORIES, [
        Query.equal("name", cat.name)
      ]);
      if (existing.total === 0) {
        await databases.createDocument(
          DATABASE_ID,
          COLLECTIONS.CATEGORIES,
          ID.unique(),
          { ...cat, isSystem: true, isActive: true },
          [Permission.read(Role.any())]
        );
        console.log(`[Appwrite Setup] Created category: ${cat.displayName}`);
      } else {
        console.log(`[Appwrite Setup] Category '${cat.name}' already exists`);
      }
    } catch (err: any) {
      console.error(`[Appwrite Setup] Error seeding category '${cat.name}':`, err.message || err);
    }
  }
}

async function createIdempotencyCollection() {
  const collectionId = COLLECTIONS.IDEMPOTENCY;
  try {
    await databases.getCollection(DATABASE_ID, collectionId);
    console.log(`[Appwrite Setup] Collection '${collectionId}' already exists`);
    return;
  } catch {
    await databases.createCollection(
      DATABASE_ID,
      collectionId,
      'Idempotency Records',
      [Permission.read(Role.users()), Permission.create(Role.users())],
      true
    );
    console.log(`[Appwrite Setup] Created collection '${collectionId}'`);
  }

  await databases.createStringAttribute(DATABASE_ID, collectionId, 'idempotencyKey', 64, true);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'fileId', 255, true);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'userId', 255, true);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'status', 20, true);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'analysisRunId', 255, false);
  await databases.createDatetimeAttribute(DATABASE_ID, collectionId, 'createdAt', true);
  await databases.createDatetimeAttribute(DATABASE_ID, collectionId, 'expiresAt', true);

  await waitForAttributes(collectionId);

  await databases.createIndex(DATABASE_ID, collectionId, 'idx_idempotency_key', IndexType.Unique, ['idempotencyKey']);
  await databases.createIndex(DATABASE_ID, collectionId, 'idx_idempotency_file', IndexType.Key, ['fileId']);
  await databases.createIndex(DATABASE_ID, collectionId, 'idx_idempotency_expires', IndexType.Key, ['expiresAt']);

  console.log(`[Appwrite Setup] Collection '${collectionId}' fully configured`);
}

async function createUsageCollection() {
  const collectionId = COLLECTIONS.USAGE;
  try {
    await databases.getCollection(DATABASE_ID, collectionId);
    console.log(`[Appwrite Setup] Collection '${collectionId}' already exists`);
    return;
  } catch {
    await databases.createCollection(
      DATABASE_ID,
      collectionId,
      'Usage Records',
      [Permission.read(Role.users()), Permission.create(Role.users())],
      true
    );
    console.log(`[Appwrite Setup] Created collection '${collectionId}'`);
  }

  await databases.createStringAttribute(DATABASE_ID, collectionId, 'userId', 255, true);
  await databases.createStringAttribute(DATABASE_ID, collectionId, 'date', 10, true);
  await databases.createIntegerAttribute(DATABASE_ID, collectionId, 'processingsCount', true);
  await databases.createFloatAttribute(DATABASE_ID, collectionId, 'totalCost', true);
  await databases.createDatetimeAttribute(DATABASE_ID, collectionId, 'lastUpdated', true);

  await waitForAttributes(collectionId);

  await databases.createIndex(DATABASE_ID, collectionId, 'idx_usage_user_date', IndexType.Unique, ['userId', 'date']);

  console.log(`[Appwrite Setup] Collection '${collectionId}' fully configured`);
}

export async function setupAppwrite(): Promise<boolean> {
  if (!isAppwriteConfigured()) {
    console.log('[Appwrite Setup] Skipping setup - Appwrite not configured');
    return false;
  }

  if (!initializeAppwrite()) {
    console.error('[Appwrite Setup] Failed to initialize Appwrite client');
    return false;
  }

  try {
    console.log('[Appwrite Setup] Starting database setup...');
    
    await createDatabaseIfNotExists();
    await createStorageBucketIfNotExists();
    await createFilesCollection();
    await createAnalysisRunsCollection();
    await createCategoriesCollection();
    await createUserOverridesCollection();
    await createIdempotencyCollection();
    await createUsageCollection();
    await seedDefaultCategories();

    console.log('[Appwrite Setup] Setup completed successfully');
    return true;
  } catch (error) {
    console.error('[Appwrite Setup] Setup failed:', error);
    return false;
  }
}

export async function checkAppwriteHealth(): Promise<{ connected: boolean; database: boolean; storage: boolean }> {
  if (!isAppwriteConfigured()) {
    return { connected: false, database: false, storage: false };
  }

  initializeAppwrite();

  let database = false;
  let storageOk = false;

  try {
    await databases.get(DATABASE_ID);
    database = true;
  } catch {
    database = false;
  }

  try {
    await storage.getBucket(STORAGE_BUCKET_ID);
    storageOk = true;
  } catch {
    storageOk = false;
  }

  return { connected: true, database, storage: storageOk };
}
