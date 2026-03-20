import { z } from 'zod';

/**
 * Configuration validation script for Divorce Ledger.
 *
 * LIVE MODE HARDENING:
 * - Validates APP_MODE is set and consistent with NODE_ENV
 * - Enforces stricter requirements for live/production mode
 * - Fails fast on dangerous misconfigurations
 */

const VALID_APP_MODES = ['live', 'demo', 'development', 'test'] as const;

const configSchema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL URL'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_MODE: z.enum(VALID_APP_MODES).optional(),
  PORT: z.string().regex(/^\d+$/).default('5000'),
  SESSION_SECRET: z.string().min(1, 'SESSION_SECRET is required'),
  CRON_ENABLED: z.string().optional(),
});

interface ConfigWarning {
  code: string;
  message: string;
  severity: 'warn' | 'error';
}

function validateModeConsistency(config: z.infer<typeof configSchema>): ConfigWarning[] {
  const warnings: ConfigWarning[] = [];
  const appMode = config.APP_MODE;
  const nodeEnv = config.NODE_ENV;

  // APP_MODE should be set explicitly
  if (!appMode) {
    warnings.push({
      code: 'MISSING_APP_MODE',
      message:
        'APP_MODE not set. Defaulting based on NODE_ENV. Set APP_MODE explicitly for clarity.',
      severity: 'warn',
    });
  }

  // Check for dangerous mode combinations
  if (nodeEnv === 'production' && appMode === 'demo') {
    warnings.push({
      code: 'INCONSISTENT_MODE',
      message:
        'NODE_ENV=production but APP_MODE=demo. This is unusual. Verify this is intentional.',
      severity: 'warn',
    });
  }

  if (nodeEnv === 'development' && appMode === 'live') {
    warnings.push({
      code: 'DANGEROUS_LIVE_DEV',
      message:
        'NODE_ENV=development but APP_MODE=live. Live mode should run in production environment.',
      severity: 'error',
    });
  }

  // CRITICAL: Production MUST have APP_MODE explicitly set
  if (nodeEnv === 'production' && !appMode) {
    warnings.push({
      code: 'PRODUCTION_MISSING_APP_MODE',
      message:
        'NODE_ENV=production requires APP_MODE to be explicitly set (live or demo). This is mandatory for safety.',
      severity: 'error',
    });
  }

  // Production should typically be in live mode
  if (nodeEnv === 'production' && appMode && appMode !== 'live' && appMode !== 'demo') {
    warnings.push({
      code: 'PRODUCTION_INVALID_MODE',
      message: `NODE_ENV=production with APP_MODE=${appMode} is invalid. Use 'live' or 'demo'.`,
      severity: 'error',
    });
  }

  // Live mode requires CRON_ENABLED to be explicitly set
  if (appMode === 'live' && !config.CRON_ENABLED) {
    warnings.push({
      code: 'LIVE_CRON_MISSING',
      message: 'APP_MODE=live but CRON_ENABLED not set. Scheduled jobs will not run.',
      severity: 'warn',
    });
  }

  // Live mode in production should have Stripe configured
  if (appMode === 'live' && !process.env.STRIPE_SECRET_KEY) {
    warnings.push({
      code: 'LIVE_STRIPE_MISSING',
      message: 'APP_MODE=live but STRIPE_SECRET_KEY not set. Billing will not work.',
      severity: 'warn',
    });
  }

  return warnings;
}

function checkConfig() {
  console.log('🔍 [Config] Starting pre-flight validation...');

  const envData = {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    APP_MODE: process.env.APP_MODE,
    PORT: process.env.PORT,
    SESSION_SECRET: process.env.SESSION_SECRET,
    CRON_ENABLED: process.env.CRON_ENABLED,
  };

  const result = configSchema.safeParse(envData);

  if (!result.success) {
    console.error('\n❌ [Config] Validation failed:');
    const formatted = result.error.format();

    Object.entries(formatted).forEach(([key, value]) => {
      if (key !== '_errors' && value && typeof value === 'object' && '_errors' in value) {
        const errors = (value as any)._errors;
        if (Array.isArray(errors)) {
          console.error(`   - ${key}: ${errors.join(', ')}`);
        }
      }
    });

    process.exit(1);
  }

  // Check mode consistency
  const warnings = validateModeConsistency(result.data);

  let hasErrors = false;
  for (const warning of warnings) {
    if (warning.severity === 'error') {
      console.error(`❌ [Config] ${warning.code}: ${warning.message}`);
      hasErrors = true;
    } else {
      console.warn(`⚠️  [Config] ${warning.code}: ${warning.message}`);
    }
  }

  if (hasErrors) {
    console.error('\n❌ [Config] Configuration has fatal errors. Exiting.');
    process.exit(1);
  }

  // Log current mode for visibility
  const effectiveMode =
    result.data.APP_MODE || (result.data.NODE_ENV === 'production' ? 'live' : 'development');
  console.log(`✅ [Config] Core variables validated. Mode: ${effectiveMode.toUpperCase()}`);
}

checkConfig();
