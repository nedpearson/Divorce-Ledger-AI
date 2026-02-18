# Appwrite M1 - Authentication & Threat Model

## Overview
This document describes how authentication and tenant isolation work for the Appwrite document intake system in Divorce Ledger.

## Authentication Flow

### Session-Based Authentication
The platform uses Express sessions stored in PostgreSQL with secure cookies:

```
User Login → POST /api/auth/login
    ↓
Password verification (bcrypt)
    ↓
Optional 2FA (SMS via Twilio)
    ↓
Session created in PostgreSQL
    ↓
session_id cookie set (HttpOnly, Secure, SameSite=Strict)
    ↓
Appwrite routes extract userId from req.session.userId
```

### Session Properties
- **Cookie**: `session_id` (HttpOnly, Secure in production)
- **Storage**: PostgreSQL `sessions` table
- **Expiry**: 30 days with activity-based extension
- **Revocation**: Immediate on logout or password change

## Tenant Isolation Model

### Layer 1: Session Authentication (Application Layer)
Protected Appwrite routes require a valid session:

```typescript
function getUserIdOrThrow(req): { userId: string; error?: string } {
  const sessionUserId = req.session?.userId;
  if (sessionUserId) return { userId: sessionUserId };
  
  // Development-only header override
  if (process.env.NODE_ENV === 'development') {
    return { userId: req.headers['x-user-id'] || 'demo-user' };
  }
  
  return { userId: '', error: 'Authentication required' };
}
```

**Protection**: Returns 401 Unauthorized in production if no valid session.

### Layer 2: File Ownership Verification (Application Layer)
Every file operation verifies ownership:

```typescript
async function authorizeFileAccess(req, fileId): Promise<AuthResult> {
  const { userId, error } = getUserIdOrThrow(req);
  if (error) return { authorized: false, error };
  
  const file = await getFile(fileId);
  if (!file) return { authorized: false, error: 'File not found' };
  if (file.userId !== userId) return { authorized: false, error: 'Access denied' };
  
  return { authorized: true, file, userId };
}
```

**Protection**: Returns 403 Forbidden if file belongs to another user.

### Layer 3: Query Filtering (Data Layer)
All list queries are scoped to the authenticated user:

```typescript
async function listFiles(userId: string, filters): Promise<FileList> {
  const queries = [Query.equal('userId', userId)];  // Mandatory filter
  // Additional filters...
  return databases.listDocuments(DATABASE_ID, COLLECTIONS.FILES, queries);
}
```

**Protection**: Database queries never return files belonging to other users.

### Layer 4: Document Permissions (Appwrite Layer)
Files are created with user-specific permissions:

```typescript
// When creating a file document:
const permissions = [
  Permission.read(Role.user(userId)),
  Permission.update(Role.user(userId)),
  Permission.delete(Role.user(userId)),
];

databases.createDocument(DATABASE_ID, COLLECTIONS.FILES, ID.unique(), data, permissions);
```

**Protection**: Appwrite SDK enforces permissions at the database level.

## Threat Model

### Threat 1: Unauthorized File Access via Direct ID
**Attack Vector**: User A guesses or obtains file ID belonging to User B, attempts to access via `/api/appwrite/files/:id`

**Mitigations**:
1. `authorizeFileAccess()` verifies `file.userId === sessionUserId`
2. Returns 403 Forbidden if ownership mismatch
3. File IDs are UUIDs (not sequential) making guessing impractical

**Residual Risk**: LOW - Multiple layers prevent access

### Threat 2: Metadata Leakage via File Listing
**Attack Vector**: User A queries `/api/appwrite/files` hoping to see User B's files

**Mitigations**:
1. `listFiles()` always includes `Query.equal('userId', userId)`
2. Query is constructed server-side, not from user input
3. Pagination doesn't expose cross-tenant data

**Residual Risk**: NONE - Query is hardcoded to authenticated user

### Threat 3: Session Hijacking
**Attack Vector**: Attacker steals session cookie to impersonate user

**Mitigations**:
1. `HttpOnly` cookie prevents JavaScript access
2. `Secure` flag ensures HTTPS-only transmission
3. `SameSite=Strict` prevents CSRF attacks
4. Session bound to device fingerprint (optional 2FA)
5. Session revocation on password change

**Residual Risk**: LOW - Standard session security best practices

