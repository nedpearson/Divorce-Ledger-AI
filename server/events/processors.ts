import { pool, getPool } from '../db';
import { EventMessage, EventConsumer, createConsumer } from './consumer';
import { EventTopics } from './producer';
import { safeQuery, DatabaseError } from '../lib/safeQuery';

async function processTierChange(event: EventMessage): Promise<void> {
  const { userId, previousTier, newTier, isUpgrade, isDowngrade, mrrChange } = event.payload;

  try {
    await safeQuery(
      getPool(),
      'analytics.updateUserDimensionSCD2',
      `SELECT update_user_dimension_scd2($1, NULL, NULL, $2, NULL)`,
      [userId, newTier]
    );
  } catch (e) {
    if (e instanceof DatabaseError && e.code === 'TABLE_NOT_FOUND') {
      return;
    }
  }

  await safeQuery(
    getPool(),
    'analytics.insertTierTransition',
    `INSERT INTO agg_tier_transitions (
      transition_month, from_tier, to_tier, transition_type,
      transition_count, mrr_impact_cents, updated_at
    )
    VALUES (
      DATE_TRUNC('month', NOW())::date,
      $1, $2,
      CASE WHEN $3 THEN 'upgrade' WHEN $4 THEN 'downgrade' ELSE 'lateral' END,
      1, $5, NOW()
    )
    ON CONFLICT (transition_month, from_tier, to_tier) DO UPDATE SET
      transition_count = agg_tier_transitions.transition_count + 1,
      mrr_impact_cents = agg_tier_transitions.mrr_impact_cents + EXCLUDED.mrr_impact_cents,
      updated_at = NOW()`,
    [previousTier, newTier, isUpgrade, isDowngrade, mrrChange]
  );
}

async function processPayment(event: EventMessage): Promise<void> {
  const { userId, amount } = event.payload;

  await safeQuery(
    getPool(),
    'analytics.updateMonthlyRevenue',
    `UPDATE agg_monthly_revenue
    SET 
      gross_revenue_cents = gross_revenue_cents + $1,
      net_revenue_cents = net_revenue_cents + $1,
      updated_at = NOW()
    WHERE revenue_month = DATE_TRUNC('month', NOW())::date`,
    [amount]
  );
}

async function processViolation(event: EventMessage): Promise<void> {
  const { userId, severity } = event.payload;

  await safeQuery(
    getPool(),
    'analytics.updateDailyViolationMetrics',
    `UPDATE agg_daily_user_metrics
    SET 
      total_violations = total_violations + 1,
      critical_violations = critical_violations + CASE WHEN $1 = 'critical' THEN 1 ELSE 0 END,
      high_violations = high_violations + CASE WHEN $1 = 'high' THEN 1 ELSE 0 END,
      medium_violations = medium_violations + CASE WHEN $1 = 'medium' THEN 1 ELSE 0 END,
      low_violations = low_violations + CASE WHEN $1 = 'low' THEN 1 ELSE 0 END,
      updated_at = NOW()
    WHERE metric_date = CURRENT_DATE
      AND user_key = (SELECT user_key FROM dim_user WHERE user_id = $2 AND is_current = TRUE LIMIT 1)`,
    [severity, userId]
  );
}

async function processEvidenceUpload(event: EventMessage): Promise<void> {
  const { userId, fileSize } = event.payload;

  await safeQuery(
    getPool(),
    'analytics.updateEvidenceMetrics',
    `UPDATE agg_daily_user_metrics
    SET 
      total_evidence_files = total_evidence_files + 1,
      storage_used_bytes = storage_used_bytes + $1,
      updated_at = NOW()
    WHERE metric_date = CURRENT_DATE
      AND user_key = (SELECT user_key FROM dim_user WHERE user_id = $2 AND is_current = TRUE LIMIT 1)`,
    [fileSize, userId]
  );
}

