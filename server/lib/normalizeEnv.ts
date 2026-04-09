/**
 * normalizeEnv.ts
 *
 * Single source of truth for environment string normalization.
 *
 * Problem: The bootstrap service historically wrote `environment = 'live-prod'`
 * to the users table, but the schema type is `'live' | 'demo'`. Any variant
 * starting with "live" (live-prod, live-data, live-v2, etc.) should be
 * treated as the canonical `'live'` environment.
 *
 * Usage:
 *   import { normalizeEnv } from '../lib/normalizeEnv';
 *   const env = normalizeEnv(req.headers['x-environment']);
 */

export type CanonicalEnv = 'live' | 'demo';

/**
 * Normalizes any environment string variant to the canonical `'live' | 'demo'` type.
 *
 * @param raw - Raw value from a header, session, DB column, or cookie.
 * @returns `'live'` if the value starts with `'live'`, otherwise `'demo'`.
 */
export function normalizeEnv(raw: string | undefined | null): CanonicalEnv {
  if (!raw) return 'demo';
  const trimmed = raw.trim().toLowerCase();
  return trimmed.startsWith('live') ? 'live' : 'demo';
}

/**
 * Returns true if the environment is any live variant.
 * Useful for feature flags that need to be live-only.
 */
export function isLiveEnv(raw: string | undefined | null): boolean {
  return normalizeEnv(raw) === 'live';
}

/**
 * Returns true if the environment is the demo environment.
 */
export function isDemoEnv(raw: string | undefined | null): boolean {
  return normalizeEnv(raw) === 'demo';
}
