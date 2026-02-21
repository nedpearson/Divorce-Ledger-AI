import { db } from '../db';
import { workspaces, workspaceMembers } from '@shared/workspace-schema';
import { users } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import Stripe from 'stripe';
import { getUncachableStripeClient } from '../stripeClient';
import { syncEntitlements } from './entitlements.service';
import { grantAICredits } from './ai-credits.service';
import { WORKSPACE_TIER_ENTITLEMENTS, type WorkspaceTier } from '@shared/workspace-schema';

const APP_URL = process.env.APP_URL || 'http://localhost:5000';

// Stripe Product/Price IDs (set these after running setup script)
export const STRIPE_PRICE_IDS = {
  free: null,
  individual: process.env.STRIPE_PRICE_INDIVIDUAL,
  pro: process.env.STRIPE_PRICE_PRO,
  firm_starter: process.env.STRIPE_PRICE_FIRM_STARTER,
  firm_pro: process.env.STRIPE_PRICE_FIRM_PRO,
  firm_enterprise: process.env.STRIPE_PRICE_FIRM_ENTERPRISE,
} as const;

/**
 * Creates a Stripe Checkout session for workspace subscription
 */
export async function createCheckoutSession(
  userId: number,
  planId: WorkspaceTier,
  workspaceType: 'consumer' | 'firm'
): Promise<{ checkoutUrl: string; workspaceId: string }> {
  const stripe = await getUncachableStripeClient();
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Check if user already has a workspace
  let workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerId, userId),
  });

  // Create workspace if doesn't exist
  if (!workspace) {
    const [newWorkspace] = await db
      .insert(workspaces)
      .values({
        name: workspaceType === 'consumer'
          ? `${user.username}'s Workspace`
          : `${user.username}'s Law Firm`,
        type: workspaceType,
        ownerId: userId,
        subscriptionTier: 'free',
        aiCreditsBalance: 0,
        aiCreditsLimit: 100,
        settings: {},
      })
      .returning();

    workspace = newWorkspace;

    // Add user as owner
    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId,
      role: 'owner',
    });
  }

  // Get or create Stripe customer
  let stripeCustomerId = workspace.stripeCustomerId;
  
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.username,
      metadata: {
        userId: userId.toString(),
        workspaceId: workspace.id,
      },
    });
    stripeCustomerId = customer.id;

    await db
      .update(workspaces)
      .set({ stripeCustomerId, updatedAt: new Date() })
      .where(eq(workspaces.id, workspace.id));
  }

  // Get price ID
  const priceId = STRIPE_PRICE_IDS[planId];
  if (!priceId) {
    throw new Error(`No Stripe price configured for plan: ${planId}`);
  }

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${APP_URL}/workspace/${workspace.id}/welcome?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/pricing`,
    metadata: {
      workspaceId: workspace.id,
      planId,
      userId: userId.toString(),
    },
    subscription_data: {
      metadata: {
        workspaceId: workspace.id,
        planId,
      },
    },
  });

  return {
    checkoutUrl: session.url!,
    workspaceId: workspace.id,
  };
}

/**
 * Creates a Stripe Customer Portal session for subscription management
 */
export async function createCustomerPortalSession(
  userId: number,
  workspaceId: string
): Promise<{ portalUrl: string }> {
  const stripe = await getUncachableStripeClient();
  const workspace = await db.query.workspaces.findFirst({
    where: and(
      eq(workspaces.id, workspaceId),
      eq(workspaces.ownerId, userId)
    ),
  });

  if (!workspace) {
    throw new Error('Workspace not found or access denied');
  }

  if (!workspace.stripeCustomerId) {
    throw new Error('No Stripe customer found for this workspace');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: workspace.stripeCustomerId,
    return_url: `${APP_URL}/workspace/${workspaceId}/settings/billing`,
  });

  return { portalUrl: session.url };
}

/**
 * Handles successful checkout (called from webhook)
 */
export async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session
): Promise<void> {
  const stripe = await getUncachableStripeClient();
  const { workspaceId, planId } = session.metadata || {};

  if (!workspaceId || !planId) {
    throw new Error('Missing required metadata in checkout session');
  }

  const subscriptionId = session.subscription as string;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  // Update workspace with subscription details
  await db
    .update(workspaces)
    .set({
      stripeSubscriptionId: subscriptionId,
      subscriptionTier: planId as WorkspaceTier,
      subscriptionStatus: subscription.status,
      billingCycleStart: new Date(subscription.current_period_start * 1000),
      updatedAt: new Date(),
    })
    .where(eq(workspaces.id, workspaceId));

  // Sync entitlements and grant initial AI credits
  await syncEntitlements(workspaceId, planId as WorkspaceTier);

  // Grant initial AI credits
  const tierConfig = WORKSPACE_TIER_ENTITLEMENTS[planId as WorkspaceTier];
  if (tierConfig) {
    await grantAICredits(workspaceId, tierConfig.aiCreditsMonthly, 'subscription_started');
  }

  console.log(`Checkout completed for workspace ${workspaceId}, plan ${planId}`);
}

/**
 * Handles subscription updates (upgrades/downgrades)
 */
export async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription
): Promise<void> {
  const { workspaceId, planId } = subscription.metadata || {};

  if (!workspaceId) {
    console.warn('No workspaceId in subscription metadata');
    return;
  }

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });

  if (!workspace) {
    console.warn(`Workspace ${workspaceId} not found for subscription update`);
    return;
  }

  // Update subscription status
  await db
    .update(workspaces)
    .set({
      subscriptionStatus: subscription.status,
      subscriptionTier: (planId as WorkspaceTier) || workspace.subscriptionTier,
      billingCycleStart: new Date(subscription.current_period_start * 1000),
      updatedAt: new Date(),
    })
    .where(eq(workspaces.id, workspaceId));

  // If plan changed, sync entitlements
  if (planId && planId !== workspace.subscriptionTier) {
    await syncEntitlements(workspaceId, planId as WorkspaceTier);
    console.log(`Subscription updated: workspace ${workspaceId} changed to ${planId}`);
  }
}

/**
 * Handles subscription deletion (cancellation)
 */
export async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
): Promise<void> {
  const { workspaceId } = subscription.metadata || {};

  if (!workspaceId) {
    console.warn('No workspaceId in subscription metadata');
    return;
  }

  // Downgrade to free tier
  await db
    .update(workspaces)
    .set({
      subscriptionTier: 'free',
      subscriptionStatus: 'canceled',
      stripeSubscriptionId: null,
      aiCreditsBalance: 0,
      aiCreditsLimit: 100,
      updatedAt: new Date(),
    })
    .where(eq(workspaces.id, workspaceId));

  await syncEntitlements(workspaceId, 'free');

  console.log(`Subscription deleted: workspace ${workspaceId} downgraded to free`);
}

/**
 * Handles successful invoice payment (monthly credit reset)
 */
export async function handleInvoicePaymentSucceeded(
  invoice: Stripe.Invoice
): Promise<void> {
  if (!invoice.subscription) {
    return;
  }

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.stripeSubscriptionId, invoice.subscription as string),
  });

  if (!workspace) {
    return;
  }

  // Reset monthly AI credits
  const { resetMonthlyCredits } = await import('./ai-credits.service');
  await resetMonthlyCredits(workspace.id);

  console.log(`Invoice paid: reset AI credits for workspace ${workspace.id}`);
}

/**
 * Handles failed invoice payment
 */
export async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice
): Promise<void> {
  if (!invoice.subscription) {
    return;
  }

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.stripeSubscriptionId, invoice.subscription as string),
  });

  if (!workspace) {
    return;
  }

  // Mark subscription as past due
  await db
    .update(workspaces)
    .set({
      subscriptionStatus: 'past_due',
      updatedAt: new Date(),
    })
    .where(eq(workspaces.id, workspace.id));

  console.warn(`Invoice payment failed for workspace ${workspace.id}`);
  // TODO: Send notification email to workspace owner
}

/**
 * Get workspace billing summary
 */
export async function getWorkspaceBillingSummary(workspaceId: string) {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });

  if (!workspace) {
    throw new Error('Workspace not found');
  }

  const tierConfig = WORKSPACE_TIER_ENTITLEMENTS[workspace.subscriptionTier];

  let upcomingInvoice = null;
  if (workspace.stripeSubscriptionId) {
    try {
      const stripe = await getUncachableStripeClient();
      upcomingInvoice = await stripe.invoices.retrieveUpcoming({
        subscription: workspace.stripeSubscriptionId,
      });
    } catch (error) {
      console.warn('Could not retrieve upcoming invoice:', error);
    }
  }

  return {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      type: workspace.type,
      subscriptionTier: workspace.subscriptionTier,
      subscriptionStatus: workspace.subscriptionStatus,
    },
    billing: {
      price: tierConfig?.price || 0,
      currency: 'usd',
      interval: 'month',
      nextBillingDate: workspace.billingCycleStart
        ? new Date(workspace.billingCycleStart.getTime() + 30 * 24 * 60 * 60 * 1000)
        : null,
      upcomingAmount: upcomingInvoice?.amount_due || null,
    },
    aiCredits: {
      balance: workspace.aiCreditsBalance,
      limit: workspace.aiCreditsLimit,
      monthlyAllocation: tierConfig?.aiCreditsMonthly || 0,
    },
    stripeCustomerId: workspace.stripeCustomerId,
    stripeSubscriptionId: workspace.stripeSubscriptionId,
  };
}
