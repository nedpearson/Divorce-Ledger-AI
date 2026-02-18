import { useState, useRef, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Upload, X, FileText, CheckCircle2, Loader2, AlertCircle } from "lucide-react";

interface UploadedFile {
  id: string;
  ownerId: string;
  storageFileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  hash: string;
  status: string;
  createdAt: string;
}

interface AppwriteCategory {
  $id: string;
  name: string;
  displayName: string;
  description?: string;
}

interface FileUploadProps {
  onUploadComplete?: (file: UploadedFile) => void;
  className?: string;
}

export function AppwriteFileUpload({ onUploadComplete, className }: FileUploadProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<"idle" | "preparing" | "uploading" | "processing" | "complete" | "error">("idle");
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [isConfidential, setIsConfidential] = useState(false);

  const { data: categoriesData } = useQuery<{ categories: AppwriteCategory[] }>({
    queryKey: ["/api/appwrite/categories"],
  });

  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      return new Promise<UploadedFile>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(percentComplete);
            if (percentComplete < 100) {
              setUploadPhase("uploading");
            } else {
              setUploadPhase("processing");
            }
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              if (response.success) {
                resolve(response.file);
              } else {
                reject(new Error(response.error || "Upload failed"));
              }
            } catch {
              reject(new Error("Invalid response from server"));
            }
          } else {
            try {
              const errorResponse = JSON.parse(xhr.responseText);
              reject(new Error(errorResponse.error || `Upload failed: ${xhr.status}`));
            } catch {
              reject(new Error(`Upload failed: ${xhr.status}`));
            }
          }
        });

        xhr.addEventListener("error", () => {
          reject(new Error("Network error during upload"));
        });

        xhr.open("POST", "/api/appwrite/files/upload");
        xhr.send(formData);
      });
    },
    onSuccess: (file) => {
      setUploadPhase("complete");
      toast({
        title: "Upload Complete",
        description: `${file.fileName} has been uploaded successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/appwrite/files"] });
      onUploadComplete?.(file);
      
      setTimeout(() => {
        resetUpload();
        setDialogOpen(false);
      }, 1500);
    },
    onError: (error: Error) => {
      setUploadPhase("error");
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setTitle(file.name.replace(/\.[^/.]+$/, ""));
      setDialogOpen(true);
    }
  }, []);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      setTitle(file.name.replace(/\.[^/.]+$/, ""));
      setDialogOpen(true);
    }
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const handleUpload = () => {
    if (!selectedFile) return;

    setUploadPhase("preparing");
    setUploadProgress(0);

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("title", title || selectedFile.name);
    if (description) formData.append("description", description);
    if (category) formData.append("category", category);
    formData.append("isConfidential", String(isConfidential));

    uploadMutation.mutate(formData);
  };

  const resetUpload = () => {
    setSelectedFile(null);
    setUploadProgress(0);
    setUploadPhase("idle");
    setTitle("");
    setDescription("");
    setCategory("");
    setIsConfidential(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getPhaseText = () => {
    switch (uploadPhase) {
      case "preparing": return "Preparing...";
      case "uploading": return `Uploading: ${uploadProgress}%`;
      case "processing": return "Processing...";
      case "complete": return "Complete!";
      case "error": return "Upload failed";
      default: return "";
    }
  };

  return (
    <div className={className}>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelect}
        accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt"
        data-testid="input-file-select"
      />

      <Card
        className="border-2 border-dashed cursor-pointer transition-colors hover-elevate"
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        data-testid="card-drop-zone"
      >
        <CardContent className="flex flex-col items-center justify-center py-8 gap-3">
          <Upload className="h-10 w-10 text-muted-foreground" />
          <div className="text-center">
            <p className="font-medium">Drop a file here or click to upload</p>
            <p className="text-sm text-muted-foreground">
              PDF, images, spreadsheets, or documents up to 50MB
            </p>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        if (!open && uploadPhase !== "uploading" && uploadPhase !== "processing") {
          resetUpload();
        }
        setDialogOpen(open);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>

          {selectedFile && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-muted rounded-md">
                <FileText className="h-8 w-8 text-primary" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{selectedFile.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>
                {uploadPhase === "idle" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={resetUpload}
                    data-testid="button-remove-file"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {uploadPhase !== "idle" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>{getPhaseText()}</span>
                    {uploadPhase === "complete" && (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    )}
                    {uploadPhase === "error" && (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    )}
                    {(uploadPhase === "uploading" || uploadPhase === "processing" || uploadPhase === "preparing") && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                  </div>
                  <Progress value={uploadPhase === "complete" ? 100 : uploadProgress} />
                </div>
              )}

              {uploadPhase === "idle" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="title">Title</Label>
                    <Input
                      id="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Document title"
                      data-testid="input-document-title"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger data-testid="select-category">
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categoriesData?.categories.map((cat) => (
                          <SelectItem key={cat.$id} value={cat.name}>
                            {cat.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description (optional)</Label>
                    <Input
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Brief description of the document"
                      data-testid="input-document-description"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="confidential"
                      checked={isConfidential}
                      onCheckedChange={(checked) => setIsConfidential(checked === true)}
                      data-testid="checkbox-confidential"
                    />
                    <Label htmlFor="confidential" className="text-sm cursor-pointer">
                      Mark as confidential
                    </Label>
                  </div>
                </>
              )}
            </div>
          )}

          <DialogFooter>
            {uploadPhase === "idle" && (
              <>
                <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel-upload">
                  Cancel
                </Button>
                <Button onClick={handleUpload} disabled={!selectedFile} data-testid="button-start-upload">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </Button>
              </>
            )}
            {uploadPhase === "error" && (
              <Button onClick={handleUpload} data-testid="button-retry-upload">
                Retry Upload
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
