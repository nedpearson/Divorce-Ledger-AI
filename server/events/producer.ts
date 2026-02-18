import { pool, getPool } from '../db';
import { safeQuery } from '../lib/safeQuery';

export interface EventPayload {
  [key: string]: any;
}

export interface EventOptions {
  partitionKey?: string;
  correlationId?: string;
  causationId?: string;
  metadata?: Record<string, any>;
}

export interface PublishedEvent {
  eventId: number;
  eventType: string;
  topic: string;
  sequenceNumber: number;
}

export const EventTopics = {
  USER_TIER_CHANGED: 'user.tier_changed',
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  BILLING_PAYMENT: 'billing.payment',
  BILLING_PAYMENT_FAILED: 'billing.payment_failed',
  BILLING_SUBSCRIPTION_CREATED: 'billing.subscription_created',
  BILLING_SUBSCRIPTION_CANCELLED: 'billing.subscription_cancelled',
  BILLING_REFUND: 'billing.refund',
  VIOLATION_CREATED: 'violation.created',
  VIOLATION_UPDATED: 'violation.updated',
  VIOLATION_DELETED: 'violation.deleted',
  EVIDENCE_UPLOADED: 'evidence.uploaded',
  CASE_CREATED: 'case.created',
  CASE_STATUS_CHANGED: 'case.status_changed',
  PDF_EXPORTED: 'pdf.exported',
  AI_CLASSIFICATION: 'ai.classification',
  VOICE_TRANSCRIPTION: 'voice.transcription'
} as const;

export type EventTopic = typeof EventTopics[keyof typeof EventTopics];

class EventProducer {
  async publish(
    eventType: string,
    topic: EventTopic,
    payload: EventPayload,
    options: EventOptions = {}
  ): Promise<PublishedEvent> {
    const correlationId = options.correlationId || this.generateCorrelationId();
    
    const result = await safeQuery(
      getPool(),
      'events.publishEvent',
      `SELECT publish_event($1, $2, $3, $4, $5, $6, $7) as event_id`,
      [
        eventType,
        topic,
        JSON.stringify(payload),
        options.partitionKey || 'default',
        correlationId,
        options.causationId || null,
        JSON.stringify(options.metadata || {})
      ]
    );

    const eventId = result.rows[0].event_id;

    const eventResult = await safeQuery(
      getPool(),
      'events.getSequenceNumber',
      `SELECT sequence_number FROM event_log WHERE event_id = $1`,
      [eventId]
    );

    return {
      eventId,
      eventType,
      topic,
      sequenceNumber: eventResult.rows[0]?.sequence_number || 0
    };
  }

  async publishToOutbox(
    eventType: string,
    topic: EventTopic,
    payload: EventPayload,
    options: EventOptions = {}
  ): Promise<number> {
    const correlationId = options.correlationId || this.generateCorrelationId();
    
    const result = await safeQuery(
      getPool(),
      'events.publishToOutbox',
      `INSERT INTO event_outbox (event_type, topic, partition_key, payload, metadata, correlation_id, causation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING outbox_id`,
      [
        eventType,
        topic,
        options.partitionKey || 'default',
        JSON.stringify(payload),
        JSON.stringify(options.metadata || {}),
        correlationId,
        options.causationId || null
      ]
    );

    return result.rows[0].outbox_id;
  }

  async publishWithTransaction(
    client: any,
    eventType: string,
    topic: EventTopic,
    payload: EventPayload,
    options: EventOptions = {}
  ): Promise<number> {
    const correlationId = options.correlationId || this.generateCorrelationId();
    
    const result = await safeQuery(
      client,
      'events.publishWithTransaction',
      `INSERT INTO event_outbox (event_type, topic, partition_key, payload, metadata, correlation_id, causation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING outbox_id`,
      [
        eventType,
        topic,
        options.partitionKey || 'default',
        JSON.stringify(payload),
        JSON.stringify(options.metadata || {}),
        correlationId,
        options.causationId || null
      ]
    );

    return result.rows[0].outbox_id;
  }

