import {
  databases,
  DATABASE_ID,
  COLLECTIONS,
  ID,
  Query,
  Permission,
  Role,
  initializeAppwrite,
} from './client';
import crypto from 'crypto';

export interface ProcessingLimits {
  maxFileSizeMB: number;
  maxDailyProcessingsPerUser: number;
  maxDailyCostPerUser: number;
  maxConcurrentProcessings: number;
  maxRetries: number;
  allowedMimeTypes: string[];
}

export const DEFAULT_LIMITS: ProcessingLimits = {
  maxFileSizeMB: 25,
  maxDailyProcessingsPerUser: 50,
  maxDailyCostPerUser: 1.0,
  maxConcurrentProcessings: 3,
  maxRetries: 3,
  allowedMimeTypes: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
};

export interface IdempotencyRecord {
  $id: string;
  idempotencyKey: string;
  fileId: string;
  userId: string;
  status: 'processing' | 'completed' | 'failed';
  analysisRunId?: string;
  createdAt: string;
  expiresAt: string;
}

export interface UsageRecord {
  $id: string;
  userId: string;
  date: string;
  processingsCount: number;
  totalCost: number;
  lastUpdated: string;
}

const activeProcessings = new Map<string, { startTime: number; fileId: string }>();

export function generateIdempotencyKey(fileId: string, userId: string): string {
  const input = `${fileId}:${userId}`;
  return crypto.createHash('sha256').update(input).digest('hex').substring(0, 32);
}

export function generateRetryIdempotencyKey(
  fileId: string,
  userId: string,
  retryNumber: number
): string {
  const input = `${fileId}:${userId}:retry:${retryNumber}`;
  return crypto.createHash('sha256').update(input).digest('hex').substring(0, 32);
}

export async function checkIdempotency(idempotencyKey: string): Promise<IdempotencyRecord | null> {
  initializeAppwrite();

  try {
    const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.IDEMPOTENCY, [
      Query.equal('idempotencyKey', idempotencyKey),
      Query.limit(1),
    ]);

    if (result.documents.length > 0) {
      const record = result.documents[0] as unknown as IdempotencyRecord;
      const expiresAt = new Date(record.expiresAt);
      if (expiresAt > new Date()) {
        return record;
      }
      await databases.deleteDocument(DATABASE_ID, COLLECTIONS.IDEMPOTENCY, record.$id);
    }
    return null;
  } catch {
    return null;
  }
}

export async function createIdempotencyRecord(
  idempotencyKey: string,
  fileId: string,
  userId: string
): Promise<IdempotencyRecord | null> {
  initializeAppwrite();

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  try {
    const doc = await databases.createDocument(
      DATABASE_ID,
      COLLECTIONS.IDEMPOTENCY,
      ID.unique(),
      {
        idempotencyKey,
        fileId,
        userId,
        status: 'processing',
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      },
      [Permission.read(Role.user(userId))]
    );

    return doc as unknown as IdempotencyRecord;
  } catch (error) {
    // Collection may not exist - log and return null to allow processing to continue
    console.warn(
      `[Appwrite Idempotency] Failed to create idempotency record for file ${fileId}:`,
      (error as Error).message
    );
    return null;
  }
}

export async function updateIdempotencyRecord(
  recordId: string,
  status: 'completed' | 'failed',
  analysisRunId?: string
): Promise<void> {
  initializeAppwrite();

  await databases.updateDocument(DATABASE_ID, COLLECTIONS.IDEMPOTENCY, recordId, {
    status,
    analysisRunId,
  });
}

export async function getOrCreateDailyUsage(userId: string): Promise<UsageRecord> {
  initializeAppwrite();

  const today = new Date().toISOString().split('T')[0];

  try {
    const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.USAGE, [
      Query.equal('userId', userId),
      Query.equal('date', today),
      Query.limit(1),
    ]);

    if (result.documents.length > 0) {
      return result.documents[0] as unknown as UsageRecord;
    }

    const doc = await databases.createDocument(
      DATABASE_ID,
      COLLECTIONS.USAGE,
      ID.unique(),
      {
        userId,
        date: today,
        processingsCount: 0,
        totalCost: 0,
        lastUpdated: new Date().toISOString(),
      },
      [Permission.read(Role.user(userId))]
    );

    return doc as unknown as UsageRecord;
  } catch {
    return {
      $id: '',
      userId,
      date: today,
      processingsCount: 0,
      totalCost: 0,
      lastUpdated: new Date().toISOString(),
    };
  }
}

