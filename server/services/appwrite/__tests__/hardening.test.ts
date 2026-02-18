import { describe, it, expect, afterEach } from 'vitest';
import {
  generateIdempotencyKey,
  generateRetryIdempotencyKey,
  checkFileGuardrails,
  registerProcessing,
  unregisterProcessing,
  getActiveProcessingCount,
  cleanupStaleProcessings,
  calculateBackoffDelay,
  withRetry,
  DEFAULT_LIMITS,
  DEFAULT_RETRY_POLICY,
} from '../processingGuardrails';

describe('Idempotency Keys', () => {
  it('should generate consistent keys for same inputs', () => {
    const key1 = generateIdempotencyKey('file1', 'user1');
    const key2 = generateIdempotencyKey('file1', 'user1');
    expect(key1).toBe(key2);
  });

  it('should generate different keys for different files', () => {
    const key1 = generateIdempotencyKey('file1', 'user1');
    const key2 = generateIdempotencyKey('file2', 'user1');
    expect(key1).not.toBe(key2);
  });

  it('should generate different keys for different users', () => {
    const key1 = generateIdempotencyKey('file1', 'user1');
    const key2 = generateIdempotencyKey('file1', 'user2');
    expect(key1).not.toBe(key2);
  });

  it('should generate retry-specific keys', () => {
    const normalKey = generateIdempotencyKey('file1', 'user1');
    const retryKey = generateRetryIdempotencyKey('file1', 'user1', 1);
    expect(normalKey).not.toBe(retryKey);
  });

  it('should generate different keys for different retry numbers', () => {
    const retry1 = generateRetryIdempotencyKey('file1', 'user1', 1);
    const retry2 = generateRetryIdempotencyKey('file1', 'user1', 2);
    expect(retry1).not.toBe(retry2);
  });

  it('should generate 32-character hex keys', () => {
    const key = generateIdempotencyKey('file1', 'user1');
    expect(key).toMatch(/^[a-f0-9]{32}$/);
  });
});

describe('File Guardrails', () => {
  it('should allow files within size limit', async () => {
    const result = await checkFileGuardrails(10 * 1024 * 1024, 'image/jpeg');
    expect(result.allowed).toBe(true);
  });

  it('should reject files exceeding size limit', async () => {
    const result = await checkFileGuardrails(30 * 1024 * 1024, 'image/jpeg');
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('FILE_TOO_LARGE');
  });

  it('should allow supported file types', async () => {
    const types = ['image/jpeg', 'image/png', 'application/pdf'];
    for (const type of types) {
      const result = await checkFileGuardrails(1024, type);
      expect(result.allowed).toBe(true);
    }
  });

  it('should reject unsupported file types', async () => {
    const result = await checkFileGuardrails(1024, 'application/x-executable');
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('INVALID_TYPE');
  });

  it('should use custom limits when provided', async () => {
    const customLimits = { ...DEFAULT_LIMITS, maxFileSizeMB: 1 };
    const result = await checkFileGuardrails(2 * 1024 * 1024, 'image/jpeg', customLimits);
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('FILE_TOO_LARGE');
  });
});

describe('Concurrency Management', () => {
  afterEach(() => {
    while (getActiveProcessingCount() > 0) {
      cleanupStaleProcessings(0);
    }
  });

  it('should track active processings', () => {
    const id1 = registerProcessing('file1');
    const id2 = registerProcessing('file2');
    expect(getActiveProcessingCount()).toBe(2);
    unregisterProcessing(id1);
    expect(getActiveProcessingCount()).toBe(1);
    unregisterProcessing(id2);
    expect(getActiveProcessingCount()).toBe(0);
  });

  it('should cleanup old processings', async () => {
    registerProcessing('file1');
    await new Promise(resolve => setTimeout(resolve, 20));
    const cleaned = cleanupStaleProcessings(10);
    expect(cleaned).toBe(1);
    expect(getActiveProcessingCount()).toBe(0);
  });

  it('should not cleanup recent processings', () => {
    registerProcessing('file1');
    const cleaned = cleanupStaleProcessings(60000);
    expect(cleaned).toBe(0);
    expect(getActiveProcessingCount()).toBe(1);
  });
});

describe('Retry Policy', () => {
  it('should calculate exponential backoff', () => {
    const delay0 = calculateBackoffDelay(0);
    const delay1 = calculateBackoffDelay(1);
    const delay2 = calculateBackoffDelay(2);

    expect(delay0).toBeGreaterThanOrEqual(1000);
    expect(delay0).toBeLessThan(2000);
    expect(delay1).toBeGreaterThanOrEqual(2000);
    expect(delay1).toBeLessThan(4000);
    expect(delay2).toBeGreaterThanOrEqual(4000);
  });

  it('should cap delay at maxDelayMs', () => {
    const delay = calculateBackoffDelay(10);
    expect(delay).toBeLessThanOrEqual(DEFAULT_RETRY_POLICY.maxDelayMs);
  });

  it('should retry on failure and succeed', async () => {
    let attempts = 0;
    const operation = async () => {
      attempts++;
      if (attempts < 3) throw new Error('Temporary failure');
      return 'success';
    };

    const result = await withRetry(operation, { ...DEFAULT_RETRY_POLICY, baseDelayMs: 10 });
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('should throw after max retries exceeded', async () => {
    let attempts = 0;
    const operation = async () => {
      attempts++;
      throw new Error('Permanent failure');
    };

    await expect(
      withRetry(operation, { ...DEFAULT_RETRY_POLICY, maxRetries: 2, baseDelayMs: 10 })
    ).rejects.toThrow('Permanent failure');
    expect(attempts).toBe(3);
  });

  it('should call onRetry callback', async () => {
    const retryAttempts: number[] = [];
    let failCount = 0;
    const operation = async () => {
      failCount++;
      if (failCount < 3) throw new Error('Retry me');
      return 'done';
    };

    await withRetry(
      operation,
      { ...DEFAULT_RETRY_POLICY, baseDelayMs: 10 },
      (attempt) => { retryAttempts.push(attempt); }
    );

    expect(retryAttempts).toEqual([1, 2]);
  });
});

describe('Default Limits', () => {
  it('should have reasonable default values', () => {
    expect(DEFAULT_LIMITS.maxFileSizeMB).toBe(25);
    expect(DEFAULT_LIMITS.maxDailyProcessingsPerUser).toBe(50);
    expect(DEFAULT_LIMITS.maxDailyCostPerUser).toBe(1.00);
    expect(DEFAULT_LIMITS.maxConcurrentProcessings).toBe(3);
    expect(DEFAULT_LIMITS.maxRetries).toBe(3);
  });

  it('should include common document types', () => {
    expect(DEFAULT_LIMITS.allowedMimeTypes).toContain('image/jpeg');
    expect(DEFAULT_LIMITS.allowedMimeTypes).toContain('application/pdf');
    expect(DEFAULT_LIMITS.allowedMimeTypes).toContain('text/csv');
  });
});
