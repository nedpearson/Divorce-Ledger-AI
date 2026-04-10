/**
 * BatchHistoryPanel
 *
 * Shows a list of all upload batches for the current user, with counts,
 * status badges, and full drill-down to see all files in a batch.
 * Also supports batch deletion and per-document retry.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Copy,
  Sparkles,
  Trash2,
  RotateCcw,
  FileText,
  File,
  Image,
  FileSpreadsheet,
  Zap,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface BatchDocument {
  id: string;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  processingStatus: string | null;
  reviewStatus: string | null;
  isDuplicate: boolean | null;
  aiConfidence: number | null;
  aiCategory: string | null;
  errorCode: string | null;
  createdAt: string;
}

interface BatchDetail {
  success: boolean;
  batch: UploadBatch;
  documents: BatchDocument[];
  summary: {
    queued: number;
    processing: number;
    completed: number;
    failed: number;
    needsReview: number;
    duplicates: number;
  };
}

interface BatchesResponse {
  success: boolean;
  batches: UploadBatch[];
  total: number;
}

interface BatchHistoryPanelProps {
  onSelectBatch?: (batchId: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  try {
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    if (u?.id) headers['X-User-Id'] = u.id;
    const env = localStorage.getItem('environment');
    if (env) headers['X-Environment'] = env;
  } catch { /* ignore */ }
  return headers;
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

function docStatusBadge(doc: BatchDocument) {
  if (doc.isDuplicate) {
    return <Badge className="text-[10px] bg-orange-500/20 text-orange-400 border-orange-500/30 gap-1"><Copy className="h-2.5 w-2.5" />Duplicate</Badge>;
  }
  const s = doc.processingStatus;
  if (s === 'completed') return <Badge className="text-[10px] bg-green-500/20 text-green-400 border-green-500/30 gap-1"><CheckCircle2 className="h-2.5 w-2.5" />Done</Badge>;
  if (s === 'failed') return <Badge variant="destructive" className="text-[10px] gap-1"><AlertTriangle className="h-2.5 w-2.5" />Failed</Badge>;
  if (s === 'processing') return <Badge className="text-[10px] bg-purple-500/20 text-purple-400 border-purple-500/30 gap-1"><Loader2 className="h-2.5 w-2.5 animate-spin" />Processing</Badge>;
  if (s === 'uploaded' || s === 'queued') return <Badge variant="secondary" className="text-[10px] gap-1"><Clock className="h-2.5 w-2.5" />Queued</Badge>;
  if (s === 'duplicate_skipped') return <Badge className="text-[10px] bg-orange-500/20 text-orange-400 border-orange-500/30 gap-1"><Copy className="h-2.5 w-2.5" />Duplicate</Badge>;
  return <Badge variant="outline" className="text-[10px]">{s || 'unknown'}</Badge>;
}

function getFileIcon(mimeType: string | null) {
  if (!mimeType) return <File className="h-3.5 w-3.5 text-muted-foreground" />;
  if (mimeType.startsWith('image/')) return <Image className="h-3.5 w-3.5 text-blue-400" />;
  if (mimeType === 'application/pdf') return <FileText className="h-3.5 w-3.5 text-red-400" />;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv') {
    return <FileSpreadsheet className="h-3.5 w-3.5 text-green-400" />;
  }
  return <File className="h-3.5 w-3.5 text-muted-foreground" />;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
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

// ─── Batch Detail Row ─────────────────────────────────────────────────────────

