import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Send,
  Paperclip,
  Shield,
  Lock,
  CheckCheck,
  Lightbulb,
  AlertCircle,
  FileText,
  User,
  Scale,
  AlertTriangle,
} from "lucide-react";
import type { Message } from "@shared/schema";

export default function Communication() {
  const { user, environment } = useAuth();
  const { toast } = useToast();
  const [messageInput, setMessageInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages = [], isLoading: messagesLoading, isError: messagesError } = useQuery<Message[]>({
    queryKey: ["/api/messages", environment],
    queryFn: async () => {
      const res = await fetch(`/api/messages?environment=${environment}`);
      if (!res.ok) throw new Error("Failed to load messages");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const { data: suggestions = [] } = useQuery<Array<{ type: string; title: string; description: string }>>({
    queryKey: ["/api/suggestions", environment],
    queryFn: async () => {
      const res = await fetch(`/api/suggestions?environment=${environment}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      return apiRequest("POST", `/api/messages?environment=${environment}`, {
        senderId: user?.id || "demo-user",
        senderRole: "client",
        senderName: user?.fullName || "Client",
        content,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages", environment] });
      setMessageInput("");
    },
    onError: () => {
      toast({
        title: "Failed to send message",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (messageInput.trim()) {
      sendMessageMutation.mutate(messageInput.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const sortedMessages = [...messages].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const formatTime = (timestamp: Date | string) => {
    const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (timestamp: Date | string) => {
    const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  };

  const groupMessagesByDate = (msgs: Message[]) => {
    const groups: { date: string; messages: Message[] }[] = [];
    let currentDate = "";

    for (const msg of msgs) {
      const msgDate = formatDate(msg.timestamp);
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ date: msgDate, messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    }
    return groups;
  };

  const messageGroups = groupMessagesByDate(sortedMessages);

  const getSuggestionIcon = (type: string) => {
    switch (type) {
      case "evidence_missing":
        return AlertCircle;
      case "similar_violations":
        return FileText;
      case "next_steps":
        return Lightbulb;
      default:
        return Lightbulb;
    }
  };

  return (
    <div className="h-full flex">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="shrink-0 px-4 py-3 border-b flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary text-primary-foreground">
                <Scale className="h-5 w-5" />
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="font-semibold text-sm" data-testid="text-chat-title">Attorney: Michael Chen</h2>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 bg-green-500 rounded-full" />
                <span className="text-xs text-muted-foreground">Available</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1 text-xs">
              <Lock className="h-3 w-3" />
              Secure Channel
            </Badge>
            <Badge variant="outline" className="gap-1 text-xs">
              <Shield className="h-3 w-3" />
              Attorney-Client Privilege
            </Badge>
          </div>
        </div>

        <div className="flex-1 overflow-hidden relative">
          {messagesLoading ? (
            <div className="p-4 space-y-4">
              <Skeleton className="h-16 w-3/4" />
              <Skeleton className="h-16 w-2/3 ml-auto" />
              <Skeleton className="h-16 w-3/4" />
            </div>
          ) : messagesError ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="p-3 bg-destructive/10 rounded-full mb-3">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <h3 className="font-medium mb-1">Unable to load messages</h3>
              <p className="text-sm text-muted-foreground">Please try again later.</p>
            </div>
          ) : (
            <ScrollArea className="h-full" ref={scrollRef as any}>
              <div className="p-4 space-y-4">
                {messageGroups.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="p-3 bg-muted rounded-full mb-3">
                      <Shield className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <h3 className="font-medium mb-1">Secure Communication Hub</h3>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      All messages are protected by attorney-client privilege and encrypted end-to-end.
                    </p>
                  </div>
                ) : (
                  messageGroups.map((group) => (
                    <div key={group.date}>
                      <div className="flex items-center justify-center mb-4">
                        <Badge variant="secondary" className="text-xs font-normal">
                          {group.date}
                        </Badge>
                      </div>
                      <div className="space-y-3">
                        {group.messages.map((msg) => {
                          const isOwnMessage = msg.senderRole === "client";
                          return (
                            <div
                              key={msg.id}
                              className={`flex gap-2 ${isOwnMessage ? "flex-row-reverse" : ""}`}
                              data-testid={`message-${msg.id}`}
                            >
                              <Avatar className="h-8 w-8 shrink-0">
                                <AvatarFallback className={isOwnMessage ? "bg-primary text-primary-foreground" : "bg-muted"}>
                                  {isOwnMessage ? <User className="h-4 w-4" /> : <Scale className="h-4 w-4" />}
                                </AvatarFallback>
                              </Avatar>
                              <div className={`max-w-[70%] ${isOwnMessage ? "text-right" : ""}`}>
                                <div
                                  className={`px-3 py-2 rounded-lg text-sm ${
                                    isOwnMessage
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted"
                                  }`}
                                >
                                  {msg.content}
                                  {msg.attachmentUrl && (
                                    <div className="mt-2 flex items-center gap-1.5 text-xs opacity-80">
                                      <Paperclip className="h-3 w-3" />
                                      <span>{msg.attachmentName || "Attachment"}</span>
                                    </div>
                                  )}
                                </div>
                                <div className={`flex items-center gap-1 mt-1 text-xs text-muted-foreground ${isOwnMessage ? "justify-end" : ""}`}>
                                  <span>{formatTime(msg.timestamp)}</span>
                                  {isOwnMessage && msg.isRead && (
                                    <CheckCheck className="h-3 w-3 text-primary" />
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        <div className="shrink-0 p-3 border-t">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              data-testid="button-attach-file"
              className="shrink-0"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Input
              placeholder="Type a message..."
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sendMessageMutation.isPending}
              data-testid="input-message"
              className="flex-1"
            />
            <Button
              onClick={handleSend}
              disabled={!messageInput.trim() || sendMessageMutation.isPending}
              data-testid="button-send-message"
              className="shrink-0"
            >
              <Send className="h-4 w-4 mr-2" />
              Send
            </Button>
          </div>
        </div>
      </div>

      <div className="w-72 border-l p-4 hidden lg:block">
        <div className="mb-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Lightbulb className="h-4 w-4" />
            Smart Suggestions
          </h3>
          {suggestions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No suggestions at this time. Continue documenting your case.
            </p>
          ) : (
            <div className="space-y-3">
              {suggestions.map((suggestion, idx) => {
                const Icon = getSuggestionIcon(suggestion.type);
                return (
                  <Card key={idx} className="p-3">
                    <div className="flex items-start gap-2">
                      <div className="p-1.5 bg-primary/10 rounded shrink-0">
                        <Icon className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium leading-tight">{suggestion.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                          {suggestion.description}
                        </p>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-6 pt-4 border-t">
          <h3 className="font-semibold text-sm mb-3">Quick Actions</h3>
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start text-xs"
              data-testid="button-schedule-call"
            >
              <Scale className="h-3.5 w-3.5 mr-2" />
              Schedule Call with Attorney
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start text-xs"
              data-testid="button-share-document"
            >
              <FileText className="h-3.5 w-3.5 mr-2" />
              Share Document
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
