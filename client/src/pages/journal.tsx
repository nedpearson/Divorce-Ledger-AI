import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  Mic,
  MicOff,
  Camera,
  FileUp,
  Save,
  Trash2,
  Edit,
  BookOpen,
  Calendar,
  Clock,
  Loader2,
  ChevronLeft,
  X,
  ImageIcon,
  FileText,
  Download,
} from "lucide-react";

interface JournalEntry {
  id: string;
  userId: string;
  environment: string;
  title: string;
  content: string;
  mood: string | null;
  tags: string[] | null;
  inputType: string | null;
  voiceTranscription: string | null;
  createdAt: string;
  updatedAt: string;
}

interface JournalAttachment {
  id: string;
  journalEntryId: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
}

const moodOptions = [
  { value: "hopeful", label: "Hopeful", color: "bg-green-500/10 text-green-600" },
  { value: "anxious", label: "Anxious", color: "bg-yellow-500/10 text-yellow-600" },
  { value: "sad", label: "Sad", color: "bg-blue-500/10 text-blue-600" },
  { value: "angry", label: "Angry", color: "bg-red-500/10 text-red-600" },
  { value: "calm", label: "Calm", color: "bg-cyan-500/10 text-cyan-600" },
  { value: "stressed", label: "Stressed", color: "bg-orange-500/10 text-orange-600" },
  { value: "grateful", label: "Grateful", color: "bg-purple-500/10 text-purple-600" },
  { value: "neutral", label: "Neutral", color: "bg-gray-500/10 text-gray-600" },
];

