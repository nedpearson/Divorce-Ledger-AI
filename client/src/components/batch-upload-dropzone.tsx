/**
 * BatchUploadDropzone
 *
 * Multi-file drag-and-drop upload zone with:
 * - Per-file status tracking (queued → uploading → uploaded → processing → done/error)
 * - Live progress bar per file
 * - Duplicate badge
 * - Case pre-assignment selector
 * - Batch summary panel (total / done / failed / processing)
 * - "Start Processing" button that triggers the AI pipeline
 *
 * Backward-compatible: the single-file DocumentUpload component remains untouched.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  Upload,
  X,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Clock,
  FileText,
  File,
  Image,
  FileSpreadsheet,
  Copy,
  Play,
  FolderOpen,
  RefreshCw,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type FileStatus =
  | 'queued'
  | 'uploading'
  | 'uploaded'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'duplicate';

interface QueuedFile {
  id: string;          // local temp key before server assigns
  file: File;
  status: FileStatus;
  progress: number;
  error?: string;
  documentId?: string; // assigned after upload
  isDuplicate?: boolean;
  duplicateOfDocumentId?: string;
}

interface BatchStatus {
  batchId: string;
  status: string;
  summary: {
    queued: number;
    processing: number;
    completed: number;
    failed: number;
    needsReview: number;
    duplicates: number;
  };
}

interface BatchUploadDropzoneProps {
  onBatchComplete?: (batchId: string) => void;
  className?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function localId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return <Image className="h-4 w-4 text-blue-400" />;
  if (mimeType === 'application/pdf') return <FileText className="h-4 w-4 text-red-400" />;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv') {
    return <FileSpreadsheet className="h-4 w-4 text-green-400" />;
  }
  return <File className="h-4 w-4 text-muted-foreground" />;
}

function fileStatusBadge(status: FileStatus, isDuplicate?: boolean) {
  if (isDuplicate || status === 'duplicate') {
    return (
      <Badge className="text-[10px] bg-orange-500/20 text-orange-400 border-orange-500/30 gap-1">
        <Copy className="h-2.5 w-2.5" /> Duplicate
      </Badge>
    );
  }
  switch (status) {
    case 'queued':
      return <Badge variant="secondary" className="text-[10px] gap-1"><Clock className="h-2.5 w-2.5" />Queued</Badge>;
    case 'uploading':
      return <Badge className="text-[10px] bg-blue-500/20 text-blue-400 border-blue-500/30 gap-1"><Loader2 className="h-2.5 w-2.5 animate-spin" />Uploading</Badge>;
    case 'uploaded':
      return <Badge variant="secondary" className="text-[10px] gap-1"><Clock className="h-2.5 w-2.5" />Ready</Badge>;
    case 'processing':
      return <Badge className="text-[10px] bg-purple-500/20 text-purple-400 border-purple-500/30 gap-1"><Loader2 className="h-2.5 w-2.5 animate-spin" />AI Processing</Badge>;
    case 'completed':
      return <Badge className="text-[10px] bg-green-500/20 text-green-400 border-green-500/30 gap-1"><CheckCircle2 className="h-2.5 w-2.5" />Done</Badge>;
    case 'failed':
      return <Badge variant="destructive" className="text-[10px] gap-1"><AlertTriangle className="h-2.5 w-2.5" />Failed</Badge>;
    default:
      return null;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BatchUploadDropzone({ onBatchComplete, className }: BatchUploadDropzoneProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [batchId, setBatchId] = useState<string | null>(null);
  const [batchName, setBatchName] = useState('');
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [batchComplete, setBatchComplete] = useState(false);

  // Poll for batch status while processing
  const [pollEnabled, setPollEnabled] = useState(false);
  const { data: batchStatusData } = useQuery<BatchStatus>({
    queryKey: ['/api/batches', batchId, 'status'],
    queryFn: async () => {
      const res = await fetch(`/api/batches/${batchId}/status`, { credentials: 'include' });
      if (!res.ok) throw new Error('Status poll failed');
      return res.json();
    },
    enabled: !!batchId && pollEnabled,
    refetchInterval: 2500,
  });

  // When all processing is done, stop polling
  useEffect(() => {
    if (!batchStatusData) return;
    const s = batchStatusData.status;
    if (s === 'completed' || s === 'partial_failure' || s === 'failed') {
      setPollEnabled(false);
      setIsProcessing(false);
      setBatchComplete(true);
      onBatchComplete?.(batchStatusData.batchId);
      toast({
        title: s === 'completed' ? 'Batch Complete' : 'Batch Finished with Issues',
        description: `${batchStatusData.summary.completed} processed, ${batchStatusData.summary.failed} failed, ${batchStatusData.summary.duplicates} duplicates`,
        variant: s === 'failed' ? 'destructive' : 'default',
      });
    }
  }, [batchStatusData]);

  // Fetch cases for assignment selector
  const { data: casesData } = useQuery<{ cases: Array<{ id: string; title: string }> }>({
    queryKey: ['/api/cases'],
    queryFn: async () => {
      const res = await fetch('/api/cases', { credentials: 'include' });
      if (!res.ok) return { cases: [] };
      return res.json();
    },
  });

  // ── File addition helpers ───────────────────────────────────────────────────

  const addFiles = useCallback((files: File[]) => {
    const ACCEPTED_TYPES = [
      'application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/tiff',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv', 'text/plain', 'message/rfc822',
    ];
    const MAX_SIZE = 100 * 1024 * 1024; // 100MB

    const valid: QueuedFile[] = [];
    const rejected: string[] = [];

    for (const file of files) {
      if (file.size > MAX_SIZE) { rejected.push(`${file.name}: too large (max 100MB)`); continue; }
      if (!ACCEPTED_TYPES.includes(file.type) && file.type !== '') {
        // also accept application/zip, just be permissive for unknown types
      }
      valid.push({ id: localId(), file, status: 'queued', progress: 0 });
    }

    if (rejected.length > 0) {
      toast({ title: 'Some files rejected', description: rejected.join('\n'), variant: 'destructive' });
    }

    setQueue((prev) => [...prev, ...valid]);
    setBatchComplete(false);
  }, [toast]);

  // ── Drag & Drop ─────────────────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) addFiles(files);
  }, [addFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) addFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [addFiles]);

  const removeFile = useCallback((id: string) => {
    setQueue((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // ── Upload all queued files ─────────────────────────────────────────────────

  const getUserHeaders = () => {
    const headers: Record<string, string> = {};
    try {
      const u = JSON.parse(localStorage.getItem('user') || 'null');
      if (u?.id) headers['X-User-Id'] = u.id;
      const env = localStorage.getItem('environment');
      if (env) headers['X-Environment'] = env;
    } catch { /* ignore */ }
    return headers;
  };

  const uploadAll = async () => {
    const toUpload = queue.filter((f) => f.status === 'queued');
    if (toUpload.length === 0) return;

    setIsUploading(true);

    // ── Step 1: Create batch ──
    let activeBatchId = batchId;
    if (!activeBatchId) {
      try {
        const createRes = await fetch('/api/batches', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', ...getUserHeaders() },
          body: JSON.stringify({
            batchName: batchName || `Batch ${new Date().toLocaleString()}`,
            caseId: selectedCaseId || undefined,
          }),
        });
        const createData = await createRes.json();
        if (!createData.success) throw new Error(createData.error);
        activeBatchId = createData.batchId;
        setBatchId(activeBatchId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        toast({ title: 'Failed to create batch', description: msg, variant: 'destructive' });
        setIsUploading(false);
        return;
      }
    }

    // ── Step 2: Upload each file ──
    for (const qf of toUpload) {
      setQueue((prev) => prev.map((f) => f.id === qf.id ? { ...f, status: 'uploading', progress: 0 } : f));

      const formData = new FormData();
      formData.append('file', qf.file);

      await new Promise<void>((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setQueue((prev) => prev.map((f) => f.id === qf.id ? { ...f, progress: pct } : f));
          }
        });
        xhr.addEventListener('load', () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.success) {
              setQueue((prev) => prev.map((f) =>
                f.id === qf.id ? {
                  ...f,
                  status: data.isDuplicate ? 'duplicate' : 'uploaded',
                  progress: 100,
                  documentId: data.documentId,
                  isDuplicate: data.isDuplicate,
                  duplicateOfDocumentId: data.duplicateOfDocumentId,
                } : f
              ));
            } else {
              setQueue((prev) => prev.map((f) => f.id === qf.id ? { ...f, status: 'failed', error: data.error } : f));
            }
          } catch {
            setQueue((prev) => prev.map((f) => f.id === qf.id ? { ...f, status: 'failed', error: 'Upload response parse error' } : f));
          }
          resolve();
        });
        xhr.addEventListener('error', () => {
          setQueue((prev) => prev.map((f) => f.id === qf.id ? { ...f, status: 'failed', error: 'Network error' } : f));
          resolve();
        });
        xhr.open('POST', `/api/batches/${activeBatchId}/upload`);
        xhr.withCredentials = true;
        const headers = getUserHeaders();
        Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
        xhr.send(formData);
      });
    }

    setIsUploading(false);
  };

  // ── Start AI processing ─────────────────────────────────────────────────────

  const startProcessing = async () => {
    if (!batchId) return;
    setIsProcessing(true);

    try {
      const res = await fetch(`/api/batches/${batchId}/start`, {
        method: 'POST',
        credentials: 'include',
        headers: getUserHeaders(),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      // Update queue to show processing
      setQueue((prev) => prev.map((f) =>
        f.status === 'uploaded' ? { ...f, status: 'processing' } : f
      ));

      setPollEnabled(true);
      toast({ title: 'AI Processing Started', description: 'Each document is processed independently.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: 'Failed to start processing', description: msg, variant: 'destructive' });
      setIsProcessing(false);
    }
  };

  // ── Derived counts ──────────────────────────────────────────────────────────

  const totalFiles = queue.length;
  const queuedCount = queue.filter((f) => f.status === 'queued').length;
  const uploadedCount = queue.filter((f) => f.status === 'uploaded').length;
  const processingCount = queue.filter((f) => f.status === 'processing').length;
  const completedCount = queue.filter((f) => f.status === 'completed').length;
  const failedCount = queue.filter((f) => f.status === 'failed').length;
  const duplicateCount = queue.filter((f) => f.status === 'duplicate' || f.isDuplicate).length;

  const allUploaded = queuedCount === 0 && uploadedCount + processingCount + completedCount + failedCount + duplicateCount === totalFiles && totalFiles > 0;
  const hasReadyToProcess = uploadedCount > 0;
  const hasQueuedFiles = queuedCount > 0;

  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <div className={className}>
      {/* ── Drop Zone ── */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => queue.length === 0 ? fileInputRef.current?.click() : undefined}
        className={`
          relative rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer
          ${isDragging
            ? 'border-primary bg-primary/5 scale-[1.01] shadow-lg shadow-primary/20'
            : 'border-border hover:border-primary/50 hover:bg-muted/30'
          }
          ${queue.length > 0 ? 'cursor-default' : ''}
        `}
        data-testid="batch-drop-zone"
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInput}
          accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.tiff,.doc,.docx,.xls,.xlsx,.csv,.txt,.eml,.zip"
          data-testid="batch-file-input"
        />

        {queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4 px-4">
            <div className="p-4 rounded-full bg-primary/10">
              <Upload className="h-8 w-8 text-primary" />
            </div>
            <div className="text-center space-y-1">
              <p className="font-semibold text-base">Drop multiple files here, or click to select</p>
              <p className="text-sm text-muted-foreground">
                PDF, images, spreadsheets, DOCX, CSV — up to 100 files, 100MB each
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} data-testid="batch-select-button">
              <FolderOpen className="h-4 w-4 mr-2" />
              Browse Files
            </Button>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {/* Add more button */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">{totalFiles} file{totalFiles !== 1 ? 's' : ''} in queue</p>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                disabled={isUploading || isProcessing}
                data-testid="batch-add-more-button"
              >
                <Upload className="h-3.5 w-3.5 mr-1" />
                Add More
              </Button>
            </div>

            {/* File list */}
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {queue.map((qf) => (
                <div
                  key={qf.id}
                  className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors"
                  data-testid={`batch-file-item-${qf.id}`}
                >
                  <div className="shrink-0">{getFileIcon(qf.file.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate max-w-[200px]">{qf.file.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{formatBytes(qf.file.size)}</span>
                      {fileStatusBadge(qf.status, qf.isDuplicate)}
                    </div>
                    {(qf.status === 'uploading' || qf.status === 'processing') && (
                      <Progress
                        value={qf.status === 'processing' ? 60 : qf.progress}
                        className="h-1 mt-1"
                      />
                    )}
                    {qf.error && (
                      <p className="text-[11px] text-destructive mt-0.5 truncate">{qf.error}</p>
                    )}
                  </div>
                  {qf.status === 'queued' && !isUploading && !isProcessing && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={(e) => { e.stopPropagation(); removeFile(qf.id); }}
                      data-testid={`batch-remove-file-${qf.id}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Configuration + Actions ── */}
      {queue.length > 0 && (
        <Card className="mt-3">
          <CardContent className="pt-4 space-y-4">
            {/* Batch name + case assignment */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="batch-name" className="text-xs">Batch Name (optional)</Label>
                <Input
                  id="batch-name"
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                  placeholder={`Batch ${new Date().toLocaleDateString()}`}
                  disabled={!!batchId}
                  className="h-8 text-sm"
                  data-testid="batch-name-input"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="batch-case" className="text-xs">Assign to Case (optional)</Label>
                <Select value={selectedCaseId} onValueChange={setSelectedCaseId} disabled={!!batchId}>
                  <SelectTrigger id="batch-case" className="h-8 text-sm" data-testid="batch-case-select">
                    <SelectValue placeholder="Select case..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No case assigned</SelectItem>
                    {casesData?.cases?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Batch summary bar */}
            {batchId && (
              <div className="flex items-center gap-3 flex-wrap text-xs">
                {uploadedCount > 0 && <span className="text-muted-foreground">{uploadedCount} ready</span>}
                {processingCount > 0 && <span className="text-purple-400">{processingCount} processing</span>}
                {completedCount > 0 && <span className="text-green-400">{completedCount} done</span>}
                {failedCount > 0 && <span className="text-destructive">{failedCount} failed</span>}
                {duplicateCount > 0 && <span className="text-orange-400">{duplicateCount} duplicates</span>}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {hasQueuedFiles && (
                <Button
                  onClick={uploadAll}
                  disabled={isUploading || isProcessing}
                  data-testid="batch-upload-button"
                >
                  {isUploading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading...</>
                  ) : (
                    <><Upload className="h-4 w-4 mr-2" />Upload {queuedCount} File{queuedCount !== 1 ? 's' : ''}</>
                  )}
                </Button>
              )}

              {hasReadyToProcess && !isProcessing && (
                <Button
                  variant={hasQueuedFiles ? 'outline' : 'default'}
                  onClick={startProcessing}
                  disabled={isUploading || isProcessing}
                  data-testid="batch-start-processing-button"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Start AI Processing ({uploadedCount} file{uploadedCount !== 1 ? 's' : ''})
                </Button>
              )}

              {isProcessing && (
                <Button variant="outline" disabled>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing... (auto-refreshing)
                </Button>
              )}

              {failedCount > 0 && !isProcessing && batchId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await fetch(`/api/batches/${batchId}/documents/bulk`, {
                      method: 'POST',
                      credentials: 'include',
                      headers: { 'Content-Type': 'application/json', ...getUserHeaders() },
                      body: JSON.stringify({ action: 'retry-failed' }),
                    });
                    toast({ title: 'Retrying failed documents...' });
                  }}
                  data-testid="batch-retry-failed-button"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry {failedCount} Failed
                </Button>
              )}

              {batchComplete && completedCount > 0 && batchId && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    await fetch(`/api/batches/${batchId}/documents/bulk`, {
                      method: 'POST',
                      credentials: 'include',
                      headers: { 'Content-Type': 'application/json', ...getUserHeaders() },
                      body: JSON.stringify({ action: 'approve' }),
                    });
                    toast({ title: 'Bulk approved', description: `${completedCount} AI-processed documents approved.` });
                  }}
                  data-testid="batch-approve-all-button"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Approve All AI Results
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Helper for getUserHeaders outside of component (reused in action callbacks)
function getUserHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  try {
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    if (u?.id) headers['X-User-Id'] = u.id;
    const env = localStorage.getItem('environment');
    if (env) headers['X-Environment'] = env;
  } catch { /* ignore */ }
  return headers;
}