export async function incrementUsage(userId: string, cost: number): Promise<UsageRecord> {
  initializeAppwrite();

  const usage = await getOrCreateDailyUsage(userId);

  if (!usage.$id) {
    return usage;
  }

  const doc = await databases.updateDocument(DATABASE_ID, COLLECTIONS.USAGE, usage.$id, {
    processingsCount: usage.processingsCount + 1,
    totalCost: usage.totalCost + cost,
    lastUpdated: new Date().toISOString(),
  });

  return doc as unknown as UsageRecord;
}

export interface GuardrailCheckResult {
  allowed: boolean;
  reason?: string;
  code?:
    | 'FILE_TOO_LARGE'
    | 'INVALID_TYPE'
    | 'DAILY_LIMIT'
    | 'COST_LIMIT'
    | 'CONCURRENCY_LIMIT'
    | 'RETRY_LIMIT';
}

export async function checkFileGuardrails(
  fileSize: number,
  mimeType: string,
  limits: ProcessingLimits = DEFAULT_LIMITS
): Promise<GuardrailCheckResult> {
  const maxBytes = limits.maxFileSizeMB * 1024 * 1024;
  if (fileSize > maxBytes) {
    return {
      allowed: false,
      reason: `File size exceeds ${limits.maxFileSizeMB}MB limit`,
      code: 'FILE_TOO_LARGE',
    };
  }

  if (!limits.allowedMimeTypes.includes(mimeType)) {
    return {
      allowed: false,
      reason: `File type ${mimeType} is not supported`,
      code: 'INVALID_TYPE',
    };
  }

  return { allowed: true };
}

export interface ProcessingGuardrailOptions {
  skipRetryLimit?: boolean;
}

export async function checkProcessingGuardrails(
  userId: string,
  retryCount: number = 0,
  limits: ProcessingLimits = DEFAULT_LIMITS,
  options: ProcessingGuardrailOptions = {}
): Promise<GuardrailCheckResult> {
  if (!options.skipRetryLimit && retryCount >= limits.maxRetries) {
    return {
      allowed: false,
      reason: `Maximum retry attempts (${limits.maxRetries}) exceeded`,
      code: 'RETRY_LIMIT',
    };
  }

  const usage = await getOrCreateDailyUsage(userId);

  if (usage.processingsCount >= limits.maxDailyProcessingsPerUser) {
    return {
      allowed: false,
      reason: `Daily processing limit (${limits.maxDailyProcessingsPerUser}) reached`,
      code: 'DAILY_LIMIT',
    };
  }

  if (usage.totalCost >= limits.maxDailyCostPerUser) {
    return {
      allowed: false,
      reason: `Daily cost ceiling ($${limits.maxDailyCostPerUser.toFixed(2)}) reached`,
      code: 'COST_LIMIT',
    };
  }

  const concurrentCount = activeProcessings.size;
  if (concurrentCount >= limits.maxConcurrentProcessings) {
    return {
      allowed: false,
      reason: `Concurrent processing limit (${limits.maxConcurrentProcessings}) reached`,
      code: 'CONCURRENCY_LIMIT',
    };
  }

  return { allowed: true };
}

export function registerProcessing(fileId: string): string {
  const processingId = ID.unique();
  activeProcessings.set(processingId, { startTime: Date.now(), fileId });
  return processingId;
}

export function unregisterProcessing(processingId: string): void {
  activeProcessings.delete(processingId);
}

export function getActiveProcessingCount(): number {
  return activeProcessings.size;
}

export function cleanupStaleProcessings(maxAgeMs: number = 5 * 60 * 1000): number {
  const now = Date.now();
  let cleaned = 0;

  const entries = Array.from(activeProcessings.entries());
  for (const [id, data] of entries) {
    if (now - data.startTime > maxAgeMs) {
      activeProcessings.delete(id);
      cleaned++;
    }
  }

  return cleaned;
}

export interface RetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

export function calculateBackoffDelay(
  attempt: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY
): number {
  const delay = policy.baseDelayMs * Math.pow(policy.backoffMultiplier, attempt);
  const jitter = Math.random() * 0.3 * delay;
  return Math.min(delay + jitter, policy.maxDelayMs);
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  onRetry?: (attempt: number, error: Error, delayMs: number) => void
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < policy.maxRetries) {
        const delay = calculateBackoffDelay(attempt, policy);
        onRetry?.(attempt + 1, lastError, delay);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

export interface GuardrailStats {
  activeProcessings: number;
  todayProcessings: number;
  todayCost: number;
  limits: ProcessingLimits;
}

export async function getGuardrailStats(userId: string): Promise<GuardrailStats> {
  const usage = await getOrCreateDailyUsage(userId);

  return {
    activeProcessings: getActiveProcessingCount(),
    todayProcessings: usage.processingsCount,
    todayCost: usage.totalCost,
    limits: DEFAULT_LIMITS,
  };
}