  async processOutbox(): Promise<number> {
    const result = await safeQuery(
      getPool(),
      'events.processOutbox',
      `SELECT process_outbox() as processed`
    );
    return result.rows[0].processed;
  }

  async publishTierChange(
    userId: string,
    previousTier: string,
    newTier: string,
    reason: string,
    options: EventOptions = {}
  ): Promise<PublishedEvent> {
    return this.publish(
      'tier_changed',
      EventTopics.USER_TIER_CHANGED,
      {
        userId,
        previousTier,
        newTier,
        reason,
        changedAt: new Date().toISOString(),
        isUpgrade: this.isUpgrade(previousTier, newTier),
        isDowngrade: this.isDowngrade(previousTier, newTier),
        mrrChange: this.calculateMrrChange(previousTier, newTier)
      },
      { ...options, partitionKey: userId }
    );
  }

  async publishPayment(
    userId: string,
    amount: number,
    currency: string,
    stripePaymentIntentId: string,
    status: 'succeeded' | 'failed',
    options: EventOptions = {}
  ): Promise<PublishedEvent> {
    const topic = status === 'succeeded' 
      ? EventTopics.BILLING_PAYMENT 
      : EventTopics.BILLING_PAYMENT_FAILED;
    
    return this.publish(
      status === 'succeeded' ? 'payment_succeeded' : 'payment_failed',
      topic,
      {
        userId,
        amount,
        currency,
        stripePaymentIntentId,
        status,
        processedAt: new Date().toISOString()
      },
      { ...options, partitionKey: userId }
    );
  }

  async publishViolationCreated(
    userId: string,
    violationId: number,
    category: string,
    severity: string,
    options: EventOptions = {}
  ): Promise<PublishedEvent> {
    return this.publish(
      'violation_created',
      EventTopics.VIOLATION_CREATED,
      {
        userId,
        violationId,
        category,
        severity,
        createdAt: new Date().toISOString()
      },
      { ...options, partitionKey: userId }
    );
  }

  async publishEvidenceUploaded(
    userId: string,
    violationId: number,
    evidenceId: number,
    fileType: string,
    fileSize: number,
    options: EventOptions = {}
  ): Promise<PublishedEvent> {
    return this.publish(
      'evidence_uploaded',
      EventTopics.EVIDENCE_UPLOADED,
      {
        userId,
        violationId,
        evidenceId,
        fileType,
        fileSize,
        uploadedAt: new Date().toISOString()
      },
      { ...options, partitionKey: userId }
    );
  }

  async publishAIClassification(
    userId: string,
    violationId: number,
    classification: string,
    confidence: number,
    options: EventOptions = {}
  ): Promise<PublishedEvent> {
    return this.publish(
      'ai_classification',
      EventTopics.AI_CLASSIFICATION,
      {
        userId,
        violationId,
        classification,
        confidence,
        processedAt: new Date().toISOString()
      },
      { ...options, partitionKey: userId }
    );
  }

  private generateCorrelationId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getTierOrder(tier: string): number {
    const order: Record<string, number> = {
      'free': 0,
      'individual': 1,
      'pro': 2,
      'team': 3,
      'enterprise': 4
    };
    return order[tier] ?? 0;
  }

  private isUpgrade(from: string, to: string): boolean {
    return this.getTierOrder(to) > this.getTierOrder(from);
  }

  private isDowngrade(from: string, to: string): boolean {
    return this.getTierOrder(to) < this.getTierOrder(from);
  }

  private calculateMrrChange(from: string, to: string): number {
    const prices: Record<string, number> = {
      'free': 0,
      'individual': 1200,
      'pro': 4900,
      'team': 14900,
      'enterprise': 39900
    };
    return (prices[to] ?? 0) - (prices[from] ?? 0);
  }
}

export const eventProducer = new EventProducer();
