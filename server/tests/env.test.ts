// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { isLiveMode, isDemoMode, getAppMode } from '../config';

describe('Environment Configuration', () => {
  it('should detect app modes correctly', () => {
    // These tests rely on the environment variables set during the test run
    // In CI we set APP_MODE=test
    expect(getAppMode()).toBeDefined();
    expect(['demo', 'live', 'development', 'test']).toContain(getAppMode());
  });

  it('isLiveMode should return false in test environment', () => {
    expect(isLiveMode()).toBe(false);
  });
});
