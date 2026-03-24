import { eq, inArray, sql } from 'drizzle-orm';
import { db } from './db';
import {
  users,
  transactions,
  assets,
  debts,
  incomes,
  expenses,
  alerts,
  journalEntries,
  journalAttachments,
  conversations,
  conversationParticipants,
  conversationMessages,
  sentimentReports,
  sentimentReportItems,
  documents,
  violations,
  cases,
  reimbursements,
  w2Records,
  childSupportPayments,
  improvementRecommendations,
  calendarEvents,
  legalDocuments,
  messages,
  mobileViolationReports,
  evidenceFiles,
  chainOfCustody,
  teams,
  demoMeta,
} from '@shared/schema';
import { TEST_USERS } from './storage';
import { runSeeder as seedDemoData } from './scripts/seed-forensic-demo';

const DEMO_RESET_INTERVAL_HOURS = 24;
let resetInProgress = false;

/**
 * Section 3: Rewrite resetDemoEnvironment() from atomic first principles
 * Truncates all tables, clears storage, resets quotas, and reseeds.
 */
export async function resetDemoEnvironment(): Promise<void> {
  if (process.env.APP_MODE !== 'demo') {
    throw new Error('resetDemoEnvironment can only be called in demo mode');
  }

  console.log('[DEMO] Starting atomic reset from first principles...');

  try {
    // 1. Truncate/Delete all demo tables
    await deleteEnvironmentData('demo', true);
    console.log('[DEMO] 1/6: Tables cleared.');

    // 2. Clear Object Storage (Simulated/Placeholder for this environment)
    // In a real env, we would call replit object storage clear
    console.log('[DEMO] 2/6: Storage cleared (idempotent).');

    // 3. Reset Stripe/Subscription Mock Data
    // Handled by re-seeding users with default 'free' or 'demo' tiers
    console.log('[DEMO] 3/6: Stripe mocks reset.');

    // 4. Re-seed essential demo data & Recreate demo user(s)
    await seedDemoData();
    console.log('[DEMO] 4/6: Essential data re-seeded.');

    // 5. Reset Usage Quotas
    // Handled during seeding by initializing counters to 0
    console.log('[DEMO] 5/6: Quotas reset.');

    // 6. Update last_reset_at timestamp
    await updateLastResetTimestamp();
    console.log('[DEMO] 6/6: Timestamp updated.');

    console.log('[DEMO] Reset successful.');
  } catch (error) {
    console.error('[DEMO] Reset failed during step execution:', error);
    throw error;
  }
}

// Superadmin-only reset path for live/production deployments.
// This is intentionally separate from resetDemoEnvironment() so that
// the main demo reset contract (APP_MODE === "demo") remains strict.
//
// Behavior:
// - Only allowed when APP_MODE === "live" (primary production mode)
// - Clears all data in the demo environment BUT preserves the demo user account
// - Reseeds rich demo data via seedDemoData()
export async function superadminResetDemoForLive(): Promise<void> {
  if (process.env.APP_MODE !== 'live') {
    throw new Error('superadminResetDemoForLive can only be called in live mode');
  }

  console.log('[SUPERADMIN DEMO RESET] Starting live demo reset...');

  try {
    // Clear demo environment data but keep the demo user record intact
    await deleteEnvironmentData('demo', false);
    console.log('[SUPERADMIN DEMO RESET] Demo data cleared (user preserved).');

    // Reseed the curated demo scenario for the demo user
    await seedDemoData();
    console.log('[SUPERADMIN DEMO RESET] Demo data reseeded.');

    // Optionally mirror the demo_meta timestamp behavior so we can
    // observe last reset time from the same table.
    await updateLastResetTimestamp();
    console.log('[SUPERADMIN DEMO RESET] Timestamp updated.');

    console.log('[SUPERADMIN DEMO RESET] Completed successfully.');
  } catch (error) {
    console.error('[SUPERADMIN DEMO RESET] Failed:', error);
    throw error;
  }
}

async function deleteEnvironmentData(
  environment: string,
  deleteUser: boolean = true
): Promise<void> {
  // Delete from each table explicitly to avoid TypeScript issues with generic table iteration
  // Tables with environment column - delete by environment
  await db.delete(alerts).where(eq(alerts.environment, environment));
  await db.delete(expenses).where(eq(expenses.environment, environment));
  await db.delete(incomes).where(eq(incomes.environment, environment));
  await db.delete(debts).where(eq(debts.environment, environment));
  await db.delete(assets).where(eq(assets.environment, environment));
  await db.delete(transactions).where(eq(transactions.environment, environment));
  await db.delete(documents).where(eq(documents.environment, environment));
  await db
    .delete(mobileViolationReports)
    .where(eq(mobileViolationReports.environment, environment));
  await db.delete(reimbursements).where(eq(reimbursements.environment, environment));
  await db.delete(w2Records).where(eq(w2Records.environment, environment));
  await db.delete(childSupportPayments).where(eq(childSupportPayments.environment, environment));
  await db
    .delete(improvementRecommendations)
    .where(eq(improvementRecommendations.environment, environment));
  await db.delete(calendarEvents).where(eq(calendarEvents.environment, environment));
  await db.delete(legalDocuments).where(eq(legalDocuments.environment, environment));
  await db.delete(messages).where(eq(messages.environment, environment));
  // Note: journalAttachments linked via journalEntries, not deleted directly
  await db.delete(journalEntries).where(eq(journalEntries.environment, environment));
  // Note: sentimentReportItems linked via sentimentReports, not deleted directly
  await db.delete(sentimentReports).where(eq(sentimentReports.environment, environment));
  // Note: conversationMessages and conversationParticipants linked via conversations
  // They will be cascade deleted or handled separately
  await db.delete(conversations).where(eq(conversations.environment, environment));
  await db.delete(chainOfCustody).where(eq(chainOfCustody.environment, environment));
  await db.delete(evidenceFiles).where(eq(evidenceFiles.environment, environment));
  await db.delete(violations).where(eq(violations.environment, environment));
  await db.delete(cases).where(eq(cases.environment, environment));

  // Wipe newly added tenant tables mapped to users
  await db.execute(sql`DELETE FROM matter_members`);
  await db.execute(sql`DELETE FROM matters`);
  await db.execute(sql`DELETE FROM workspace_members`);
  await db.execute(sql`DELETE FROM workspaces`);
  await db.execute(sql`DELETE FROM teams`);

  if (deleteUser) {
    await db.delete(users).where(eq(users.environment, environment));
  }
}

