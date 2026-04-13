import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { format, isValid } from 'date-fns';

const safeFormat = (dateValue: any, formatStr: string) => {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  return isValid(date) ? format(date, formatStr) : '';
};

import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  MessageSquare,
  Send,
  Plus,
  Users,
  FileText,
  AlertTriangle,
  BarChart3,
  Loader2,
  ChevronLeft,
  UserPlus,
  Scale,
  Gavel,
  HeartPulse,
  X,
  Download,
  Mic,
  MicOff,
  Camera,
} from 'lucide-react';

interface Participant {
  id: string;
  conversationId: string;
  userId: string | null;
  email: string;
  displayName: string;
  role: string;
  status: string;
  joinedAt: string;
  leftAt: string | null;
}

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderEmail: string;
  senderName: string;
  content: string;
  inputType: string | null;
  voiceTranscription: string | null;
  sentimentScore: number | null;
  sentimentLabel: string | null;
  hasNegativeContent: boolean | null;
  negativeTopics: string[] | null;
  isEdited: boolean;
  editedAt: string | null;
  isDeleted: boolean;
  createdAt: string;
}

interface Conversation {
  id: string;
  creatorUserId: string;
  environment: string;
  title: string;
  type: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  participants?: Participant[];
  messages?: Message[];
}

interface SentimentReport {
  id: string;
  conversationId: string;
  title: string;
  reportType: string;
  totalMessagesAnalyzed: number;
  negativeMessageCount: number;
  summary: string;
  recommendations: string;
  topicBreakdown: Record<string, any[]>;
  participantBreakdown: Record<string, { negativeCount: number; topics: string[] }>;
  status: string;
  createdAt: string;
}

const roleIcons: Record<string, React.ReactNode> = {
  party: <Users className="h-4 w-4" />,
  attorney: <Scale className="h-4 w-4" />,
  mediator: <Gavel className="h-4 w-4" />,
  therapist: <HeartPulse className="h-4 w-4" />,
};

const roleColors: Record<string, string> = {
  party: 'bg-blue-500/10 text-blue-600',
  attorney: 'bg-purple-500/10 text-purple-600',
  mediator: 'bg-green-500/10 text-green-600',
  therapist: 'bg-pink-500/10 text-pink-600',
};

import { useDrilldown } from '@/lib/drilldown-context';

