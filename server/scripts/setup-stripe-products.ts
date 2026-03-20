#!/usr/bin/env ts-node
/**
 * Stripe Products Setup Script
 *
 * Creates Stripe Products and Prices for workspace billing
 * Run once in test mode, then once in production mode
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... npm run setup-stripe-products
 *   STRIPE_SECRET_KEY=sk_live_... npm run setup-stripe-products
 */

import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY environment variable is required');
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  // @ts-ignore
  apiVersion: '2024-12-18.acacia',
});

interface PlanConfig {
  id: string;
  name: string;
  description: string;
  price: number; // in cents
  interval: 'month' | 'year';
  workspaceType: 'consumer' | 'firm';
  tier: string;
}

const PLANS: PlanConfig[] = [
  // Consumer Plans
  {
    id: 'consumer_individual',
    name: 'Individual Plan',
    description: 'For individual users managing personal divorce cases',
    price: 1200, // $12
    interval: 'month',
    workspaceType: 'consumer',
    tier: 'individual',
  },
  {
    id: 'consumer_pro',
    name: 'Pro Plan',
    description: 'Advanced features for power users',
    price: 4900, // $49
    interval: 'month',
    workspaceType: 'consumer',
    tier: 'pro',
  },

  // Firm Plans
  {
    id: 'firm_starter',
    name: 'Firm Starter',
    description: 'For small law firms with up to 3 staff members',
    price: 14900, // $149
    interval: 'month',
    workspaceType: 'firm',
    tier: 'firm_starter',
  },
  {
    id: 'firm_pro',
    name: 'Firm Pro',
    description: 'For growing law firms with up to 10 staff members',
    price: 39900, // $399
    interval: 'month',
    workspaceType: 'firm',
    tier: 'firm_pro',
  },
];

async function setupProducts() {
  console.log('🚀 Setting up Stripe products and prices...\n');

  const mode = STRIPE_SECRET_KEY!.startsWith('sk_live') ? '🔴 PRODUCTION' : '🟡 TEST';
  console.log(`Mode: ${mode}\n`);

  for (const plan of PLANS) {
    try {
      console.log(`📦 Creating product: ${plan.name}...`);

      // Check if product already exists
      const existingProducts = await stripe.products.list({
        limit: 100,
      });

      let product = existingProducts.data.find((p) => p.metadata?.plan_id === plan.id);

      if (product) {
        console.log(`   ✓ Product already exists: ${product.id}`);
      } else {
        // Create product
        product = await stripe.products.create({
          id: plan.id,
          name: plan.name,
          description: plan.description,
          metadata: {
            plan_id: plan.id,
            workspace_type: plan.workspaceType,
            tier: plan.tier,
          },
        });
        console.log(`   ✓ Created product: ${product.id}`);
      }

      // Create price
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.price,
        currency: 'usd',
        recurring: {
          interval: plan.interval,
        },
        metadata: {
          plan_id: plan.id,
          tier: plan.tier,
        },
      });

      console.log(`   ✓ Created price: ${price.id}`);
      console.log(`   💰 Price: $${(plan.price / 100).toFixed(2)}/${plan.interval}`);
      console.log(`   ⚙️  Set env var: STRIPE_PRICE_${plan.tier.toUpperCase()}=${price.id}\n`);
    } catch (error: any) {
      console.error(`   ❌ Error creating ${plan.name}:`, error.message);
    }
  }

  // Create AI Credits Overage (Metered Billing)
  try {
    console.log('📦 Creating AI Credits Overage product...');

    const overageProduct = await stripe.products.create({
      name: 'AI Credits Overage',
      description: 'Additional AI credits beyond monthly allocation',
      metadata: {
        plan_id: 'ai_credits_overage',
        type: 'metered',
      },
    });

    const overagePrice = await stripe.prices.create({
      product: overageProduct.id,
      unit_amount: 10, // $0.10 per 10 credits
      currency: 'usd',
      recurring: {
        interval: 'month',
        usage_type: 'metered',
        // @ts-ignore
        aggregate_usage: 'sum',
      },
      metadata: {
        plan_id: 'ai_credits_overage',
      },
    });

    console.log(`   ✓ Created overage product: ${overageProduct.id}`);
    console.log(`   ✓ Created overage price: ${overagePrice.id}`);
    console.log(`   💰 Price: $0.10 per 10 credits`);
    console.log(`   ⚙️  Set env var: STRIPE_PRICE_AI_OVERAGE=${overagePrice.id}\n`);
  } catch (error: any) {
    console.error('   ❌ Error creating overage product:', error.message);
  }

  console.log('✅ Setup complete!\n');
  console.log('📝 Add these environment variables to your .env file:\n');
  console.log('   STRIPE_PRICE_INDIVIDUAL=<price_id>');
  console.log('   STRIPE_PRICE_PRO=<price_id>');
  console.log('   STRIPE_PRICE_FIRM_STARTER=<price_id>');
  console.log('   STRIPE_PRICE_FIRM_PRO=<price_id>');
  console.log('   STRIPE_PRICE_AI_OVERAGE=<price_id>');
}

setupProducts()
  .then(() => {
    console.log('\n🎉 Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
