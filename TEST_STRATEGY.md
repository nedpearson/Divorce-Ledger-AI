# Test Strategy

## Testing Framework

- **Backend**: Vitest + Supertest
  - `server/tests/api.test.ts`: Core API endpoint tests.
- **Frontend**: Vitest + React Testing Library (Standard for Vite/React)

## Running Tests

```bash
npx vitest run
```

## Test Coverage

The current test suite covers:

1. **Health Checks**: Verified `/health` and `/api/health` return 200 OK.
2. **Auth Session**: Verified `/api/auth/session` returns 401 Unauthorized for unauthenticated requests.
3. **Subscription**: Initial test for `/api/subscription` (found public by default, requires review if it should be protected).

## Critical Areas for Future Tests

1. **Mutation Tests**: Create/Update/Delete operations for violations, documents, and finances.
2. **Tier Enforcement**: Integration tests validating that users cannot exceed their subscription limits.
3. **QuickBooks/Firefly Integrations**: Mocked integration tests to ensure third-party syncing logic is robust.
4. **End-to-End (E2E)**: Playwright or Cypress tests for critical user journeys (Signup -> Upload -> Document Violation).
5. **Data Governance**: Automated tests for PII redacting and GDPR consent flows.