function BatchDetailRow({ batch, onDeleted }: { batch: UploadBatch; onDeleted: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: detail, isLoading: isDetailLoading } = useQuery<BatchDetail>({
    queryKey: ['/api/batches', batch.id, 'detail'],
    queryFn: async () => {
      const res = await fetch(`/api/batches/${batch.id}`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to load batch detail');
      return res.json();
    },
    enabled: expanded,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/batches/${batch.id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        // If DELETE not implemented on server, delete docs locally
        const data = await res.json().catch(() => ({ error: 'Delete failed' }));
        throw new Error(data.error || 'Failed to delete batch');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Batch deleted', description: 'The batch and its records have been removed.' });
      queryClient.invalidateQueries({ queryKey: ['/api/batches'] });
      queryClient.invalidateQueries({ queryKey: ['/api/storage/files'] });
      onDeleted();
    },
    onError: (err: any) => {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
    },
  });

  const retryFailedMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/batches/${batch.id}/documents/bulk`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ action: 'retry-failed' }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: 'Retrying failed documents', description: `${data.retriedCount || 0} documents queued for retry.` });
      queryClient.invalidateQueries({ queryKey: ['/api/batches', batch.id, 'detail'] });
      queryClient.invalidateQueries({ queryKey: ['/api/batches'] });
    },
  });

  const reExtractMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/batches/${batch.id}/documents/bulk`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ action: 're-extract' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Re-extraction failed');
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: 'Expenses extracted! ✓',
        description: `${data.extractedCount || 0} documents processed. Check your dashboard.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/expenses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/batches', batch.id, 'detail'] });
    },
    onError: (err: any) => {
      toast({ title: 'Re-extraction failed', description: err.message, variant: 'destructive' });
    },
  });

  const totalActive = batch.totalFiles;
  const done = batch.totalCompleted;
  const failed = batch.totalFailed;
  const processing = batch.totalProcessing;
  const pct = totalActive > 0 ? Math.round((done / totalActive) * 100) : 0;

  return (
    <Card className="overflow-hidden" data-testid={`batch-history-item-${batch.id}`}>
      {/* ── Batch Header Row ── */}
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
              <div className="mt-1.5 flex items-center gap-2">
                <Progress value={pct} className="h-1 flex-1" />
                <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-right">{pct}%</span>
              </div>
            )}
          </div>

          {/* ── Actions ── */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Re-extract expenses button — always visible on completed batches */}
            {(batch.status === 'completed' || batch.status === 'partial_failure') && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-blue-500 hover:text-blue-400"
                title="Re-extract financial data to dashboard"
                onClick={(e) => { e.stopPropagation(); reExtractMutation.mutate(); }}
                disabled={reExtractMutation.isPending}
                data-testid={`batch-reextract-${batch.id}`}
              >
                {reExtractMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Zap className="h-3.5 w-3.5" />}
              </Button>
            )}

            {failed > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-amber-500 hover:text-amber-400"
                title="Retry failed"
                onClick={(e) => { e.stopPropagation(); retryFailedMutation.mutate(); }}
                disabled={retryFailedMutation.isPending}
                data-testid={`batch-retry-${batch.id}`}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  title="Delete batch"
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`batch-delete-${batch.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete batch?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the batch record and all {totalActive} document(s) in it, including any extracted financial data. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                    Delete Batch
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setExpanded((v) => !v)}
              data-testid={`batch-expand-${batch.id}`}
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardContent>

      {/* ── Expanded Document List ── */}
      {expanded && (
        <div className="border-t bg-muted/20 px-4 py-3 space-y-2">
          {isDetailLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : detail?.documents && detail.documents.length > 0 ? (
            <>
              <p className="text-xs text-muted-foreground font-medium mb-2">
                {detail.documents.length} document{detail.documents.length !== 1 ? 's' : ''} in this batch
              </p>
              {detail.documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-2 p-2 rounded-lg bg-background border border-border/50 hover:border-border transition-colors"
                  data-testid={`batch-doc-${doc.id}`}
                >
                  <div className="shrink-0">{getFileIcon(doc.mimeType)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium truncate max-w-[200px]">
                        {doc.fileName || 'Unknown file'}
                      </span>
                      {doc.fileSize && (
                        <span className="text-[10px] text-muted-foreground">{formatBytes(doc.fileSize)}</span>
                      )}
                      {docStatusBadge(doc)}
                    </div>
                    {doc.errorCode && (
                      <p className="text-[10px] text-destructive mt-0.5 truncate">{doc.errorCode}</p>
                    )}
                    {doc.aiCategory && doc.processingStatus === 'completed' && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 capitalize">
                        {doc.aiCategory.replace(/_/g, ' ')}
                        {doc.aiConfidence ? ` · ${Math.round(doc.aiConfidence * 100)}% conf` : ''}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">No documents found in this batch.</p>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function BatchHistoryPanel({ onSelectBatch }: BatchHistoryPanelProps) {
  const { data, isLoading, refetch, isRefetching } = useQuery<BatchesResponse>({
    queryKey: ['/api/batches'],
    queryFn: async () => {
      const res = await fetch('/api/batches?limit=50', { credentials: 'include', headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to load batches');
      return res.json();
    },
    refetchInterval: 10000,
  });

  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const visibleBatches = (data?.batches ?? []).filter((b) => !deletedIds.has(b.id));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (visibleBatches.length === 0) {
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
        <p className="text-sm text-muted-foreground">{visibleBatches.length} batch{visibleBatches.length !== 1 ? 'es' : ''}</p>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isRefetching} data-testid="batch-history-refresh">
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isRefetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {visibleBatches.map((batch) => (
        <BatchDetailRow
          key={batch.id}
          batch={batch}
          onDeleted={() => setDeletedIds((prev) => new Set(Array.from(prev).concat(batch.id)))}
        />
      ))}
    </div>
  );
}
