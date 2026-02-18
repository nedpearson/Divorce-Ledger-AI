import Stripe from 'stripe';

let connectionSettings: any;
let stripeAvailable = false;
let stripeInitialized = false;
let cachedCredentials: { publishableKey: string; secretKey: string } | null = null;

// STRIPE_MODE: 'test' (default) - Stripe is optional, 'production' - Stripe is required
const STRIPE_MODE = process.env.STRIPE_MODE || 'test';

function validateStripeConfig(): boolean {
  // In production mode, Stripe is required
  if (STRIPE_MODE === 'production' && !cachedCredentials) {
    console.error('Stripe production key required in production mode');
    return false;
  }
  return true;
}

// Validate that the key prefix matches the declared mode
function validateKeyPrefix(secretKey: string): boolean {
  if (STRIPE_MODE === 'production' && !secretKey.startsWith('sk_live_')) {
    console.error('CRITICAL: STRIPE_MODE is "production" but STRIPE_SECRET_KEY is not a live key (must start with "sk_live_")');
    throw new Error('Production mode requires a live Stripe key (sk_live_...)');
  }
  
  if (STRIPE_MODE === 'test' && !secretKey.startsWith('sk_test_')) {
    console.warn('Stripe is in "test" mode but STRIPE_SECRET_KEY is not a test key. Proceeding but please verify your configuration.');
  }
  
  return true;
}

// Validate Stripe connection by making a lightweight API call
async function validateStripeConnection(secretKey: string): Promise<boolean> {
  try {
    // First validate key prefix matches mode
    validateKeyPrefix(secretKey);
    
    const stripe = new Stripe(secretKey, {
      apiVersion: '2025-11-17.clover' as const,
    });
    
    // Lightweight validation call
    await stripe.balance.retrieve();
    return true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    if (STRIPE_MODE === 'production') {
      console.error(`Stripe validation failed (production mode): ${errorMsg}`);
      throw new Error(`Stripe production connection failed: ${errorMsg}`);
    } else {
      console.warn(`Stripe validation failed (test mode - non-blocking): ${errorMsg}`);
      return false;
    }
  }
}

// Check for manual API keys in environment variables
async function tryManualCredentials(): Promise<boolean> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  // Accept both STRIPE_PUBLISHABLE_KEY and STRIPE_PUBLIC_KEY for flexibility
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLIC_KEY;
  
  if (secretKey && publishableKey) {
    // Validate the connection before marking as available
    const isValid = await validateStripeConnection(secretKey);
    if (isValid) {
      cachedCredentials = {
        publishableKey,
        secretKey,
      };
      stripeAvailable = true;
      console.log('Stripe initialized with manual API keys (validated)');
      return true;
    }
  }
  return false;
}

async function initializeStripeCredentials(): Promise<boolean> {
  if (stripeInitialized) {
    return stripeAvailable;
  }
  
  stripeInitialized = true;

  // First, try manual credentials from environment variables
  if (await tryManualCredentials()) {
    return true;
  }

  // Fall back to Replit connector
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken || !hostname) {
    console.log('Stripe connector environment not available - checking manual keys');
    stripeAvailable = false;
    return validateStripeConfig();
  }

  const connectorName = 'stripe';
  const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
  const targetEnvironment = isProduction ? 'production' : 'development';

  try {
    const url = new URL(`https://${hostname}/api/v2/connection`);
    url.searchParams.set('include_secrets', 'true');
    url.searchParams.set('connector_names', connectorName);
    url.searchParams.set('environment', targetEnvironment);

    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    });

    const data = await response.json();
    
    connectionSettings = data.items?.[0];

    if (!connectionSettings || (!connectionSettings.settings?.publishable || !connectionSettings.settings?.secret)) {
      // Silently try manual credentials as fallback
      if (await tryManualCredentials()) {
        return true;
      }
      stripeAvailable = false;
      return validateStripeConfig();
    }

    // Validate the Replit connector credentials
    const secretKey = connectionSettings.settings.secret;
    const isValid = await validateStripeConnection(secretKey);
    
    if (!isValid) {
      console.log(`Stripe ${targetEnvironment} credentials invalid - trying manual keys`);
      if (await tryManualCredentials()) {
        return true;
      }
      stripeAvailable = false;
      return validateStripeConfig();
    }

    cachedCredentials = {
      publishableKey: connectionSettings.settings.publishable,
      secretKey: secretKey,
    };

    stripeAvailable = true;
    console.log(`Stripe ${targetEnvironment} initialized successfully (validated)`);
    return true;
  } catch (error) {
    console.log('Stripe connector failed, trying manual keys:', error instanceof Error ? error.message : 'Unknown error');
    // Try manual credentials as fallback
    if (await tryManualCredentials()) {
      return true;
    }
    stripeAvailable = false;
    return validateStripeConfig();
  }
}

async function getCredentials() {
  await initializeStripeCredentials();
  
  if (!cachedCredentials) {
    throw new Error('Stripe credentials not available');
  }
  
  return cachedCredentials;
}

export function isStripeAvailable() {
  return stripeAvailable;
}

export function getStripeMode() {
  return STRIPE_MODE;
}

// Call this on server startup to initialize Stripe gracefully
export async function initStripe(): Promise<boolean> {
  return await initializeStripeCredentials();
}

export async function getUncachableStripeClient() {
  const { secretKey } = await getCredentials();

  return new Stripe(secretKey, {
    apiVersion: '2025-11-17.clover' as const,
  });
}

export async function getStripePublishableKey() {
  const { publishableKey } = await getCredentials();
  return publishableKey;
}

export async function getStripeSecretKey() {
  const { secretKey } = await getCredentials();
  return secretKey;
}

let stripeSync: any = null;

export async function getStripeSync() {
  if (!stripeSync) {
    const { StripeSync } = await import('stripe-replit-sync');
    const secretKey = await getStripeSecretKey();

    stripeSync = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL!,
        max: 2,
      },
      stripeSecretKey: secretKey,
    });
  }
  return stripeSync;
}
