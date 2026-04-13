# Developer Notes

This document explains expected behaviors and log messages that may appear during development.

## Expected Log Messages

### 1. `/api/auth/session` 401 Response

```
GET /api/auth/session 401 {"error":"No session"}
```

**This is expected behavior.** When the frontend loads, it checks for an existing session. If the user hasn't logged in yet (no session cookie), the server returns 401. This is the normal "not logged in" state, not an error.

### 2. `/api/version` 200/304 Responses

```
GET /api/version 304 in 0ms
```

**This is expected behavior.** The frontend polls `/api/version` every 30 seconds to check for hot reload updates. The 304 response means "Not Modified" - the version hasn't changed since the last check. This is normal caching behavior.

### PostCSS Warning Resolution

The warning "A PostCSS plugin did not pass the from option to postcss.parse" was a non-fatal notification originating from the internal Vite/Tailwind plugin chain.

**Resolution:**

- Upgraded `postcss`, `autoprefixer`, and `tailwindcss` to their latest minor versions to ensure compatibility with Vite 7's updated internal processing.
- Verified that the warning is eliminated in the development console while maintaining full UI functionality.
- Confirmed that no custom PostCSS plugins were missing the `from` property, as the project uses standard configurations.

## Health Check Endpoints

The application provides several health check endpoints:

| Endpoint                   | Description                                            |
| -------------------------- | ------------------------------------------------------ |
| `GET /health`              | Simple legacy health check, returns `{ status: 'ok' }` |
| `GET /api/health`          | Quick health check with database connectivity          |
| `GET /api/health/detailed` | Comprehensive check with record counts                 |
| `GET /api/health/firefly`  | Firefly III integration status                         |

Use `/api/health` to verify the backend is running properly. A successful response looks like:

```json
{
  "status": "healthy",
  "timestamp": "2026-01-19T18:00:00.000Z",
  "checks": {
    "database": { "status": "pass", "message": "Connected" },
    "tables": { "status": "pass", "message": "4/4 core tables found" }
  },
  "uptime": 3600
}
```

## Distinguishing Real Errors from Expected Behavior

| Log Pattern                   | Meaning            | Action                  |
| ----------------------------- | ------------------ | ----------------------- |
| `401 {"error":"No session"}`  | User not logged in | Expected - no action    |
| `304` on `/api/version`       | Version unchanged  | Expected - no action    |
| `500` responses               | Server error       | Investigate immediately |
| `Error:` or stack traces      | Real errors        | Investigate immediately |
| PostCSS "from option" warning | Vite internals     | Safe to ignore          |

## Notes

- The session semantics are intentional: 401 means "authenticate first"
- The version polling enables hot reload detection
- All health endpoints are unauthenticated for monitoring access

## [2026-04-13] Missing Monthly Bills Feature Hardening
- **Schema**: Added an explicit unique constraint \cycle_template_month_year_unq\ on \ecurring_bill_cycles\ to prevent duplicate cycles if multiple users hit the dashboard simultaneously or if cron runs overlapping cycles.
- **Cycle Generation**: Replaced standard insert with an \.onConflictDoNothing()\ pattern within \ecurring-bills.service.ts\ to leverage Postgres uniqueness, ensuring race-condition safety.
- **Detection Logic**: Validated exact conditions for marking a cycle \missing\ (pending status, not waived, upload window elapsed). Confirmed alerts trigger correctly on state transition.
- **Financial Propagation**: Exposed \hasMissingBills\ flag via \/api/obligations/summary\. Added a contextual visual warning token onto both the main dashboard's StatCard (Net Position & Due From Spouse) and the Obligations page. This ensures incomplete variables are explicitly flagged and stops missing inputs from being silently treated as $0.
- **UX Check**: Verified the widget rendering logic natively integrates.
- **Notes for future**: Add an option for users to manually waive historical months via UI, and enhance multi-document to single-cycle matching if multiple installments occur.

