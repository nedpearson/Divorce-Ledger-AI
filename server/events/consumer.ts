import { pool, getPool } from '../db';
import { EventTopic, EventTopics } from './producer';
import { safeQuery, DatabaseError } from '../lib/safeQuery';
import { createLogger } from '../lib/logger';

const logger = createLogger('EventConsumer');

export interface EventMessage {
  eventId: number;
  eventType: string;
  topic: string;
  partitionKey: string;
  payload: any;
  metadata: any;
  sequenceNumber: number;
  correlationId: string;
  createdAt: Date;
}

export type EventHandler = (event: EventMessage) => Promise<void>;

interface Subscription {
  topic: EventTopic;
  handler: EventHandler;
  handlerName: string;
}

interface ConsumerConfig {
  consumerGroup: string;
  batchSize?: number;
  pollIntervalMs?: number;
  maxRetries?: number;
}

class EventConsumer {
  private consumerGroup: string;
  private subscriptions: Map<string, Subscription[]> = new Map();
  private isRunning: boolean = false;
  private pollIntervalMs: number;
  private batchSize: number;
  private maxRetries: number;
  private pollTimer: NodeJS.Timeout | null = null;
  private processedEventIds: Set<number> = new Set();

  constructor(config: ConsumerConfig) {
    this.consumerGroup = config.consumerGroup;
    this.batchSize = config.batchSize || 100;
    this.pollIntervalMs = config.pollIntervalMs || 1000;
    this.maxRetries = config.maxRetries || 3;
  }

  subscribe(topic: EventTopic, handler: EventHandler, handlerName: string): void {
    const subs = this.subscriptions.get(topic) || [];
    subs.push({ topic, handler, handlerName });
    this.subscriptions.set(topic, subs);
    console.log(
      `[EventConsumer:${this.consumerGroup}] Subscribed to ${topic} with handler ${handlerName}`
    );
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log(`[EventConsumer:${this.consumerGroup}] Already running`);
      return;
    }

    this.isRunning = true;
    console.log(`[EventConsumer:${this.consumerGroup}] Starting consumer...`);

    await this.ensureConsumerGroup();
    await this.registerSubscriptions();

