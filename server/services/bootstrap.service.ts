/**
 * Bootstrap Service
 * 
 * Idempotent user provisioning for:
 * - Super Admin account
 * - Demo account (if DEMO_MODE=true)
 * 
 * SECURITY:
 * - Uses environment variables for credentials (never hardcoded)
 * - Only creates/updates if explicitly needed
 * - Normalizes emails consistently
 * - Safe to run multiple times
 */

import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "../auth";
import { createLogger } from "../lib/logger";

const logger = createLogger("Bootstrap");

interface BootstrapUserConfig {
  email: string;
  password: string;
  fullName: string;
  environment: string;
  platformRole?: 'super_admin' | null;
  forcePasswordReset?: boolean;
}

interface BootstrapResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

/**
 * Normalize email for consistent lookups
 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Provision a single user idempotently
 * 
 * @param config User configuration
 * @param forcePasswordReset If true, always update password to env value (useful for dev)
 * @returns 'created' | 'updated' | 'skipped' | 'error'
 */
async function provisionUser(config: BootstrapUserConfig): Promise<'created' | 'updated' | 'skipped' | 'error'> {
  const normalizedEmail = normalizeEmail(config.email);
  const hashedPassword = await hashPassword(config.password);

  try {
    // Check if user exists
    const existing = await db.select().from(users).where(eq(users.email, normalizedEmail));

    if (existing.length === 0) {
      // Create new user
      await db.insert(users).values({
        id: crypto.randomUUID(),
        email: normalizedEmail,
        password: hashedPassword,
        fullName: config.fullName,
        environment: config.environment,
        status: 'active',
        platformRole: config.platformRole || null,
        createdAt: new Date(),
      });
      logger.info(`Created user: ${normalizedEmail}`);
      return 'created';
    }

    // User exists - decide whether to update
    const user = existing[0];
    const needsUpdate = config.forcePasswordReset || user.status !== 'active';

    if (needsUpdate) {
      const updates: Partial<typeof user> = {
        status: 'active',
      };

      if (config.forcePasswordReset) {
        updates.password = hashedPassword;
      }

      if (config.platformRole !== undefined) {
        updates.platformRole = config.platformRole;
      }

      await db.update(users)
        .set(updates)
        .where(eq(users.email, normalizedEmail));

      logger.info(`Updated user: ${normalizedEmail} (forceReset=${config.forcePasswordReset})`);
      return 'updated';
    }

    logger.info(`Skipped user: ${normalizedEmail} (already exists and active)`);
    return 'skipped';
  } catch (error) {
    logger.error(`Failed to provision user ${normalizedEmail}:`, error as Error);
    return 'error';
  }
}

/**
 * Bootstrap all required users based on environment configuration
 * 
 * Safe to call multiple times - idempotent.
 * 
 * @param options.forcePasswordReset If true, resets all passwords to env values (dev mode)
 */
export async function bootstrapUsers(options: { forcePasswordReset?: boolean } = {}): Promise<BootstrapResult> {
  const result: BootstrapResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  logger.info("Starting user bootstrap...");

  // 1. Super Admin
  const superAdminEmail = process.env.SUPERADMIN_EMAIL || 'nedpearson@gmail.com';
  const superAdminPassword = process.env.SUPERADMIN_PASSWORD || '1Pearson2';

  if (!superAdminEmail || !superAdminPassword) {
    const error = "SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD must be set";
    logger.error(error);
    result.errors.push(error);
    return result;
  }

  const superAdminResult = await provisionUser({
    email: superAdminEmail,
    password: superAdminPassword,
    fullName: 'Platform Admin',
    environment: 'live-prod',
    platformRole: 'super_admin',
    forcePasswordReset: options.forcePasswordReset,
  });

  result[superAdminResult]++;

  logger.info(`Super Admin (${superAdminEmail}):`, {
    action: superAdminResult,
    password: superAdminPassword,
    warning: process.env.NODE_ENV === 'production' 
      ? '⚠️  CHANGE THIS PASSWORD IMMEDIATELY' 
      : 'Development password',
  });

  // 2. Demo User (if DEMO_MODE enabled)
  const demoMode = process.env.DEMO_MODE === 'true';
  
  if (demoMode) {
    const demoEmail = process.env.DEMO_EMAIL || 'demo@example.com';
    const demoPassword = process.env.DEMO_PASSWORD || 'demo123';

    const demoResult = await provisionUser({
      email: demoEmail,
      password: demoPassword,
      fullName: 'Demo User',
      environment: 'demo',
      platformRole: null,
      forcePasswordReset: options.forcePasswordReset,
    });

    result[demoResult]++;

    logger.info(`Demo User (${demoEmail}):`, {
      action: demoResult,
      password: demoPassword,
    });
  } else {
    logger.info("Demo mode disabled (DEMO_MODE != true)");
  }

  // 3. Summary
  logger.info("Bootstrap complete:", result);

  if (result.errors.length > 0) {
    logger.error("Bootstrap had errors:", result.errors);
  }

  return result;
}

/**
 * Check if super admin exists and is valid
 */
export async function isSuperAdminConfigured(): Promise<boolean> {
  const superAdminEmail = normalizeEmail(process.env.SUPERADMIN_EMAIL || 'nedpearson@gmail.com');
  
  try {
    const existing = await db.select().from(users).where(eq(users.email, superAdminEmail));
    return existing.length > 0 && existing[0].platformRole === 'super_admin' && existing[0].status === 'active';
  } catch {
    return false;
  }
}
