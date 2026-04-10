/**
 * BatchHistoryPanel
 *
 * Shows a list of all upload batches for the current user, with counts,
 * status badges, and click-through to a batch detail view.
 */

import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  ChevronRight,
  RefreshCw,
  Copy,
  Sparkles,
} from 'lucide-react';

interface UploadBatch {
  id: string;
  batchName: string | null;
  status: string;
  totalFiles: number;
  totalCompleted: number;
  totalFailed: number;
  totalProcessing: number;
  sourceType: string;
  createdAt: string;
  completedAt: string | null;
}

interface BatchesResponse {
  success: boolean;
  batches: UploadBatch[];
  total: number;
}

interface BatchHistoryPanelProps {
  onSelectBatch?: (batchId: string) => void;
}

function batchStatusBadge(status: string) {
  switch (status) {
    case 'created':
    case 'uploading':
      return <Badge variant="secondary" className="gap-1 text-xs"><Clock className="h-3 w-3" />In Progress</Badge>;
    case 'processing':
      return <Badge className="gap-1 text-xs bg-purple-500/20 text-purple-400 border-purple-500/30"><Loader2 className="h-3 w-3 animate-spin" />Processing</Badge>;
    case 'completed':
      return <Badge className="gap-1 text-xs bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle2 className="h-3 w-3" />Completed</Badge>;
    case 'partial_failure':
      return <Badge className="gap-1 text-xs bg-amber-500/20 text-amber-400 border-amber-500/30"><AlertTriangle className="h-3 w-3" />Partial Failure</Badge>;
    case 'failed':
      return <Badge variant="destructive" className="gap-1 text-xs"><AlertTriangle className="h-3 w-3" />Failed</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{status}</Badge>;
  }
}

function formatRelativeDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const min = Math.floor(diff / 60000);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  if (min < 2) return 'just now';
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString();
}

export function BatchHistoryPanel({ onSelectBatch }: BatchHistoryPanelProps) {
  const { data, isLoading, refetch, isRefetching } = useQuery<BatchesResponse>({
    queryKey: ['/api/batches'],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      try {
        const u = JSON.parse(localStorage.getItem('user') || 'null');
        if (u?.id) headers['X-User-Id'] = u.id;
      } catch { /* ignore */ }
      const res = await fetch('/api/batches?limit=50', { credentials: 'include', headers });
      if (!res.ok) throw new Error('Failed to load batches');
      return res.json();
    },
    refetchInterval: 10000,
  });

  const batches = data?.batches ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <EmptyState
        title="No Batches Yet"
        description="Upload multiple documents at once using the batch uploader above."
        className="py-12"
      />
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-muted-foreground">{batches.length} batch{batches.length !== 1 ? 'es' : ''}</p>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isRefetching} data-testid="batch-history-refresh">
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isRefetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {batches.map((batch) => {
        const totalActive = batch.totalFiles;
        const done = batch.totalCompleted;
        const failed = batch.totalFailed;
        const processing = batch.totalProcessing;
        const pct = totalActive > 0 ? Math.round((done / totalActive) * 100) : 0;

        return (
          <Card
            key={batch.id}
            className="hover:shadow-md hover:border-primary/30 transition-all cursor-pointer"
            onClick={() => onSelectBatch?.(batch.id)}
            data-testid={`batch-history-item-${batch.id}`}
          >
            <CardContent className="py-3 px-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-muted shrink-0 mt-0.5">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">
                      {batch.batchName || `Batch ${new Date(batch.createdAt).toLocaleString()}`}
                    </span>
                    {batchStatusBadge(batch.status)}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                    <span>{totalActive} file{totalActive !== 1 ? 's' : ''}</span>
                    {done > 0 && (
                      <span className="flex items-center gap-1 text-green-400">
                        <CheckCircle2 className="h-3 w-3" />{done} done
                      </span>
                    )}
                    {processing > 0 && (
                      <span className="flex items-center gap-1 text-purple-400">
                        <Sparkles className="h-3 w-3" />{processing} processing
                      </span>
                    )}
                    {failed > 0 && (
                      <span className="flex items-center gap-1 text-destructive">
                        <AlertTriangle className="h-3 w-3" />{failed} failed
                      </span>
                    )}
                    <span className="ml-auto">{formatRelativeDate(batch.createdAt)}</span>
                  </div>
                  {totalActive > 0 && (
                    <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
