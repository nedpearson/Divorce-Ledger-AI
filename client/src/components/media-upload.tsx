import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Camera, ImagePlus, Video, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MediaFile {
  id: string;
  file: File;
  preview: string;
  type: "image" | "video";
}

interface MediaUploadProps {
  onFilesChange: (files: File[]) => void;
  maxFiles?: number;
  maxVideoLength?: number;
  disabled?: boolean;
  className?: string;
  showWatermarkBadge?: boolean;
}

export function MediaUpload({
  onFilesChange,
  maxFiles = 10,
  maxVideoLength = -1,
  disabled = false,
  className,
  showWatermarkBadge = false,
}: MediaUploadProps) {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const addFile = useCallback((file: File, type: "image" | "video") => {
    const id = Math.random().toString(36).substring(2, 9);
    const preview = URL.createObjectURL(file);
    
    setFiles((prev) => {
      if (prev.length >= maxFiles) {
        setError(`Maximum ${maxFiles} files allowed`);
        return prev;
      }
      const newFiles = [...prev, { id, file, preview, type }];
      onFilesChange(newFiles.map(f => f.file));
      return newFiles;
    });
    setError(null);
  }, [maxFiles, onFilesChange]);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const file = prev.find(f => f.id === id);
      if (file) {
        URL.revokeObjectURL(file.preview);
      }
      const newFiles = prev.filter(f => f.id !== id);
      onFilesChange(newFiles.map(f => f.file));
      return newFiles;
    });
  }, [onFilesChange]);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (!selectedFiles) return;

    Array.from(selectedFiles).forEach((file) => {
      const type = file.type.startsWith("video/") ? "video" : "image";
      addFile(file, type);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [addFile]);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsCapturing(true);
    } catch (err) {
      setError("Camera access denied");
    }
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !streamRef.current) return;

    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
          addFile(file, "image");
        }
      }, "image/jpeg", 0.9);
    }

    stopCamera();
  }, [addFile]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCapturing(false);
  }, []);

  const startVideoRecording = useCallback(async () => {
    setError(null);
    videoChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: true,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          videoChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const videoBlob = new Blob(videoChunksRef.current, { type: "video/webm" });
        const file = new File([videoBlob], `video-${Date.now()}.webm`, { type: "video/webm" });
        addFile(file, "video");
        stopCamera();
      };

      mediaRecorder.start(1000);
      setIsRecordingVideo(true);

      if (maxVideoLength > 0) {
        recordingTimerRef.current = setTimeout(() => {
          stopVideoRecording();
        }, maxVideoLength * 1000);
      }
    } catch (err) {
      setError("Camera/microphone access denied");
    }
  }, [addFile, maxVideoLength]);

  const stopVideoRecording = useCallback(() => {
    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecordingVideo(false);
  }, []);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || files.length >= maxFiles}
          data-testid="button-gallery-upload"
        >
          <ImagePlus className="h-4 w-4 mr-2" />
          Gallery
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={isCapturing ? capturePhoto : startCamera}
          disabled={disabled || files.length >= maxFiles || isRecordingVideo}
          data-testid="button-camera-capture"
        >
          {isCapturing ? (
            <>
              <Camera className="h-4 w-4 mr-2" />
              Take Photo
            </>
          ) : (
            <>
              <Camera className="h-4 w-4 mr-2" />
              Camera
            </>
          )}
        </Button>

        <Button
          type="button"
          variant={isRecordingVideo ? "destructive" : "outline"}
          size="sm"
          onClick={isRecordingVideo ? stopVideoRecording : startVideoRecording}
          disabled={disabled || files.length >= maxFiles || isCapturing}
          data-testid="button-video-record"
        >
          {isRecordingVideo ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Stop Recording
            </>
          ) : (
            <>
              <Video className="h-4 w-4 mr-2" />
              Video
              {maxVideoLength > 0 && (
                <span className="text-xs ml-1 text-muted-foreground">
                  ({maxVideoLength}s max)
                </span>
              )}
            </>
          )}
        </Button>

        {isCapturing && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={stopCamera}
            data-testid="button-cancel-camera"
          >
            Cancel
          </Button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          data-testid="input-file-upload"
        />
      </div>

      {(isCapturing || isRecordingVideo) && (
        <div className="relative rounded-md overflow-hidden bg-black">
          <video
            ref={videoRef}
            className="w-full max-h-64 object-contain"
            autoPlay
            muted={!isRecordingVideo}
            playsInline
          />
          {isRecordingVideo && (
            <div className="absolute top-2 left-2 flex items-center gap-2 bg-destructive text-white px-2 py-1 rounded text-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
              </span>
              Recording
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive" data-testid="text-media-error">{error}</p>
      )}

      {files.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {files.map((file) => (
            <div
              key={file.id}
              className="relative aspect-square rounded-md overflow-hidden bg-muted group"
              data-testid={`media-preview-${file.id}`}
            >
              {file.type === "image" ? (
                <img
                  src={file.preview}
                  alt="Preview"
                  className="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <video
                  src={file.preview}
                  className="w-full h-full object-cover"
                  preload="metadata"
                />
              )}

              {showWatermarkBadge && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs text-center py-0.5">
                  Watermarked
                </div>
              )}

              <button
                type="button"
                onClick={() => removeFile(file.id)}
                className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                data-testid={`button-remove-media-${file.id}`}
              >
                <X className="h-3 w-3" />
              </button>

              {file.type === "video" && (
                <div className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-1 rounded">
                  Video
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {files.length}/{maxFiles} files
        {showWatermarkBadge && " (Free tier: images will be watermarked)"}
      </p>
    </div>
  );
}
