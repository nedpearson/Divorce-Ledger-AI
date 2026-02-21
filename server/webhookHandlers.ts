import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { storage } from './storage';
import type { SubscriptionTier } from '@shared/schema';
import { db } from './db';
import { stripeEvents } from '@shared/workspace-schema';
import { eq } from 'drizzle-orm';

// Import workspace billing handlers
import {
  handleCheckoutCompleted,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleInvoicePaymentSucceeded,
  handleInvoicePaymentFailed,
} from './services/workspace-billing.service';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    
    // Process webhook - stripe-replit-sync handles signature verification internally
    await sync.processWebhook(payload, signature);
    
    // Additionally process custom logic for subscription events
    try {
      const stripe = await getUncachableStripeClient();
      const webhookSecret = await sync.getWebhookSecret();
      
      if (webhookSecret) {
        const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
        await WebhookHandlers.handleStripeEvent(event);
      }
    } catch (err: any) {
      // Non-critical: sync already processed, custom handling failed
      console.error('Custom webhook handling failed:', err.message);
    }
  }
  
  static async handleStripeEvent(event: any): Promise<void> {
    // Check idempotency - have we already processed this event?
    const processed = await db.query.stripeEvents.findFirst({
      where: eq(stripeEvents.eventId, event.id),
    });

    if (processed) {
      console.log(`Event ${event.id} already processed, skipping`);
      return;
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          
          // Handle workspace billing checkout
          if (session.metadata?.workspaceId) {
            await handleCheckoutCompleted(session);
            console.log(`Workspace checkout completed: ${session.metadata.workspaceId}`);
          }
          
          // Handle legacy user tier checkout
          else if (session.metadata?.userId && session.metadata?.tier) {
            const userId = session.metadata.userId;
            const tier = session.metadata.tier as SubscriptionTier;
            
            await storage.updateUserTier(
              userId,
              tier,
              session.customer,
              session.subscription
            );
            console.log(`User ${userId} upgraded to ${tier}`);
          }
          break;
        }
        
        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const subscription = event.data.object;
          
          // Handle workspace subscription updates
          if (subscription.metadata?.workspaceId) {
            await handleSubscriptionUpdated(subscription);
            console.log(`Workspace subscription updated: ${subscription.id}`);
          }
          break;
        }
        
        case 'customer.subscription.deleted': {
          const subscription = event.data.object;
          
          // Handle workspace subscription cancellation
          if (subscription.metadata?.workspaceId) {
            await handleSubscriptionDeleted(subscription);
            console.log(`Workspace subscription deleted: ${subscription.id}`);
          }
          
          // Handle legacy cancellation
          else {
            const customerId = subscription.customer;
            console.log(`Subscription cancelled for customer ${customerId}`);
          }
          break;
        }
        
        case 'invoice.payment_succeeded': {
          const invoice = event.data.object;
          
          if (invoice.subscription) {
            await handleInvoicePaymentSucceeded(invoice);
            console.log(`Invoice paid: ${invoice.id}`);
          }
          break;
        }
        
        case 'invoice.payment_failed': {
          const invoice = event.data.object;
          
          if (invoice.subscription) {
            await handleInvoicePaymentFailed(invoice);
            console.warn(`Invoice payment failed: ${invoice.id}`);
          }
          break;
        }
      }

      // Record event as processed (idempotency)
      await db.insert(stripeEvents).values({
        id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        eventId: event.id,
        type: event.type,
        metadata: { processed: true },
      });

    } catch (error: any) {
      console.error(`Error handling Stripe event ${event.type}:`, error);
      throw error; // Re-throw to signal webhook failure
    }
  }
}
