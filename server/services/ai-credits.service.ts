import { db } from '../db';
import { workspaces, aiCreditTransactions } from '@shared/workspace-schema';
import { eq, sql } from 'drizzle-orm';
import Stripe from 'stripe';
import { getUncachableStripeClient } from '../stripeClient';

export interface ConsumeCreditsResult {
  success: boolean;
  newBalance: number;
  error?: string;
}

export type UserIdInput = number | string | undefined;

function resolveUserId(userId: UserIdInput, fallback: string): string {
  if (userId === undefined || userId === null) {
    return fallback;
  }
  return String(userId);
}

/**
 * Consumes AI credits from a workspace balance
 * Supports both SAFE mode (blocks when exhausted) and METERED mode (allows negative balance)
 */
export async function consumeCredits(
  workspaceId: string,
  userId: UserIdInput,
  amount: number,
  reason: string,
  metadata?: Record<string, any>
): Promise<ConsumeCreditsResult> {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });

  if (!workspace) {
    throw new Error('Workspace not found');
  }

  // Check overage mode
  const overageMode = workspace.settings?.aiCreditsOverageMode || 'safe';

  // In SAFE mode, block if insufficient credits
  if (overageMode === 'safe' && workspace.aiCreditsBalance < amount) {
    return {
      success: false,
      newBalance: workspace.aiCreditsBalance,
      error: 'Insufficient AI credits. Please upgrade your plan or wait for monthly reset.',
    };
  }

  // Calculate new balance
  const newBalance = workspace.aiCreditsBalance - amount;
  const resolvedUserId = resolveUserId(userId, workspace.ownerId);

  try {
    await db.transaction(async (tx) => {
      // Update workspace balance
      await tx
        .update(workspaces)
        .set({ aiCreditsBalance: newBalance, updatedAt: new Date() })
        .where(eq(workspaces.id, workspaceId));

      // Log transaction
      await tx.insert(aiCreditTransactions).values({
        workspaceId,
        userId: resolvedUserId,
        amount: -amount,
        balanceAfter: newBalance,
        reason,
        metadata: metadata || {},
      });
    });

    // In METERED mode, if negative balance, report overage to Stripe
    if (overageMode === 'metered' && newBalance < 0 && workspace.stripeSubscriptionId) {
      await reportOverageToStripe(workspace.stripeSubscriptionId, Math.abs(newBalance));
    }

    return { success: true, newBalance };
  } catch (error) {
    console.error('Failed to consume AI credits:', error);
    throw error;
  }
}

/**
 * Grants AI credits to a workspace (monthly allocation or purchase)
 */
export async function grantAICredits(
  workspaceId: string,
  amount: number,
  reason: string,
  userId?: UserIdInput
): Promise<void> {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });

  if (!workspace) {
    throw new Error('Workspace not found');
  }

  const newBalance = workspace.aiCreditsBalance + amount;
  const resolvedUserId = resolveUserId(userId, workspace.ownerId);

  await db.transaction(async (tx) => {
    await tx
      .update(workspaces)
      .set({ aiCreditsBalance: newBalance, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId));

    await tx.insert(aiCreditTransactions).values({
      workspaceId,
      userId: resolvedUserId,
      amount,
      balanceAfter: newBalance,
      reason,
      metadata: {},
    });
  });
}

/**
 * Resets monthly AI credits at billing cycle
 */
export async function resetMonthlyCredits(workspaceId: string): Promise<void> {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });

  if (!workspace) {
    console.warn(`Workspace ${workspaceId} not found for credit reset`);
    return;
  }

  // Get monthly allocation from tier configuration
  const { WORKSPACE_TIER_ENTITLEMENTS } = await import('@shared/workspace-schema');
  const tierConfig = WORKSPACE_TIER_ENTITLEMENTS[workspace.subscriptionTier];
  const monthlyAllocation = tierConfig?.aiCreditsMonthly || 0;

  await db.transaction(async (tx) => {
    await tx
      .update(workspaces)
      .set({
        aiCreditsBalance: monthlyAllocation,
        aiCreditsLimit: monthlyAllocation,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceId));

    await tx.insert(aiCreditTransactions).values({
      workspaceId,
      userId: workspace.ownerId,
      amount: monthlyAllocation,
      balanceAfter: monthlyAllocation,
      reason: 'monthly_reset',
      metadata: { tier: workspace.subscriptionTier },
    });
  });

  console.log(
    `Reset AI credits for workspace ${workspaceId} to ${monthlyAllocation} (tier: ${workspace.subscriptionTier})`
  );
}

/**
 * Refunds AI credits (e.g., when an AI operation fails)
 */
export async function refundCredits(
  workspaceId: string,
  userId: UserIdInput,
  amount: number,
  reason: string
): Promise<void> {
  await grantAICredits(workspaceId, amount, `refund_${reason}`, userId);
  console.log(`Refunded ${amount} AI credits to workspace ${workspaceId}: ${reason}`);
}

/**
 * Reports overage usage to Stripe for metered billing
 */
async function reportOverageToStripe(subscriptionId: string, overageAmount: number): Promise<void> {
  const stripe = await getUncachableStripeClient();
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const customerId = typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;

    // Report usage in units of 10 credits (since we charge $0.10 per 10 credits)
    const usageUnits = Math.ceil(overageAmount / 10);

    await stripe.billing.meterEvents.create({
      event_name: 'ai_credits_overage',
      payload: {
        stripe_customer_id: customerId,
        value: usageUnits.toString(),
      },
    });

    console.log(`Reported ${usageUnits} overage units to Stripe for subscription ${subscriptionId}`);
  } catch (error) {
    console.error('Failed to report overage to Stripe:', error);
    // Don't throw - this is non-critical
  }
}

/**
 * Gets AI credit balance for a workspace
 */
export async function getAICreditBalance(workspaceId: string): Promise<{
  balance: number;
  limit: number;
  percentageUsed: number;
}> {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });

  if (!workspace) {
    throw new Error('Workspace not found');
  }

  const percentageUsed = workspace.aiCreditsLimit > 0
    ? ((workspace.aiCreditsLimit - workspace.aiCreditsBalance) / workspace.aiCreditsLimit) * 100
    : 0;

  return {
    balance: workspace.aiCreditsBalance,
    limit: workspace.aiCreditsLimit,
    percentageUsed: Math.round(percentageUsed),
  };
}

/**
 * Gets AI credit transaction history for a workspace
 */
export async function getAICreditHistory(
  workspaceId: string,
  limit: number = 50
): Promise<typeof aiCreditTransactions.$inferSelect[]> {
  const transactions = await db.query.aiCreditTransactions.findMany({
    where: eq(aiCreditTransactions.workspaceId, workspaceId),
    orderBy: (transactions, { desc }) => [desc(transactions.createdAt)],
    limit,
  });

  return transactions;
}

export class InsufficientCreditsError extends Error {
  constructor(message?: string) {
    super(message || 'Insufficient AI credits');
    this.name = 'InsufficientCreditsError';
  }
}
