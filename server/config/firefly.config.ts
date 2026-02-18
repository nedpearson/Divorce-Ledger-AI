/**
 * Firefly III Configuration Module
 * 
 * This module handles configuration for Firefly III integration.
 * 
 * PRIMARY APPROACH (Per-User, Recommended):
 * - Each user connects their own Firefly III instance via /api/firefly/connect
 * - Tokens are encrypted with AES-256-GCM and stored in the database
 * - This is more secure than global environment variables
 * 
 * FALLBACK APPROACH (Global, Optional):
 * - Set FIREFLY_BASE_URL and FIREFLY_ACCESS_TOKEN as environment variables
 * - Used only when per-user connection is not available
 * - Not recommended for multi-tenant deployments
 */

export interface FireflyEnvConfig {
  baseUrl: string | null;
  accessToken: string | null;
  isConfigured: boolean;
}

let cachedConfig: FireflyEnvConfig | null = null;

export function getFireflyEnvConfig(): FireflyEnvConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const baseUrl = process.env.FIREFLY_BASE_URL?.trim() || null;
  const accessToken = process.env.FIREFLY_ACCESS_TOKEN?.trim() || null;

  cachedConfig = {
    baseUrl: baseUrl ? normalizeUrl(baseUrl) : null,
    accessToken,
    isConfigured: Boolean(baseUrl && accessToken),
  };

  return cachedConfig;
}

function normalizeUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export function validateFireflyEnv(): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const config = getFireflyEnvConfig();
  const errors: string[] = [];
  const warnings: string[] = [];

  if (config.baseUrl && !config.accessToken) {
    errors.push('FIREFLY_BASE_URL is set but FIREFLY_ACCESS_TOKEN is missing');
  }

  if (config.accessToken && !config.baseUrl) {
    errors.push('FIREFLY_ACCESS_TOKEN is set but FIREFLY_BASE_URL is missing');
  }

  if (config.baseUrl) {
    try {
      const url = new URL(config.baseUrl);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        errors.push('FIREFLY_BASE_URL must use http or https protocol');
      }
    } catch (e) {
      errors.push('FIREFLY_BASE_URL is not a valid URL');
    }
  }

  if (config.accessToken && config.accessToken.length < 10) {
    errors.push('FIREFLY_ACCESS_TOKEN appears to be too short');
  }

  if (!config.isConfigured) {
    warnings.push(
      'Global Firefly III environment variables not configured. ' +
      'Users can connect their own Firefly III instances via Settings > Integrations.'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function logFireflyConfigStatus(): void {
  const validation = validateFireflyEnv();
  const config = getFireflyEnvConfig();

  console.log('[Firefly Config] Startup validation:');
  
  if (config.isConfigured) {
    console.log(`  ✓ Global config: ${config.baseUrl}`);
  } else {
    console.log('  ℹ Global config: Not set (per-user connections will be used)');
  }

  for (const warning of validation.warnings) {
    console.log(`  ⚠ ${warning}`);
  }

  for (const error of validation.errors) {
    console.error(`  ✗ ${error}`);
  }

  if (!validation.valid) {
    console.error('[Firefly Config] Configuration errors detected. Please fix before using global Firefly integration.');
  }
}

export function clearFireflyConfigCache(): void {
  cachedConfig = null;
}
