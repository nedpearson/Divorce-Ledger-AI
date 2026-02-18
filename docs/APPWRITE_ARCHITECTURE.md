# Appwrite-First Document Processing Architecture

## Overview

This document describes the complete Appwrite-first architecture for financial document processing in the Divorce Ledger application. Every document flows through Appwrite for OCR, extraction, categorization, and approval before touching financial tables.

**Non-Negotiable Requirements:**
1. Every document must go through Appwrite
2. No document is finalized without user approval
3. Categorization must be editable before posting
4. Financial data must map cleanly to QuickBooks-style reporting
5. Uploads must show real progress (not fake spinners)

---

## 1. Appwrite-First Architecture

### Text-Based Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                   REPLIT FRONTEND                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐  │
│  │   File Upload   │  │  Camera Capture │  │  Approval UI    │  │ Financial View │  │
│  │   Component     │  │   (Mobile PWA)  │  │  (Review/Edit)  │  │ (Post-Approval)│  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  └────────┬───────┘  │
│           │                    │                    │                    │          │
│           └────────────────────┴────────────────────┴────────────────────┘          │
│                                         │                                            │
│                           ┌─────────────▼─────────────┐                             │
│                           │    Express API Server     │                             │
│                           │   (server/routes/appwrite)│                             │
│                           └─────────────┬─────────────┘                             │
└─────────────────────────────────────────┼───────────────────────────────────────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     ▼                     │
                    │           APPWRITE CLOUD (NYC)            │
                    │                                           │
                    │  ┌─────────────────────────────────────┐  │
                    │  │           APPWRITE AUTH             │  │
                    │  │    (User sessions, API keys)        │  │
                    │  └─────────────────────────────────────┘  │
                    │                                           │
                    │  ┌─────────────────────────────────────┐  │
                    │  │         APPWRITE STORAGE            │  │
                    │  │  ┌─────────────┐ ┌────────────────┐ │  │
                    │  │  │ Raw Files   │ │ Processed Files│ │  │
                    │  │  │ (Originals) │ │ (Thumbnails)   │ │  │
                    │  │  └─────────────┘ └────────────────┘ │  │
                    │  └─────────────────────────────────────┘  │
                    │                                           │
                    │  ┌─────────────────────────────────────┐  │
                    │  │        APPWRITE DATABASES           │  │
                    │  │  ┌───────────────────────────────┐  │  │
                    │  │  │  divorce_ledger_db            │  │  │
                    │  │  │  ├── files (document records) │  │  │
                    │  │  │  ├── analysis_runs (OCR logs) │  │  │
                    │  │  │  ├── categories (taxonomy)    │  │  │
                    │  │  │  ├── user_overrides (edits)   │  │  │
                    │  │  │  ├── idempotency_records      │  │  │
                    │  │  │  └── usage_records (quotas)   │  │  │
                    │  │  └───────────────────────────────┘  │  │
                    │  └─────────────────────────────────────┘  │
                    │                                           │
                    │  ┌─────────────────────────────────────┐  │
                    │  │        APPWRITE REALTIME           │  │
                    │  │    (WebSocket status updates)      │  │
                    │  └─────────────────────────────────────┘  │
                    │                                           │
                    └───────────────────────────────────────────┘
                                          │
                                          ▼
                    ┌─────────────────────────────────────────────┐
                    │         SERVER-SIDE PROCESSING              │
                    │  ┌─────────────────────────────────────┐    │
                    │  │      Queue Processor (15s poll)     │    │
                    │  │  ┌───────────────────────────────┐  │    │
                    │  │  │ 1. PDF Analyzer (text/image)  │  │    │
                    │  │  │ 2. Image Quality Analyzer     │  │    │
                    │  │  │ 3. Two-Pass Extraction        │  │    │
                    │  │  │    - Pass A: Gemini OCR       │  │    │
                    │  │  │    - Pass B: Verification     │  │    │
                    │  │  │ 4. Auto-Categorization        │  │    │
                    │  │  │ 5. Confidence Scoring         │  │    │
                    │  │  └───────────────────────────────┘  │    │
                    │  └─────────────────────────────────────┘    │
                    └─────────────────────────────────────────────┘
