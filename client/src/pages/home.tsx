import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { Link, useLocation, useSearch } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  Camera,
  AlertTriangle,
  FileText,
  Clock,
  ChevronRight,
  Upload,
  Mic,
  Check,
  Edit3,
  FolderOpen,
  Sparkles,
  Zap,
  Shield,
  X,
  Loader2,
  Square,
  Play,
  Calculator,
  Layers
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FeedbackCTA } from '@/components/feedback-cta';
import type { Document, Violation } from '@shared/schema';

type CaptureMode =
  | null
  | 'scan-doc'
  | 'upload-doc'
  | 'voice-doc'
  | 'scan-violation'
  | 'upload-violation'
  | 'voice-violation';

interface CapturedData {
  type: 'document' | 'violation';
  source: 'scan' | 'upload' | 'voice';
  title: string;
  suggestedCategory: string;
  suggestedLink: string;
  transcription?: string;
  extractedText?: string;
  file?: File;
}

interface PendingFile {
  file: File;
  type: 'document' | 'violation';
  source: 'scan' | 'upload';
}

const DOCUMENT_CATEGORIES = [
  { value: 'financial', label: 'Financial Records' },
  { value: 'legal', label: 'Legal Documents' },
  { value: 'evidence', label: 'Evidence' },
  { value: 'correspondence', label: 'Correspondence' },
  { value: 'medical', label: 'Medical Records' },
  { value: 'property', label: 'Property Documents' },
  { value: 'other', label: 'Other' },
];

const VIOLATION_TYPES = [
  { value: 'custody', label: 'Custody Violation' },
  { value: 'financial_hiding', label: 'Financial Misconduct' },
  { value: 'harassment', label: 'Communication Violation' },
  { value: 'child_neglect', label: 'Child Neglect' },
  { value: 'court_order', label: 'Court Order Violation' },
  { value: 'property_damage', label: 'Property Damage' },
  { value: 'other', label: 'Other' },
];

const LINK_OPTIONS = [
  { value: 'case', label: 'Main Case File' },
  { value: 'finances', label: 'Financial Records' },
  { value: 'custody', label: 'Custody Documentation' },
  { value: 'property', label: 'Property Division' },
  { value: 'timeline', label: 'Case Timeline' },
];

