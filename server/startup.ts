import { initStripe, isStripeAvailable, getStripeMode } from './stripeClient';
import { db } from './db';
import { sql } from 'drizzle-orm';

interface StartupResult {
  name: string;
  status: 'success' | 'warning' | 'error';
  message: string;
  critical: boolean;
}

class StartupService {
  private results: StartupResult[] = [];
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    this.results = [];
    
    await this.checkDatabase();
    await this.checkStripe();
    
    this.initialized = true;
    this.logResults();
  }

  private async checkDatabase(): Promise<void> {
    try {
      // Check if database is configured before attempting connection
      if (!process.env.DATABASE_URL) {
        this.results.push({
          name: 'Database',
          status: 'warning',
          message: 'DATABASE_URL not configured - running in degraded mode',
          critical: false,
        });
        return;
      }

      await db.execute(sql`SELECT 1`);
      this.results.push({
        name: 'Database',
        status: 'success',
        message: 'PostgreSQL connection successful',
        critical: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.results.push({
        name: 'Database',
        status: 'error',
        message: `Database connection failed: ${message}`,
        critical: false, // Not critical - app can run without DB
      });
      // Don't throw - allow server to start in degraded mode
    }
  }

  private async checkStripe(): Promise<void> {
    const mode = getStripeMode();
    
    try {
      await initStripe();

      if (isStripeAvailable()) {
        this.results.push({
          name: 'Stripe',
          status: 'success',
          message: `Initialized successfully in ${mode} mode (validated)`,
          critical: mode === 'production',
        });
      } else {
        this.results.push({
          name: 'Stripe',
          status: 'warning',
          message: `Not configured (optional in ${mode} mode)`,
          critical: false,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isCriticalError = mode === 'production';

      this.results.push({
        name: 'Stripe',
        status: isCriticalError ? 'error' : 'warning',
        message: `${isCriticalError ? 'CRITICAL:' : ''} ${message}`,
        critical: isCriticalError,
      });

      if (isCriticalError) {
        throw error;
      }
    }
  }

  private logResults(): void {
    console.log('\n=== Startup Health Check ===');
    for (const result of this.results) {
      const icon = result.status === 'success' ? '[OK]' : result.status === 'warning' ? '[WARN]' : '[ERR]';
      console.log(`${icon} ${result.name}: ${result.message}`);
    }
    console.log('============================\n');
  }

  getResults(): StartupResult[] {
    return [...this.results];
  }

  hasCriticalErrors(): boolean {
    return this.results.some(r => r.status === 'error' && r.critical);
  }

  isHealthy(): boolean {
    return !this.hasCriticalErrors();
  }
}

export const startupService = new StartupService();