export default function JournalPage() {
  const { toast } = useToast();
  const [isNewEntryOpen, setIsNewEntryOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [mood, setMood] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Fetch journal entries
  const { data: entries = [], isLoading } = useQuery<JournalEntry[]>({
    queryKey: ["/api/journal"],
  });

  // Create entry mutation
  const createMutation = useMutation({
    mutationFn: async (data: Partial<JournalEntry>) => {
      const response = await apiRequest("POST", "/api/journal", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/journal"] });
      resetForm();
      setIsNewEntryOpen(false);
      toast({ title: "Entry saved", description: "Your journal entry has been saved." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Update entry mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<JournalEntry> }) => {
      const response = await apiRequest("PATCH", `/api/journal/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/journal"] });
      setIsEditing(false);
      toast({ title: "Entry updated", description: "Your journal entry has been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Delete entry mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/journal/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/journal"] });
      setSelectedEntry(null);
      toast({ title: "Entry deleted", description: "Your journal entry has been deleted." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setTitle("");
    setContent("");
    setMood(null);
    setTags([]);
    setTagInput("");
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach(track => track.stop());
        await transcribeAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      toast({
        title: "Microphone access denied",
        description: "Please allow microphone access to use voice recording.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(",")[1];
        const response = await apiRequest("POST", "/api/journal/transcribe", {
          audioData: base64Audio,
          mimeType: "audio/webm",
        });
        const { transcription } = await response.json();
        setContent(prev => prev + (prev ? "\n\n" : "") + transcription);
        setIsTranscribing(false);
        toast({ title: "Transcription complete", description: "Voice note has been transcribed." });
      };
    } catch (error) {
      setIsTranscribing(false);
      toast({
        title: "Transcription failed",
        description: "Could not transcribe the audio. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      toast({
        title: "File attached",
        description: `${file.name} will be attached to this entry.`,
      });
    }
  };

  const handleCameraCapture = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        toast({
          title: "Photo captured",
          description: "Photo will be attached to this entry.",
        });
      }
    };
    input.click();
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const handleSave = () => {
    if (!title.trim()) {
      toast({ title: "Title required", description: "Please enter a title for your entry.", variant: "destructive" });
      return;
    }
    if (!content.trim()) {
      toast({ title: "Content required", description: "Please enter some content for your entry.", variant: "destructive" });
      return;
    }
    createMutation.mutate({ title, content, mood, tags: tags.length > 0 ? tags : null });
  };

  const handleUpdate = () => {
    if (!selectedEntry) return;
    updateMutation.mutate({
      id: selectedEntry.id,
      data: { title, content, mood, tags: tags.length > 0 ? tags : null },
    });
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this entry? This cannot be undone.")) {
      deleteMutation.mutate(id);
    }
  };

  const getMoodConfig = (moodValue: string | null) => {
    return moodOptions.find(m => m.value === moodValue) || moodOptions[7];
  };

  // When viewing/editing an entry
  useEffect(() => {
    if (selectedEntry && isEditing) {
      setTitle(selectedEntry.title);
      setContent(selectedEntry.content);
      setMood(selectedEntry.mood);
      setTags(selectedEntry.tags || []);
    }
  }, [selectedEntry, isEditing]);

  const exportData = () => {
    if (!entries || entries.length === 0) return;
    const headers = ["Date", "Time", "Title", "Mood", "Tags", "Content"];
    const csvContent = [
      headers.join(","),
      ...entries.map(e => {
        const moodConfig = getMoodConfig(e.mood);
        return [
          format(new Date(e.createdAt), "yyyy-MM-dd"),
          format(new Date(e.createdAt), "HH:mm:ss"),
          `"${e.title.replace(/"/g, '""')}"`,
          moodConfig.label,
          `"${(e.tags || []).join("; ").replace(/"/g, '""')}"`,
          `"${e.content.replace(/"/g, '""')}"`
        ].join(",");
      })
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `journal_entries_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Personal Journal</h1>
            <p className="text-muted-foreground text-sm">Document your thoughts and experiences</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportData} disabled={entries.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
          <Dialog open={isNewEntryOpen} onOpenChange={setIsNewEntryOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-entry" className="gap-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">New Entry</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>New Journal Entry</DialogTitle>
                <DialogDescription>Record your thoughts, feelings, or events.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <Input
                  data-testid="input-entry-title"
                  placeholder="Entry title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />

                {/* Voice/Camera/File controls */}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={isRecording ? "destructive" : "outline"}
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isTranscribing}
                    data-testid="button-voice-record"
                  >
                    {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    <span className="ml-1">{isRecording ? "Stop" : "Voice"}</span>
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={handleCameraCapture} data-testid="button-camera">
                    <Camera className="h-4 w-4" />
                    <span className="ml-1">Camera</span>
                  </Button>
                  <label>
                    <Button type="button" size="sm" variant="outline" asChild data-testid="button-file-upload">
                      <span>
                        <FileUp className="h-4 w-4" />
                        <span className="ml-1">File</span>
                      </span>
                    </Button>
                    <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*,video/*,audio/*,.pdf,.doc,.docx" />
                  </label>
                </div>

                {isTranscribing && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Transcribing voice note...
                  </div>
                )}

                <Textarea
                  data-testid="input-entry-content"
                  placeholder="Write about your day, feelings, or events..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="min-h-[200px]"
                />

                {/* Mood selection */}
                <div>
                  <label className="text-sm font-medium mb-2 block">How are you feeling?</label>
                  <div className="flex flex-wrap gap-2">
                    {moodOptions.map((m) => (
                      <Button
                        key={m.value}
                        type="button"
                        size="sm"
                        variant={mood === m.value ? "default" : "outline"}
                        onClick={() => setMood(mood === m.value ? null : m.value)}
                        className={mood === m.value ? "bg-primary" : ""}
                        data-testid={`button-mood-${m.value}`}
                      >
                        {m.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Tags</label>
                  <div className="flex gap-2 mb-2">
                    <Input
                      placeholder="Add a tag..."
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
                      data-testid="input-tag"
                    />
                    <Button type="button" size="sm" onClick={handleAddTag} data-testid="button-add-tag">
                      Add
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="gap-1">
                        {tag}
                        <X className="h-3 w-3 cursor-pointer" onClick={() => handleRemoveTag(tag)} />
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { resetForm(); setIsNewEntryOpen(false); }} data-testid="button-cancel">
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={createMutation.isPending} data-testid="button-save-entry">
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Entry
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Entries Grid */}
      {entries.length === 0 ? (
        <Card className="p-12 text-center">
          <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No journal entries yet</h3>
          <p className="text-muted-foreground mb-4">Start documenting your thoughts and experiences</p>
          <Button onClick={() => setIsNewEntryOpen(true)} data-testid="button-create-first-entry">
            <Plus className="h-4 w-4 mr-2" />
            Create Your First Entry
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {entries.map((entry) => {
            const moodConfig = getMoodConfig(entry.mood);
            return (
              <Card
                key={entry.id}
                className="cursor-pointer hover-elevate transition-all"
                onClick={() => setSelectedEntry(entry)}
                data-testid={`card-entry-${entry.id}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg line-clamp-1">{entry.title}</CardTitle>
                    {entry.mood && (
                      <Badge variant="secondary" className={moodConfig.color}>
                        {moodConfig.label}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(entry.createdAt), "MMM d, yyyy")}
                    <Clock className="h-3 w-3 ml-2" />
                    {format(new Date(entry.createdAt), "h:mm a")}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-3">{entry.content}</p>
                  {entry.tags && entry.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {entry.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                      {entry.tags.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{entry.tags.length - 3}
                        </Badge>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Entry Detail Dialog */}
      <Dialog open={!!selectedEntry} onOpenChange={(open) => !open && (setSelectedEntry(null), setIsEditing(false))}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedEntry && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-2">
                  {isEditing ? (
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="text-lg font-semibold"
                      data-testid="input-edit-title"
                    />
                  ) : (
                    <DialogTitle className="text-xl">{selectedEntry.title}</DialogTitle>
                  )}
                </div>
                <DialogDescription className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {format(new Date(selectedEntry.createdAt), "MMMM d, yyyy 'at' h:mm a")}
                  {selectedEntry.mood && (
                    <Badge variant="secondary" className={`ml-2 ${getMoodConfig(selectedEntry.mood).color}`}>
                      {getMoodConfig(selectedEntry.mood).label}
                    </Badge>
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                {isEditing ? (
                  <div className="space-y-4">
                    <Textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      className="min-h-[200px]"
                      data-testid="input-edit-content"
                    />
                    <div>
                      <label className="text-sm font-medium mb-2 block">Mood</label>
                      <div className="flex flex-wrap gap-2">
                        {moodOptions.map((m) => (
                          <Button
                            key={m.value}
                            type="button"
                            size="sm"
                            variant={mood === m.value ? "default" : "outline"}
                            onClick={() => setMood(mood === m.value ? null : m.value)}
                          >
                            {m.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{selectedEntry.content}</p>
                )}
                {!isEditing && selectedEntry.tags && selectedEntry.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-4">
                    {selectedEntry.tags.map((tag) => (
                      <Badge key={tag} variant="outline">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <DialogFooter className="gap-2">
                {isEditing ? (
                  <>
                    <Button variant="outline" onClick={() => setIsEditing(false)} data-testid="button-cancel-edit">
                      Cancel
                    </Button>
                    <Button onClick={handleUpdate} disabled={updateMutation.isPending} data-testid="button-save-edit">
                      {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                      Save Changes
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="destructive" onClick={() => handleDelete(selectedEntry.id)} disabled={deleteMutation.isPending} data-testid="button-delete-entry">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                    <Button variant="outline" onClick={() => setIsEditing(true)} data-testid="button-edit-entry">
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
