import { z } from "zod";

/**
 * Canonical APP_MODE type
 */
export type AppMode = 'demo' | 'live' | 'development' | 'test';

/**
 * Environment configuration schema
 */
const envSchema = z.object({
  APP_MODE: z.enum(['demo', 'live', 'development', 'test']).default('development'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().optional(), // Allow server to start without DB
  SESSION_SECRET: z.string().optional(), // Allow server to start in degraded mode
  CRON_ENABLED: z.string().optional().transform(v => v === 'true'),
});

// Cache the parsed config
let _config: z.infer<typeof envSchema> | null = null;

export function getConfig() {
  if (!_config) {
    const rawData = {
      APP_MODE: process.env.APP_MODE || (process.env.NODE_ENV === 'production' ? 'live' : 'development'),
      NODE_ENV: process.env.NODE_ENV,
      DATABASE_URL: process.env.DATABASE_URL,
      SESSION_SECRET: process.env.SESSION_SECRET,
      CRON_ENABLED: process.env.CRON_ENABLED,
    };
    _config = envSchema.parse(rawData);
  }
  return _config;
}

/**
 * Lightweight helpers for mode detection
 */
export const getAppMode = (): AppMode => getConfig().APP_MODE as AppMode;
export const isLiveMode = () => getAppMode() === 'live';
export const isDemoMode = () => getAppMode() === 'demo';
export const isDevMode = () => getAppMode() === 'development';
export const isTestMode = () => getAppMode() === 'test';

/**
 * Validate environment consistency
 */
export function validateEnv() {
  const mode = getAppMode();
  const nodeEnv = getConfig().NODE_ENV;

  console.log(`🔍 [Config] Mode: ${mode.toUpperCase()}, NodeEnv: ${nodeEnv.toUpperCase()}`);

  // 1. Detect dangerous overlaps
  if (mode === 'live' && nodeEnv === 'development') {
    throw new Error("DANGEROUS_CONFIG: APP_MODE=live cannot run with NODE_ENV=development. Possible production data exposure.");
  }

  if (nodeEnv === 'production' && mode === 'development') {
    throw new Error("INVALID_CONFIG: APP_MODE=development cannot run in production environment.");
  }

  // 2. Strict Live Checks
  if (mode === 'live') {
    const requiredLive = ['STRIPE_SECRET_KEY', 'SENDGRID_API_KEY'];
    for (const key of requiredLive) {
      if (!process.env[key]) {
        console.warn(`⚠️  [Config] Missing ${key} in LIVE mode. Some features will fail.`);
      }
    }
  }

  console.log("✅ [Config] Environment sanity check passed.");
}
