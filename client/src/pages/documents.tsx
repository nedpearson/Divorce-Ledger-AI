import { useQuery, useMutation } from '@tanstack/react-query';
import { useState, useEffect, useRef, useDeferredValue } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import { apiRequest, queryClient, safeRouterFetch } from '@/lib/queryClient';
import {
  FileText,
  Upload,
  FolderOpen,
  Search,
  Filter,
  Plus,
  Download,
  Trash2,
  Eye,
  Lock,
  Loader2,
  File,
  Image,
  FileSpreadsheet,
  BarChart3,
  FileCheck,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Camera,
  ChevronRight,
  Sparkles,
  RefreshCw,
  X,
  CheckCircle2,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { FeedbackCTA } from '@/components/feedback-cta';
import type { Document } from '@shared/schema';

const categoryOptions = [
  { value: 'financial', label: 'Financial Records' },
  { value: 'tax', label: 'Tax Documents' },
  { value: 'legal', label: 'Legal Documents' },
  { value: 'evidence', label: 'Evidence' },
  { value: 'correspondence', label: 'Correspondence' },
  { value: 'medical', label: 'Medical Records' },
  { value: 'property', label: 'Property Documents' },
  { value: 'other', label: 'Other' },
];

const LINK_OPTIONS = [
  { value: 'case', label: 'Main Case File' },
  { value: 'finances', label: 'Financial Records' },
  { value: 'custody', label: 'Custody Documentation' },
  { value: 'property', label: 'Property Division' },
  { value: 'timeline', label: 'Case Timeline' },
];

function getFileIcon(fileType: string | null, size: 'sm' | 'lg' = 'sm') {
  const sizeClass = size === 'lg' ? 'h-12 w-12' : 'h-6 w-6';
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

interface CapturedData {
  title: string;
  suggestedCategory: string;
  suggestedLink: string;
  extractedText: string;
  file?: File;
  fileUrl?: string;
  fileSize?: number;
  fileType?: string;
}

function AddDocumentDialog({
  onSuccess,
  open: externalOpen,
  onOpenChange,
}: {
  onSuccess: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const { environment } = useAuth();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;

  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [capturedData, setCapturedData] = useState<CapturedData | null>(null);

  const [editedTitle, setEditedTitle] = useState('');
  const [editedCategory, setEditedCategory] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedLink, setEditedLink] = useState('case');
  const [isConfidential, setIsConfidential] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Upload file to Python backend for text extraction & storage (replaces Appwrite / Node upload)
  const uploadToAppwrite = async (
    file: File,
    metadata?: { title?: string; category?: string }
  ): Promise<{ fileUrl: string; storageFileId: string; extractedText?: string } | null> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', metadata?.title || file.name.replace(/\.[^/.]+$/, ''));
    formData.append('category', metadata?.category || 'other');
    if (environment) {
      formData.append('environment', environment);
    }

    try {
      // Changed from /api/appwrite/files/upload to /api/documents/upload to hit Python via safeRouterFetch
      const response = await safeRouterFetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include', // Include session cookies for auth
      });

      if (!response.ok) {
        console.error('Document upload failed:', await response.text());
        return null;
      }

      const result = await response.json();
      if (result.success && result.file) {
        return {
          fileUrl: result.file.fileUrl || '',
          storageFileId: result.file.storageFileId || '',
          extractedText: result.extractedText || '',
        };
      }
      return null;
    } catch (error) {
      console.error('Document upload error:', error);
      return null;
    }
  };

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/documents', data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Document Saved', description: 'Your document has been added to your case.' });
      setApprovalOpen(false);
      setOpen(false);
      onSuccess();
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save document.',
        variant: 'destructive',
      });
    },
  });

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
    });
  };

  const handleCapture = async (
    e: React.ChangeEvent<HTMLInputElement>,
    source: 'scan' | 'upload'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setUploadProgress(0);
    try {
      const base64 = await fileToBase64(file);
      const res = await apiRequest('POST', '/api/capture/analyze', {
        base64Data: base64,
        mimeType: file.type,
        fileName: file.name,
        captureType: 'document',
        source,
      });
      const result = await res.json();
      setUploadProgress(50);

      // Upload to Appwrite instead of Replit Object Storage
      const suggestedCategory = result.data?.category || 'other';
      const suggestedTitle = result.data?.title || file.name.replace(/\.[^/.]+$/, '');
      const uploadRes = await uploadToAppwrite(file, {
        title: suggestedTitle,
        category: suggestedCategory,
      });
      if (uploadRes) setUploadProgress(100);

      const publicFileUrl = uploadRes?.fileUrl || '';
      const extractedTextFromPython = uploadRes?.extractedText || '';

      const data: CapturedData = {
        title: result.data?.title || file.name.replace(/\.[^/.]+$/, ''),
        suggestedCategory: result.data?.category || 'other',
        suggestedLink: result.data?.suggestedLink || 'case',
        extractedText: extractedTextFromPython || result.data?.extractedText || '',
        file,
        fileUrl: publicFileUrl,
        fileSize: file.size,
        fileType: file.type,
      };

      setCapturedData(data);
      setEditedTitle(data.title);
      setEditedCategory(data.suggestedCategory);
      setEditedDescription(data.extractedText);
      setEditedLink(data.suggestedLink);

      // Auto-save the document immediately after successful AI analysis
      // This triggers the backend forensic analysis pipeline automatically
      const saveRes = await apiRequest('POST', '/api/documents', {
        title: data.title,
        category: data.suggestedCategory,
        description: data.extractedText,
        isConfidential: false,
        fileUrl: data.fileUrl,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      });

      if (saveRes.ok) {
        const savedDoc = await saveRes.json();
        toast({
          title: 'Document Analyzed & Saved',
          description: `"${data.title}" has been categorized as ${data.suggestedCategory} and saved.`,
        });
        setOpen(false);
        onSuccess();
        queryClient.invalidateQueries({ queryKey: ['/api', 'documents'] });
        queryClient.invalidateQueries({ queryKey: ['/api', 'expenses'] });
        queryClient.invalidateQueries({ queryKey: ['/api', 'incomes'] });
        queryClient.invalidateQueries({ queryKey: ['/api', 'debts'] });
      } else {
        // If auto-save fails, fall back to manual approval dialog
        setApprovalOpen(true);
        toast({
          title: 'Auto-save failed',
          description: 'Please review and save manually.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Analysis Failed',
        description: 'Could not analyze document automatically.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApprove = () => {
    if (!capturedData) return;
    createMutation.mutate({
      title: editedTitle,
      category: editedCategory,
      description: editedDescription,
      isConfidential,
      fileUrl: capturedData.fileUrl,
      fileName: capturedData.file?.name,
      fileSize: capturedData.fileSize,
      fileType: capturedData.fileType,
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button data-testid="button-add-document">
            <Plus className="h-4 w-4 mr-2" />
            Add Document
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add New Document</DialogTitle>
            <DialogDescription>Choose how you want to add your document</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Button
              variant="outline"
              className="h-24 flex flex-col gap-2 hover-elevate"
              onClick={() => cameraInputRef.current?.click()}
              disabled={isProcessing}
            >
              <Camera className="h-8 w-8 text-blue-500" />
              <span>Scan with Camera</span>
            </Button>
            <Button
              variant="outline"
              className="h-24 flex flex-col gap-2 hover-elevate"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
            >
              <Upload className="h-8 w-8 text-purple-500" />
              <span>Upload from Device</span>
            </Button>
            {isProcessing && (
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {uploadProgress > 0 ? `Uploading: ${uploadProgress}%` : 'Processing with AI...'}
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}
          </div>
          <input
            type="file"
            ref={cameraInputRef}
            className="hidden"
            accept="image/*"
            capture="environment"
            onChange={(e) => handleCapture(e, 'scan')}
          />
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={(e) => handleCapture(e, 'upload')}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={approvalOpen} onOpenChange={setApprovalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-5 w-5 text-cyan-500" />
              <DialogTitle>AI Document Analysis</DialogTitle>
            </div>
            <DialogDescription>Review and confirm the extracted information</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Document Title</Label>
                <Input value={editedTitle} onChange={(e) => setEditedTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={editedCategory} onValueChange={setEditedCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Extracted Content / Summary</Label>
              <textarea
                className="w-full min-h-[150px] p-3 rounded-md border bg-background text-sm"
                value={editedDescription}
                onChange={(e) => setEditedDescription(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="confidential-ai"
                checked={isConfidential}
                onChange={(e) => setIsConfidential(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="confidential-ai">Mark as confidential</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApprovalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleApprove} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DocumentPreviewDialog({
  document,
  open,
  onOpenChange,
}: {
  document: Document | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [zoom, setZoom] = useState(100);

  if (!document) return null;

  const categoryLabel =
    categoryOptions.find((c) => c.value === document.category)?.label || document.category;
  const isImage = document.fileType?.includes('image');
  const isPdf = document.fileType?.includes('pdf');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {getFileIcon(document.fileType, 'lg')}
              <div>
                <DialogTitle className="text-xl">{document.title}</DialogTitle>
                <DialogDescription className="flex items-center gap-2 mt-1">
                  <Badge variant="outline">{categoryLabel}</Badge>
                  <span>{new Date(document.createdAt).toLocaleDateString()}</span>
                  {document.fileSize && <span>{formatFileSize(document.fileSize)}</span>}
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setZoom(Math.max(50, zoom - 25))}
                data-testid="button-zoom-out"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-sm w-12 text-center">{zoom}%</span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setZoom(Math.min(200, zoom + 25))}
                data-testid="button-zoom-in"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setZoom(100)}
                data-testid="button-zoom-reset"
              >
                <RotateCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto mt-4">
          <div className="bg-muted/30 rounded-lg p-6 min-h-[60vh] overflow-auto">
            {isImage && document.fileUrl ? (
              <div className="flex justify-center">
                <img
                  src={document.fileUrl}
                  alt={document.title}
                  className="rounded-lg shadow-lg"
                  style={{ width: `${zoom}%`, maxWidth: 'none' }}
                  loading="lazy"
                  decoding="async"
                />
              </div>
            ) : isPdf && document.fileUrl ? (
              <iframe
                src={`${document.fileUrl}#zoom=${zoom}`}
                className="w-full h-[600px] rounded-lg border-0"
                title={document.title}
                key={zoom}
              />
            ) : (
              <div className="prose dark:prose-invert max-w-none">
                <div
                  className="bg-background rounded-lg p-6 shadow-sm border"
                  style={{
                    maxWidth: '8.5in',
                    margin: '0 auto',
                    minHeight: '11in',
                    fontFamily: 'Georgia, serif',
                    fontSize: `${(zoom / 100) * 14}px`,
                    lineHeight: '1.8',
                  }}
                >
                  <h2
                    className="font-semibold mb-4 border-b pb-2"
                    style={{ fontSize: `${(zoom / 100) * 18}px` }}
                  >
                    {document.title}
                  </h2>

                  {document.aiAnalysisStatus === 'pending' && (
                    <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700">
                      <p className="text-amber-700 dark:text-amber-400 text-sm">
                        AI analysis is pending. Text will be extracted shortly.
                      </p>
                    </div>
                  )}

                  {document.aiExtractedText ? (
                    <div className="whitespace-pre-wrap leading-relaxed">
                      <div className="mb-4 p-2 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-700">
                        <span className="text-green-700 dark:text-green-400 text-xs font-medium">
                          AI Extracted Text
                        </span>
                      </div>
                      {document.aiExtractedText}
                    </div>
                  ) : document.description ? (
                    <div className="whitespace-pre-wrap leading-relaxed">
                      {document.description}
                    </div>
                  ) : (
                    <p className="text-muted-foreground italic">
                      No content available for this document.
                    </p>
                  )}

                  {document.aiSummary && (
                    <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                      <p className="text-blue-700 dark:text-blue-400 text-sm">
                        <strong>AI Summary:</strong> {document.aiSummary}
                      </p>
                    </div>
                  )}

                  {document.isConfidential && (
                    <div className="mt-6 pt-4 border-t flex items-center gap-2 text-amber-600 dark:text-amber-400">
                      <Lock className="h-4 w-4" />
                      <span className="text-sm font-medium">CONFIDENTIAL DOCUMENT</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={() => {
              if (document.fileUrl) {
                window.open(document.fileUrl, '_blank');
              } else {
                const blob = new Blob([document.description || document.title], {
                  type: 'text/plain',
                });
                const url = URL.createObjectURL(blob);
                const a = window.document.createElement('a');
                a.href = url;
                a.download = `${document.title}.txt`;
                a.click();
                URL.revokeObjectURL(url);
              }
            }}
            data-testid="button-download-preview"
          >
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LetterDocument({
  document,
  onDelete,
  onPreview,
  showActions = true,
}: {
  document: Document;
  onDelete?: () => void;
  onPreview?: () => void;
  showActions?: boolean;
}) {
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('DELETE', `/api/documents/${document.id}`);
    },
    onSuccess: () => {
      toast({ title: 'Deleted', description: 'Document has been deleted.' });
      onDelete?.();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete document.', variant: 'destructive' });
    },
  });

  const handleDownload = () => {
    if (document.fileUrl) {
      window.open(document.fileUrl, '_blank');
    } else {
      const blob = new Blob([document.description || document.title], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = `${document.title}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
    toast({ title: 'Download Started', description: 'Your document is being downloaded.' });
  };

  const categoryLabel =
    categoryOptions.find((c) => c.value === document.category)?.label || document.category;

  return (
    <div className="w-full max-w-4xl mx-auto" data-testid={`card-document-${document.id}`}>
      <div
        className="bg-background border rounded-lg shadow-sm"
        style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          lineHeight: '1.8',
        }}
      >
        <div className="flex items-center justify-between p-4 border-b bg-muted/30 rounded-t-lg gap-2 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            {getFileIcon(document.fileType)}
            <Badge variant="outline">{categoryLabel}</Badge>
            <span className="text-xs text-muted-foreground">
              {new Date(document.createdAt).toLocaleDateString()}
            </span>
            {document.isConfidential && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Lock className="h-3 w-3" />
                Confidential
              </Badge>
            )}
          </div>
          {showActions && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onPreview}
                data-testid={`button-view-${document.id}`}
              >
                <Eye className="h-4 w-4 mr-1" />
                View
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                data-testid={`button-download-${document.id}`}
              >
                <Download className="h-4 w-4 mr-1" />
                Download
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                data-testid={`button-delete-${document.id}`}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          )}
        </div>

        <div className="p-6 md:p-8">
          <h2 className="text-xl md:text-2xl font-semibold mb-4 pb-3 border-b">{document.title}</h2>

          {document.fileUrl && document.fileType?.includes('image') ? (
            <div className="flex justify-center mb-4 aspect-video max-w-lg mx-auto bg-muted rounded-lg overflow-hidden">
              <img
                src={document.fileUrl}
                alt={document.title}
                className="w-full h-full object-contain rounded-lg shadow-md"
                loading="lazy"
                decoding="async"
              />
            </div>
          ) : null}

          <div className="whitespace-pre-wrap text-sm md:text-base leading-relaxed text-foreground">
            {document.description || 'No content available for this document.'}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryView({ documents }: { documents: Document[] }) {
  const categoryCounts = documents.reduce(
    (acc, doc) => {
      const cat = doc.category || 'other';
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const totalSize = documents.reduce((sum, doc) => sum + (doc.fileSize || 0), 0);
  const confidentialCount = documents.filter((d) => d.isConfidential).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-primary">{documents.length}</div>
            <div className="text-sm text-muted-foreground">Total Documents</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-blue-500">
              {Object.keys(categoryCounts).length}
            </div>
            <div className="text-sm text-muted-foreground">Categories</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-green-500">{formatFileSize(totalSize)}</div>
            <div className="text-sm text-muted-foreground">Total Size</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-amber-500">{confidentialCount}</div>
            <div className="text-sm text-muted-foreground">Confidential</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Documents by Category
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {categoryOptions.map((opt) => {
              const count = categoryCounts[opt.value] || 0;
              const percentage = documents.length > 0 ? (count / documents.length) * 100 : 0;
              return (
                <div key={opt.value} className="flex items-center gap-3">
                  <span className="text-sm w-32 truncate">{opt.label}</span>
                  <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            Recent Documents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {documents.slice(0, 5).map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50"
              >
                {getFileIcon(doc.fileType)}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{doc.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(doc.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <Badge variant="outline" className="text-xs">
                  {categoryOptions.find((c) => c.value === doc.category)?.label || doc.category}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PDFView({
  documents,
  onPreview,
}: {
  documents: Document[];
  onPreview: (doc: Document) => void;
}) {
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(documents[0] || null);

  useEffect(() => {
    if (documents.length > 0 && !selectedDoc) {
      setSelectedDoc(documents[0]);
    }
  }, [documents, selectedDoc]);

  if (documents.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Documents to View</h3>
          <p className="text-sm text-muted-foreground text-center">
            Upload documents to view them here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid md:grid-cols-[300px_1fr] gap-6">
      <Card className="h-fit">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Document List</CardTitle>
        </CardHeader>
        <CardContent className="p-2">
          <ScrollArea className="h-[500px]">
            <div className="space-y-1">
              {documents.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => setSelectedDoc(doc)}
                  className={`w-full text-left p-3 rounded-lg transition-colors flex items-center gap-3 ${
                    selectedDoc?.id === doc.id
                      ? 'bg-primary/10 border border-primary/20'
                      : 'hover:bg-muted/50'
                  }`}
                  data-testid={`pdf-select-${doc.id}`}
                >
                  {getFileIcon(doc.fileType)}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{doc.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
          <div className="flex items-center gap-3">
            {selectedDoc && getFileIcon(selectedDoc.fileType, 'lg')}
            <div>
              <CardTitle>{selectedDoc?.title || 'Select a document'}</CardTitle>
              <CardDescription>
                {selectedDoc && (
                  <>
                    {categoryOptions.find((c) => c.value === selectedDoc.category)?.label ||
                      selectedDoc.category}
                    {' - '}
                    {new Date(selectedDoc.createdAt).toLocaleDateString()}
                  </>
                )}
              </CardDescription>
            </div>
          </div>
          {selectedDoc && (
            <Button
              variant="outline"
              onClick={() => onPreview(selectedDoc)}
              data-testid="button-fullscreen-preview"
            >
              <Eye className="h-4 w-4 mr-2" />
              Full View
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {selectedDoc ? (
            <div
              className="bg-muted/30 rounded-lg p-6 overflow-auto"
              style={{
                maxHeight: '600px',
                minHeight: '400px',
              }}
            >
              {selectedDoc.fileType?.includes('image') && selectedDoc.fileUrl ? (
                <div className="flex justify-center aspect-video bg-muted rounded-lg overflow-hidden">
                  <img
                    src={selectedDoc.fileUrl}
                    alt={selectedDoc.title}
                    className="w-full h-full object-contain rounded-lg shadow-lg"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              ) : selectedDoc.fileType?.includes('pdf') && selectedDoc.fileUrl ? (
                <iframe
                  src={selectedDoc.fileUrl}
                  className="w-full h-[500px] rounded-lg"
                  title={selectedDoc.title}
                />
              ) : (
                <div
                  className="bg-background rounded-lg p-8 shadow-sm border mx-auto"
                  style={{
                    maxWidth: '8.5in',
                    fontFamily: 'Georgia, serif',
                    lineHeight: '1.8',
                  }}
                >
                  <h2 className="text-xl font-semibold mb-4 pb-3 border-b">{selectedDoc.title}</h2>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {selectedDoc.description || 'No content available for this document.'}
                  </div>
                  {selectedDoc.isConfidential && (
                    <div className="mt-6 pt-4 border-t flex items-center gap-2 text-amber-600 dark:text-amber-400">
                      <Lock className="h-4 w-4" />
                      <span className="text-sm font-medium">CONFIDENTIAL DOCUMENT</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mb-4" />
              <p>Select a document from the list to view</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function DocumentsPage() {
  const { environment, user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<Document | null>(null);
  const [activeTab, setActiveTab] = useState('all');

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStatus, setAnalysisStatus] = useState('');
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [showAnalysisCard, setShowAnalysisCard] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'scan') {
      setShowAddDialog(true);
      setTimeout(() => {
        window.history.replaceState({}, '', '/documents');
      }, 100);
    }
  }, []);

  const {
    data: documents,
    isLoading,
    refetch,
  } = useQuery<Document[]>({
    queryKey: ['/api', 'documents', { environment, userId: user?.id }],
    queryFn: async () => {
      const res = await fetch('/api/documents', {
        credentials: 'include',
        headers: {
          'X-Environment': environment,
          'X-User-Id': user?.id || '',
        },
      });
      if (!res.ok) throw new Error('Failed to fetch documents');
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const handleReanalyze = async () => {
    setIsAnalyzing(true);
    setAnalysisComplete(false);
    setShowAnalysisCard(true);
    setAnalysisProgress(0);
    setAnalysisStatus('Scanning documents for re-analysis...');

    try {
      // Use force=true to reanalyze all documents and extract financial data
      const scanRes = await apiRequest('POST', '/api/documents/reanalyze?force=true');
      const scanData = await scanRes.json();

      if (scanData.total === 0) {
        toast({ title: 'No Documents', description: 'No documents with files found to analyze.' });
        setIsAnalyzing(false);
        setShowAnalysisCard(false);
        return;
      }

      const docIds: string[] = scanData.documentIds;
      let completed = 0;

      let financialRecordsCreated = 0;
      for (const docId of docIds) {
        setAnalysisStatus(`Analyzing document ${completed + 1} of ${docIds.length}...`);
        try {
          const analyzeRes = await apiRequest('POST', `/api/mobile/documents/${docId}/reanalyze`);
          const result = await analyzeRes.json();
          if (result.financialRecordCreated) {
            financialRecordsCreated++;
          }
        } catch (err) {
          console.error(`Failed to analyze doc ${docId}`, err);
        }
        completed++;
        setAnalysisProgress(Math.round((completed / docIds.length) * 100));
      }

      setAnalysisProgress(100);
      setAnalysisComplete(true);
      const msg =
        financialRecordsCreated > 0
          ? `Analyzed ${completed} documents. Created ${financialRecordsCreated} financial records.`
          : `Successfully analyzed ${completed} documents.`;
      setAnalysisStatus(msg);

      // Refresh documents and financial data
      refetch();
      queryClient.invalidateQueries({ queryKey: ['/api', 'incomes'] });
      queryClient.invalidateQueries({ queryKey: ['/api', 'expenses'] });
      queryClient.invalidateQueries({ queryKey: ['/api', 'assets'] });
      queryClient.invalidateQueries({ queryKey: ['/api', 'debts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/transactions'] });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to analyze documents.',
        variant: 'destructive',
      });
      setShowAnalysisCard(false);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const dismissAnalysisCard = () => {
    setShowAnalysisCard(false);
    setAnalysisProgress(0);
    setAnalysisStatus('');
    setAnalysisComplete(false);
  };

  const filteredDocuments = (documents || []).filter((doc) => {
    const matchesSearch =
      doc.title.toLowerCase().includes(deferredSearchQuery.toLowerCase()) ||
      (doc.description || '').toLowerCase().includes(deferredSearchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || doc.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const exportData = () => {
    if (!documents || documents.length === 0) return;
    const headers = ['Title', 'Category', 'Date Added', 'File Size', 'Confidential'];
    const csvContent = [
      headers.join(','),
      ...documents.map((d) =>
        [
          `"${d.title.replace(/"/g, '""')}"`,
          categoryOptions.find((c) => c.value === d.category)?.label || d.category,
          new Date(d.createdAt).toLocaleDateString(),
          d.fileSize ? formatFileSize(d.fileSize) : '',
          d.isConfidential ? 'Yes' : 'No',
        ].join(',')
      ),
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `documents_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24 md:pb-6" data-testid="page-documents">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">
            Documents
          </h1>
          <p className="text-sm text-muted-foreground">
            Upload, organize, and manage all your legal and financial documents.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportData} disabled={!documents?.length}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            onClick={handleReanalyze}
            disabled={isAnalyzing}
            data-testid="button-reanalyze"
          >
            {isAnalyzing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {isAnalyzing ? 'Analyzing...' : 'Re-Analyze All'}
          </Button>
          <AddDocumentDialog
            onSuccess={() => refetch()}
            open={showAddDialog}
            onOpenChange={setShowAddDialog}
          />
        </div>
      </div>

      {showAnalysisCard && (
        <Card
          className={`${analysisComplete ? 'bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-500/30' : 'bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border-cyan-500/30'}`}
        >
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-3">
                {analysisComplete ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <Sparkles className="h-5 w-5 text-cyan-500 animate-pulse" />
                )}
                <span className="font-medium text-sm">
                  {analysisComplete ? 'Analysis Complete' : analysisStatus}
                </span>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={dismissAnalysisCard}
                data-testid="button-dismiss-analysis"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <Progress
              value={analysisProgress}
              className={`h-2 ${analysisComplete ? '[&>div]:bg-green-500' : ''}`}
            />
            <p className="text-xs text-muted-foreground mt-2">
              {analysisComplete ? analysisStatus : `${analysisProgress}% complete`}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-documents"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-category-filter">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter by category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categoryOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="all" data-testid="tab-all">
            <FileText className="h-4 w-4 mr-2" />
            All
          </TabsTrigger>
          <TabsTrigger value="summary" data-testid="tab-summary">
            <BarChart3 className="h-4 w-4 mr-2" />
            Summary
          </TabsTrigger>
          <TabsTrigger value="pdf" data-testid="tab-pdf-view">
            <Eye className="h-4 w-4 mr-2" />
            PDF View
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-lg bg-muted animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-5 w-1/3 bg-muted rounded animate-pulse" />
                      <div className="h-4 w-2/3 bg-muted rounded animate-pulse" />
                      <div className="h-3 w-1/4 bg-muted rounded animate-pulse" />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : filteredDocuments.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="p-4 bg-muted rounded-full mb-4">
                  <FolderOpen className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-2">No Documents Found</h3>
                <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
                  {searchQuery || categoryFilter !== 'all'
                    ? 'No documents match your search criteria. Try adjusting your filters.'
                    : 'Get started by uploading your first document.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-8">
              {filteredDocuments.map((doc) => (
                <LetterDocument
                  key={doc.id}
                  document={doc}
                  onDelete={() => refetch()}
                  onPreview={() => setPreviewDocument(doc)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="summary">
          <SummaryView documents={documents || []} />
        </TabsContent>

        <TabsContent value="pdf">
          <PDFView documents={documents || []} onPreview={(doc) => setPreviewDocument(doc)} />
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Quick Upload
          </CardTitle>
          <CardDescription>Drag and drop files here or click to browse</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover-elevate cursor-pointer transition-colors">
            <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">
              Drop files here to upload, or click to browse
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Supports PDF, Word, Excel, Images, and more
            </p>
          </div>
        </CardContent>
      </Card>

      <DocumentPreviewDialog
        document={previewDocument}
        open={!!previewDocument}
        onOpenChange={(open) => !open && setPreviewDocument(null)}
      />

      <div className="flex justify-center pt-4">
        <FeedbackCTA />
      </div>
    </div>
  );
}
