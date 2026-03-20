# Frontend Observability & Error Handling

This document describes the frontend error handling and observability infrastructure for Divorce Ledger.

## Error Boundary

**Location**: `client/src/components/error-boundary.tsx`

The global ErrorBoundary wraps the entire application in `App.tsx`. It:

- Catches React rendering errors
- Logs errors with structured data to the backend
- Shows a user-friendly error UI with:
  - "Try Again" button (attempts recovery)
  - "Go to Home" button
  - "Contact Support" link (opens email)
  - Error ID for support reference

## Error Logger

**Location**: `client/src/lib/error-logger.ts`

Provides centralized error logging:

```typescript
import { logFrontendError } from '@/lib/error-logger';

logFrontendError(new Error('Something failed'), { level: 'error' });
```

### Error Report Structure

```json
{
  "type": "frontend-error",
  "level": "error|warn|info",
  "route": "/current-path",
  "message": "Error message",
  "stack": "...",
  "userId": "user-id",
  "environment": "demo|live",
  "timestamp": "ISO date",
  "componentStack": "React component stack"
}
```

## Global Error Handlers

**Location**: `client/src/main.tsx`

`setupGlobalErrorHandlers()` installs:

- `window.onerror` - catches uncaught exceptions
- `window.unhandledrejection` - catches unhandled promise rejections

Both handlers use `logFrontendError()` to report errors.

## Backend Logging Endpoint

**Endpoint**: `POST /api/log/frontend-error`

In development, errors are logged to console.
In production, errors are sent to this endpoint for server-side logging.

## Running Frontend Tests

```bash
cd client
npx vitest run --config vitest.config.ts
```

Basic smoke tests verify that main pages and components export correctly.

## Network Error Handling

All pages use TanStack Query which provides built-in:

- `isLoading` states for loading spinners
- `isError` states for error messages
- Automatic retries on network failures (3 retries by default)
- Stale-while-revalidate for cached data

**Verified patterns in the codebase:**

- Dashboard: Shows `Loader2` spinner during data fetch (line 288)
- Documents: Shows loading skeleton while fetching (line 1067)
- All query hooks use proper loading/error handling

Example pattern used throughout:

```tsx
const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['/api/data'] });

if (isLoading) return <Loader />;
if (isError) return <ErrorState onRetry={refetch} />;
return <DataView data={data} />;
```

## Manual Testing Checklist

Before releases, verify:

1. **Dashboard**: Loading spinner visible, data loads without blank screen
2. **Documents**: Empty state shows when no docs, error toast on failed upload
3. **Violations**: Form validation messages appear, loading states work
4. **Settings**: Form saves successfully, error handling on API failure
5. **Offline**: Cached pages still accessible when network drops
6. **Error simulation**: Temporarily break API call to verify error boundary works

## Console Hygiene

- Use `logFrontendError()` for unexpected errors
- Avoid `console.log` in production code
- Debug logging only in development with `import.meta.env.DEV` check
- Valid console usage: error catches in try/catch blocks (logged with toast)
