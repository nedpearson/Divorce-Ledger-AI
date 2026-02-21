# Supabase Edge Functions - Deployment & Usage

## Overview

This directory contains production-ready Supabase Edge Functions  for the Divorce Ledger AI platform. Edge Functions run on Deno Deploy and provide server-side logic close to users.

## Available Functions

| Function | Purpose | Trigger |
|----------|---------|---------|
| `process-upload` | Validates uploads, creates jobs, triggers workflows | HTTP POST after file upload |
| `classify-document` | AI-powered document classification | Job queue or HTTP POST |
| `generate-thumbnail` | Creates document preview images | Job queue |
| `sync-integrations` | Syncs with external services | Scheduled or HTTP POST |
| `audit-log` | Centralizes audit logging | HTTP POST from backend |

## Prerequisites

```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-ref
```

## Deployment

### Deploy All Functions

```bash
# Deploy all functions at once
for func in process-upload classify-document generate-thumbnail sync-integrations audit-log; do
  supabase functions deploy $func --project-ref your-project-ref
done
```

### Deploy Individual Function

```bash
supabase functions deploy process-upload \
  --project-ref your-project-ref \
  --no-verify-jwt
```

### Set Environment Variables

```bash
# Set secrets for all functions
supabase secrets set \
  OPENAI_API_KEY=sk-... \
  GEMINI_API_KEY=... \
  --project-ref your-project-ref
```

## Testing Locally

### Start Local Supabase

```bash
# Start local Supabase stack
supabase start

# Serve functions locally
supabase functions serve process-upload --env-file ./supabase/.env.local
```

### Test with cURL

```bash
# Test process-upload function
curl -i --location --request POST \
  'http://localhost:54321/functions/v1/process-upload' \
  --header 'Authorization: Bearer eyJhbG...' \
  --header 'Content-Type: application/json' \
  --data '{
    "document_id": "550e8400-e29b-41d4-a716-446655440000",
    "file_path": "user-id/doc-id/file.pdf",
    "user_id": "user-id",
    "file_size": 102400,
    "mime_type": "application/pdf"
  }'
```

## Production Usage Examples

### 1. Process Upload (Called after file upload)

```typescript
// Frontend or Backend code
const { data, error } = await supabase.functions.invoke('process-upload', {
  body: {
    document_id: documentId,
    file_path: storagePath,
    user_id: userId,
    file_size: file.size,
    mime_type: file.type,
  },
});

if (error) {
  console.error('Upload processing failed:', error);
} else {
  console.log('Upload queued for processing:', data);
}
```

### 2. Classify Document (Manual trigger or job queue)

```typescript
// Trigger classification manually
const { data, error } = await supabaseServiceRole.functions.invoke(
  'classify-document',
  {
    body: {
      document_id: documentId,
      job_id: jobId, // Optional
    },
  }
);
```

### 3. Generate Thumbnail

```typescript
// Backend job worker calls this
const { data, error } = await supabaseServiceRole.functions.invoke(
  'generate-thumbnail',
  {
    body: {
      document_id: documentId,
      storage_path: 'user-id/doc-id/file.pdf',
    },
  }
);
```

### 4. Sync Integrations (Scheduled via cron)

```typescript
// Called by external cron job or Supabase scheduled function
const { data, error } = await supabaseServiceRole.functions.invoke(
  'sync-integrations',
  {
    body: {
      integration_id: integrationId,
      user_id: userId,
    },
  }
);
```

### 5. Audit Log (Centralized logging)

```typescript
// Backend calls this for important events
await supabaseServiceRole.functions.invoke('audit-log', {
  body: {
    user_id: userId,
    action: 'user_login',
    resource_type: 'auth',
    resource_id: sessionId,
    metadata: { ip_address: req.ip, user_agent: req.headers['user-agent'] },
    severity: 'info',
  },
});
```

## Monitoring & Debugging

### View Logs

```bash
# Stream logs for a specific function
supabase functions logs process-upload --project-ref your-project-ref

# View logs in dashboard
# Navigate to: Edge Functions → [function-name] → Logs
```

### Common Issues

#### Issue: Function times out
- **Cause**: Operation taking > 30 seconds
- **Solution**: Break into smaller chunks, use job queue for long operations

#### Issue: CORS errors
- **Cause**: Missing CORS headers
- **Solution**: Ensure corsHeaders are returned in all responses including errors

#### Issue: Service role key not working
- **Cause**: Using anon key instead of service role key
- **Solution**: Verify environment variables in Supabase dashboard

## Performance Optimization

### Cold Start Optimization

```typescript
// Keep clients initialized outside handler
let supabaseClient: SupabaseClient | null = null;

serve(async (req) => {
  // Reuse client across invocations
  if (!supabaseClient) {
    supabaseClient = createClient(/* ... */);
  }
  
  // ... rest of handler
});
```

### Batch Operations

```typescript
// Process multiple items in one function call
const { data: documents } = await supabase
  .from('documents')
  .select('*')
  .in('id', documentIds);

for (const doc of documents) {
  await processDocument(doc);
}
```

## Security Best Practices

1. **Validate all inputs** - Never trust client data
2. **Use service role key** - Required for bypassing RLS
3. **Implement rate limiting** - Prevent abuse
4. **Log sensitive operations** - Audit trail is critical
5. **Handle errors gracefully** - Don't expose internal details
6. **Set appropriate timeouts** - Default is 30s
7. **Validate JWT tokens** - For authenticated operations
8. **Sanitize user input** - Prevent injection attacks

## Cost Optimization

Edge Functions pricing (Supabase Pro plan):
- First 500K requests/month: Free
- Additional requests: $2 per 1M requests
- Execution time: Free up to 400K GB-seconds/month

Tips:
- Batch operations to reduce function calls
- Cache frequently accessed data
- Use database functions for simple queries
- Implement exponential backoff for retries

## CI/CD Integration

### GitHub Actions Deployment

```yaml
name: Deploy Edge Functions

on:
  push:
    branches: [main]
    paths:
      - 'supabase/functions/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1
        with:
          version: latest
      
      - name: Deploy Functions
        run: |
          supabase functions deploy process-upload \\
            --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
          supabase functions deploy classify-document \\
            --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

## Troubleshooting Guide

### Logs show "Function not found"
1. Verify function is deployed: `supabase functions list`
2. Check function name spelling
3. Ensure project-ref is correct

### Logs show "Unauthorized"
1. Check Authorization header format: `Bearer <token>`
2. Verify token is valid (not expired)
3. For service operations, use service role key

### Logs show "Timeout"
1. Check if operation is too slow
2. Add progress logging to identify bottleneck
3. Consider breaking into smaller operations
4. Use job queue for long-running tasks

### Database queries fail
1. Verify RLS policies allow service role
2. Check database connection in logs
3. Validate SQL syntax
4. Ensure tables exist

## Additional Resources

- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [Deno Documentation](https://deno.land/manual)
- [Deno Deploy Limits](https://deno.com/deploy/docs/pricing-and-limits)

## Support

For issues or questions:
1. Check this README first
2. Search Supabase Discord
3. Create issue in project repository
4. Contact platform team
