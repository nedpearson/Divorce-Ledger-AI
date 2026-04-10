/**
 * One-off script to force reseed demo financial data.
 * Run with: npx tsx server/scripts/force-reseed-demo.ts
 */
import 'dotenv/config';
import { db } from '../db';
import {
  users,
  assets,
  debts,
  incomes,
  expenses,
  transactions,
  violations,
  cases,
  calendarEvents,
  alerts,
  documents,
  messages,
  mobileViolationReports,
  legalDocuments,
  evidenceFiles,
  reimbursements,
  w2Records,
  childSupportPayments,
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';

async function main() {
  console.log('[FORCE RESEED] Starting...');

  // Find the demo client user
  const demoEmail = (process.env.DEMO_EMAIL || 'demo@example.com').trim().toLowerCase();
  const clientEmail = 'client.demo@example.com';
  
  const [demoUser] = await db.select().from(users).where(and(eq(users.email, demoEmail), eq(users.environment, 'demo')));
  const [clientUser] = await db.select().from(users).where(and(eq(users.email, clientEmail), eq(users.environment, 'demo')));
  
  const userId = demoUser?.id || 'demo-user';
  const clientId = clientUser?.id || 'demo-client-user';
  
  console.log(`[FORCE RESEED] Demo user ID: ${userId}`);
  console.log(`[FORCE RESEED] Client user ID: ${clientId}`);
  
  // Clear existing financial data for both demo users
  for (const uid of [userId, clientId]) {
    await db.delete(assets).where(and(eq(assets.userId, uid), eq(assets.environment, 'demo')));
    await db.delete(debts).where(and(eq(debts.userId, uid), eq(debts.environment, 'demo')));
    await db.delete(incomes).where(and(eq(incomes.userId, uid), eq(incomes.environment, 'demo')));
    await db.delete(expenses).where(and(eq(expenses.userId, uid), eq(expenses.environment, 'demo')));
    await db.delete(transactions).where(and(eq(transactions.userId, uid), eq(transactions.environment, 'demo')));
    await db.delete(violations).where(and(eq(violations.userId, uid), eq(violations.environment, 'demo')));
    await db.delete(cases).where(and(eq(cases.userId, uid), eq(cases.environment, 'demo')));
    await db.delete(calendarEvents).where(and(eq(calendarEvents.userId, uid), eq(calendarEvents.environment, 'demo')));
    await db.delete(alerts).where(and(eq(alerts.userId, uid), eq(alerts.environment, 'demo')));
    await db.delete(documents).where(and(eq(documents.userId, uid), eq(documents.environment, 'demo')));
    await db.delete(legalDocuments).where(and(eq(legalDocuments.userId, uid), eq(legalDocuments.environment, 'demo')));
    await db.delete(messages).where(eq(messages.senderId, uid));
    await db.delete(mobileViolationReports).where(and(eq(mobileViolationReports.userId, uid), eq(mobileViolationReports.environment, 'demo')));
    // Note: evidenceFiles, reimbursements, w2Records, childSupportPayments tied to violations/users
    await db.delete(reimbursements).where(and(eq(reimbursements.userId, uid), eq(reimbursements.environment, 'demo')));
    await db.delete(w2Records).where(and(eq(w2Records.userId, uid), eq(w2Records.environment, 'demo')));
    await db.delete(childSupportPayments).where(and(eq(childSupportPayments.userId, uid), eq(childSupportPayments.environment, 'demo')));
    console.log(`[FORCE RESEED] Cleared all data for user: ${uid}`);
  }
  
  console.log('[FORCE RESEED] Data cleared. Next app restart will reseed with new realistic data.');
  process.exit(0);
}

main().catch(err => {
  console.error('[FORCE RESEED] Failed:', err);
  process.exit(1);
});
