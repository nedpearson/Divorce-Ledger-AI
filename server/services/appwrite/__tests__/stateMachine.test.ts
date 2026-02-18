import { describe, it, expect, afterEach } from 'vitest';
import { FILE_STATUS } from '../client';
import { 
  ALLOWED_TRANSITIONS, 
  isValidTransition, 
  InvalidTransitionError 
} from '../fileService';
import { 
  subscribeToFileUpdates, 
  emitFileStatusChange, 
  getActiveSubscriptionCount,
  clearAllSubscriptions,
  createStatusChangeEvent,
  FileStatusEvent
} from '../realtimeService';

describe('State Machine - ALLOWED_TRANSITIONS', () => {
  it('should allow UPLOADED → EXTRACTING', () => {
    expect(isValidTransition(FILE_STATUS.UPLOADED, FILE_STATUS.EXTRACTING)).toBe(true);
  });

  it('should allow UPLOADED → QUEUED', () => {
    expect(isValidTransition(FILE_STATUS.UPLOADED, FILE_STATUS.QUEUED)).toBe(true);
  });

  it('should allow UPLOADED → ERROR', () => {
    expect(isValidTransition(FILE_STATUS.UPLOADED, FILE_STATUS.ERROR)).toBe(true);
  });

  it('should allow EXTRACTING → ANALYZING', () => {
    expect(isValidTransition(FILE_STATUS.EXTRACTING, FILE_STATUS.ANALYZING)).toBe(true);
  });

  it('should allow ANALYZING → SUGGESTED', () => {
    expect(isValidTransition(FILE_STATUS.ANALYZING, FILE_STATUS.SUGGESTED)).toBe(true);
  });

  it('should allow ANALYZING → FINALIZED', () => {
    expect(isValidTransition(FILE_STATUS.ANALYZING, FILE_STATUS.FINALIZED)).toBe(true);
  });

  it('should allow SUGGESTED → FINALIZED', () => {
    expect(isValidTransition(FILE_STATUS.SUGGESTED, FILE_STATUS.FINALIZED)).toBe(true);
  });

  it('should allow ERROR → UPLOADED (retry)', () => {
    expect(isValidTransition(FILE_STATUS.ERROR, FILE_STATUS.UPLOADED)).toBe(true);
  });

  it('should NOT allow FINALIZED → any state', () => {
    const allStatuses = Object.values(FILE_STATUS);
    for (const status of allStatuses) {
      expect(isValidTransition(FILE_STATUS.FINALIZED, status)).toBe(false);
    }
  });

  it('should NOT allow UPLOADED → FINALIZED (skip states)', () => {
    expect(isValidTransition(FILE_STATUS.UPLOADED, FILE_STATUS.FINALIZED)).toBe(false);
  });

  it('should NOT allow EXTRACTING → FINALIZED (skip analyzing)', () => {
    expect(isValidTransition(FILE_STATUS.EXTRACTING, FILE_STATUS.FINALIZED)).toBe(false);
  });

  it('should NOT allow backward transitions except ERROR recovery', () => {
    expect(isValidTransition(FILE_STATUS.ANALYZING, FILE_STATUS.EXTRACTING)).toBe(false);
    expect(isValidTransition(FILE_STATUS.SUGGESTED, FILE_STATUS.EXTRACTING)).toBe(false);
  });
});

describe('State Machine - InvalidTransitionError', () => {
  it('should create error with correct properties', () => {
    const error = new InvalidTransitionError(
      FILE_STATUS.UPLOADED, 
      FILE_STATUS.FINALIZED
    );
    
    expect(error.name).toBe('InvalidTransitionError');
    expect(error.fromStatus).toBe(FILE_STATUS.UPLOADED);
    expect(error.toStatus).toBe(FILE_STATUS.FINALIZED);
    expect(error.message).toContain('uploaded');
    expect(error.message).toContain('finalized');
  });
});

describe('Realtime Service', () => {
  afterEach(() => {
    clearAllSubscriptions();
  });

  it('should subscribe to file updates', () => {
    const callback = () => {};
    const unsubscribe = subscribeToFileUpdates('user1', callback);
    
    expect(getActiveSubscriptionCount('user1')).toBe(1);
    
    unsubscribe();
    expect(getActiveSubscriptionCount('user1')).toBe(0);
  });

  it('should emit events to subscribers', () => {
    const events: FileStatusEvent[] = [];
    subscribeToFileUpdates('user1', (event) => events.push(event));
    
    const event = createStatusChangeEvent(
      'file1',
      'user1',
      FILE_STATUS.UPLOADED,
      FILE_STATUS.EXTRACTING
    );
    
    emitFileStatusChange(event);
    
    expect(events.length).toBe(1);
    expect(events[0].fileId).toBe('file1');
    expect(events[0].fromStatus).toBe(FILE_STATUS.UPLOADED);
    expect(events[0].toStatus).toBe(FILE_STATUS.EXTRACTING);
  });

  it('should only emit to correct user', () => {
    const user1Events: FileStatusEvent[] = [];
    const user2Events: FileStatusEvent[] = [];
    
    subscribeToFileUpdates('user1', (event) => user1Events.push(event));
    subscribeToFileUpdates('user2', (event) => user2Events.push(event));
    
    emitFileStatusChange(createStatusChangeEvent(
      'file1', 'user1', FILE_STATUS.UPLOADED, FILE_STATUS.EXTRACTING
    ));
    
    expect(user1Events.length).toBe(1);
    expect(user2Events.length).toBe(0);
  });

  it('should handle multiple subscribers per user', () => {
    let count = 0;
    subscribeToFileUpdates('user1', () => count++);
    subscribeToFileUpdates('user1', () => count++);
    
    emitFileStatusChange(createStatusChangeEvent(
      'file1', 'user1', FILE_STATUS.UPLOADED, FILE_STATUS.EXTRACTING
    ));
    
    expect(count).toBe(2);
  });

  it('should count active subscriptions', () => {
    subscribeToFileUpdates('user1', () => {});
    subscribeToFileUpdates('user1', () => {});
    subscribeToFileUpdates('user2', () => {});
    
    expect(getActiveSubscriptionCount()).toBe(3);
    expect(getActiveSubscriptionCount('user1')).toBe(2);
    expect(getActiveSubscriptionCount('user2')).toBe(1);
  });

  it('should create status change event with metadata', () => {
    const event = createStatusChangeEvent(
      'file1',
      'user1',
      FILE_STATUS.ANALYZING,
      FILE_STATUS.FINALIZED,
      {
        analysisRunId: 'run123',
        confidence: 0.95,
        needsUserReview: false,
      }
    );
    
    expect(event.type).toBe('file.status.changed');
    expect(event.analysisRunId).toBe('run123');
    expect(event.confidence).toBe(0.95);
    expect(event.needsUserReview).toBe(false);
    expect(event.timestamp).toBeTruthy();
  });

  it('should clear all subscriptions', () => {
    subscribeToFileUpdates('user1', () => {});
    subscribeToFileUpdates('user2', () => {});
    
    clearAllSubscriptions();
    
    expect(getActiveSubscriptionCount()).toBe(0);
  });
});
