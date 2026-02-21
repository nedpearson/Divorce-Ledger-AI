import { pool } from '../db';
import { ExtractedData } from './extraction';
import { safeQuery, safeQueryFirst } from '../lib/safeQuery';

function getPool() {
  if (!pool) throw new Error('Database pool not initialized');
  return pool;
}

export interface TransformedData {
  dimUsers: DimUser[];
  factViolations: FactViolation[];
  factTransactions: FactTransaction[];
  factBillingEvents: FactBillingEvent[];
}

interface DimUser {
  userId: string;
  email: string;
  name: string;
  subscriptionTier: string;
  stripeCustomerId: string | null;
  createdAt: Date;
}

interface FactViolation {
  violationId: number;
  userId: string;
  caseId: number | null;
  category: string;
  severityScore: number;
  aiClassification: string | null;
  aiConfidence: number | null;
  hasAudioTranscript: boolean;
  hasEvidence: boolean;
  evidenceCount: number;
  location: string | null;
  violationDate: Date;
  createdAt: Date;
}

interface FactTransaction {
  sourceTable: string;
  sourceId: number;
  userId: string;
  transactionType: string;
  category: string;
  amountCents: number;
  ownership: string;
  isVerified: boolean;
  environment: string;
  transactionDate: Date;
}

interface FactBillingEvent {
  userId: string;
  eventType: string;
  amountCents: number;
  currency: string;
  stripeInvoiceId: string | null;
  status: string;
  eventTimestamp: Date;
}

class TransformationService {
  transformUsers(users: any[]): DimUser[] {
    return users.map(user => ({
      userId: user.id,
      email: user.email || '',
      name: user.name || user.email?.split('@')[0] || 'Unknown',
      subscriptionTier: user.subscription_tier || 'free',
      stripeCustomerId: user.stripe_customer_id,
      createdAt: new Date(user.created_at),
    }));
  }

  transformViolations(violations: any[]): FactViolation[] {
    return violations.map(v => {
      let metadata: any = {};
      if (typeof v.metadata === 'string') {
        try { metadata = JSON.parse(v.metadata); } catch { /* Invalid JSON metadata, use empty object */ }
      } else if (v.metadata) {
        metadata = v.metadata;
      }

      return {
        violationId: v.id,
        userId: v.user_id,
        caseId: v.case_id || null,
        category: this.normalizeCategory(v.type || v.category || 'Other'),
        severityScore: v.severity_score || this.calculateSeverity(v),
        aiClassification: v.ai_classification || metadata.ai_classification || null,
        aiConfidence: metadata.ai_confidence || null,
        hasAudioTranscript: !!v.audio_transcript,
        hasEvidence: !!metadata.evidence_count || v.evidence_count > 0,
        evidenceCount: metadata.evidence_count || v.evidence_count || 0,
        location: v.location || metadata.location || null,
        violationDate: new Date(v.violation_date || v.created_at),
        createdAt: new Date(v.created_at),
      };
    });
  }

  transformTransactions(transactions: any[]): FactTransaction[] {
    return transactions.map(t => {
      const sourceTable = t.source_table || 'transactions';
      const isIncome = sourceTable === 'incomes';
      const isExpense = sourceTable === 'expenses';
      const isAsset = sourceTable === 'assets';
      const isDebt = sourceTable === 'debts';

      let transactionType = 'unknown';
      if (isIncome) transactionType = 'income';
      else if (isExpense) transactionType = 'expense';
      else if (isAsset) transactionType = 'asset';
      else if (isDebt) transactionType = 'debt';
      else transactionType = t.type || 'transaction';

      const amount = t.amount || t.value || 0;

      return {
        sourceTable,
        sourceId: t.id,
        userId: t.user_id,
        transactionType,
        category: t.category || 'Uncategorized',
        amountCents: Math.round(amount * 100),
        ownership: t.ownership || t.owner || 'joint',
        isVerified: t.verified || false,
        environment: t.environment || 'live',
        transactionDate: new Date(t.date || t.created_at),
      };
    });
  }

  transformBillingEvents(events: any[]): FactBillingEvent[] {
    return events.map(e => {
      let metadata: any = {};
      if (typeof e.metadata === 'string') {
        try { metadata = JSON.parse(e.metadata); } catch { /* Invalid JSON metadata, use empty object */ }
      } else if (e.metadata) {
        metadata = e.metadata;
      }

      return {
        userId: e.user_id,
        eventType: e.event_type || e.action || 'unknown',
        amountCents: e.amount_cents || metadata.amount || 0,
        currency: e.currency || 'USD',
        stripeInvoiceId: e.stripe_invoice_id || metadata.invoice_id || null,
        status: e.status || 'completed',
        eventTimestamp: new Date(e.created_at || e.timestamp),
      };
    });
  }

