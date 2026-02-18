import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { storage } from './storage';
import type { SubscriptionTier } from '@shared/schema';

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
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const tier = session.metadata?.tier as SubscriptionTier;
        
        if (userId && tier) {
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
      
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        
        // Find user by Stripe customer ID and downgrade to free
        // For now, log the cancellation
        console.log(`Subscription cancelled for customer ${customerId}`);
        break;
      }
      
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        console.log(`Subscription updated: ${subscription.id}, status: ${subscription.status}`);
        break;
      }
    }
  }
}
