import { Router, Request, Response } from 'express';
import { eventProducer, EventTopics } from '../events/producer';
import {
  startAnalyticsProcessor,
  startAuditProcessor,
  stopAllProcessors,
  getProcessorStatus,
} from '../events/processors';
import { pool, getPool } from '../db';
import { safeQuery, DatabaseError } from '../lib/safeQuery';
import { handleRouteError } from '../lib/errorHandler';

const router = Router();

const EVENTS_DISABLED = true;
const EVENTS_DISABLED_MESSAGE =
  'Event streaming module temporarily disabled - pending schema migration';

function checkEventsDisabled(req: Request, res: Response, next: Function) {
  if (EVENTS_DISABLED) {
    return res.status(503).json({
      error: EVENTS_DISABLED_MESSAGE,
      disabled: true,
    });
  }
  next();
}

function requireAdminSecret(req: Request, res: Response, next: Function) {
  const adminSecret = req.headers['x-admin-secret'];
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized - admin secret required' });
  }
  next();
}

router.get(
  '/status',
  checkEventsDisabled,
  requireAdminSecret,
  async (req: Request, res: Response) => {
    try {
      const processorStatus = await getProcessorStatus();

      const eventCountResult = await safeQuery(
        getPool(),
        'events.routes.getEventCount',
        `SELECT 
        topic, 
        COUNT(*) as event_count,
        MAX(created_at) as last_event_at
      FROM event_log
      GROUP BY topic
      ORDER BY event_count DESC`
      );

      const outboxResult = await safeQuery(
        getPool(),
        'events.routes.getOutboxStatus',
        `SELECT status, COUNT(*) as count
      FROM event_outbox
      GROUP BY status`
      );

      const dlqResult = await safeQuery(
        getPool(),
        'events.routes.getDLQCount',
        `SELECT COUNT(*) as count FROM event_dead_letter WHERE status = 'failed'`
      );

      res.json({
        processors: processorStatus,
        topics: eventCountResult.rows,
        outbox: outboxResult.rows.reduce((acc: any, row: any) => {
          acc[row.status] = parseInt(row.count);
          return acc;
        }, {}),
        deadLetterQueue: parseInt(dlqResult.rows[0].count),
      });
    } catch (error: any) {
      handleRouteError(res, error);
    }
  }
);