  transformAll(data: ExtractedData): TransformedData {
    return {
      dimUsers: this.transformUsers(data.users),
      factViolations: this.transformViolations(data.violations),
      factTransactions: this.transformTransactions(data.transactions),
      factBillingEvents: this.transformBillingEvents(data.billingEvents),
    };
  }

  private normalizeCategory(category: string): string {
    const categoryMap: Record<string, string> = {
      'financial': 'Financial Hiding',
      'custody': 'Custody Violation',
      'harassment': 'Communication Harassment',
      'property': 'Property Damage',
      'support': 'Support Non-Payment',
      'visitation': 'Visitation Interference',
    };
    
    const lowerCategory = category.toLowerCase();
    for (const [key, value] of Object.entries(categoryMap)) {
      if (lowerCategory.includes(key)) return value;
    }
    return category || 'Other';
  }

  private calculateSeverity(violation: any): number {
    let score = 5;
    
    if (violation.audio_transcript) score += 2;
    if (violation.evidence_count > 0) score += violation.evidence_count;
    if (violation.type?.toLowerCase().includes('custody')) score += 3;
    if (violation.type?.toLowerCase().includes('financial')) score += 2;
    
    return Math.min(score, 10);
  }

  async getOrCreateTimeKey(date: Date): Promise<number> {
    const dateStr = date.toISOString().split('T')[0];
    
    const result = await safeQuery(
      getPool(),
      'etl.transformation:getTimeKey',
      'SELECT time_key FROM dim_time WHERE full_date = $1',
      [dateStr]
    );
    
    if (result.rows.length > 0) {
      return result.rows[0].time_key;
    }
    
    const insertResult = await safeQuery(
      getPool(),
      'etl.transformation:insertTimeKey',
      `INSERT INTO dim_time (full_date, day_of_week, day_of_month, day_of_year, 
       week_of_year, month, month_name, quarter, year, is_weekend, is_month_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (full_date) DO UPDATE SET full_date = EXCLUDED.full_date
       RETURNING time_key`,
      [
        dateStr,
        date.getDay(),
        date.getDate(),
        Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000),
        Math.ceil((date.getTime() - new Date(date.getFullYear(), 0, 1).getTime()) / 604800000),
        date.getMonth() + 1,
        date.toLocaleString('default', { month: 'long' }),
        Math.ceil((date.getMonth() + 1) / 3),
        date.getFullYear(),
        date.getDay() === 0 || date.getDay() === 6,
        new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate() === date.getDate()
      ]
    );
    
    if (insertResult.rows.length === 0) {
      throw new Error('Failed to create time dimension record');
    }
    
    return insertResult.rows[0].time_key;
  }

  async getOrCreateUserKey(userId: string, userData?: DimUser): Promise<number> {
    const result = await safeQuery(
      getPool(),
      'etl.transformation:getUserKey',
      'SELECT user_key FROM dim_user WHERE user_id = $1 AND is_current = TRUE',
      [userId]
    );
    
    if (result.rows.length > 0) {
      return result.rows[0].user_key;
    }
    
    if (userData) {
      const insertResult = await safeQuery(
        getPool(),
        'etl.transformation:insertUserKeyWithData',
        `INSERT INTO dim_user (user_id, email, name, subscription_tier, stripe_customer_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING user_key`,
        [userData.userId, userData.email, userData.name, userData.subscriptionTier, 
         userData.stripeCustomerId, userData.createdAt]
      );
      if (insertResult.rows.length === 0) {
        throw new Error('Failed to create user dimension record');
      }
      return insertResult.rows[0].user_key;
    }
    
    const insertResult = await safeQuery(
      getPool(),
      'etl.transformation:insertUserKeyUnknown',
      `INSERT INTO dim_user (user_id, email, name, subscription_tier)
       VALUES ($1, 'unknown', 'Unknown User', 'free')
       RETURNING user_key`,
      [userId]
    );
    if (insertResult.rows.length === 0) {
      throw new Error('Failed to create unknown user dimension record');
    }
    return insertResult.rows[0].user_key;
  }
}

export const transformationService = new TransformationService();