async function processAIClassification(event: EventMessage): Promise<void> {
  const { userId } = event.payload;

  await safeQuery(
    getPool(),
    'analytics.updateAIUsageMetrics',
    `UPDATE agg_daily_user_metrics
    SET 
      ai_features_used = ai_features_used + 1,
      updated_at = NOW()
    WHERE metric_date = CURRENT_DATE
      AND user_key = (SELECT user_key FROM dim_user WHERE user_id = $2 AND is_current = TRUE LIMIT 1)`,
    [userId]
  );

  await safeQuery(
    getPool(),
    'analytics.updateFeatureUsage',
    `UPDATE agg_feature_usage_by_tier
    SET 
      total_uses = total_uses + 1,
      users_who_used = users_who_used + 1,
      updated_at = NOW()
    WHERE usage_month = DATE_TRUNC('month', NOW())::date
      AND feature_name = 'ai_classification'`
  );
}

async function auditLog(event: EventMessage): Promise<void> {
  console.log(`[Audit] ${event.eventType}: ${JSON.stringify(event.payload)}`);
}

let analyticsConsumer: EventConsumer | null = null;
let auditConsumer: EventConsumer | null = null;

export async function startAnalyticsProcessor(): Promise<void> {
  if (analyticsConsumer) {
    console.log('[Analytics] Processor already running');
    return;
  }

  analyticsConsumer = createConsumer({
    consumerGroup: 'analytics-processor',
    batchSize: 50,
    pollIntervalMs: 2000
  });

  analyticsConsumer.subscribe(EventTopics.USER_TIER_CHANGED, processTierChange, 'processTierChange');
  analyticsConsumer.subscribe(EventTopics.BILLING_PAYMENT, processPayment, 'processPayment');
  analyticsConsumer.subscribe(EventTopics.VIOLATION_CREATED, processViolation, 'processViolation');
  analyticsConsumer.subscribe(EventTopics.EVIDENCE_UPLOADED, processEvidenceUpload, 'processEvidenceUpload');
  analyticsConsumer.subscribe(EventTopics.AI_CLASSIFICATION, processAIClassification, 'processAIClassification');

  await analyticsConsumer.start();
  console.log('[Analytics] Processor started');
}

export async function startAuditProcessor(): Promise<void> {
  if (auditConsumer) {
    console.log('[Audit] Processor already running');
    return;
  }

  auditConsumer = createConsumer({
    consumerGroup: 'audit-logger',
    batchSize: 100,
    pollIntervalMs: 5000
  });

  auditConsumer.subscribe(EventTopics.USER_TIER_CHANGED, auditLog, 'auditTierChange');
  auditConsumer.subscribe(EventTopics.BILLING_PAYMENT, auditLog, 'auditPayment');
  auditConsumer.subscribe(EventTopics.BILLING_PAYMENT_FAILED, auditLog, 'auditPaymentFailed');
  auditConsumer.subscribe(EventTopics.VIOLATION_CREATED, auditLog, 'auditViolation');
  auditConsumer.subscribe(EventTopics.EVIDENCE_UPLOADED, auditLog, 'auditEvidence');

  await auditConsumer.start();
  console.log('[Audit] Processor started');
}

export function stopAllProcessors(): void {
  if (analyticsConsumer) {
    analyticsConsumer.stop();
    analyticsConsumer = null;
  }
  if (auditConsumer) {
    auditConsumer.stop();
    auditConsumer = null;
  }
  console.log('[Events] All processors stopped');
}

export async function getProcessorStatus(): Promise<{
  analytics: { running: boolean; lag: Record<string, number> };
  audit: { running: boolean; lag: Record<string, number> };
}> {
  return {
    analytics: {
      running: analyticsConsumer !== null,
      lag: analyticsConsumer ? await analyticsConsumer.getConsumerLag() : {}
    },
    audit: {
      running: auditConsumer !== null,
      lag: auditConsumer ? await auditConsumer.getConsumerLag() : {}
    }
  };
}
