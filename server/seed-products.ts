import { getUncachableStripeClient } from './stripeClient';
import { SUBSCRIPTION_TIERS } from '@shared/schema';

async function createSubscriptionProducts() {
  const stripe = await getUncachableStripeClient();

  console.log('Creating subscription products in Stripe...');

  const products = [
    {
      tier: 'individual' as const,
      name: 'Divorce Ledger Individual',
      description: 'Perfect for individuals managing their own divorce case',
      price: 1200, // $12.00
    },
    {
      tier: 'pro' as const,
      name: 'Divorce Ledger Pro',
      description: 'Advanced features for complex cases with AI pattern detection',
      price: 4900, // $49.00
    },
    {
      tier: 'team' as const,
      name: 'Divorce Ledger Team',
      description: 'Collaborate with your legal team on case management',
      price: 14900, // $149.00
    },
    {
      tier: 'enterprise' as const,
      name: 'Divorce Ledger Enterprise',
      description: 'Full-featured solution for law firms with API access',
      price: 39900, // $399.00
    },
  ];

  for (const productData of products) {
    // Check if product already exists
    const existingProducts = await stripe.products.search({
      query: `name:'${productData.name}'`,
    });

    if (existingProducts.data.length > 0) {
      console.log(`Product "${productData.name}" already exists, skipping...`);
      continue;
    }

    // Create product
    const product = await stripe.products.create({
      name: productData.name,
      description: productData.description,
      metadata: {
        tier: productData.tier,
        app: 'divorceledger',
      },
    });

    console.log(`Created product: ${product.id} (${productData.name})`);

    // Create monthly price
    const monthlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: productData.price,
      currency: 'usd',
      recurring: { interval: 'month' },
      metadata: {
        tier: productData.tier,
        interval: 'monthly',
      },
    });

    console.log(`Created monthly price: ${monthlyPrice.id} ($${productData.price / 100}/month)`);

    // Create yearly price with 20% discount
    const yearlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(productData.price * 12 * 0.8),
      currency: 'usd',
      recurring: { interval: 'year' },
      metadata: {
        tier: productData.tier,
        interval: 'yearly',
      },
    });

    console.log(`Created yearly price: ${yearlyPrice.id} ($${Math.round(productData.price * 12 * 0.8) / 100}/year)`);
  }

  console.log('Done creating subscription products!');
}

createSubscriptionProducts().catch(console.error);
