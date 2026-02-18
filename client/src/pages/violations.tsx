import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Violation } from "@shared/schema";
import { VoiceInputButton } from "@/components/voice-recorder";
import { FeedbackCTA } from "@/components/feedback-cta";

interface UploadedFile {
  name: string;
  type: string;
  size: number;
  objectPath: string;
}
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  Plus,
  Camera,
  MapPin,
  Clock,
  CheckCircle,
  XCircle,
  FileText,
  Send,
  Trash2,
  Image,
  Video,
  Users,
  Save,
  Mic,
  Upload,
  X,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const violationTypes = [
  { value: "custody", label: "Custody Violation" },
  { value: "financial_hiding", label: "Financial Hiding" },
  { value: "property_damage", label: "Property Damage" },
  { value: "child_neglect", label: "Child Neglect" },
  { value: "court_order", label: "Court Order Violation" },
  { value: "harassment", label: "Harassment" },
  { value: "other", label: "Other" },
];

const violationFormSchema = z.object({
  type: z.string().min(1, "Select a violation type"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  location: z.string().optional(),
  witnesses: z.array(z.string()).optional(),
});

type ViolationFormValues = z.infer<typeof violationFormSchema>;

export default function Violations() {
  const { environment } = useAuth();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [witnessInputs, setWitnessInputs] = useState<string[]>([""]);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-open report dialog if action=report query param is present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("action") === "report") {
      // Use setTimeout to ensure state is set before navigation
      setIsDialogOpen(true);
      // Clear the query param after a brief delay to prevent re-opening on refresh
      setTimeout(() => {
        window.history.replaceState({}, "", "/violations");
      }, 100);
    }
  }, []);

  const { data: violations, isLoading } = useQuery<Violation[]>({
    queryKey: ["/api", "violations", { environment }],
  });

  interface SubscriptionData {
    tier: string;
    usage: {
      violationsCountThisMonth: number;
      remainingViolations: number | string;
      voiceTranscriptionsThisMonth: number;
      mediaUploadsThisMonth: number;
      remainingVoice: number | string;
      remainingMedia: number | string;
    };
  }

  const { data: subscription } = useQuery<SubscriptionData>({
    queryKey: ["/api/subscription"],
  });

  const form = useForm<ViolationFormValues>({
    resolver: zodResolver(violationFormSchema),
    defaultValues: {
      type: "",
      description: "",
      location: "",
      witnesses: [],
    },
  });

  const resetFormState = () => {
    form.reset();
    setUploadedFiles([]);
    setWitnessInputs([""]);
    setVoiceTranscript("");
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    setIsUploading(true);
    const newFiles: UploadedFile[] = [];
    
    for (const file of Array.from(files)) {
      try {
        // Request presigned URL
        const urlResponse = await fetch("/api/uploads/request-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: file.name,
            size: file.size,
            contentType: file.type,
          }),
        });
        
        if (!urlResponse.ok) {
          throw new Error("Failed to get upload URL");
        }
        
        const { uploadURL, objectPath } = await urlResponse.json();
        
        // Upload file directly to storage
        const uploadResponse = await fetch(uploadURL, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });
        
        if (!uploadResponse.ok) {
          throw new Error("Failed to upload file");
        }
        
        newFiles.push({
          name: file.name,
          type: file.type,
          size: file.size,
          objectPath,
        });
        
        toast({ title: `Uploaded: ${file.name}` });
      } catch (error) {
        toast({ title: `Failed to upload ${file.name}`, variant: "destructive" });
      }
    }
    
    setUploadedFiles(prev => [...prev, ...newFiles]);
    setIsUploading(false);
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const createMutation = useMutation({
    mutationFn: async (data: ViolationFormValues & { isDraft?: boolean }) => {
      const witnesses = witnessInputs.filter(w => w.trim() !== "");
      const photoFiles = uploadedFiles.filter(f => f.type.startsWith("image/"));
      const videoFiles = uploadedFiles.filter(f => f.type.startsWith("video/"));
      const payload = {
        ...data,
        witnesses: witnesses.length > 0 ? witnesses : undefined,
        photoCount: photoFiles.length,
        videoDuration: videoFiles.length > 0 ? 1 : null,
        mediaUrls: uploadedFiles.map(f => f.objectPath),
        isDraft: data.isDraft || false,
        audioTranscript: voiceTranscript || undefined,
      };
      
      // Create the violation first
      const response = await apiRequest("POST", `/api/violations?environment=${environment}`, payload);
      const violation = await response.json() as Violation;
      
      // Save evidence files with metadata for each uploaded file
      for (const file of uploadedFiles) {
        await apiRequest("POST", `/api/evidence?environment=${environment}`, {
          violationId: violation.id,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          objectPath: file.objectPath,
        });
      }
      
      return violation;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api", "violations", { environment }] });
      toast({ title: variables.isDraft ? "Draft saved" : "Violation documented successfully" });
      resetFormState();
      setIsDialogOpen(false);
    },
    onError: async (error: Error & { response?: Response }) => {
      try {
        if (error.response) {
          const data = await error.response.json() as { error?: string; reason?: string; upgradeRequired?: boolean };
          if (data.upgradeRequired) {
            toast({ 
              title: data.error || "Limit reached", 
              description: data.reason || "Please upgrade your plan to continue.",
              variant: "destructive" 
            });
            return;
          }
        }
      } catch {
        // Ignore parsing errors
      }
      toast({ title: "Failed to document violation", variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/violations/${id}/status?environment=${environment}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api", "violations", { environment }] });
      toast({ title: "Status updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/violations/${id}?environment=${environment}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api", "violations", { environment }] });
      toast({ title: "Violation deleted" });
    },
  });

  const onSubmit = (data: ViolationFormValues, isDraft = false) => {
    createMutation.mutate({ ...data, isDraft });
  };

  const handleSaveAsDraft = () => {
    const values = form.getValues();
    if (values.type && values.description.length >= 10) {
      onSubmit(values, true);
    } else {
      toast({ title: "Please fill in required fields before saving", variant: "destructive" });
    }
  };

  const addWitnessField = () => {
    setWitnessInputs([...witnessInputs, ""]);
  };

  const updateWitness = (index: number, value: string) => {
    const updated = [...witnessInputs];
    updated[index] = value;
    setWitnessInputs(updated);
  };

  const photoFiles = uploadedFiles.filter(f => f.type.startsWith("image/"));
  const videoFiles = uploadedFiles.filter(f => f.type.startsWith("video/"));

  const getStatusBadge = (status: string, isDraft?: boolean | null) => {
    if (isDraft) {
      return <Badge variant="outline" className="border-dashed">Draft</Badge>;
    }
    switch (status) {
      case "pending":
        return <Badge variant="secondary">Pending Review</Badge>;
      case "reviewed":
        return <Badge variant="outline">Reviewed</Badge>;
      case "approved":
        return <Badge className="bg-green-600 text-white">Approved</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getTypeLabel = (type: string) => {
    return violationTypes.find((t) => t.value === type)?.label || type;
  };

  const filteredViolations = useMemo(() => violations?.filter((v) => {
    if (activeTab === "all") return true;
    if (activeTab === "drafts") return v.isDraft === true;
    return v.status === activeTab && !v.isDraft;
  }), [violations, activeTab]);

  const stats = useMemo(() => ({
    total: violations?.length || 0,
    pending: violations?.filter((v) => v.status === "pending" && !v.isDraft).length || 0,
    reviewed: violations?.filter((v) => v.status === "reviewed").length || 0,
    approved: violations?.filter((v) => v.status === "approved").length || 0,
    drafts: violations?.filter((v) => v.isDraft).length || 0,
  }), [violations]);

  return (
    <div className="p-4 md:p-6 space-y-4 pb-24 md:pb-6" data-testid="page-violations">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Document Violations</h1>
          <p className="text-sm text-muted-foreground">
            Record and track court order violations with timestamped evidence
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-violation">
              <Plus className="h-4 w-4 mr-2" />
              Document Violation
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Document New Violation
              </DialogTitle>
              {subscription && (
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
                  <span data-testid="text-remaining-voice">
                    Voice: {subscription.usage.remainingVoice === "unlimited" ? "Unlimited" : `${subscription.usage.remainingVoice} left`}
                  </span>
                  <span data-testid="text-remaining-media">
                    Media: {subscription.usage.remainingMedia === "unlimited" ? "Unlimited" : `${subscription.usage.remainingMedia} left`}
                  </span>
                </div>
              )}
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => onSubmit(data, false))} className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground border rounded-md p-2 bg-muted/30">
                  <Clock className="h-4 w-4" />
                  <span>{format(new Date(), "MMM d, yyyy h:mm a")} (Auto-filled)</span>
                </div>

                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Violation Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-violation-type">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {violationTypes.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-2">
                  <FormLabel>Evidence</FormLabel>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    multiple
                    accept="image/*,video/*"
                    onChange={(e) => handleFileUpload(e.target.files)}
                    data-testid="input-file"
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      data-testid="button-upload"
                    >
                      <Upload className="h-4 w-4 mr-1" />
                      {isUploading ? "Uploading..." : "Upload Files"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*';
                        input.capture = 'environment';
                        input.onchange = (e) => {
                          const files = (e.target as HTMLInputElement).files;
                          if (files) handleFileUpload(files);
                        };
                        input.click();
                      }}
                      disabled={isUploading}
                      data-testid="button-camera"
                    >
                      <Camera className="h-4 w-4 mr-1" />
                      Camera
                    </Button>
                    {photoFiles.length > 0 && (
                      <Badge variant="secondary" className="gap-1">
                        <Image className="h-3 w-3" />
                        {photoFiles.length} {photoFiles.length === 1 ? "image" : "images"}
                      </Badge>
                    )}
                    {videoFiles.length > 0 && (
                      <Badge variant="secondary" className="gap-1">
                        <Video className="h-3 w-3" />
                        {videoFiles.length} {videoFiles.length === 1 ? "video" : "videos"}
                      </Badge>
                    )}
                  </div>
                  {uploadedFiles.length > 0 && (
                    <div className="space-y-1 pt-1">
                      {uploadedFiles.map((file, index) => (
                        <div key={index} className="flex items-center justify-between text-sm bg-muted/50 rounded px-2 py-1">
                          <span className="flex items-center gap-2 truncate">
                            {file.type.startsWith("image/") ? (
                              <Image className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            ) : (
                              <Video className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            )}
                            <span className="truncate">{file.name}</span>
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeFile(index)}
                            data-testid={`button-remove-file-${index}`}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {uploadedFiles.length > 0 && (
                    <div className="text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        {uploadedFiles.length} {uploadedFiles.length === 1 ? "file" : "files"} uploaded
                      </span>
                    </div>
                  )}
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        Description
                        <span className="text-xs text-muted-foreground">(or use voice)</span>
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Textarea
                            placeholder='e.g., "He picked up 30 min late..." or click the mic to speak'
                            className="min-h-[80px] pr-10"
                            data-testid="input-violation-description"
                            {...field}
                          />
                          <div className="absolute right-2 top-2">
                            <VoiceInputButton
                              onTranscript={(text) => {
                                const current = field.value || "";
                                field.onChange(current ? `${current} ${text}` : text);
                                setVoiceTranscript(prev => prev ? `${prev} ${text}` : text);
                              }}
                            />
                          </div>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location (Optional)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Enter location"
                            className="pl-9"
                            data-testid="input-violation-location"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-2">
                  <FormLabel className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Witnesses (Optional)
                  </FormLabel>
                  {witnessInputs.map((witness, index) => (
                    <Input
                      key={index}
                      placeholder={`Witness ${index + 1} name`}
                      value={witness}
                      onChange={(e) => updateWitness(index, e.target.value)}
                      data-testid={`input-witness-${index}`}
                    />
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={addWitnessField}
                    data-testid="button-add-witness"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add another witness
                  </Button>
                </div>

                <div className="flex justify-between gap-2 pt-2 flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSaveAsDraft}
                    disabled={createMutation.isPending}
                    data-testid="button-save-draft"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Save as Draft
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        resetFormState();
                        setIsDialogOpen(false);
                      }}
                      data-testid="button-cancel-violation"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={createMutation.isPending}
                      data-testid="button-submit-violation"
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Submit
                    </Button>
                  </div>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{stats.pending}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{stats.reviewed}</p>
                <p className="text-xs text-muted-foreground">Reviewed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{stats.approved}</p>
                <p className="text-xs text-muted-foreground">Approved</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="p-3 pb-0">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex-wrap">
              <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
              <TabsTrigger value="drafts" data-testid="tab-drafts">Drafts ({stats.drafts})</TabsTrigger>
              <TabsTrigger value="pending" data-testid="tab-pending">Pending</TabsTrigger>
              <TabsTrigger value="reviewed" data-testid="tab-reviewed">Reviewed</TabsTrigger>
              <TabsTrigger value="approved" data-testid="tab-approved">Approved</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="p-3">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : filteredViolations && filteredViolations.length > 0 ? (
            <div className="space-y-3">
              {filteredViolations.map((violation) => (
                <div
                  key={violation.id}
                  className="border rounded-md p-3 space-y-2"
                  data-testid={`violation-card-${violation.id}`}
                >
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline">{getTypeLabel(violation.type)}</Badge>
                      {getStatusBadge(violation.status, violation.isDraft)}
                    </div>
                    <div className="flex items-center gap-1">
                      {violation.status === "pending" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              updateStatusMutation.mutate({
                                id: violation.id,
                                status: "reviewed",
                              })
                            }
                            data-testid={`button-review-${violation.id}`}
                          >
                            Mark Reviewed
                          </Button>
                          <Button
                            size="sm"
                            onClick={() =>
                              updateStatusMutation.mutate({
                                id: violation.id,
                                status: "approved",
                              })
                            }
                            data-testid={`button-approve-${violation.id}`}
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Approve
                          </Button>
                        </>
                      )}
                      {violation.status === "reviewed" && (
                        <Button
                          size="sm"
                          onClick={() =>
                            updateStatusMutation.mutate({
                              id: violation.id,
                              status: "approved",
                            })
                          }
                          data-testid={`button-approve-${violation.id}`}
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Approve
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(violation.id)}
                        data-testid={`button-delete-${violation.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm">{violation.description}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(violation.timestamp), "MMM d, yyyy h:mm a")}
                    </span>
                    {violation.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {violation.location}
                      </span>
                    )}
                    {violation.photoCount && violation.photoCount > 0 && (
                      <span className="flex items-center gap-1">
                        <Image className="h-3 w-3" />
                        {violation.photoCount} {violation.photoCount === 1 ? "photo" : "photos"}
                      </span>
                    )}
                    {violation.videoDuration && (
                      <span className="flex items-center gap-1">
                        <Video className="h-3 w-3" />
                        {violation.videoDuration}s video
                      </span>
                    )}
                    {violation.witnesses && violation.witnesses.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {violation.witnesses.length} {violation.witnesses.length === 1 ? "witness" : "witnesses"}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No violations documented yet</p>
              <p className="text-sm">Click "Document Violation" to add one</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-center pt-4">
        <FeedbackCTA />
      </div>
    </div>
  );
}