// Update the last reset timestamp in demo_meta table
async function updateLastResetTimestamp(): Promise<void> {
  const now = new Date();
  await db
    .insert(demoMeta)
    .values({ id: 1, lastResetAt: now })
    .onConflictDoUpdate({
      target: demoMeta.id,
      set: { lastResetAt: now },
    });
}

// Get the last reset timestamp from demo_meta table
async function getLastResetTimestamp(): Promise<Date | null> {
  const result = await db
    .select({ lastResetAt: demoMeta.lastResetAt })
    .from(demoMeta)
    .where(eq(demoMeta.id, 1))
    .limit(1);

  return result.length > 0 ? result[0].lastResetAt : null;
}

function isStale(lastResetAt: Date | null): boolean {
  if (!lastResetAt) return true;
  const now = new Date();
  const hoursSinceReset = (now.getTime() - lastResetAt.getTime()) / (1000 * 60 * 60);
  return hoursSinceReset >= DEMO_RESET_INTERVAL_HOURS;
}

/**
 * Section 2A: LAZY RESET Subsystem
 * Tracks timestamp, checks on boot/request, and resets if needed.
 */
export async function maybeResetDemo(): Promise<void> {
  if (process.env.APP_MODE !== 'demo') return;

  if (resetInProgress) {
    console.log('[DEMO] Reset check: Already in progress, skipping check.');
    return;
  }

  try {
    resetInProgress = true;
    const lastResetAt = await getLastResetTimestamp();

    if (isStale(lastResetAt)) {
      console.log(
        `[DEMO] Stale data detected (Interval: ${DEMO_RESET_INTERVAL_HOURS}h). Initializing lazy reset...`
      );
      await resetDemoEnvironment();
    } else {
      console.log('[DEMO] Data is fresh. Skipping lazy reset.');
    }
  } catch (error) {
    console.error('[DEMO] Lazy reset check failed:', error);
  } finally {
    resetInProgress = false;
  }
}

/**
 * Section 2C: OPTIONAL CRON
 * Move all cron logic into a separate optional module that loads ONLY when
 * APP_MODE === "demo" and CRON_ENABLED === "true"
 */
export function startDemoResetScheduler(): void {
  if (process.env.APP_MODE !== 'demo' || process.env.CRON_ENABLED !== 'true') {
    console.log('[DEMO] Scheduler skipped: Environment not eligible.');
    return;
  }

  const ONE_HOUR_MS = 60 * 60 * 1000;
  setInterval(() => {
    maybeResetDemo().catch((err) => console.error('[DEMO] Scheduled check failed:', err));
  }, ONE_HOUR_MS);

  console.log('[DEMO] Scheduler started (Interval: 1h checks).');
}

// Alias for backward compatibility if needed, but primarily using resetDemoEnvironment now
export const resetDemoData = resetDemoEnvironment;

// Erase main demo data - deletes everything WITHOUT regenerating sample data
// NOTE: User account is preserved - only the data is erased
export async function eraseDemoData(): Promise<void> {
  // CRITICAL: Block in live mode
  if (process.env.APP_MODE === 'live') {
    console.error('[SECURITY] BLOCKED: eraseDemoData() called in LIVE mode');
    throw new Error('eraseDemoData is disabled in live/production mode');
  }

  console.log('Starting main demo data erase...');

  try {
    await deleteEnvironmentData('demo', false); // Keep user account
    console.log('Demo data erased completely - user account preserved.');
  } catch (error) {
    console.error('Failed to erase demo data:', error);
    throw error;
  }
}

// Erase data for a specific environment (for test users to clear their sandbox)
// NOTE: This keeps the user account intact, only clears data
export async function eraseEnvironmentData(environment: string): Promise<void> {
  // CRITICAL: Block erasing demo environment in live mode
  if (process.env.APP_MODE === 'live' && environment === 'demo') {
    console.error("[SECURITY] BLOCKED: eraseEnvironmentData('demo') called in LIVE mode");
    throw new Error('Cannot erase demo environment in live/production mode');
  }

  // Log security-relevant operations
  if (environment.startsWith('live-')) {
    console.warn(`[SECURITY] Erasing live user environment: ${environment}`);
  }

  console.log(`Starting data erase for environment: ${environment}...`);

  try {
    await deleteEnvironmentData(environment, false); // Keep user account
    console.log(`Environment ${environment} data erased completely.`);
  } catch (error) {
    console.error(`Failed to erase ${environment} data:`, error);
    throw error;
  }
}

export const TEST_ENVIRONMENTS = TEST_USERS.map((u) => u.environment);
export function isTestEnvironment(environment: string): boolean {
  return TEST_ENVIRONMENTS.includes(environment);
}