    this.poll();
  }

  stop(): void {
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    console.log(`[EventConsumer:${this.consumerGroup}] Stopped`);
  }

  private async ensureConsumerGroup(): Promise<void> {
    await safeQuery(
      getPool(),
      'events.ensureConsumerGroup',
      `INSERT INTO event_consumer_groups (group_id, description)
       VALUES ($1, $2)
       ON CONFLICT (group_id) DO UPDATE SET updated_at = NOW()`,
      [this.consumerGroup, `Consumer group ${this.consumerGroup}`]
    );
  }

  private async registerSubscriptions(): Promise<void> {
    const entries = Array.from(this.subscriptions.entries());
    for (const [topic, subs] of entries) {
      for (const sub of subs) {
        await safeQuery(
          getPool(),
          'events.registerSubscription',
          `INSERT INTO event_subscriptions (consumer_group, topic, handler_name, is_active)
           VALUES ($1, $2, $3, TRUE)
           ON CONFLICT (consumer_group, topic, handler_name) DO UPDATE SET is_active = TRUE`,
          [this.consumerGroup, topic, sub.handlerName]
        );
      }
    }
  }

  private async poll(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const topics = Array.from(this.subscriptions.keys());
      for (const topic of topics) {
        await this.processTopicEvents(topic as EventTopic);
      }
    } catch (error) {
      if (error instanceof DatabaseError) {
        logger.error('Poll error', error, {
          consumerGroup: this.consumerGroup,
          traceId: error.traceId,
        });
      } else {
        logger.error('Poll error', error instanceof Error ? error : new Error(String(error)), {
          consumerGroup: this.consumerGroup,
        });
      }
    }

    this.pollTimer = setTimeout(() => this.poll(), this.pollIntervalMs);
  }

  private async processTopicEvents(topic: EventTopic): Promise<void> {
    const events = await this.fetchPendingEvents(topic);

    if (events.length === 0) return;

    console.log(
      `[EventConsumer:${this.consumerGroup}] Processing ${events.length} events from ${topic}`
    );

    for (const event of events) {
      if (this.processedEventIds.has(event.eventId)) {
        continue;
      }

      const subs = this.subscriptions.get(topic) || [];
      let allSucceeded = true;

      for (const sub of subs) {
        try {
          await this.processEventWithRetry(event, sub.handler, sub.handlerName);
        } catch (error: any) {
          allSucceeded = false;
          await this.sendToDeadLetter(event, sub.handlerName, error);
        }
      }

      if (allSucceeded) {
        await this.commitOffset(topic, event.eventId);
        this.processedEventIds.add(event.eventId);

        if (this.processedEventIds.size > 10000) {
          const oldIds = Array.from(this.processedEventIds).slice(0, 5000);
          oldIds.forEach((id) => this.processedEventIds.delete(id));
        }
      }
    }
  }

  private async fetchPendingEvents(topic: EventTopic): Promise<EventMessage[]> {
    const result = await safeQuery(
      getPool(),
      'events.fetchPendingEvents',
      `SELECT * FROM get_pending_events($1, $2, $3)`,
      [this.consumerGroup, topic, this.batchSize]
    );

    return result.rows.map((row) => ({
      eventId: row.event_id,
      eventType: row.event_type,
      topic: row.topic,
      partitionKey: row.partition_key,
      payload: row.payload,
      metadata: row.metadata,
      sequenceNumber: row.sequence_number,
      correlationId: row.correlation_id,
      createdAt: row.created_at,
    }));
  }

  private async processEventWithRetry(
    event: EventMessage,
    handler: EventHandler,
    handlerName: string
  ): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        await handler(event);
        return;
      } catch (error: any) {
        lastError = error;
        console.warn(
          `[EventConsumer:${this.consumerGroup}] Handler ${handlerName} failed attempt ${attempt + 1}/${this.maxRetries}:`,
          error.message
        );

        if (attempt < this.maxRetries - 1) {
          await this.delay(Math.pow(2, attempt) * 100);
        }
      }
    }

    throw lastError;
  }

  private async commitOffset(topic: EventTopic, eventId: number): Promise<void> {
    await safeQuery(getPool(), 'events.commitOffset', `SELECT commit_offset($1, $2, $3)`, [
      this.consumerGroup,
      topic,
      eventId,
    ]);
  }

  private async sendToDeadLetter(
    event: EventMessage,
    handlerName: string,
    error: Error
  ): Promise<void> {
    await safeQuery(
      getPool(),
      'events.sendToDeadLetter',
      `INSERT INTO event_dead_letter (
        original_event_id, consumer_group, topic, event_type, payload, 
        error_message, error_stack, retry_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        event.eventId,
        this.consumerGroup,
        event.topic,
        event.eventType,
        JSON.stringify(event.payload),
        error.message,
        error.stack,
        this.maxRetries,
      ]
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getConsumerLag(topic?: EventTopic): Promise<Record<string, number>> {
    const query = topic
      ? `SELECT topic, 
           (SELECT MAX(event_id) FROM event_log WHERE topic = eco.topic) - last_offset as lag
         FROM event_consumer_offsets eco
         WHERE consumer_group = $1 AND topic = $2`
      : `SELECT topic, 
           (SELECT MAX(event_id) FROM event_log WHERE topic = eco.topic) - last_offset as lag
         FROM event_consumer_offsets eco
         WHERE consumer_group = $1`;

    const result = await safeQuery(
      getPool(),
      'events.getConsumerLag',
      query,
      topic ? [this.consumerGroup, topic] : [this.consumerGroup]
    );

    const lag: Record<string, number> = {};
    for (const row of result.rows) {
      lag[row.topic] = row.lag || 0;
    }
    return lag;
  }

  async replayEvents(topic: EventTopic, fromEventId: number): Promise<void> {
    await safeQuery(
      getPool(),
      'events.replayEvents',
      `UPDATE event_consumer_offsets 
       SET last_offset = $3
       WHERE consumer_group = $1 AND topic = $2`,
      [this.consumerGroup, topic, fromEventId - 1]
    );
  }
}

export function createConsumer(config: ConsumerConfig): EventConsumer {
  return new EventConsumer(config);
}

export { EventConsumer };