export default function CommunicationsPage() {
  const { toast } = useToast();
  const { openDrilldown } = useDrilldown();
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [isNewConvoOpen, setIsNewConvoOpen] = useState(false);
  const [isAddParticipantOpen, setIsAddParticipantOpen] = useState(false);
  const [isReportSheetOpen, setIsReportSheetOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<SentimentReport | null>(null);

  // New conversation form
  const [convoTitle, setConvoTitle] = useState('');
  const [participantEmail, setParticipantEmail] = useState('');
  const [participantName, setParticipantName] = useState('');
  const [participantRole, setParticipantRole] = useState('party');

  // Message input
  const [messageContent, setMessageContent] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch conversations
  const { data: conversations = [], isLoading: loadingConvos } = useQuery<Conversation[]>({
    queryKey: ['/api/conversations'],
  });

  // Fetch selected conversation details
  const { data: conversationDetails, isLoading: loadingDetails } = useQuery<Conversation>({
    queryKey: ['/api/conversations', selectedConversation?.id],
    enabled: !!selectedConversation,
  });

  // Fetch sentiment reports for selected conversation
  const { data: sentimentReports = [] } = useQuery<SentimentReport[]>({
    queryKey: ['/api/conversations', selectedConversation?.id, 'reports'],
    enabled: !!selectedConversation,
  });

  // Create conversation mutation
  const createConvoMutation = useMutation({
    mutationFn: async (data: {
      title: string;
      participants?: Array<{ email: string; displayName: string; role: string }>;
    }) => {
      const response = await apiRequest('POST', '/api/conversations', data);
      return response.json();
    },
    onSuccess: (newConvo) => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      setIsNewConvoOpen(false);
      setConvoTitle('');
      setSelectedConversation(newConvo);
      toast({ title: 'Conversation created', description: 'You can now start messaging.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (data: { content: string; inputType?: string }) => {
      const response = await apiRequest(
        'POST',
        `/api/conversations/${selectedConversation?.id}/messages`,
        data
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation?.id] });
      setMessageContent('');
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Add participant mutation
  const addParticipantMutation = useMutation({
    mutationFn: async (data: { email: string; displayName: string; role: string }) => {
      const response = await apiRequest(
        'POST',
        `/api/conversations/${selectedConversation?.id}/participants`,
        data
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation?.id] });
      setIsAddParticipantOpen(false);
      setParticipantEmail('');
      setParticipantName('');
      setParticipantRole('party');
      toast({
        title: 'Participant added',
        description: 'They will be notified and can join the conversation.',
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Generate report mutation
  const generateReportMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        'POST',
        `/api/conversations/${selectedConversation?.id}/reports`,
        {
          title: `Communication Analysis - ${safeFormat(new Date(), 'MMM d, yyyy')}`,
        }
      );
      return response.json();
    },
    onSuccess: (report) => {
      queryClient.invalidateQueries({
        queryKey: ['/api/conversations', selectedConversation?.id, 'reports'],
      });
      setSelectedReport(report);
      setIsReportSheetOpen(true);
      toast({ title: 'Report generated', description: 'Sentiment analysis report is ready.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Voice recording functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach((track) => track.stop());
        await transcribeAndSend(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      toast({
        title: 'Microphone access denied',
        description: 'Please allow microphone access to use voice messages.',
        variant: 'destructive',
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeAndSend = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        const response = await apiRequest('POST', '/api/journal/transcribe', {
          audioData: base64Audio,
          mimeType: 'audio/webm',
        });
        const { transcription } = await response.json();
        if (transcription) {
          sendMessageMutation.mutate({ content: transcription, inputType: 'voice' });
        }
        setIsTranscribing(false);
      };
    } catch (error) {
      setIsTranscribing(false);
      toast({
        title: 'Transcription failed',
        description: 'Could not process voice message.',
        variant: 'destructive',
      });
    }
  };

  const handleSendMessage = () => {
    if (!messageContent.trim() || !selectedConversation) return;
    sendMessageMutation.mutate({ content: messageContent, inputType: 'text' });
  };

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversationDetails?.messages]);

  const exportConversation = () => {
    if (!conversationDetails || !conversationDetails.messages) return;
    const headers = ['Date', 'Time', 'Sender', 'Role', 'Message', 'Sentiment', 'Topics'];
    const csvContent = [
      headers.join(','),
      ...conversationDetails.messages.map((msg) => {
        const participant = conversationDetails.participants?.find(
          (p: any) => p.email === msg.senderEmail
        );
        return [
          safeFormat(msg.createdAt, 'yyyy-MM-dd'),
          safeFormat(msg.createdAt, 'HH:mm:ss'),
          `"${msg.senderName.replace(/"/g, '""')}"`,
          participant?.role || 'Unknown',
          `"${msg.content.replace(/"/g, '""')}"`,
          msg.sentimentLabel || 'Neutral',
          `"${(msg.negativeTopics || []).join('; ')}"`,
        ].join(',');
      }),
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversation_${selectedConversation?.id || 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getSentimentBadge = (message: Message) => {
    if (!message.hasNegativeContent) return null;
    return (
      <Badge variant="destructive" className="text-xs">
        <AlertTriangle className="h-3 w-3 mr-1" />
        Negative
      </Badge>
    );
  };

  if (loadingConvos) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] md:h-[calc(100vh-2rem)]">
      {/* Conversations List */}
      <div
        className={`w-full md:w-80 border-r flex flex-col ${selectedConversation ? 'hidden md:flex' : 'flex'}`}
      >
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Conversations</h2>
          </div>
          <Dialog open={isNewConvoOpen} onOpenChange={setIsNewConvoOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-new-conversation">
                <Plus className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Conversation</DialogTitle>
                <DialogDescription>
                  Start a documented conversation with your co-parent or add legal counsel.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <Input
                  placeholder="Conversation title (e.g., Schedule Discussion)"
                  value={convoTitle}
                  onChange={(e) => setConvoTitle(e.target.value)}
                  data-testid="input-conversation-title"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsNewConvoOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createConvoMutation.mutate({ title: convoTitle })}
                  disabled={!convoTitle.trim() || createConvoMutation.isPending}
                  data-testid="button-create-conversation"
                >
                  {createConvoMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  )}
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <ScrollArea className="flex-1">
          {conversations.length === 0 ? (
            <div className="p-8 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No conversations yet</p>
              <Button
                size="sm"
                className="mt-4"
                onClick={() => setIsNewConvoOpen(true)}
                data-testid="button-start-first-conversation"
              >
                Start a Conversation
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`p-4 cursor-pointer hover-elevate ${selectedConversation?.id === conv.id ? 'bg-accent' : ''}`}
                  onClick={() => setSelectedConversation(conv)}
                  data-testid={`conversation-${conv.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium line-clamp-1">{conv.title}</h3>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {conv.participants?.length || 0} members
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {safeFormat(conv.updatedAt, 'MMM d, h:mm a')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Conversation View */}
      <div className={`flex-1 flex flex-col ${!selectedConversation ? 'hidden md:flex' : 'flex'}`}>
        {!selectedConversation ? (
          <div className="flex-1 flex items-center justify-center text-center p-8">
            <div>
              <MessageSquare className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Select a Conversation</h3>
              <p className="text-muted-foreground">
                Choose a conversation from the list or start a new one
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Conversation Header */}
            <div className="p-4 border-b flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  onClick={() => setSelectedConversation(null)}
                  data-testid="button-back"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <div>
                  <h2 className="font-semibold">{selectedConversation.title}</h2>
                  <p className="text-xs text-muted-foreground">
                    {conversationDetails?.participants?.length || 0} participants
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportConversation}
                  disabled={!conversationDetails?.messages?.length}
                >
                  <Download className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">Export</span>
                </Button>
                <Dialog open={isAddParticipantOpen} onOpenChange={setIsAddParticipantOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" data-testid="button-add-participant">
                      <UserPlus className="h-4 w-4 mr-1" />
                      <span className="hidden sm:inline">Add</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Participant</DialogTitle>
                      <DialogDescription>
                        Add a co-parent, attorney, mediator, or therapist to this conversation.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <Input
                        placeholder="Email address"
                        type="email"
                        value={participantEmail}
                        onChange={(e) => setParticipantEmail(e.target.value)}
                        data-testid="input-participant-email"
                      />
                      <Input
                        placeholder="Display name"
                        value={participantName}
                        onChange={(e) => setParticipantName(e.target.value)}
                        data-testid="input-participant-name"
                      />
                      <Select value={participantRole} onValueChange={setParticipantRole}>
                        <SelectTrigger data-testid="select-participant-role">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="party">Co-Parent / Party</SelectItem>
                          <SelectItem value="attorney">Attorney / Legal Counsel</SelectItem>
                          <SelectItem value="mediator">Mediator</SelectItem>
                          <SelectItem value="therapist">Therapist / Counselor</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsAddParticipantOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={() =>
                          addParticipantMutation.mutate({
                            email: participantEmail,
                            displayName: participantName,
                            role: participantRole,
                          })
                        }
                        disabled={
                          !participantEmail || !participantName || addParticipantMutation.isPending
                        }
                        data-testid="button-submit-participant"
                      >
                        {addParticipantMutation.isPending && (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        )}
                        Add
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Sheet open={isReportSheetOpen} onOpenChange={setIsReportSheetOpen}>
                  <SheetTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => generateReportMutation.mutate()}
                      disabled={generateReportMutation.isPending}
                      data-testid="button-generate-report"
                    >
                      {generateReportMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <BarChart3 className="h-4 w-4 mr-1" />
                      )}
                      <span className="hidden sm:inline">Report</span>
                    </Button>
                  </SheetTrigger>
                  <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
                    <SheetHeader>
                      <SheetTitle>Communication Analysis Report</SheetTitle>
                      <SheetDescription>
                        AI-generated analysis of negative communication patterns
                      </SheetDescription>
                    </SheetHeader>
                    {selectedReport && (
                      <div className="mt-6 space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                          <Card className="cursor-pointer hover-elevate transition-all" onClick={() => openDrilldown({ layer: 1, sourceEntity: 'kpi_metric', identifier: `report_total_msgs_${selectedReport.id}` })}>
                            <CardContent className="pt-4">
                              <p className="text-2xl font-bold">
                                {selectedReport.totalMessagesAnalyzed}
                              </p>
                              <p className="text-sm text-muted-foreground">Messages Analyzed</p>
                            </CardContent>
                          </Card>
                          <Card className="cursor-pointer hover-elevate transition-all" onClick={() => openDrilldown({ layer: 1, sourceEntity: 'kpi_metric', identifier: `report_neg_msgs_${selectedReport.id}` })}>
                            <CardContent className="pt-4">
                              <p className="text-2xl font-bold text-destructive">
                                {selectedReport.negativeMessageCount}
                              </p>
                              <p className="text-sm text-muted-foreground">Negative Messages</p>
                            </CardContent>
                          </Card>
                        </div>

                        <div>
                          <h4 className="font-medium mb-2">Summary</h4>
                          <Card>
                            <CardContent className="pt-4">
                              <p className="text-sm whitespace-pre-wrap">
                                {selectedReport.summary}
                              </p>
                            </CardContent>
                          </Card>
                        </div>

                        <div>
                          <h4 className="font-medium mb-2">Recommendations</h4>
                          <Card>
                            <CardContent className="pt-4">
                              <p className="text-sm whitespace-pre-wrap">
                                {selectedReport.recommendations}
                              </p>
                            </CardContent>
                          </Card>
                        </div>

                        {Object.keys(selectedReport.topicBreakdown || {}).length > 0 && (
                          <div>
                            <h4 className="font-medium mb-2">Topics of Conflict</h4>
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(selectedReport.topicBreakdown).map(
                                ([topic, items]) => (
                                  <Badge key={topic} variant="destructive">
                                    {topic} ({(items as any[]).length})
                                  </Badge>
                                )
                              )}
                            </div>
                          </div>
                        )}

                        <Button className="w-full" data-testid="button-export-report">
                          <Download className="h-4 w-4 mr-2" />
                          Export PDF for Legal/Therapeutic Use
                        </Button>
                      </div>
                    )}
                  </SheetContent>
                </Sheet>
              </div>
            </div>

            {/* Participants Bar */}
            {conversationDetails?.participants && conversationDetails.participants.length > 0 && (
              <div className="px-4 py-2 border-b bg-muted/30 flex items-center gap-2 overflow-x-auto">
                {conversationDetails.participants.map((p) => (
                  <Badge
                    key={p.id}
                    variant="secondary"
                    className={`${roleColors[p.role] || ''} shrink-0`}
                  >
                    {roleIcons[p.role]}
                    <span className="ml-1">{p.displayName}</span>
                  </Badge>
                ))}
              </div>
            )}

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              {loadingDetails ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : conversationDetails?.messages?.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No messages yet. Start the conversation!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {conversationDetails?.messages?.map((msg) => {
                    const isCurrentUser = msg.senderId === 'demo-user'; // Simplified check
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`max-w-[80%] ${isCurrentUser ? 'order-2' : ''}`}>
                          <div className="flex items-center gap-2 mb-1">
                            {!isCurrentUser && (
                              <Avatar className="h-6 w-6">
                                <AvatarFallback className="text-xs">
                                  {msg.senderName
                                    .split(' ')
                                    .map((n) => n[0])
                                    .join('')}
                                </AvatarFallback>
                              </Avatar>
                            )}
                            <span className="text-xs text-muted-foreground">{msg.senderName}</span>
                            <span className="text-xs text-muted-foreground">
                              {safeFormat(msg.createdAt, 'h:mm a')}
                            </span>
                            {getSentimentBadge(msg)}
                          </div>
                          <Card
                            className={`${isCurrentUser ? 'bg-primary text-primary-foreground' : ''}`}
                          >
                            <CardContent className="p-3">
                              <p className="text-sm">{msg.content}</p>
                              {msg.inputType === 'voice' && (
                                <div className="flex items-center gap-1 mt-1 text-xs opacity-70">
                                  <Mic className="h-3 w-3" />
                                  Voice message
                                </div>
                              )}
                              {msg.hasNegativeContent &&
                                msg.negativeTopics &&
                                msg.negativeTopics.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-2">
                                    {msg.negativeTopics.map((topic) => (
                                      <Badge
                                        key={topic}
                                        variant="outline"
                                        className="text-xs bg-destructive/10"
                                      >
                                        {topic}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                            </CardContent>
                          </Card>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Message Input */}
            <div className="p-4 border-t">
              <div className="flex items-end gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant={isRecording ? 'destructive' : 'outline'}
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isTranscribing}
                  data-testid="button-voice-message"
                >
                  {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
                <Textarea
                  placeholder="Type a message..."
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  className="resize-none min-h-[44px] max-h-[120px]"
                  rows={1}
                  data-testid="input-message"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!messageContent.trim() || sendMessageMutation.isPending}
                  data-testid="button-send-message"
                >
                  {sendMessageMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {isTranscribing && (
                <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Transcribing voice message...
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
