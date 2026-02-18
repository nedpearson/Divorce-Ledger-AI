import { useState, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Mic,
  Camera,
  Upload,
  FileText,
  Loader2,
  Square,
  Lightbulb,
  Send,
  CheckCircle,
  Clock,
  AlertCircle,
  TestTube,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ImprovementRecommendation, RECOMMENDATION_STATUSES } from "@shared/schema";

type InputMode = "text" | "voice" | "camera" | "file";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: typeof Clock }> = {
  submitted: { label: "Submitted", variant: "secondary", icon: Clock },
  reviewing: { label: "Under Review", variant: "default", icon: AlertCircle },
  testing: { label: "Testing", variant: "outline", icon: TestTube },
  approved: { label: "Approved", variant: "default", icon: CheckCircle },
  implemented: { label: "Implemented", variant: "default", icon: Check },
  rejected: { label: "Not Accepted", variant: "destructive", icon: AlertCircle },
};

export default function RecommendationsPage() {
  const { environment, user } = useAuth();
  const { toast } = useToast();
  
  const [inputMode, setInputMode] = useState<InputMode>("text");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const { data: myRecommendations = [], isLoading } = useQuery<ImprovementRecommendation[]>({
    queryKey: ["/api/recommendations", environment],
    queryFn: async () => {
      const res = await fetch(`/api/recommendations`, {
        headers: { "x-environment": environment }
      });
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; body: string; inputType: string; transcription?: string; mediaUrls?: string[] }) => {
      const res = await apiRequest("POST", "/api/recommendations", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations"] });
      toast({ title: "Feedback Submitted", description: "Thank you! We'll review your suggestion." });
      resetForm();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to submit feedback.", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setTitle("");
    setBody("");
    setSelectedFile(null);
    setInputMode("text");
  };

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach(track => track.stop());
        await processVoiceRecording(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      toast({ title: "Microphone Error", description: "Could not access microphone. Please check permissions.", variant: "destructive" });
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processVoiceRecording = async (audioBlob: Blob) => {
    setIsProcessing(true);
    try {
      const base64 = await blobToBase64(audioBlob);
      const res = await fetch("/api/capture/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-environment": environment },
        body: JSON.stringify({ type: "voice", data: base64 }),
      });
      const result = await res.json();
      if (result.transcription) {
        setBody(result.transcription);
        setTitle(result.transcription.slice(0, 100) + (result.transcription.length > 100 ? "..." : ""));
      }
    } catch (error) {
      toast({ title: "Processing Error", description: "Failed to process voice recording.", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setSelectedFile(file);
    setIsProcessing(true);
    
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch("/api/capture/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-environment": environment },
        body: JSON.stringify({ type: "image", data: base64, mimeType: file.type }),
      });
      const result = await res.json();
      if (result.extractedText) {
        setBody(result.extractedText);
        setTitle(result.extractedText.slice(0, 100) + (result.extractedText.length > 100 ? "..." : ""));
      }
    } catch (error) {
      toast({ title: "Processing Error", description: "Failed to process file.", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCameraCapture = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setSelectedFile(file);
    setIsProcessing(true);
    
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch("/api/capture/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-environment": environment },
        body: JSON.stringify({ type: "image", data: base64, mimeType: file.type }),
      });
      const result = await res.json();
      if (result.extractedText) {
        setBody(result.extractedText);
        setTitle(result.extractedText.slice(0, 100) + (result.extractedText.length > 100 ? "..." : ""));
      }
    } catch (error) {
      toast({ title: "Processing Error", description: "Failed to process image.", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = () => {
    if (!title.trim() || !body.trim()) {
      toast({ title: "Missing Information", description: "Please provide a title and description.", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      title: title.trim(),
      body: body.trim(),
      inputType: inputMode,
    });
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        resolve(base64.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        resolve(base64.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Lightbulb className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Share Your Ideas</h1>
          <p className="text-muted-foreground">Help us improve Divorce Ledger with your feedback</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Submit Feedback</CardTitle>
          <CardDescription>Share a feature request, bug report, or improvement suggestion</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={inputMode === "text" ? "default" : "outline"}
              size="sm"
              onClick={() => setInputMode("text")}
              data-testid="button-input-text"
            >
              <FileText className="h-4 w-4 mr-2" />
              Type
            </Button>
            <Button
              variant={inputMode === "voice" ? "default" : "outline"}
              size="sm"
              onClick={() => setInputMode("voice")}
              data-testid="button-input-voice"
            >
              <Mic className="h-4 w-4 mr-2" />
              Voice
            </Button>
            <Button
              variant={inputMode === "camera" ? "default" : "outline"}
              size="sm"
              onClick={() => setInputMode("camera")}
              data-testid="button-input-camera"
            >
              <Camera className="h-4 w-4 mr-2" />
              Camera
            </Button>
            <Button
              variant={inputMode === "file" ? "default" : "outline"}
              size="sm"
              onClick={() => setInputMode("file")}
              data-testid="button-input-file"
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </Button>
          </div>

          {inputMode === "voice" && (
            <div className="flex flex-col items-center gap-4 p-6 border rounded-lg bg-muted/30">
              {isRecording ? (
                <>
                  <div className="w-16 h-16 rounded-full bg-red-500 animate-pulse flex items-center justify-center">
                    <Mic className="h-8 w-8 text-white" />
                  </div>
                  <p className="text-sm text-muted-foreground">Recording... Click to stop</p>
                  <Button variant="destructive" onClick={stopVoiceRecording} data-testid="button-stop-recording">
                    <Square className="h-4 w-4 mr-2" />
                    Stop Recording
                  </Button>
                </>
              ) : isProcessing ? (
                <>
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Processing your voice...</p>
                </>
              ) : (
                <>
                  <Button onClick={startVoiceRecording} size="lg" data-testid="button-start-recording">
                    <Mic className="h-5 w-5 mr-2" />
                    Start Recording
                  </Button>
                  <p className="text-sm text-muted-foreground">Click to record your feedback</p>
                </>
              )}
            </div>
          )}

          {inputMode === "camera" && (
            <div className="flex flex-col items-center gap-4 p-6 border rounded-lg bg-muted/30">
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleCameraCapture}
              />
              {isProcessing ? (
                <>
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Analyzing image...</p>
                </>
              ) : (
                <>
                  <Button onClick={() => cameraInputRef.current?.click()} size="lg" data-testid="button-take-photo">
                    <Camera className="h-5 w-5 mr-2" />
                    Take Photo
                  </Button>
                  <p className="text-sm text-muted-foreground">Capture a screenshot or document</p>
                </>
              )}
            </div>
          )}

          {inputMode === "file" && (
            <div className="flex flex-col items-center gap-4 p-6 border rounded-lg bg-muted/30">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.txt"
                className="hidden"
                onChange={handleFileUpload}
              />
              {isProcessing ? (
                <>
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Processing file...</p>
                </>
              ) : selectedFile ? (
                <>
                  <p className="text-sm font-medium">{selectedFile.name}</p>
                  <Button variant="outline" onClick={() => fileInputRef.current?.click()} data-testid="button-change-file">
                    Choose Different File
                  </Button>
                </>
              ) : (
                <>
                  <Button onClick={() => fileInputRef.current?.click()} size="lg" data-testid="button-upload-file">
                    <Upload className="h-5 w-5 mr-2" />
                    Upload File
                  </Button>
                  <p className="text-sm text-muted-foreground">Upload an image or document</p>
                </>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="Brief summary of your feedback"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={500}
              data-testid="input-title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">Description</Label>
            <Textarea
              id="body"
              placeholder="Describe your idea, bug, or suggestion in detail..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-32 resize-none"
              maxLength={10000}
              data-testid="input-body"
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!title.trim() || !body.trim() || createMutation.isPending}
            className="w-full"
            data-testid="button-submit"
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Submit Feedback
          </Button>
        </CardContent>
      </Card>

      {myRecommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your Submissions</CardTitle>
            <CardDescription>Track the status of your feedback</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <div className="space-y-3">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  myRecommendations.map((rec) => {
                    const statusInfo = STATUS_CONFIG[rec.status] || STATUS_CONFIG.submitted;
                    const StatusIcon = statusInfo.icon;
                    return (
                      <div
                        key={rec.id}
                        className="flex items-start justify-between gap-3 p-3 border rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{rec.title}</p>
                          <p className="text-sm text-muted-foreground line-clamp-2">{rec.body}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(rec.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge variant={statusInfo.variant} className="shrink-0">
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {statusInfo.label}
                        </Badge>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
