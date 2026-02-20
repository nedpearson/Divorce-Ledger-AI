import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Cloud, 
  CloudOff, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Wifi, 
  WifiOff 
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { 
  getSyncStatus, 
  onSyncStatusChange, 
  syncOfflineData, 
  type SyncStatus 
} from '@/lib/wifi-sync';
import {
  getUnsyncedDocuments,
  getUnsyncedViolations,
  getSyncQueue,
} from '@/lib/offline-db';

/**
 * Sync Status Indicator
 * 
 * Shows:
 * - Online/offline status
 * - Pending sync count
 * - Last sync time
 * - Manual sync button
 */
export function SyncStatusIndicator() {
  const [status, setStatus] = useState<SyncStatus>(() => {
    try {
      return getSyncStatus();
    } catch (error) {
      console.error('[Sync Status] Error getting initial status:', error);
      return {
        isOnline: navigator.onLine,
        isSyncing: false,
        lastSyncTime: null,
        pendingCount: 0,
        error: null,
      };
    }
  });
  const [pendingCounts, setPendingCounts] = useState({ documents: 0, violations: 0, queue: 0 });
  const [syncing, setSyncing] = useState(false);
  const [open, setOpen] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    try {
      // Subscribe to status changes
      const unsubscribe = onSyncStatusChange(setStatus);
      
      // Update pending counts
      updatePendingCounts();
      const interval = setInterval(updatePendingCounts, 5000);
      
      return () => {
        unsubscribe();
        clearInterval(interval);
      };
    } catch (error) {
      console.error('[Sync Status] Setup error:', error);
      setHasError(true);
    }
  }, []);

  const updatePendingCounts = async () => {
    try {
      const docs = await getUnsyncedDocuments();
      const viols = await getUnsyncedViolations();
      const queue = await getSyncQueue();
      setPendingCounts({
        documents: docs.length,
        violations: viols.length,
        queue: queue.length,
      });
    } catch (error) {
      console.error('[Sync Status] Error updating pending counts:', error);
      // Don't update counts if there's an error
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncOfflineData();
      console.log('[Sync] Result:', result);
      await updatePendingCounts();
    } catch (error) {
      console.error('[Sync] Error:', error);
    } finally {
      setSyncing(false);
    }
  };

  const totalPending = pendingCounts.documents + pendingCounts.violations + pendingCounts.queue;
  const hasPending = totalPending > 0;

  // Don't render if there's an error during setup
  if (hasError) {
    return null;
  }

  const getStatusIcon = () => {
    if (status.isSyncing || syncing) {
      return <RefreshCw className="h-4 w-4 animate-spin" />;
    }
    if (!status.isOnline) {
      return <CloudOff className="h-4 w-4" />;
    }
    if (hasPending) {
      return <AlertCircle className="h-4 w-4" />;
    }
    return <CheckCircle2 className="h-4 w-4" />;
  };

  const getStatusColor = () => {
    if (status.isSyncing || syncing) return 'bg-blue-500';
    if (!status.isOnline) return 'bg-gray-500';
    if (status.error) return 'bg-red-500';
    if (hasPending) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getStatusText = () => {
    if (status.isSyncing || syncing) return 'Syncing...';
    if (!status.isOnline) return 'Offline';
    if (status.error) return 'Sync Error';
    if (hasPending) return `${totalPending} Pending`;
    return 'Synced';
  };

  const formatLastSync = () => {
    if (!status.lastSyncTime) return 'Never';
    const ago = Date.now() - status.lastSyncTime;
    const minutes = Math.floor(ago / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative gap-2"
        >
          <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
          {getStatusIcon()}
          {hasPending && (
            <Badge variant="secondary" className="h-5 px-1 text-xs">
              {totalPending}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <Card className="border-0 shadow-none">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Sync Status</CardTitle>
              <div className="flex items-center gap-2">
                {status.isOnline ? (
                  <Wifi className="h-4 w-4 text-green-600" />
                ) : (
                  <WifiOff className="h-4 w-4 text-gray-400" />
                )}
                <span className="text-sm text-muted-foreground">
                  {getStatusText()}
                </span>
              </div>
            </div>
            <CardDescription className="text-xs">
              Last sync: {formatLastSync()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Pending Items */}
            {hasPending && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Pending Items</h4>
                <div className="space-y-1 text-sm">
                  {pendingCounts.documents > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Documents</span>
                      <span className="font-medium">{pendingCounts.documents}</span>
                    </div>
                  )}
                  {pendingCounts.violations > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Violations</span>
                      <span className="font-medium">{pendingCounts.violations}</span>
                    </div>
                  )}
                  {pendingCounts.queue > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Updates</span>
                      <span className="font-medium">{pendingCounts.queue}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Error Message */}
            {status.error && (
              <div className="p-2 bg-red-50 border border-red-200 rounded-md">
                <p className="text-xs text-red-800">{status.error}</p>
              </div>
            )}

            {/* No Pending Items */}
            {!hasPending && !status.error && (
              <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                All data synced
              </div>
            )}

            {/* Sync Button */}
            <Button
              onClick={handleSync}
              disabled={syncing || status.isSyncing || !status.isOnline}
              size="sm"
              className="w-full"
            >
              {(syncing || status.isSyncing) ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <Cloud className="h-4 w-4 mr-2" />
                  Sync Now
                </>
              )}
            </Button>

            {!status.isOnline && (
              <p className="text-xs text-center text-muted-foreground">
                Connect to WiFi to sync
              </p>
            )}
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  );
}
