import { pool } from '../db';
import { TransformedData, transformationService } from './transformation';
import { etlService } from './etl-service';
import { safeQuery } from '../lib/safeQuery';
import { createLogger } from '../lib/logger';

const logger = createLogger('ETL:Loading');

function getPool() {
  if (!pool) throw new Error('Database pool not initialized');
  return pool;
}

export interface LoadResult {
  usersLoaded: number;
  violationsLoaded: number;
  transactionsLoaded: number;
  billingEventsLoaded: number;
  errors: string[];
}

class LoadingService {
  async loadDimUsers(users: TransformedData['dimUsers']): Promise<number> {
    let loaded = 0;
    
    for (const user of users) {
      try {
        await safeQuery(
          getPool(),
          'etl.loading:loadDimUser',
          `INSERT INTO dim_user (user_id, email, name, subscription_tier, stripe_customer_id, created_at, is_current)
           VALUES ($1, $2, $3, $4, $5, $6, TRUE)
           ON CONFLICT (user_id, effective_from) DO UPDATE SET
             email = EXCLUDED.email,
             name = EXCLUDED.name,
             subscription_tier = EXCLUDED.subscription_tier,
             stripe_customer_id = EXCLUDED.stripe_customer_id`,
          [user.userId, user.email, user.name, user.subscriptionTier, 
           user.stripeCustomerId, user.createdAt]
        );
        loaded++;
      } catch (error) {
        logger.error(`Failed to load user ${user.userId}`, error as Error);
      }
    }
    
    return loaded;
  }

  async loadFactViolations(violations: TransformedData['factViolations']): Promise<number> {
    let loaded = 0;
    
    for (const v of violations) {
      try {
        const timeKey = await transformationService.getOrCreateTimeKey(v.violationDate);
        const userKey = await transformationService.getOrCreateUserKey(v.userId);
        
        const categoryResult = await safeQuery(
          getPool(),
          'etl.loading:getCategoryKey',
          'SELECT category_key FROM dim_violation_category WHERE category_name = $1',
          [v.category]
        );
        const categoryKey = categoryResult.rows[0]?.category_key || null;

        await safeQuery(
          getPool(),
          'etl.loading:loadFactViolation',
          `INSERT INTO fact_violation (
            time_key, user_key, category_key, violation_id, severity_score,
            ai_classification, ai_confidence, has_audio_transcript, has_evidence,
            evidence_count, location, violation_date
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT DO NOTHING`,
          [
            timeKey, userKey, categoryKey, v.violationId, v.severityScore,
            v.aiClassification, v.aiConfidence, v.hasAudioTranscript, v.hasEvidence,
            v.evidenceCount, v.location, v.violationDate
          ]
        );
        loaded++;
      } catch (error) {
        logger.error(`Failed to load violation ${v.violationId}`, error as Error);
      }
    }
    
    return loaded;
  }

  async loadFactTransactions(transactions: TransformedData['factTransactions']): Promise<number> {
    let loaded = 0;
    
    for (const t of transactions) {
      try {
        const timeKey = await transformationService.getOrCreateTimeKey(t.transactionDate);
        const userKey = await transformationService.getOrCreateUserKey(t.userId);

        await safeQuery(
          getPool(),
          'etl.loading:loadFactTransaction',
          `INSERT INTO fact_financial_transaction (
            time_key, user_key, transaction_type, category, amount_cents,
            ownership, is_verified, environment, source_table, source_id, transaction_date
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT DO NOTHING`,
          [
            timeKey, userKey, t.transactionType, t.category, t.amountCents,
            t.ownership, t.isVerified, t.environment, t.sourceTable, t.sourceId, t.transactionDate
          ]
        );
        loaded++;
      } catch (error) {
        logger.error(`Failed to load transaction ${t.sourceId}`, error as Error);
      }
    }
    
    return loaded;
  }

  async loadFactBillingEvents(events: TransformedData['factBillingEvents']): Promise<number> {
    let loaded = 0;
    
    for (const e of events) {
      try {
        const timeKey = await transformationService.getOrCreateTimeKey(e.eventTimestamp);
        const userKey = await transformationService.getOrCreateUserKey(e.userId);
        
        const subResult = await safeQuery(
          getPool(),
          'etl.loading:getSubscriptionKey',
          'SELECT subscription_key FROM dim_subscription WHERE is_current = TRUE LIMIT 1',
          []
        );
        const subscriptionKey = subResult.rows[0]?.subscription_key || null;

        await safeQuery(
          getPool(),
          'etl.loading:loadFactBillingEvent',
          `INSERT INTO fact_billing_event (
            time_key, user_key, subscription_key, event_type, amount_cents,
            currency, stripe_invoice_id, status, event_timestamp
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT DO NOTHING`,
          [
            timeKey, userKey, subscriptionKey, e.eventType, e.amountCents,
            e.currency, e.stripeInvoiceId, e.status, e.eventTimestamp
          ]
        );
        loaded++;
      } catch (error) {
        logger.error(`Failed to load billing event`, error as Error);
      }
    }
    
    return loaded;
  }

  async loadAll(data: TransformedData): Promise<LoadResult> {
    const errors: string[] = [];
    
    const [usersLoaded, violationsLoaded, transactionsLoaded, billingEventsLoaded] = 
      await Promise.all([
        this.loadDimUsers(data.dimUsers).catch(e => { errors.push(`Users: ${e.message}`); return 0; }),
        this.loadFactViolations(data.factViolations).catch(e => { errors.push(`Violations: ${e.message}`); return 0; }),
        this.loadFactTransactions(data.factTransactions).catch(e => { errors.push(`Transactions: ${e.message}`); return 0; }),
        this.loadFactBillingEvents(data.factBillingEvents).catch(e => { errors.push(`Billing: ${e.message}`); return 0; }),
      ]);

    return {
      usersLoaded,
      violationsLoaded,
      transactionsLoaded,
      billingEventsLoaded,
      errors
    };
  }
}

export const loadingService = new LoadingService();