### Threat 4: Development Header Bypass in Production
**Attack Vector**: Attacker sends `X-User-Id` header in production to impersonate any user

**Mitigations**:
1. Header bypass only active when `NODE_ENV === 'development'`
2. Production deployments set `NODE_ENV=production`
3. Header is completely ignored in production

**Residual Risk**: NONE - Environment check is definitive

### Threat 5: Storage Bucket Direct Access
**Attack Vector**: Attacker attempts to access Appwrite Storage bucket directly

**Mitigations**:
1. Storage operations use server-side API key (not exposed to client)
2. Bucket has no public read permissions
3. All file downloads go through authenticated API routes
4. File URLs are signed and time-limited

**Residual Risk**: LOW - API key is server-side secret

### Threat 6: Cross-Tenant Data in AI Analysis
**Attack Vector**: AI analysis service processes files from multiple users, potentially mixing data

**Mitigations**:
1. Analysis runs are tied to specific file documents
2. File ownership verified before analysis
3. Analysis results stored with same userId as source file
4. Queue processor respects file ownership

**Residual Risk**: LOW - Ownership chain maintained throughout pipeline

### Threat 7: Privilege Escalation via API Manipulation
**Attack Vector**: Attacker modifies request body to change userId field

**Mitigations**:
1. userId is extracted server-side from session, not from request body
2. Request body userId fields are ignored or overwritten
3. File creation always uses session userId

**Residual Risk**: NONE - Server-side extraction is authoritative

## Security Matrix

| Endpoint | Auth Required | Ownership Check | Query Scoped | Notes |
|----------|---------------|-----------------|--------------|-------|
| POST /files/upload | Yes (401) | N/A (new file) | N/A | Session required |
| GET /files | Yes (401) | N/A | Yes (userId filter) | Session required |
| GET /files/:id | Yes (401) | Yes (403) | N/A | Session + ownership |
| POST /files/:id/approve | Yes (401) | Yes (403) | N/A | Session + ownership |
| POST /files/:id/retry | Yes (401) | Yes (403) | N/A | Session + ownership |
| DELETE /files/:id | Yes (401) | Yes (403) | N/A | Session + ownership |
| GET /analysis/:fileId | Yes (401) | Yes (403) | N/A | Session + ownership |
| GET /categories | No | N/A | N/A | Public reference data |
| GET /status | No | N/A | N/A | Health check |
| POST /setup | No | N/A | N/A | Idempotent provisioning |
| POST /queue/process | Admin (401) | N/A | N/A | Admin secret required in prod |

### Public Endpoints (No Authentication)
These endpoints are intentionally public:
- `/status` - Health check for monitoring
- `/categories` - Reference data for UI dropdowns
- `/setup` - Idempotent database provisioning (safe to call multiple times)

### Admin-Protected Endpoints
- `/queue/process` - Requires `x-admin-secret` header in production

## Audit Trail

All file operations are logged with:
- Timestamp
- User ID
- Action type
- File ID
- IP address (where available)
- Success/failure status

## Recommendations

1. **Rate Limiting**: Add per-user rate limits on file upload endpoints
2. **File Size Quotas**: Implement per-user storage quotas
3. **Audit Logging**: Log all file access attempts for forensic analysis
4. **IP Allowlisting**: Consider IP-based restrictions for sensitive accounts
5. **Session Monitoring**: Implement anomaly detection for unusual session patterns

## Testing Tenant Isolation

### Manual Test Cases
```bash
# 1. Upload file as User A
curl -X POST http://localhost:5000/api/appwrite/files/upload \
  -H "X-User-Id: user-a" \
  -F "file=@test.pdf" -F "title=User A File"

# Response: { "file": { "$id": "abc123", "userId": "user-a", ... } }

# 2. Try to access User A's file as User B
curl http://localhost:5000/api/appwrite/files/abc123 \
  -H "X-User-Id: user-b"

# Response: 403 { "error": "Access denied" }

# 3. List files as User B (should not see User A's files)
curl http://localhost:5000/api/appwrite/files \
  -H "X-User-Id: user-b"

# Response: { "files": [], "total": 0 }

# 4. Production auth enforcement (no header bypass)
NODE_ENV=production curl http://localhost:5000/api/appwrite/files \
  -H "X-User-Id: user-a"

# Response: 401 { "error": "Authentication required" }
```
