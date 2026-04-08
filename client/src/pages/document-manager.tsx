import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/lib/auth';
import {
  FileText,
  Loader2,
  File,
  Image,
  FileSpreadsheet,
  RefreshCw,
  Trash2,
  Eye,
  Lock,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Sparkles,
  Check,
  X,
  Edit2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { ReviewQueue } from '@/components/documents/review-queue';
import { DocumentUpload } from '@/components/document-upload';
import { EmptyState } from '@/components/ui/empty-state';

interface StoredFile {
  $id: string;
  userId: string;
  storageFileId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileHash: string;
  status: string;
  category?: string;
  suggestedCategory?: string;
  extractedFields?: string;
  finalizedCategory?: string;
  finalizedFields?: string;
  title?: string;
  description?: string;
  aiSummary?: string;
  aiConfidence?: number;
  isConfidential?: boolean;
  errorMessage?: string;
  approvedAt?: string;
  approvedBy?: string;
  $createdAt: string;
  $updatedAt: string;
}

interface ExtractedFields {
  [key: string]: string | number | boolean | null;
}

function getFileIcon(fileType: string | null, size: 'sm' | 'lg' = 'sm') {
  const sizeClass = size === 'lg' ? 'h-10 w-10' : 'h-5 w-5';
  if (!fileType) return <File className={`${sizeClass} text-muted-foreground`} />;
  if (fileType.includes('image')) return <Image className={`${sizeClass} text-blue-500`} />;
  if (fileType.includes('pdf')) return <FileText className={`${sizeClass} text-red-500`} />;
  if (fileType.includes('spreadsheet') || fileType.includes('excel') || fileType.includes('csv')) {
    return <FileSpreadsheet className={`${sizeClass} text-green-500`} />;
  }
  return <File className={`${sizeClass} text-muted-foreground`} />;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

const STATUS_PROGRESS: Record<string, number> = {
  uploaded: 10,
  queued: 25,
  extracting: 50,
  analyzing: 75,
  suggested: 90,
  awaiting_user: 90,
  finalized: 100,
  error: 0,
};

const STATUS_LABELS: Record<string, string> = {
  uploaded: 'Queued for processing...',
  queued: 'Waiting in queue...',
  extracting: 'Extracting text from document...',
  analyzing: 'AI analyzing content...',
  suggested: 'Review required',
  awaiting_user: 'Awaiting your review',
  finalized: 'Complete',
  error: 'Processing failed',
};

function getStatusProgress(status: string): number {
  return STATUS_PROGRESS[status] ?? 0;
}

function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function isProcessingStatus(status: string): boolean {
  return ['queued', 'extracting', 'analyzing'].includes(status);
}

function getStatusBadge(status: string) {
  const statusConfig: Record<
    string,
    { variant: 'default' | 'secondary' | 'outline' | 'destructive'; icon: React.ReactNode }
  > = {
    uploaded: { variant: 'secondary', icon: <Clock className="h-3 w-3" /> },
    queued: { variant: 'secondary', icon: <Clock className="h-3 w-3" /> },
    extracting: { variant: 'default', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    analyzing: { variant: 'default', icon: <Sparkles className="h-3 w-3" /> },
    suggested: { variant: 'outline', icon: <Eye className="h-3 w-3" /> },
    awaiting_user: { variant: 'outline', icon: <Eye className="h-3 w-3" /> },
    finalized: { variant: 'default', icon: <CheckCircle2 className="h-3 w-3" /> },
    error: { variant: 'destructive', icon: <AlertTriangle className="h-3 w-3" /> },
  };

  const config = statusConfig[status] || { variant: 'secondary' as const, icon: null };

  return (
    <Badge variant={config.variant} className="flex items-center gap-1">
      {config.icon}
      {status.replace('_', ' ')}
    </Badge>
  );
}

const CATEGORIES = [
  { value: 'financial', label: 'Financial' },
  { value: 'legal', label: 'Legal' },
  { value: 'medical', label: 'Medical' },
  { value: 'property', label: 'Property' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'correspondence', label: 'Correspondence' },
  { value: 'evidence', label: 'Evidence' },
  { value: 'other', label: 'Other' },
];

function parseExtractedFields(fieldsJson?: string): ExtractedFields {
  if (!fieldsJson) return {};
  try {
    return JSON.parse(fieldsJson);
  } catch {
    return {};
  }
}

function formatFieldValue(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function formatFieldLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DocumentManager() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [overrideFile, setOverrideFile] = useState<StoredFile | null>(null);
  const [overrideCategory, setOverrideCategory] = useState('');
  const [overrideFields, setOverrideFields] = useState<ExtractedFields>({});
  const [overrideReason, setOverrideReason] = useState('');

  const userId = user?.id ? String(user.id) : null;
  // Polling takes over where realtime dropped off
  const [processingFilesDetected, setProcessingFilesDetected] = useState(false);

  const {
    data: filesData,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<{ files: StoredFile[]; total: number }>({
    queryKey: ['/api/storage/files'],
    refetchInterval: processingFilesDetected ? 2000 : 10000,
  });

  const files: StoredFile[] = filesData?.files || [];
  const hasProcessingFiles = files.some((f: StoredFile) => isProcessingStatus(f.status));

  useEffect(() => {
    setProcessingFilesDetected(hasProcessingFiles);
  }, [hasProcessingFiles]);

  const analyzeMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const res = await apiRequest('POST', `/api/storage/files/${fileId}/analyze`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Analysis failed with status ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Analysis Started', description: 'Document is being analyzed.' });
      queryClient.invalidateQueries({ queryKey: ['/api/storage/files'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Analysis Failed', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const res = await apiRequest('DELETE', `/api/storage/files/${fileId}`);
      if (!res.ok) {
        if (res.status === 404) {
          // Document already deleted or doesn't exist, treat as success
          return { success: true };
        }
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Delete failed with status ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'File Deleted', description: 'The file has been removed.' });
      queryClient.invalidateQueries({ queryKey: ['/api/storage/files'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Delete Failed',
        description: error.message || 'Could not delete the file.',
        variant: 'destructive',
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({
      fileId,
      category,
      fields,
      reason,
    }: {
      fileId: string;
      category: string;
      fields?: ExtractedFields;
      reason?: string;
    }) => {
      const res = await apiRequest('POST', `/api/storage/files/${fileId}/approve`, {
        category,
        fields,
        reason,
      });
      if (!res.ok) throw new Error('Approval failed');
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Document Approved',
        description: 'The document has been categorized and finalized.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/storage/files'] });
      setOverrideFile(null);
      setOverrideCategory('');
      setOverrideFields({});
      setOverrideReason('');
    },
    onError: () => {
      toast({
        title: 'Approval Failed',
        description: 'Could not approve the document.',
        variant: 'destructive',
      });
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const res = await apiRequest('POST', `/api/storage/files/${fileId}/retry`);
      if (!res.ok) throw new Error('Retry failed');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Retry Queued', description: 'The document will be reprocessed.' });
      queryClient.invalidateQueries({ queryKey: ['/api/storage/files'] });
    },
    onError: () => {
      toast({
        title: 'Retry Failed',
        description: 'Could not queue document for retry.',
        variant: 'destructive',
      });
    },
  });

  const handleApprove = (file: StoredFile) => {
    const extractedFields = parseExtractedFields(file.extractedFields);
    approveMutation.mutate({
      fileId: file.$id,
      category: file.suggestedCategory || 'other',
      fields: extractedFields,
    });
  };

  const openOverrideDialog = (file: StoredFile) => {
    setOverrideFile(file);
    setOverrideCategory(file.suggestedCategory || '');
    setOverrideFields(parseExtractedFields(file.extractedFields));
    setOverrideReason('');
  };

  const handleOverrideSubmit = () => {
    if (!overrideFile || !overrideCategory) return;
    approveMutation.mutate({
      fileId: overrideFile.$id,
      category: overrideCategory,
      fields: overrideFields,
      reason: overrideReason || undefined,
    });
  };

  const updateField = useCallback((key: string, value: string) => {
    setOverrideFields((prev) => ({ ...prev, [key]: value }));
  }, []);

  const uploadedFiles = useMemo(
    () => files.filter((f) => f.status === 'uploaded' || f.status === 'queued'),
    [files]
  );
  const processingFiles = useMemo(
    () => files.filter((f) => ['extracting', 'analyzing'].includes(f.status)),
    [files]
  );
  const pendingFiles = useMemo(
    () => files.filter((f) => ['suggested', 'awaiting_user'].includes(f.status)),
    [files]
  );
  const completedFiles = useMemo(() => files.filter((f) => f.status === 'finalized'), [files]);
  const errorFiles = useMemo(() => files.filter((f) => f.status === 'error'), [files]);

  const renderFileCard = (file: StoredFile) => {
    const isSuggested = file.status === 'suggested' || file.status === 'awaiting_user';
    const isError = file.status === 'error';
    const isProcessing = isProcessingStatus(file.status);
    const confidencePercent = file.aiConfidence ? Math.round(file.aiConfidence * 100) : 0;
    const progress = getStatusProgress(file.status);

    return (
      <Card key={file.$id} className="hover-elevate">
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            {getFileIcon(file.fileType, 'lg')}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium truncate">{file.title || file.fileName}</span>
                {file.isConfidential && <Lock className="h-3 w-3 text-amber-500" />}
                {getStatusBadge(file.status)}
              </div>
              <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap mt-1">
                <span>{formatFileSize(file.fileSize)}</span>
                <span>-</span>
                <span title={new Date(file.$updatedAt).toLocaleString()}>
                  {formatRelativeTime(file.$updatedAt)}
                </span>
                {file.category && (
                  <>
                    <span>-</span>
                    <Badge variant="outline" className="text-xs">
                      {file.category}
                    </Badge>
                  </>
                )}
              </div>

              {isProcessing && (
                <div className="mt-2 space-y-1">
                  <Progress value={progress} className="h-2" />
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{getStatusLabel(file.status)}</p>
                    <span className="text-xs text-muted-foreground">{progress}%</span>
                  </div>
                </div>
              )}

              {file.status === 'uploaded' && !isProcessing && (
                <div className="mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => analyzeMutation.mutate(file.$id)}
                    disabled={analyzeMutation.isPending}
                    data-testid={`button-analyze-${file.$id}`}
                  >
                    {analyzeMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-1" />
                    )}
                    Analyze Now
                  </Button>
                </div>
              )}

              {isSuggested &&
                (() => {
                  const extractedFields = parseExtractedFields(file.extractedFields);
                  const fieldKeys = Object.keys(extractedFields);
                  return (
                    <div className="mt-3 p-3 bg-muted/50 rounded-md space-y-3">
                      <div className="flex items-center gap-2 text-sm">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <span className="font-medium">AI Suggestion:</span>
                        <Badge variant="secondary">{file.suggestedCategory || 'unknown'}</Badge>
                        <span className="text-muted-foreground">
                          ({confidencePercent}% confidence)
                        </span>
                      </div>
                      {file.aiSummary && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {file.aiSummary}
                        </p>
                      )}
                      {fieldKeys.length > 0 && (
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          {fieldKeys.slice(0, 4).map((key) => (
                            <div key={key} className="flex flex-col">
                              <span className="text-xs text-muted-foreground">
                                {formatFieldLabel(key)}
                              </span>
                              <span className="font-medium truncate">
                                {formatFieldValue(extractedFields[key])}
                              </span>
                            </div>
                          ))}
                          {fieldKeys.length > 4 && (
                            <div className="text-xs text-muted-foreground">
                              +{fieldKeys.length - 4} more fields
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApprove(file)}
                          disabled={approveMutation.isPending}
                          data-testid={`button-approve-${file.$id}`}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openOverrideDialog(file)}
                          disabled={approveMutation.isPending}
                          data-testid={`button-override-${file.$id}`}
                        >
                          <Edit2 className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                      </div>
                    </div>
                  );
                })()}

              {isError && (
                <div className="mt-2 flex items-center gap-2">
                  <p className="text-xs text-destructive truncate flex-1">{file.errorMessage}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => retryMutation.mutate(file.$id)}
                    disabled={retryMutation.isPending}
                    data-testid={`button-retry-${file.$id}`}
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Retry
                  </Button>
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => deleteMutation.mutate(file.$id)}
              disabled={deleteMutation.isPending}
              data-testid={`button-delete-file-${file.$id}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderFileList = (fileList: StoredFile[], emptyMessage: string) => {
    if (fileList.length === 0) {
      return (
        <EmptyState 
          title="Queue Empty" 
          description={emptyMessage} 
          className="my-4 mx-4 py-12"
        />
      );
    }

    return <div className="space-y-2">{fileList.map(renderFileCard)}</div>;
  };

  return (
    <div className="container max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Document Intake</h1>
          <p className="text-muted-foreground">
            Upload documents for AI-powered analysis and categorization
          </p>
        </div>
        <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="text-xs gap-1"
            >
              <Wifi className="h-3 w-3 text-green-500" />
              Live Sync
            </Badge>
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isRefetching}
            data-testid="button-refresh-files"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <DocumentUpload
        onUploadComplete={() => {
          queryClient.invalidateQueries({ queryKey: ['/api/storage/files'] });
        }}
      />

      <div className="h-1 min-h-[4px] w-full">
        {(isLoading || deleteMutation.isPending) && (
          <Progress value={isLoading ? 30 : 70} className="h-1" data-testid="progress-loading" />
        )}
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="all" data-testid="tab-all-files">
            All ({files.length})
          </TabsTrigger>
          <TabsTrigger value="pending" data-testid="tab-pending-files">
            Pending ({uploadedFiles.length + processingFiles.length})
          </TabsTrigger>
          <TabsTrigger value="review" data-testid="tab-review-files">
            Upload Review ({pendingFiles.length})
          </TabsTrigger>
          <TabsTrigger value="routing" data-testid="tab-routing">
            Data Routing
          </TabsTrigger>
          <TabsTrigger value="complete" data-testid="tab-complete-files">
            Complete ({completedFiles.length})
          </TabsTrigger>
          <TabsTrigger value="errors" data-testid="tab-error-files">
            Errors ({errorFiles.length})
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="h-[500px] mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <TabsContent value="all" className="mt-0">
                {renderFileList(files, 'No documents uploaded yet')}
              </TabsContent>
              <TabsContent value="pending" className="mt-0">
                {renderFileList([...uploadedFiles, ...processingFiles], 'No pending documents')}
              </TabsContent>
              <TabsContent value="review" className="mt-0">
                {renderFileList(pendingFiles, 'No documents awaiting review')}
              </TabsContent>
              <TabsContent value="routing" className="mt-0">
                <ReviewQueue />
              </TabsContent>
              <TabsContent value="complete" className="mt-0">
                {renderFileList(completedFiles, 'No completed documents')}
              </TabsContent>
              <TabsContent value="errors" className="mt-0">
                {renderFileList(errorFiles, 'No errors')}
              </TabsContent>
            </>
          )}
        </ScrollArea>
      </Tabs>

      <Dialog open={!!overrideFile} onOpenChange={(open) => !open && setOverrideFile(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Document Details</DialogTitle>
            <DialogDescription>
              Review and modify the AI-suggested category and extracted fields
            </DialogDescription>
          </DialogHeader>
          {overrideFile && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-md">
                <p className="font-medium">{overrideFile.title || overrideFile.fileName}</p>
                <p className="text-sm text-muted-foreground">
                  AI suggested: {overrideFile.suggestedCategory || 'unknown'}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select value={overrideCategory} onValueChange={setOverrideCategory}>
                  <SelectTrigger data-testid="select-override-category">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {Object.keys(overrideFields).length > 0 && (
                <div className="space-y-3">
                  <Label>Extracted Fields</Label>
                  <div className="space-y-2 p-3 bg-muted/50 rounded-md">
                    {Object.entries(overrideFields).map(([key, value]) => (
                      <div key={key} className="space-y-1">
                        <Label htmlFor={`field-${key}`} className="text-xs text-muted-foreground">
                          {formatFieldLabel(key)}
                        </Label>
                        <Input
                          id={`field-${key}`}
                          value={formatFieldValue(value)}
                          onChange={(e) => updateField(key, e.target.value)}
                          data-testid={`input-field-${key}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="reason">Change Reason (optional)</Label>
                <Textarea
                  id="reason"
                  placeholder="Why are you making these changes?"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  data-testid="input-override-reason"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideFile(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleOverrideSubmit}
              disabled={!overrideCategory || approveMutation.isPending}
              data-testid="button-confirm-override"
            >
              {approveMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