```

### Replit ↔ Appwrite Communication

```
┌────────────────────┐                    ┌─────────────────────┐
│   REPLIT SERVER    │                    │   APPWRITE CLOUD    │
│                    │                    │                     │
│  Express Routes    │─── HTTPS REST ────▶│  REST API           │
│  /api/appwrite/*   │◀── JSON Response ──│  /v1/*              │
│                    │                    │                     │
│  Appwrite SDK      │─── WebSocket ─────▶│  Realtime           │
│  (node-appwrite)   │◀── Events ─────────│  (Status Updates)   │
│                    │                    │                     │
│  Environment Vars: │                    │  Project:           │
│  APPWRITE_ENDPOINT │                    │  696dc1cb0033cf776b3b
│  APPWRITE_PROJECT  │                    │                     │
│  APPWRITE_API_KEY  │                    │  Region: NYC        │
└────────────────────┘                    └─────────────────────┘
```

---

## 2. Upload → Approval → Posting Flow

### Complete Flow (Desktop + Mobile)

```
STAGE 1: UPLOAD
═══════════════
                 Desktop                              Mobile
                    │                                    │
         ┌──────────▼──────────┐            ┌───────────▼───────────┐
         │  File Input / Drag  │            │  Camera Capture PWA   │
         │     & Drop          │            │  (navigator.camera)   │
         └──────────┬──────────┘            └───────────┬───────────┘
                    │                                    │
                    └──────────────┬─────────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │      XHR Upload Request     │
                    │   POST /api/appwrite/files  │
                    │   Content-Type: multipart   │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │   REAL PROGRESS EVENTS      │
                    │   xhr.upload.onprogress     │
                    │   (bytes: loaded/total)     │
                    └──────────────┬──────────────┘
                                   │
STAGE 2: STORAGE                   ▼
═══════════════   ┌─────────────────────────────────────┐
                  │         Appwrite Storage            │
                  │   Bucket: document_files            │
                  │   Returns: storageFileId            │
                  └───────────────┬─────────────────────┘
                                  │
STAGE 3: QUEUED                   ▼
═══════════════   ┌─────────────────────────────────────┐
                  │     Appwrite Database: files        │
                  │   status: 'uploaded' → 'queued'     │
                  │   Realtime event broadcast          │
                  └───────────────┬─────────────────────┘
                                  │
STAGE 4: EXTRACTING               ▼
═══════════════════   ┌─────────────────────────────────┐
                      │   Queue Processor (15s poll)    │
                      │   status: 'extracting'          │
                      │   ┌─────────────────────────┐   │
                      │   │ 1. PDF Type Detection   │   │
                      │   │    - Digital PDF: text  │   │
                      │   │    - Scanned: OCR       │   │
                      │   │ 2. Image Quality Check  │   │
                      │   │    - Blur detection     │   │
                      │   │    - Glare detection    │   │
                      │   │    - Crop issue check   │   │
                      │   └─────────────────────────┘   │
                      └───────────────┬─────────────────┘
                                      │
STAGE 5: ANALYZING                    ▼
════════════════   ┌─────────────────────────────────────────┐
                   │   Two-Pass Extraction Pipeline          │
                   │   status: 'analyzing'                   │
                   │   ┌───────────────────────────────────┐ │
                   │   │ PASS A: Extraction (Gemini)       │ │
                   │   │ - OCR the document                │ │
                   │   │ - Extract: dates, amounts, vendor │ │
                   │   │ - Suggest: category + confidence  │ │
                   │   │ - Generate: summary, keywords     │ │
                   │   └───────────────────────────────────┘ │
                   │   ┌───────────────────────────────────┐ │
                   │   │ PASS B: Verification              │ │
                   │   │ - Cross-check extracted values    │ │
                   │   │ - Evidence pointers (line #, text)│ │
                   │   │ - Confidence adjustment           │ │
                   │   │ - must_review flag               │ │
                   │   └───────────────────────────────────┘ │
                   └─────────────────┬───────────────────────┘
                                     │
STAGE 6: SUGGESTED                   ▼
════════════════   ┌──────────────────────────────────────────┐
                   │   Ready for User Approval                │
                   │   status: 'suggested' / 'awaiting_user'  │
                   │   ┌────────────────────────────────────┐ │
                   │   │ Stored in Appwrite:                │ │
                   │   │ - suggestedCategory                │ │
                   │   │ - extractedFields (JSON)           │ │
                   │   │ - aiConfidence (0.0-1.0)           │ │
                   │   │ - aiSummary                        │ │
                   │   │ - category_candidates (top 3)      │ │
                   │   └────────────────────────────────────┘ │
                   └─────────────────┬────────────────────────┘
                                     │
STAGE 7: APPROVAL UI                 ▼
════════════════════   ┌─────────────────────────────────────┐
                       │         USER APPROVAL SCREEN        │
                       │   ┌─────────────────────────────┐   │
                       │   │ Document Preview            │   │
                       │   │ Suggested Category: [___▼]  │   │
                       │   │ Alt Categories: [a] [b] [c] │   │
                       │   │                             │   │
                       │   │ Extracted Fields:           │   │
                       │   │ ├─ Vendor: [Walmart____]    │   │
                       │   │ ├─ Date: [2024-01-15__]     │   │
                       │   │ ├─ Amount: [$123.45____]    │   │
                       │   │ └─ Category: [Groceries_▼]  │   │
                       │   │                             │   │
                       │   │ [✓ Accept] [✎ Edit] [✗ Skip]│   │
                       │   └─────────────────────────────┘   │
                       └─────────────────┬───────────────────┘
                                         │
                       User Actions:     │
                       ├── Accept Category → status: 'finalized'
                       ├── Change Category → Update before finalize
                       └── Edit Fields → Update extractedFields
                                         │
STAGE 8: FINALIZED                       ▼
════════════════   ┌──────────────────────────────────────────┐
                   │   POST /api/appwrite/files/:id/approve   │
                   │   status: 'finalized'                    │
                   │   ┌────────────────────────────────────┐ │
                   │   │ Stored:                            │ │
                   │   │ - finalizedCategory                │ │
                   │   │ - finalizedFields (user-approved)  │ │
                   │   │ - finalizedBy (userId)             │ │
                   │   │ - finalizedAt (timestamp)          │ │
                   │   │ - finalizedFromAnalysisRunId       │ │
                   │   └────────────────────────────────────┘ │
                   └─────────────────┬────────────────────────┘
                                     │
STAGE 9: FINANCIAL POSTING           ▼
══════════════════════   ┌────────────────────────────────────┐
                         │   ONLY NOW: Create Financial Entry │
                         │   (expenses, incomes, transactions)│
                         │   ┌──────────────────────────────┐ │
                         │   │ financialEntryFromDocument() │ │
                         │   │ - Creates expense/income     │ │
                         │   │ - Links to source document   │ │
                         │   │ - Audit trail complete       │ │
                         │   └──────────────────────────────┘ │
                         └────────────────────────────────────┘
```

---

## 3. Real Progress Bar Implementation

### Frontend Progress Tracking

```typescript
// client/src/components/appwrite-file-upload.tsx

// XHR upload with REAL byte progress (not simulated)
const xhr = new XMLHttpRequest();

xhr.upload.addEventListener("progress", (event) => {
  if (event.lengthComputable) {
    // REAL progress: actual bytes uploaded / total bytes
    const percentComplete = Math.round((event.loaded / event.total) * 100);
    setUploadProgress(percentComplete);
    
    if (percentComplete < 100) {
      setUploadPhase("uploading");  // Still uploading
    } else {
      setUploadPhase("processing"); // Upload done, server processing
    }
  }
});
```

### Processing Stage Progress

```typescript
// Status-to-progress mapping

const STATUS_PROGRESS: Record<string, number> = {
  'uploaded':    10,   // File in storage
  'queued':      20,   // In processing queue
  'extracting':  40,   // PDF/image analysis
  'analyzing':   70,   // AI extraction running
  'suggested':   90,   // Ready for approval
  'finalized':  100,   // Complete
  'error':        0,   // Failed
};
```

### Realtime Status Updates

```typescript
// client/src/hooks/use-appwrite-realtime.ts

export function useAppwriteRealtime(userId: string | null) {
  useEffect(() => {
    const channel = `databases.${DATABASE_ID}.collections.${COLLECTIONS.FILES}.documents`;
    
    // Subscribe to file status changes via Appwrite Realtime
    const unsubscribe = client.subscribe(channel, (event) => {
      // Automatic UI refresh when status changes
      queryClient.invalidateQueries({ queryKey: ['/api/appwrite/files'] });
    });

    return () => unsubscribe();
  }, [userId]);
}

// Fallback polling (when WebSocket unavailable)
export function useFileStatusPolling(enabled: boolean, intervalMs = 5000) {
  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['/api/appwrite/files'] });
    }, intervalMs);
    return () => clearInterval(interval);
  }, [enabled, intervalMs]);
}
```

### Failure and Retry Handling

```typescript
// server/services/appwrite/processingGuardrails.ts

export const DEFAULT_RETRY_POLICY = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

// Exponential backoff with jitter
export async function withRetry<T>(
  operation: () => Promise<T>,
  policy = DEFAULT_RETRY_POLICY
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      if (attempt < policy.maxRetries) {
        const delay = Math.min(
          policy.baseDelayMs * Math.pow(policy.backoffMultiplier, attempt),
          policy.maxDelayMs
        );
        await sleep(delay + Math.random() * 1000); // Jitter
      }
    }
  }
  throw lastError;
}
```

---

## 4. Financial Auto-Categorization Logic

### Vendor Detection

```typescript
// Extracted by Gemini Vision API
interface ExtractedFields {
  vendor_name: string | null;      // "Walmart", "Amazon", "Shell"
  payee: string | null;            // Who received payment
  payer: string | null;            // Who paid
  total_amount: { value: number; currency: string } | null;
  // ... other fields
}

// Vendor-to-category mapping (extensible)
const VENDOR_CATEGORY_MAP: Record<string, string> = {
  'walmart': 'Groceries',
  'amazon': 'Shopping',
  'shell': 'Transportation/Gas',
  'starbucks': 'Dining/Coffee',
  'comcast': 'Utilities/Internet',
  'pg&e': 'Utilities/Electric',
  'kaiser': 'Medical/Insurance',
};
```

### Expense vs Income Detection

```typescript
function classifyTransaction(extracted: ExtractedFields, docType: string) {
  // Check document type first
  if (docType === 'paystub') {
    return { isExpense: false, isIncome: true };
  }
  
  if (docType === 'receipt' || docType === 'invoice') {
    return { isExpense: true, isIncome: false };
  }
  
  // Check for refunds/credits (negative amounts)
  if (extracted.total_amount?.value < 0) {
    return { isExpense: false, isIncome: true };
  }
  
  // Default to expense
  return { isExpense: true, isIncome: false };
}
```

### Category Assignment with Confidence

```typescript
// Categories with top 3 candidates
interface CategoryOutput {
  suggested_category: string;
  confidence: number;  // 0.0 to 1.0
  category_candidates: [
    { category: string; score: number },
    { category: string; score: number },
    { category: string; score: number }
  ];
  needs_user_review: boolean;
}

// Thresholds
const CONFIDENCE_THRESHOLD = 0.85;           // Auto-accept if above
const CATEGORY_CONFIDENCE_THRESHOLD = 0.90;  // High confidence required

// Flag low-confidence for mandatory review
function requiresApproval(output: CategoryOutput): boolean {
  return (
    output.confidence < CONFIDENCE_THRESHOLD ||
    output.needs_user_review ||
    output.category_candidates[1]?.score > 0.70  // Close second choice
  );
}
```

### Re-categorization Updates Historical Reports

```typescript
async function handleRecategorization(fileId: string, newCategory: string) {
  // 1. Update file record
  await updateFile(fileId, { finalizedCategory: newCategory });
  
  // 2. If financial entry exists, update it
  const existingEntry = await findFinancialEntryByDocument(fileId);
  if (existingEntry) {
    await updateFinancialEntry(existingEntry.id, {
      category: newCategory,
      updatedReason: 'user_recategorization',
    });
  }
  
  // 3. Recalculate category totals
  await recalculateCategoryTotals(existingEntry?.userId);
}
```

---

## 5. Approval-First Data Model

### Critical Rule: Nothing Touches Financials Until Approved

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DATA ISOLATION GUARANTEE                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   APPWRITE SIDE (Processing)          POSTGRES SIDE (Financials)   │
│   ══════════════════════════          ══════════════════════════   │
│                                                                     │
│   files                               expenses                      │
│   ├─ storageFileId                    ├─ id                        │
│   ├─ status: suggested ──────────────┤   (NO ENTRY until          │
│   ├─ suggestedCategory              X│    status='finalized')      │
│   ├─ extractedFields                  │                             │
│   └─ aiConfidence                     ├─ sourceDocumentId ◄────────┤
│                                       ├─ amount                     │
│   analysis_runs                       ├─ category                   │
│   ├─ ocrOutput                        └─ approvedAt                 │
│   └─ verificationResult                                             │
│                                                                     │
│   ONLY on finalize():                                               │
│   ┌────────────────────────────────────────────────────────────┐   │
│   │  if (file.status === 'finalized') {                        │   │
│   │    createFinancialEntry(file.finalizedFields);             │   │
│   │  }                                                         │   │
│   └────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Appwrite Database Schema

```typescript
// Collection: files
interface AppwriteFile {
  $id: string;
  userId: string;
  
  // Storage reference
  storageFileId: string;
  fileName: string;
  fileType: string;  // MIME type
  fileSize: number;
  fileHash: string;  // SHA-256 for dedup
  
  // Processing status
  status: 'uploaded'|'queued'|'extracting'|'analyzing'|'suggested'|'finalized'|'error';
  
  // AI suggestions (PRE-approval)
  suggestedCategory?: string;
  extractedFields?: string;  // JSON
  aiSummary?: string;
  aiConfidence?: number;
  
  // User finalized (POST-approval)
  finalizedCategory?: string;
  finalizedFields?: string;
  finalizedBy?: string;
  finalizedAt?: string;
  finalizedFromAnalysisRunId?: string;
  
  // Metadata
  title?: string;
  description?: string;
  isConfidential?: boolean;
  errorMessage?: string;
}

// Collection: analysis_runs
interface AnalysisRun {
  $id: string;
  fileId: string;
  userId: string;
  runType: 'ocr' | 'vision' | 'categorization';
  modelProvider: string;
  modelVersion: string;
  promptVersionHash: string;
  inputHash: string;
  rawOutput: string;
  normalizedOutput: string;
  suggestedCategory?: string;
  confidence?: number;
  status: 'success' | 'failed' | 'timeout';
  latencyMs?: number;
  estimatedCost?: number;
}

// Collection: categories
interface Category {
  $id: string;
  name: string;
  displayName: string;
  parentCategory?: string;
  isActive: boolean;
}

// Collection: idempotency_records
interface IdempotencyRecord {
  $id: string;  // = idempotencyKey
  fileId: string;
  status: 'processing' | 'completed' | 'failed';
  analysisRunId?: string;
}
```

---

## 6. Verification: "How I Know It's Working"

### Logs to Monitor

```bash
# Successful processing:
[Appwrite] Queue processor: found 1 files to process
[Appwrite] Starting analysis for file abc123...
[Appwrite] Pass A (extraction) completed in 2340ms
[Appwrite] Pass B (verification) completed in 890ms
[Appwrite] File abc123 analyzed: category=Financial/Receipt, confidence=0.94
[Appwrite Finalize] File abc123 finalized by user xyz789

# Error states:
[Appwrite] Analysis failed for file abc123: API rate limit exceeded
[Appwrite] Retrying file abc123 (attempt 2/3)...
[Appwrite] File abc123 marked as ERROR after 3 failed attempts
```

### Database State Queries

```sql
-- Check file status distribution (healthy system):
-- finalized: 85%, suggested: 10%, analyzing: 3%, error: 2%

-- Find stuck files (in processing > 5 minutes):
SELECT * FROM files
WHERE status IN ('extracting', 'analyzing')
AND "$updatedAt" < NOW() - INTERVAL '5 minutes';

-- Verify approval-first guarantee (should return 0):
SELECT COUNT(*) FROM expenses e
JOIN files f ON e.source_document_id = f.$id
WHERE f.status != 'finalized';
```

### Test Documents

| Document | Expected Output |
|----------|-----------------|
| grocery_receipt.jpg | doc_type: "receipt", vendor: "Safeway", amount: $45.67, confidence: 0.92 |
| bank_statement.pdf | doc_type: "bank_statement", period: Jan 2024, balance: $5,432.10 |
| blurry_photo.jpg | confidence: 0.45, needs_user_review: true, warnings: ["blur detected"] |

### Health Checks

```typescript
// GET /api/appwrite/status
{
  configured: true,
  database: "connected",
  storage: "connected",
  queueProcessor: "running",
  stuckFiles: 0,
  errorRate: "2.3%"
}
```

---

## 7. Replit-Specific Setup

### Folder Structure

```
/
├── client/src/
│   ├── components/appwrite-file-upload.tsx
│   ├── hooks/use-appwrite-realtime.ts
│   ├── lib/appwrite.ts
│   └── pages/appwrite-documents.tsx
├── server/
│   ├── routes/appwrite.routes.ts
│   └── services/appwrite/
│       ├── client.ts
│       ├── setup.ts
│       ├── fileService.ts
│       ├── analysisService.ts
│       ├── extractionPipeline.ts
│       ├── pdfAnalyzer.ts
│       ├── imageQualityAnalyzer.ts
│       ├── processingGuardrails.ts
│       └── selftest.ts
└── shared/schema.ts
```

### Environment Variables

```bash
# Required
APPWRITE_ENDPOINT=https://nyc.cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=696dc1cb0033cf776b3b
APPWRITE_API_KEY=<server-side-api-key>
GEMINI_API_KEY=<google-gemini-key>
```

### Scaling Limits (Appwrite Cloud)

| Limit | Value |
|-------|-------|
| Max file size | 50MB |
| Max files/user | 10,000 |
| Monthly bandwidth | 10GB |
| Database size | 1GB |
| Realtime connections | 1,000 |

---

## 8. Failure Points & Hard-Won Lessons

### Common Integration Failures

| Issue | Symptom | Solution |
|-------|---------|----------|
| WebSocket drops | Realtime stops after 5min | Polling fallback |
| Cold starts | First request slow (30s+) | Queue processor keeps warm |
| CORS errors | Client SDK fails | Proxy through Express |
| API key exposure | Security risk | Server SDK only |

### Why Uploads Stall

1. **File size exceeded**: Progress freezes at 100% → Set explicit limits
2. **Network timeout**: Upload hangs → Chunk large files
3. **Storage quota**: 403 errors → Check quota before upload

### Why OCR Silently Fails

1. **Rate limits**: Files stuck in "analyzing" → Exponential backoff
2. **Malformed PDF**: Empty extraction → PDF validation + image fallback
3. **Token overflow**: Truncated output → Chunk documents

### Preventing Financial Corruption

1. Use database transactions for finalize
2. Implement idempotency keys
3. Maintain full audit trail

---

## 9. Minimal Working MVP

### Upload Handler

```typescript
async function handleUpload(file: File) {
  const xhr = new XMLHttpRequest();
  
  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      setProgress(Math.round((e.loaded / e.total) * 100));
    }
  };
  
  xhr.onload = () => {
    if (xhr.status === 200) {
      // Realtime updates status as processing happens
    }
  };
  
  const formData = new FormData();
  formData.append('file', file);
  xhr.open('POST', '/api/appwrite/files/upload');
  xhr.send(formData);
}
```

### Processing Function

```typescript
async function analyzeFile(file: AppwriteFile) {
  await updateFile(file.$id, { status: 'extracting' });
  
  const buffer = await getFileBuffer(file.storageFileId);
  const content = await extractContent(buffer, file.fileType);
  
  await updateFile(file.$id, { status: 'analyzing' });
  
  const result = await runTwoPassPipeline(content, file.$id);
  
  await updateFile(file.$id, {
    status: result.needsReview ? 'awaiting_user' : 'suggested',
    suggestedCategory: result.category,
    extractedFields: JSON.stringify(result.fields),
    aiConfidence: result.confidence,
  });
}
```

### Approval Logic

```typescript
router.post('/files/:id/approve', async (req, res) => {
  const { finalizedCategory, finalizedFields } = req.body;
  
  // Finalize in Appwrite
  await updateFile(fileId, {
    status: 'finalized',
    finalizedCategory,
    finalizedFields: JSON.stringify(finalizedFields),
    finalizedAt: new Date().toISOString(),
  });
  
  // NOW create financial entry
  await createFinancialEntry({
    category: finalizedCategory,
    amount: finalizedFields.total_amount?.value,
    sourceDocumentId: fileId,
  });
});
```

---

## 10. Implementation Status

### What's Implemented (Working Today)

| Feature | Status | Location |
|---------|--------|----------|
| File upload with real progress | ✅ Complete | `appwrite-file-upload.tsx` |
| Appwrite Storage integration | ✅ Complete | `fileService.ts` |
| Status state machine | ✅ Complete | `client.ts` (FILE_STATUS) |
| Queue processor (15s poll) | ✅ Complete | `analysisService.ts` |
| PDF analysis (digital/scanned) | ✅ Complete | `pdfAnalyzer.ts` |
| Image quality detection | ✅ Complete | `imageQualityAnalyzer.ts` |
| Two-pass Gemini extraction | ✅ Complete | `extractionPipeline.ts` |
| Category candidates + confidence | ✅ Complete | `extractionTypes.ts` |
| Approval UI (accept/edit/skip) | ✅ Complete | `appwrite-documents.tsx` |
| Finalization endpoint | ✅ Complete | `appwrite.routes.ts` |
| Financial posting on finalize | ✅ Complete | Creates expense/income in Postgres |
| Idempotency + retry logic | ✅ Complete | `processingGuardrails.ts` |
| Realtime invalidation | ✅ Complete | `use-appwrite-realtime.ts` |
| Polling fallback | ✅ Complete | `useFileStatusPolling` hook |
| Health checks + selftest | ✅ Complete | `selftest.ts` |
| Stuck job cleanup | ✅ Complete | `cleanupStaleProcessings()` |

### What's Aspirational (Documented but Not Yet Implemented)

| Feature | Status | Notes |
|---------|--------|-------|
| QuickBooks-style mapping | ⚠️ Partial | Category mapping exists, no QuickBooks export yet |
| Stage-level realtime progress | ⚠️ Partial | Realtime invalidates list, not granular stage updates |
| Mobile camera capture | ❌ Not started | PWA camera API not implemented |
| Resumable uploads | ❌ Not started | Large file chunking not implemented |
| Batch approval | ❌ Not started | Single-file approval only |

### How Financial Posting Works (Implemented)

When a document is approved via `POST /api/appwrite/files/:id/approve`:

1. **Appwrite file is finalized** with status, category, and fields
2. **Category-to-type mapping** determines if expense or income:
   - Income categories: paystub, salary, wages, deposit, refund, dividend, etc.
   - All other categories default to expense
3. **Financial entry is created** in Postgres with:
   - Amount converted from dollars to cents
   - Linked to source document via `documentId`
   - User's environment (demo/live) respected
4. **Response includes** the created financial entry ID and type

```typescript
// From server/routes/appwrite.routes.ts
// Income categories use controlled mapping (exact match only):
const INCOME_CATEGORY_MAP: Record<string, boolean> = {
  'paystub': true, 'pay_stub': true, 'salary': true, 'wages': true,
  'bonus': true, 'dividend': true, 'rental_income': true,
  'child_support_received': true, 'alimony_received': true,
  'refund': true, 'deposit': true,
  // ... more controlled entries
};

// Validation and idempotency:
// 1. Amount must be positive number
// 2. Check for existing entry with same documentId (prevent duplicates)
// 3. Create expense or income based on strict category match

if (isIncomeCategory(category)) {
  await storage.createIncome({ userId, source, amount, documentId, ... });
} else {
  await storage.createExpense({ userId, category, description, amount, documentId, ... });
}
```

**Safety Features:**
- **Controlled vocabulary**: Only exact category matches determine income vs expense
- **Idempotency guard**: Checks for existing entries before creating (prevents duplicates on retry)
- **Amount validation**: Rejects zero, negative, or non-numeric amounts
- **Non-blocking**: Financial posting failures don't fail the finalization

The financial entry includes `documentId` which links back to the Appwrite document, enabling full audit trail from upload → analysis → approval → financial record.

---

## Summary

This architecture ensures:
- **100% Appwrite Processing**: Every document through Appwrite storage + OCR ✅
- **Approval-First**: No financial entries until user approves ✅
- **Real Progress**: XHR upload events are real; processing stages via polling ✅
- **Confidence Scoring**: Two-pass extraction with verification ✅
- **Audit Trail**: Analysis runs + financial entries linked to source documents ✅
- **Failure Recovery**: Backoff, idempotency, stuck file cleanup ✅

Current implementation status: **~90% complete**

Priority items to complete:
1. Add vendor-to-category mapping table
2. Implement mobile camera capture
3. QuickBooks export integration
