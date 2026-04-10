/**
 * purge-user-data.ts
 * Erases ALL data associated with a user (by email) from every user-scoped table.
 * Usage: npx tsx --import dotenv/config scripts/purge-user-data.ts --force
 */
import { db } from '../server/db';
import { eq } from 'drizzle-orm';
import * as schema from '../shared/schema';

if (!process.argv.includes('--force')) {
  console.error('\n❌ ABORTED: This script requires --force to run.');
  console.error('   Usage: npx tsx --import dotenv/config scripts/purge-user-data.ts --force');
  process.exit(1);
}

const TARGET_EMAIL = 'nedpearson@gmail.com';

async function run() {
  // 1. Find user
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, TARGET_EMAIL)).limit(1);
  if (!user) {
    console.error(`❌ User with email ${TARGET_EMAIL} not found`);
    process.exit(1);
  }
  const USER_ID = user.id;
  console.log(`\n🗑️  Purging ALL data for ${TARGET_EMAIL} (ID: ${USER_ID})\n`);

  // Helper to safely delete from a table if it has a userId column
  async function purge(tableName: string, table: any, column: any) {
    try {
      const result = await db.delete(table).where(eq(column, USER_ID)).returning();
      if (result.length > 0) {
        console.log(`  ✅ ${tableName}: deleted ${result.length} rows`);
      }
    } catch (e: any) {
      // Table may not exist yet in this environment
      if (e.code === '42P01') {
        console.log(`  ⚠️  ${tableName}: table does not exist (skipped)`);
      } else {
        console.error(`  ❌ ${tableName}: ${e.message}`);
      }
    }
  }

  // 2. Delete from all user-scoped tables (order matters for FK constraints)
  // Child tables first, then parent tables
  await purge('documentLineItems',    schema.documentLineItems,    schema.documentLineItems.userId);
  await purge('documentParseResults', schema.documentParseResults, schema.documentParseResults.userId);
  await purge('expenses',             schema.expenses,             schema.expenses.userId);
  await purge('incomes',              schema.incomes,              schema.incomes.userId);
  await purge('assets',               schema.assets,               schema.assets.userId);
  await purge('debts',                schema.debts,                schema.debts.userId);
  await purge('reimbursements',       schema.reimbursements,       schema.reimbursements.userId);
  await purge('w2Records',            schema.w2Records,            schema.w2Records.userId);
  await purge('transactions',         schema.transactions,         schema.transactions.userId);
  await purge('documents',            schema.documents,            schema.documents.userId);
  await purge('legalDocuments',       schema.legalDocuments,       schema.legalDocuments.userId);
  await purge('violations',           schema.violations,           schema.violations.userId);
  await purge('evidenceFiles',        schema.evidenceFiles,        schema.evidenceFiles.userId);
  await purge('chainOfCustody',       schema.chainOfCustody,       schema.chainOfCustody.userId);
  await purge('messages',             schema.messages,             schema.messages.userId);
  await purge('alerts',               schema.alerts,               schema.alerts.userId);
  await purge('calendarEvents',       schema.calendarEvents,       schema.calendarEvents.userId);
  await purge('childSupportPayments', schema.childSupportPayments, schema.childSupportPayments.userId);
  await purge('mobileViolationReports', schema.mobileViolationReports, schema.mobileViolationReports.userId);
  await purge('journalEntries',       schema.journalEntries,       schema.journalEntries.userId);
  await purge('journalAttachments',   schema.journalAttachments,   schema.journalAttachments.userId);
  await purge('usageAudit',           schema.usageAudit,           schema.usageAudit.userId);
  await purge('billingRecords',       schema.billingRecords,       schema.billingRecords.userId);
  await purge('quickbooksSyncLog',    schema.quickbooksSyncLog,    schema.quickbooksSyncLog.userId);

  // Cases (if userId column exists)
  try {
    await purge('cases', schema.cases, schema.cases.userId);
  } catch {}

  console.log(`\n✅ All data purged for ${TARGET_EMAIL}. User account itself is preserved.\n`);
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
