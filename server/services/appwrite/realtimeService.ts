import { FILE_STATUS, type FileStatus } from './client';

export interface FileStatusEvent {
  type: 'file.status.changed';
  fileId: string;
  userId: string;
  fromStatus: FileStatus;
  toStatus: FileStatus;
  timestamp: string;
  analysisRunId?: string;
  confidence?: number;
  needsUserReview?: boolean;
}

export interface RealtimeSubscription {
  userId: string;
  callback: (event: FileStatusEvent) => void;
}

const subscriptions: Map<string, RealtimeSubscription[]> = new Map();

export function subscribeToFileUpdates(
  userId: string,
  callback: (event: FileStatusEvent) => void
): () => void {
  const existing = subscriptions.get(userId) || [];
  const subscription: RealtimeSubscription = { userId, callback };
  subscriptions.set(userId, [...existing, subscription]);
  
  return () => {
    const current = subscriptions.get(userId) || [];
    subscriptions.set(
      userId,
      current.filter(s => s !== subscription)
    );
  };
}

export function emitFileStatusChange(event: FileStatusEvent): void {
  const userSubscriptions = subscriptions.get(event.userId) || [];
  for (const sub of userSubscriptions) {
    try {
      sub.callback(event);
    } catch (error) {
      console.error('[Realtime] Error in subscription callback:', error);
    }
  }
}

export function getActiveSubscriptionCount(userId?: string): number {
  if (userId) {
    return (subscriptions.get(userId) || []).length;
  }
  let total = 0;
  subscriptions.forEach((subs) => {
    total += subs.length;
  });
  return total;
}

export function clearAllSubscriptions(): void {
  subscriptions.clear();
}

export function createStatusChangeEvent(
  fileId: string,
  userId: string,
  fromStatus: FileStatus,
  toStatus: FileStatus,
  options?: {
    analysisRunId?: string;
    confidence?: number;
    needsUserReview?: boolean;
  }
): FileStatusEvent {
  return {
    type: 'file.status.changed',
    fileId,
    userId,
    fromStatus,
    toStatus,
    timestamp: new Date().toISOString(),
    ...options,
  };
}
