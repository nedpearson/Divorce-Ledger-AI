import { useEffect } from 'react';
import { queryClient } from '@/lib/queryClient';

export function useFileStatusPolling(enabled: boolean, intervalMs: number = 5000) {
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['/api/storage/files'] });
    }, intervalMs);

    return () => clearInterval(interval);
  }, [enabled, intervalMs]);
}
