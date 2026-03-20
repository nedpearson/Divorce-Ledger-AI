# Appwrite Document Processing - Hardening Test Plan

## Overview

This document outlines the test plan for the hardened Appwrite document processing system, covering idempotency, retry policies, concurrency limits, file guardrails, cost ceilings, and safe reprocessing.

## Feature Summary

| Feature              | Description                                | Implementation                              |
| -------------------- | ------------------------------------------ | ------------------------------------------- |
| Idempotency Keys     | Prevent duplicate processing of same file  | SHA-256 hash of fileId + userId + timestamp |
| Retry with Backoff   | Exponential backoff for transient failures | Base 1s, multiplier 2x, max 30s, 3 retries  |
| Concurrency Limits   | Limit parallel processing                  | Max 3 concurrent operations                 |
| Safe Reprocessing    | "Re-run" creates new AnalysisRun           | `reanalyzeFile()` with `forceNew: true`     |
| File Size Limits     | Reject oversized files                     | Max 25MB                                    |
| File Type Limits     | Only allow supported formats               | PDF, images, documents, spreadsheets        |
| Daily Processing Cap | Per-user daily limit                       | Max 50 processings/day                      |
| Daily Cost Ceiling   | Per-user daily cost limit                  | Max $1.00/day                               |

## Unit Tests

### Location: `server/services/appwrite/__tests__/hardening.test.ts`

Run with:

```bash
npx vitest run server/services/appwrite/__tests__/hardening.test.ts
```

### Test Categories

1. **Idempotency Keys**
   - Consistent key generation for same inputs
   - Different keys for different files
   - Different keys for different timestamps
   - Retry-specific key generation
   - Different keys for different retry numbers

2. **File Guardrails**
   - Allow files within size limit
   - Reject oversized files (FILE_TOO_LARGE)
   - Allow supported MIME types
   - Reject unsupported types (INVALID_TYPE)
   - Custom limits override

3. **Concurrency Management**
   - Track active processing count
   - Register/unregister processing
   - Cleanup stale processings
   - Preserve recent processings

4. **Retry Policy**
   - Exponential backoff calculation
   - Max delay cap
   - Retry on temporary failure
   - Throw after max retries
   - onRetry callback invocation

5. **Default Limits**
   - Reasonable default values
   - Common document types included

## Smoke Tests

### Manual Smoke Test Checklist

#### Setup

1. [ ] Appwrite collections created (idempotency_records, usage_records)
2. [ ] Queue processor running
3. [ ] No LSP/TypeScript errors

#### Test 1: Normal Document Flow

1. [ ] Upload a valid document (< 25MB, supported type)
2. [ ] Verify status transitions: uploaded → extracting → analyzing → suggested
3. [ ] Verify AnalysisRun created
4. [ ] Verify usage record incremented

#### Test 2: File Size Guardrail

1. [ ] Attempt to upload > 25MB file
2. [ ] Verify rejection with FILE_TOO_LARGE error
3. [ ] Verify no processing started

#### Test 3: File Type Guardrail

1. [ ] Attempt to upload unsupported file type (e.g., .exe)
2. [ ] Verify rejection with INVALID_TYPE error

#### Test 4: Idempotency - Duplicate Prevention

1. [ ] Start processing a file
2. [ ] Immediately try to start processing same file again
3. [ ] Verify second request returns "Analysis already in progress"
4. [ ] Wait for first processing to complete
5. [ ] Try again - should return cached result

#### Test 5: Safe Reprocessing

1. [ ] Process a document to completion
2. [ ] Call retry/reanalyze endpoint
3. [ ] Verify NEW AnalysisRun created (different $id)
4. [ ] Verify status reset to uploaded → processing

#### Test 6: Retry with Backoff (simulate failure)

1. [ ] Monitor logs during processing
2. [ ] Verify retry attempts are logged with increasing delays
3. [ ] Verify exponential backoff pattern

#### Test 7: Daily Limits

1. [ ] Process documents repeatedly
2. [ ] After 50 processings, verify DAILY_LIMIT rejection
3. [ ] After $1.00 cost, verify COST_LIMIT rejection

#### Test 8: Concurrency Limit

1. [ ] Upload 5 files simultaneously
2. [ ] Verify only 3 process at once
3. [ ] Verify remaining queued and processed after

## API Endpoint Tests

### GET /api/appwrite/guardrails/limits

Expected response:

```json
{
  "limits": {
    "maxFileSizeMB": 25,
    "maxDailyProcessingsPerUser": 50,
    "maxDailyCostPerUser": 1.00,
    "maxConcurrentProcessings": 3,
    "maxRetries": 3,
    "allowedMimeTypes": [...]
  }
}
```

### GET /api/appwrite/guardrails/stats

Expected response:

```json
{
  "stats": {
    "activeProcessings": 0,
    "todayProcessings": 5,
    "todayCost": 0.003,
    "limits": {...}
  }
}
```

### POST /api/appwrite/files/:id/retry

- Should return 400 if file not in error state
- Should return success with new analysisRunId
- Should check guardrails before processing

## Error Code Reference

| Code              | Description                      | HTTP Status |
| ----------------- | -------------------------------- | ----------- |
| FILE_TOO_LARGE    | File exceeds 25MB limit          | 400         |
| INVALID_TYPE      | Unsupported MIME type            | 400         |
| DAILY_LIMIT       | 50 processings/day exceeded      | 429         |
| COST_LIMIT        | $1.00/day cost exceeded          | 429         |
| CONCURRENCY_LIMIT | 3 concurrent operations exceeded | 429         |
| RETRY_LIMIT       | 3 retries exceeded               | 429         |

## Regression Considerations

- [ ] Existing documents should continue to process
- [ ] Existing AnalysisRuns should remain intact
- [ ] No breaking changes to file status flow
- [ ] Real-time updates still work
- [ ] Approval workflow unchanged

## Performance Notes

- Idempotency records expire after 24 hours
- Usage records are daily and reset at midnight UTC
- Stale processings (>5 min) are auto-cleaned
- Backoff delay includes 30% jitter to prevent thundering herd
