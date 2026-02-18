import { useEffect, useCallback, useRef, useState } from 'react';
import { client, DATABASE_ID, COLLECTIONS } from '@/lib/appwrite';
import { queryClient } from '@/lib/queryClient';

interface RealtimeEvent {
  events: string[];
  channels: string[];
  timestamp: number;
  payload: Record<string, unknown>;
}

interface UseAppwriteRealtimeReturn {
  isConnected: boolean;
  error: Error | null;
}

export function useAppwriteRealtime(userId: string | null): UseAppwriteRealtimeReturn {
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const hasReceivedEventRef = useRef(false);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleRealtimeEvent = useCallback((event: RealtimeEvent) => {
    if (!hasReceivedEventRef.current) {
      hasReceivedEventRef.current = true;
      setIsConnected(true);
      setError(null);
    }
    
    const filesChannel = `databases.${DATABASE_ID}.collections.${COLLECTIONS.FILES}.documents`;
    const isFileEvent = event.channels.some(ch => ch.startsWith(filesChannel));

    if (isFileEvent) {
      queryClient.invalidateQueries({ queryKey: ['/api/appwrite/files'] });
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setIsConnected(false);
      hasReceivedEventRef.current = false;
      return;
    }

    const channel = `databases.${DATABASE_ID}.collections.${COLLECTIONS.FILES}.documents`;
    
    try {
      hasReceivedEventRef.current = false;
      setIsConnected(false);
      
      unsubscribeRef.current = client.subscribe(channel, handleRealtimeEvent);
      
      connectionTimeoutRef.current = setTimeout(() => {
        if (!hasReceivedEventRef.current) {
          setIsConnected(false);
        }
      }, 10000);
      
    } catch (err) {
      console.warn('[Appwrite Realtime] Subscription failed:', err);
      setError(err instanceof Error ? err : new Error('Subscription failed'));
      setIsConnected(false);
    }

    return () => {
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      setIsConnected(false);
      hasReceivedEventRef.current = false;
    };
  }, [userId, handleRealtimeEvent]);

  return { isConnected, error };
}

export function useFileStatusPolling(enabled: boolean, intervalMs: number = 5000) {
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['/api/appwrite/files'] });
    }, intervalMs);

    return () => clearInterval(interval);
  }, [enabled, intervalMs]);
}