router.get(
  '/events',
  checkEventsDisabled,
  requireAdminSecret,
  async (req: Request, res: Response) => {
    try {
      const topic = req.query.topic as string;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      let query = `
      SELECT event_id, event_type, topic, partition_key, payload, 
             metadata, sequence_number, correlation_id, created_at
      FROM event_log
    `;
      const params: any[] = [];

      if (topic) {
        query += ` WHERE topic = $1`;
        params.push(topic);
      }

      query += ` ORDER BY event_id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await safeQuery(getPool(), 'events.routes.getEvents', query, params);

      res.json({
        events: result.rows,
        pagination: { limit, offset, count: result.rows.length },
      });
    } catch (error: any) {
      handleRouteError(res, error);
    }
  }
);

router.get(
  '/topics',
  checkEventsDisabled,
  requireAdminSecret,
  async (req: Request, res: Response) => {
    try {
      const result = await safeQuery(
        getPool(),
        'events.routes.getTopics',
        `SELECT 
        topic,
        COUNT(*) as total_events,
        COUNT(DISTINCT partition_key) as partitions,
        MIN(created_at) as first_event,
        MAX(created_at) as last_event
      FROM event_log
      GROUP BY topic
      ORDER BY topic`
      );

      res.json({ topics: result.rows });
    } catch (error: any) {
      handleRouteError(res, error);
    }
  }
);

router.get(
  '/consumers',
  checkEventsDisabled,
  requireAdminSecret,
  async (req: Request, res: Response) => {
    try {
      const groupsResult = await safeQuery(
        getPool(),
        'events.routes.getConsumerGroups',
        `SELECT * FROM event_consumer_groups ORDER BY group_id`
      );

      const offsetsResult = await safeQuery(
        getPool(),
        'events.routes.getConsumerOffsets',
        `SELECT 
        eco.consumer_group,
        eco.topic,
        eco.last_offset,
        eco.last_processed_at,
        (SELECT MAX(event_id) FROM event_log el WHERE el.topic = eco.topic) - eco.last_offset as lag
      FROM event_consumer_offsets eco
      ORDER BY eco.consumer_group, eco.topic`
      );

      const groups = groupsResult.rows.map((group: any) => ({
        ...group,
        offsets: offsetsResult.rows.filter((o: any) => o.consumer_group === group.group_id),
      }));

      res.json({ consumerGroups: groups });
    } catch (error: any) {
      handleRouteError(res, error);
    }
  }
);

router.get('/dlq', checkEventsDisabled, requireAdminSecret, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;

    const result = await safeQuery(
      getPool(),
      'events.routes.getDLQ',
      `SELECT * FROM event_dead_letter
      WHERE status = 'failed'
      ORDER BY created_at DESC
      LIMIT $1`,
      [limit]
    );

    res.json({ deadLetterQueue: result.rows });
  } catch (error: any) {
    handleRouteError(res, error);
  }
});

router.post(
  '/processors/start',
  checkEventsDisabled,
  requireAdminSecret,
  async (req: Request, res: Response) => {
    try {
      await startAnalyticsProcessor();
      await startAuditProcessor();
      const status = await getProcessorStatus();
      res.json({ message: 'Processors started', status });
    } catch (error: any) {
      handleRouteError(res, error, 'Failed to start processors');
    }
  }
);

router.post(
  '/processors/stop',
  checkEventsDisabled,
  requireAdminSecret,
  async (req: Request, res: Response) => {
    try {
      stopAllProcessors();
      const status = await getProcessorStatus();
      res.json({ message: 'Processors stopped', status });
    } catch (error: any) {
      handleRouteError(res, error, 'Failed to stop processors');
    }
  }
);

router.post(
  '/outbox/process',
  checkEventsDisabled,
  requireAdminSecret,
  async (req: Request, res: Response) => {
    try {
      const processed = await eventProducer.processOutbox();
      res.json({ message: 'Outbox processed', eventsPublished: processed });
    } catch (error: any) {
      handleRouteError(res, error);
    }
  }
);

router.post(
  '/dlq/:id/retry',
  checkEventsDisabled,
  requireAdminSecret,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const dlqResult = await safeQuery(
        getPool(),
        'events.routes.getDLQEntry',
        `SELECT * FROM event_dead_letter WHERE dlq_id = $1`,
        [id]
      );

      if (dlqResult.rows.length === 0) {
        return res.status(404).json({ error: 'DLQ entry not found' });
      }

      const entry = dlqResult.rows[0];

      await eventProducer.publish(entry.event_type, entry.topic, entry.payload, {
        correlationId: `retry_${entry.dlq_id}`,
      });

      await safeQuery(
        getPool(),
        'events.routes.markDLQRetried',
        `UPDATE event_dead_letter SET status = 'retried', last_retry_at = NOW() WHERE dlq_id = $1`,
        [id]
      );

      res.json({ message: 'Event retried', dlqId: id });
    } catch (error: any) {
      handleRouteError(res, error);
    }
  }
);

router.post(
  '/publish',
  checkEventsDisabled,
  requireAdminSecret,
  async (req: Request, res: Response) => {
    try {
      const { eventType, topic, payload, partitionKey, correlationId } = req.body;

      if (!eventType || !topic || !payload) {
        return res.status(400).json({ error: 'eventType, topic, and payload are required' });
      }

      const event = await eventProducer.publish(eventType, topic, payload, {
        partitionKey,
        correlationId,
      });

      res.json({ message: 'Event published', event });
    } catch (error: any) {
      handleRouteError(res, error);
    }
  }
);

router.post(
  '/consumers/:groupId/reset',
  checkEventsDisabled,
  requireAdminSecret,
  async (req: Request, res: Response) => {
    try {
      const { groupId } = req.params;
      const { topic, toEventId } = req.body;

      if (!topic) {
        return res.status(400).json({ error: 'topic is required' });
      }

      await safeQuery(
        getPool(),
        'events.routes.resetConsumerOffset',
        `UPDATE event_consumer_offsets
      SET last_offset = $3
      WHERE consumer_group = $1 AND topic = $2`,
        [groupId, topic, toEventId || 0]
      );

      res.json({
        message: 'Consumer offset reset',
        consumerGroup: groupId,
        topic,
        newOffset: toEventId || 0,
      });
    } catch (error: any) {
      handleRouteError(res, error);
    }
  }
);

export default router;
