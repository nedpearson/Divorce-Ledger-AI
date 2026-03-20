import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock browser globals if needed
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
