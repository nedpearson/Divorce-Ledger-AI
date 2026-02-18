# Appwrite M0 - Project Wiring Setup Guide

## Overview
This document covers the complete Milestone M0 (Project Wiring) setup for the Appwrite integration in Divorce Ledger.

## 1. Environment Configuration

### Required Secrets (Replit Secrets Tab)
| Secret Name | Description | Example |
|-------------|-------------|---------|
| `APPWRITE_API_KEY` | Server API key from Appwrite Console | `standard_abc123...` |

### Required Environment Variables (Replit Secrets Tab)
| Variable Name | Description | Value |
|---------------|-------------|-------|
| `APPWRITE_ENDPOINT` | Appwrite Cloud or self-hosted endpoint | `https://nyc.cloud.appwrite.io/v1` |
| `APPWRITE_PROJECT_ID` | Your Appwrite project ID | `696dc1cb0033cf776b3b` |

### Current Configuration Status
- APPWRITE_ENDPOINT: https://nyc.cloud.appwrite.io/v1
- APPWRITE_PROJECT_ID: 696dc1cb0033cf776b3b
- APPWRITE_API_KEY: (stored as secret)

## 2. Package Dependencies

### NPM Packages (package.json)
```json
{
  "appwrite": "^21.5.0",
  "node-appwrite": "^21.1.0"
}
```

Both packages are installed:
- `appwrite` - Client-side SDK (for potential frontend Realtime subscriptions)
- `node-appwrite` - Server-side SDK (for all backend operations)

## 3. Client Configuration

### File: `server/services/appwrite/client.ts`

The client exports:
- `initializeAppwrite()` - Initialize the SDK with environment variables
- `isAppwriteConfigured()` - Check if all required env vars are set
- `databases` - Appwrite Databases service
- `storage` - Appwrite Storage service
- `users` - Appwrite Users service
- `ID`, `Query`, `Permission`, `Role` - Utility exports

### Constants
```typescript
DATABASE_ID = 'divorce_ledger_db'
STORAGE_BUCKET_ID = 'document_files'

COLLECTIONS = {
  FILES: 'files',
  ANALYSIS_RUNS: 'analysis_runs',
  CATEGORIES: 'categories',
  USER_OVERRIDES: 'user_overrides'
}

FILE_STATUS = {
  UPLOADED, QUEUED, EXTRACTING, ANALYZING,
  SUGGESTED, AWAITING_USER, FINALIZED, ERROR
}
```

## 4. Verification Checklist

### A. Appwrite Console Verification
1. **Login to Appwrite Console**: https://cloud.appwrite.io
2. **Select Project**: Navigate to project `696dc1cb0033cf776b3b`

3. **Verify Database**:
   - [ ] Click **Databases** in sidebar
   - [ ] Confirm database `divorce_ledger_db` exists
   - [ ] Click into database and verify 4 collections:
     - [ ] `files` - Document intake records
     - [ ] `analysis_runs` - AI analysis history
     - [ ] `categories` - Document categories
     - [ ] `user_overrides` - User correction history

4. **Verify Storage**:
   - [ ] Click **Storage** in sidebar
   - [ ] Confirm bucket `document_files` exists
   - [ ] Check bucket settings:
     - Maximum file size: 50MB
     - Allowed extensions: pdf, png, jpg, jpeg, gif, tiff, doc, docx, xls, xlsx, csv, txt

5. **Verify API Key**:
   - [ ] Click **Settings** > **API Keys**
   - [ ] Confirm a server key exists with these scopes:
     - databases.read, databases.write
     - collections.read, collections.write
     - documents.read, documents.write
     - files.read, files.write
     - buckets.read, buckets.write

### B. Replit Console Commands
Run these commands in the Replit Shell to verify the setup:

```bash
# 1. Check environment variables are set
echo "APPWRITE_ENDPOINT: $APPWRITE_ENDPOINT"
echo "APPWRITE_PROJECT_ID: $APPWRITE_PROJECT_ID"
echo "APPWRITE_API_KEY set: $([ -n \"$APPWRITE_API_KEY\" ] && echo 'YES' || echo 'NO')"

# 2. Check packages installed
npm list appwrite node-appwrite

# 3. Test API connection (with server running)
curl -s http://localhost:5000/api/appwrite/status | jq .

# 4. Verify categories are seeded
curl -s http://localhost:5000/api/appwrite/categories | jq '.categories | length'

# 5. Run database setup (if needed)
npx tsx server/services/appwrite/setup.ts
```

### C. API Endpoint Tests

```bash
# Status check (should return configured: true, connected: true)
curl -s http://localhost:5000/api/appwrite/status

# Expected response:
# {"configured":true,"connected":true,"database":true,"storage":true}

# List categories (should return 8 default categories)
curl -s http://localhost:5000/api/appwrite/categories

# Test file upload (development mode with X-User-Id header)
curl -X POST http://localhost:5000/api/appwrite/files/upload \
  -H "X-User-Id: test-user-1" \
  -F "file=@/path/to/test.pdf" \
  -F "title=Test Document"

# List files for user
curl -s http://localhost:5000/api/appwrite/files \
  -H "X-User-Id: test-user-1"
```

## 5. Troubleshooting

### Common Issues

**Issue: "Missing required environment variable"**
- Ensure all three variables are set in Replit Secrets tab
- Restart the workflow after adding secrets

**Issue: "401 Unauthorized" from Appwrite**
- Verify API key has correct scopes
- Check API key hasn't expired
- Ensure endpoint URL includes `/v1` suffix

**Issue: "Database not found"**
- Run setup script: `npx tsx server/services/appwrite/setup.ts`
- Check Appwrite Console for database creation errors

**Issue: "Storage bucket not found"**
- Run setup script to create bucket
- Verify bucket ID matches `document_files`

## 6. Security Notes

### Production Authentication
- In production (`NODE_ENV=production`), all file endpoints require session authentication
- Returns 401 Unauthorized if no session exists
- No demo-user fallback in production

### Development Mode
- Allows `X-User-Id` header override for testing
- Falls back to `demo-user` if no header provided
- Only active when `NODE_ENV=development`

### File Access Control
- All file operations validate ownership (`file.userId === requestUserId`)
- Returns 403 Forbidden for cross-tenant access attempts
- Returns 404 for non-existent files

## 7. File Structure

```
server/services/appwrite/
├── client.ts          # SDK initialization and exports
├── setup.ts           # Database/storage provisioning
├── fileService.ts     # File CRUD operations
└── analysisService.ts # AI analysis pipeline

server/routes/
└── appwrite.routes.ts # REST API endpoints
```

## 8. Next Steps (M1+)

After M0 verification is complete:
- M1: Frontend document upload UI
- M2: Real-time status updates via Appwrite Realtime
- M3: AI analysis queue processing
- M4: User approval workflow UI
