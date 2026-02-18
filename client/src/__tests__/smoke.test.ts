/**
 * Basic smoke tests for Divorce Ledger frontend
 * 
 * These tests verify that page modules export correctly and core utilities work.
 * For full DOM rendering tests, install @testing-library/react.
 * 
 * To run: cd client && npx vitest run --config vitest.config.ts
 * 
 * Manual testing checklist:
 * 1. Dashboard: Loading spinner visible, data loads without blank screen
 * 2. Documents: Empty state shows when no docs, error toast on failed upload
 * 3. Violations: Form validation messages appear, loading states work
 * 4. Settings: Form saves successfully, error handling on API failure
 * 5. Offline: Service worker caches app shell, shows offline indicator
 */

import { describe, it, expect } from 'vitest';

describe('Page Module Exports', () => {
  it('exports Login page component', async () => {
    const mod = await import('../pages/login');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });

  it('exports Home page component', async () => {
    const mod = await import('../pages/home');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });

  it('exports Dashboard page component', async () => {
    const mod = await import('../pages/dashboard');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });

  it('exports Documents page component', async () => {
    const mod = await import('../pages/documents');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });

  it('exports Violations page component', async () => {
    const mod = await import('../pages/violations');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });

  it('exports Finances page component', async () => {
    const mod = await import('../pages/finances');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });

  it('exports Settings page component', async () => {
    const mod = await import('../pages/settings');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });
});

describe('Core Utilities', () => {
  it('ErrorBoundary is a React component class', async () => {
    const { ErrorBoundary } = await import('../components/error-boundary');
    expect(ErrorBoundary).toBeDefined();
    expect(ErrorBoundary.prototype).toBeDefined();
  });

  it('logFrontendError is a function', async () => {
    const { logFrontendError } = await import('../lib/error-logger');
    expect(logFrontendError).toBeDefined();
    expect(typeof logFrontendError).toBe('function');
  });

  it('setupGlobalErrorHandlers is a function', async () => {
    const { setupGlobalErrorHandlers } = await import('../lib/error-logger');
    expect(setupGlobalErrorHandlers).toBeDefined();
    expect(typeof setupGlobalErrorHandlers).toBe('function');
  });
});