export default function Home() {
  const { environment, user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [captureMode, setCaptureMode] = useState<CaptureMode>(null);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [capturedData, setCapturedData] = useState<CapturedData | null>(null);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedCategory, setEditedCategory] = useState('');
  const [editedTranscription, setEditedTranscription] = useState('');
  const [editedLink, setEditedLink] = useState('case');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const { data: recentDocs = [] } = useQuery<Document[]>({
    queryKey: ['/api/documents', environment],
    queryFn: async () => {
      const res = await fetch(`/api/documents?environment=${environment || 'demo'}`, {
        credentials: 'include',
        headers: {
          'X-Environment': environment || 'demo',
          'X-User-Id': user?.id || '',
        },
      });
      if (!res.ok) throw new Error('Failed to fetch documents');
      return res.json();
    },
    staleTime: 1000 * 60, // 1 minute stale time
  });

  const { data: violations = [] } = useQuery<Violation[]>({
    queryKey: ['/api/violations', environment],
    queryFn: async () => {
      const res = await fetch(`/api/violations?environment=${environment || 'demo'}`, {
        credentials: 'include',
        headers: {
          'X-Environment': environment || 'demo',
          'X-User-Id': user?.id || '',
        },
      });
      if (!res.ok) throw new Error('Failed to fetch violations');
      return res.json();
    },
    staleTime: 1000 * 60, // 1 minute stale time to prevent dupe requests
  });

  const createDocumentMutation = useMutation({
    mutationFn: async (data: { title: string; category: string; description: string }) => {
      const res = await apiRequest('POST', '/api/documents', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api', 'documents'] });
      toast({ title: 'Document Saved', description: 'Your document has been saved to your case.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to save document.', variant: 'destructive' });
    },
  });

  const createViolationMutation = useMutation({
    mutationFn: async (data: { type: string; description: string }) => {
      const res = await apiRequest('POST', '/api/violations', {
        ...data,
        timestamp: new Date().toISOString(),
        status: 'pending',
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/violations', environment] });
      toast({ title: 'Violation Reported', description: 'Your violation report has been saved.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to save violation.', variant: 'destructive' });
    },
  });

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
    });
  };

  const analyzeWithAI = async (
    base64Data: string,
    mimeType: string,
    fileName: string,
    captureType: 'document' | 'violation',
    source: 'scan' | 'upload' | 'voice'
  ) => {
    try {
      const res = await apiRequest('POST', '/api/capture/analyze', {
        base64Data,
        mimeType,
        fileName,
        captureType,
        source,
      });
      const result = await res.json();
      if (result.success && result.data) {
        return result.data;
      }
      throw new Error('Analysis failed');
    } catch (error) {
      console.error('AI analysis error:', error);
      return null;
    }
  };

  const processFile = async (
    file: File,
    type: 'document' | 'violation',
    source: 'scan' | 'upload'
  ) => {
    try {
      const base64 = await fileToBase64(file);
      const isImage = file.type.startsWith('image/');
      let aiResult = null;

      if (isImage) {
        aiResult = await analyzeWithAI(base64, file.type, file.name, type, source);
      }

      const data: CapturedData = {
        type,
        source,
        file,
        title: aiResult?.title || file.name.replace(/\.[^/.]+$/, ''),
        suggestedCategory: aiResult?.category || (type === 'document' ? 'other' : 'other'),
        suggestedLink: aiResult?.suggestedLink || (type === 'document' ? 'finances' : 'timeline'),
        extractedText:
          aiResult?.extractedText || (source === 'scan' ? 'Document scanned - please review' : ''),
      };

      setCapturedData(data);
      setEditedTitle(data.title);
      setEditedCategory(data.suggestedCategory);
      setEditedTranscription(data.extractedText || '');
      setEditedLink(data.suggestedLink);
      setIsProcessing(false);
      setApprovalOpen(true);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to analyze file', variant: 'destructive' });
      processNextFile();
    }
  };

  const processNextFile = () => {
    if (pendingFiles.length > 0) {
      const [nextFile, ...remaining] = pendingFiles;
      setPendingFiles(remaining);
      setCurrentFileIndex((prev) => prev + 1);
      setIsProcessing(true);
      processFile(nextFile.file, nextFile.type, nextFile.source);
    } else {
      setTotalFiles(0);
      setCurrentFileIndex(0);
      setCaptureMode(null);
    }
  };

  const handleCameraCapture = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'document' | 'violation'
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    setTotalFiles(fileArray.length);
    setCurrentFileIndex(1);
    setCaptureMode(null);

    if (fileArray.length === 1) {
      setIsProcessing(true);
      processFile(fileArray[0], type, 'scan');
    } else {
      const [first, ...rest] = fileArray;
      setPendingFiles(rest.map((f) => ({ file: f, type, source: 'scan' as const })));
      setIsProcessing(true);
      processFile(first, type, 'scan');
    }

    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
    }
  };

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'document' | 'violation'
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    setTotalFiles(fileArray.length);
    setCurrentFileIndex(1);
    setCaptureMode(null);

    if (fileArray.length === 1) {
      setIsProcessing(true);
      processFile(fileArray[0], type, 'upload');
    } else {
      const [first, ...rest] = fileArray;
      setPendingFiles(rest.map((f) => ({ file: f, type, source: 'upload' as const })));
      setIsProcessing(true);
      processFile(first, type, 'upload');
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleVoiceRecordStart = () => {
    setIsRecording(true);
  };

  const handleVoiceRecordStop = (type: 'document' | 'violation') => {
    setIsRecording(false);
    setIsProcessing(true);

    const data: CapturedData = {
      type,
      source: 'voice',
      title: 'Voice Note',
      suggestedCategory: type === 'document' ? 'correspondence' : 'other',
      suggestedLink: type === 'document' ? 'case' : 'timeline',
      transcription:
        'Voice recording captured. In a full implementation, this would be transcribed using AI. For now, please type your notes below.',
    };

    setCapturedData(data);
    setEditedTitle(data.title);
    setEditedCategory(data.suggestedCategory);
    setEditedTranscription(data.transcription || '');
    setEditedLink(data.suggestedLink);
    setIsProcessing(false);
    setCaptureMode(null);
    setApprovalOpen(true);
  };

  const getLinkLabel = (value: string) => {
    const option = LINK_OPTIONS.find((o) => o.value === value);
    return option?.label || value;
  };

  const handleApproveData = async () => {
    if (!capturedData) return;

    const linkInfo = `[Linked to: ${getLinkLabel(editedLink)}]`;

    if (capturedData.type === 'document') {
      await createDocumentMutation.mutateAsync({
        title: editedTitle,
        category: editedCategory,
        description: editedTranscription ? `${editedTranscription}\n\n${linkInfo}` : linkInfo,
      });
    } else {
      await createViolationMutation.mutateAsync({
        type: editedCategory,
        description: `${editedTitle}\n\n${editedTranscription}\n\n${linkInfo}`,
      });
    }

    setApprovalOpen(false);
    setCapturedData(null);

    if (pendingFiles.length > 0) {
      setTimeout(() => processNextFile(), 300);
    }
  };

  const handleSkipFile = () => {
    setApprovalOpen(false);
    setCapturedData(null);

    if (pendingFiles.length > 0) {
      setTimeout(() => processNextFile(), 300);
    } else {
      setTotalFiles(0);
      setCurrentFileIndex(0);
    }
  };

  const startCapture = (mode: CaptureMode) => {
    setCaptureMode(mode);
    if (mode === 'scan-doc' || mode === 'scan-violation') {
      setTimeout(() => cameraInputRef.current?.click(), 100);
    } else if (mode === 'upload-doc' || mode === 'upload-violation') {
      setTimeout(() => fileInputRef.current?.click(), 100);
    }
  };

  const { data: documentStats } = useQuery<any[]>({
    queryKey: ['/api/storage/files'],
  });

  const violationsCount = violations?.length || 0;

  const quickStats = [
    {
      label: 'Document Library',
      value: documentStats?.length || 0,
      icon: Layers,
      color: 'text-blue-400',
      bg: 'bg-blue-500/20',
    },
    {
      label: 'Violations',
      value: violationsCount,
      icon: AlertTriangle,
      color: 'text-orange-400',
      bg: 'bg-orange-500/20',
    },
  ];

  const isPending = createDocumentMutation.isPending || createViolationMutation.isPending;

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <div className="px-4 py-6 md:p-6 max-w-4xl mx-auto space-y-6">
        <header className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium">
            <Sparkles className="w-4 h-4" />
            Quick Capture
          </div>
          <h1 className="text-2xl font-bold">What would you like to do?</h1>
          <p className="text-muted-foreground text-sm">Capture evidence for your case</p>
        </header>

        <section className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-3">
            <button
              onClick={() => startCapture('scan-doc')}
              className="group relative w-full overflow-hidden rounded-3xl p-[2px] bg-gradient-to-br from-blue-500 via-cyan-400 to-blue-600 shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-transform flex-1"
              data-testid="button-scan-document"
            >
              <div className="relative h-full bg-card rounded-[calc(1.5rem-2px)] p-5 flex flex-col items-center justify-center text-center min-h-[160px]">
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-500/30 via-cyan-400/20 to-transparent rounded-bl-full" />
                <div className="absolute bottom-0 left-0 w-16 h-16 bg-gradient-to-tr from-blue-600/20 to-transparent rounded-tr-full" />
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center mb-3 shadow-lg shadow-blue-500/30 group-hover:scale-110 transition-transform">
                  <Camera className="w-7 h-7 text-white" />
                </div>
                <h3 className="font-bold text-lg bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                  Scan
                </h3>
                <p className="font-semibold">Documents</p>
                <p className="text-xs text-muted-foreground mt-1">Capture with camera</p>
              </div>
            </button>

            <button
              onClick={() => startCapture('upload-doc')}
              className="group w-full flex items-center gap-3 p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 hover:border-blue-500/30 active:scale-[0.98] transition-all min-h-[72px]"
              data-testid="button-upload-document"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-400/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Upload className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="font-semibold text-sm">Upload Files</p>
                <p className="text-xs text-muted-foreground truncate">From device</p>
              </div>
              <ChevronRight className="w-4 h-4 text-blue-400 shrink-0" />
            </button>

            <button
              onClick={() => startCapture('voice-doc')}
              className="group w-full flex items-center gap-3 p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 hover:border-blue-500/30 active:scale-[0.98] transition-all min-h-[72px]"
              data-testid="button-voice-document"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-400/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Mic className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="font-semibold text-sm">Voice Notes</p>
                <p className="text-xs text-muted-foreground truncate">Describe document</p>
              </div>
              <ChevronRight className="w-4 h-4 text-blue-400 shrink-0" />
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => startCapture('scan-violation')}
              className="group relative w-full overflow-hidden rounded-3xl p-[2px] bg-gradient-to-br from-orange-500 via-red-400 to-orange-600 shadow-lg shadow-orange-500/20 active:scale-[0.98] transition-transform flex-1"
              data-testid="button-report-violation"
            >
              <div className="relative h-full bg-card rounded-[calc(1.5rem-2px)] p-5 flex flex-col items-center justify-center text-center min-h-[160px]">
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-orange-500/30 via-red-400/20 to-transparent rounded-bl-full" />
                <div className="absolute bottom-0 left-0 w-16 h-16 bg-gradient-to-tr from-orange-600/20 to-transparent rounded-tr-full" />
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-red-400 flex items-center justify-center mb-3 shadow-lg shadow-orange-500/30 group-hover:scale-110 transition-transform">
                  <AlertTriangle className="w-7 h-7 text-white" />
                </div>
                <h3 className="font-bold text-lg bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text text-transparent">
                  Report
                </h3>
                <p className="font-semibold">Violation</p>
                <p className="text-xs text-muted-foreground mt-1">Capture evidence</p>
              </div>
            </button>

            <button
              onClick={() => startCapture('upload-violation')}
              className="group w-full flex items-center gap-3 p-3 rounded-2xl bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/20 hover:border-orange-500/30 active:scale-[0.98] transition-all min-h-[72px]"
              data-testid="button-upload-violation"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-400/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Upload className="w-5 h-5 text-orange-400" />
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="font-semibold text-sm">Upload Files</p>
                <p className="text-xs text-muted-foreground truncate">Evidence files</p>
              </div>
              <ChevronRight className="w-4 h-4 text-orange-400 shrink-0" />
            </button>

            <button
              onClick={() => startCapture('voice-violation')}
              className="group w-full flex items-center gap-3 p-3 rounded-2xl bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/20 hover:border-orange-500/30 active:scale-[0.98] transition-all min-h-[72px]"
              data-testid="button-voice-violation"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-400/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Mic className="w-5 h-5 text-orange-400" />
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="font-semibold text-sm">Voice Notes</p>
                <p className="text-xs text-muted-foreground truncate">Describe violation</p>
              </div>
              <ChevronRight className="w-4 h-4 text-orange-400 shrink-0" />
            </button>
          </div>
        </section>

        <div className="flex items-center justify-center gap-2 py-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>AI-powered analysis</span>
          </div>
          <span className="text-muted-foreground/50">|</span>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Shield className="w-3.5 h-3.5 text-green-400" />
            <span>Review before saving</span>
          </div>
        </div>

        <section className="grid grid-cols-2 gap-3">
          {quickStats.map((stat) => (
            <Link key={stat.label} href={stat.label === 'Documents' ? '/documents' : '/violations'}>
              <Card className="border-0 bg-muted/50 hover-elevate">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className={cn('p-2.5 rounded-xl', stat.bg)}>
                    <stat.icon className={cn('w-5 h-5', stat.color)} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold text-lg text-center">Quick Access</h2>
          <div className="grid grid-cols-3 gap-2">
            <Link href="/finances">
              <Card className="hover-elevate border-0 bg-gradient-to-br from-green-500/10 to-emerald-500/5 h-full">
                <CardContent className="flex flex-col items-center justify-center gap-2 p-4 text-center">
                  <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                    <Zap className="w-5 h-5 text-green-400" />
                  </div>
                  <p className="font-medium text-xs">Finances</p>
                </CardContent>
              </Card>
            </Link>
            <Link href="/case-builder">
              <Card className="hover-elevate border-0 bg-gradient-to-br from-purple-500/10 to-pink-500/5 h-full">
                <CardContent className="flex flex-col items-center justify-center gap-2 p-4 text-center">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-purple-400" />
                  </div>
                  <p className="font-medium text-xs">Case Builder</p>
                </CardContent>
              </Card>
            </Link>
            <Link href="/timeline">
              <Card className="hover-elevate border-0 bg-gradient-to-br from-cyan-500/10 to-blue-500/5 h-full">
                <CardContent className="flex flex-col items-center justify-center gap-2 p-4 text-center">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-cyan-400" />
                  </div>
                  <p className="font-medium text-xs">Timeline</p>
                </CardContent>
              </Card>
            </Link>
          </div>
        </section>
      </div>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => {
          const type = captureMode?.includes('doc') ? 'document' : 'violation';
          handleCameraCapture(e, type);
        }}
        data-testid="input-camera-capture"
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf,.doc,.docx,.txt"
        multiple
        className="hidden"
        onChange={(e) => {
          const type = captureMode?.includes('doc') ? 'document' : 'violation';
          handleFileUpload(e, type);
        }}
        data-testid="input-file-upload"
      />

      <Dialog
        open={captureMode?.includes('voice') || false}
        onOpenChange={(open) => !open && setCaptureMode(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mic
                className={cn(
                  'w-5 h-5',
                  captureMode?.includes('doc') ? 'text-blue-400' : 'text-orange-400'
                )}
              />
              Voice Note
            </DialogTitle>
            <DialogDescription>
              {captureMode?.includes('doc')
                ? 'Describe your document and the AI will categorize it'
                : 'Describe the violation in detail'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-6">
            <div
              className={cn(
                'w-24 h-24 rounded-full flex items-center justify-center transition-all',
                isRecording
                  ? 'bg-red-500 animate-pulse shadow-lg shadow-red-500/50'
                  : captureMode?.includes('doc')
                    ? 'bg-blue-500/20'
                    : 'bg-orange-500/20'
              )}
            >
              {isRecording ? (
                <div className="w-8 h-8 bg-white rounded-sm" />
              ) : (
                <Mic
                  className={cn(
                    'w-10 h-10',
                    captureMode?.includes('doc') ? 'text-blue-400' : 'text-orange-400'
                  )}
                />
              )}
            </div>

            <p className="text-sm text-muted-foreground text-center">
              {isRecording ? 'Recording... Tap to stop' : 'Tap to start recording'}
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setCaptureMode(null)}
              data-testid="button-voice-cancel"
            >
              Cancel
            </Button>
            {isRecording ? (
              <Button
                onClick={() =>
                  handleVoiceRecordStop(captureMode?.includes('doc') ? 'document' : 'violation')
                }
                variant="destructive"
                className="gap-2"
                data-testid="button-voice-stop"
              >
                <Square className="w-4 h-4" />
                Stop Recording
              </Button>
            ) : (
              <Button
                onClick={handleVoiceRecordStart}
                className="gap-2"
                data-testid="button-voice-start"
              >
                <Play className="w-4 h-4" />
                Start Recording
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isProcessing} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-xs [&>button]:hidden" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Processing</DialogTitle>
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="relative">
              <Loader2 className="w-12 h-12 text-primary animate-spin" />
              <Sparkles className="w-5 h-5 text-cyan-400 absolute -top-1 -right-1 animate-pulse" />
            </div>
            <div className="text-center space-y-1">
              <p className="font-semibold">Analyzing with AI</p>
              <p className="text-sm text-muted-foreground">Extracting text and categorizing...</p>
              {totalFiles > 1 && (
                <Badge variant="secondary" className="mt-2">
                  File {currentFileIndex} of {totalFiles}
                </Badge>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={approvalOpen} onOpenChange={setApprovalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-primary" />
                Review & Approve
              </div>
              {totalFiles > 1 && (
                <Badge variant="outline" className="text-xs">
                  {currentFileIndex} of {totalFiles}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Check that the AI correctly identified your{' '}
              {capturedData?.type === 'document' ? 'document' : 'violation'}. Make changes if
              needed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3">
              <p className="text-xs text-muted-foreground mb-1">AI Suggestion</p>
              <p className="text-sm font-medium">{capturedData?.title}</p>
            </div>

            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                placeholder="Enter title..."
                data-testid="input-approval-title"
              />
            </div>

            <div className="space-y-2">
              <Label>Category / Type</Label>
              <Select value={editedCategory} onValueChange={setEditedCategory}>
                <SelectTrigger data-testid="select-approval-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {(capturedData?.type === 'document' ? DOCUMENT_CATEGORIES : VIOLATION_TYPES).map(
                    (cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            {(capturedData?.source === 'voice' || capturedData?.source === 'scan') && (
              <div className="space-y-2">
                <Label>
                  {capturedData.source === 'voice' ? 'Transcription' : 'Extracted Text'}
                </Label>
                <Textarea
                  value={editedTranscription}
                  onChange={(e) => setEditedTranscription(e.target.value)}
                  placeholder={
                    capturedData.source === 'voice'
                      ? 'Voice note transcription...'
                      : 'Text extracted from document...'
                  }
                  className="min-h-[80px]"
                  data-testid="textarea-approval-content"
                />
                <p className="text-xs text-muted-foreground">
                  {capturedData.source === 'voice'
                    ? 'Edit if the transcription is incorrect'
                    : 'Edit if the AI read the document incorrectly'}
                </p>
              </div>
            )}

            <div className="rounded-lg bg-muted/50 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-muted-foreground" />
                <Label className="text-sm">Link to</Label>
              </div>
              <Select value={editedLink} onValueChange={setEditedLink}>
                <SelectTrigger data-testid="select-approval-link">
                  <SelectValue placeholder="Select where to link" />
                </SelectTrigger>
                <SelectContent>
                  {LINK_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                onClick={() => setApprovalOpen(false)}
                data-testid="button-approval-cancel"
              >
                Cancel
              </Button>
              {pendingFiles.length > 0 && (
                <Button variant="ghost" onClick={handleSkipFile} data-testid="button-approval-skip">
                  Skip
                </Button>
              )}
            </div>
            <Button
              onClick={handleApproveData}
              className="gap-2 w-full sm:w-auto"
              disabled={isPending}
              data-testid="button-approval-confirm"
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {pendingFiles.length > 0 ? 'Save & Next' : 'Approve & Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex justify-center pt-4">
        <FeedbackCTA />
      </div>
    </div>
  );
}
