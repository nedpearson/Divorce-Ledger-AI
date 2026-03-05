import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { Bot, Send, Lightbulb, AlertTriangle, TrendingUp, FileText, Loader2, Sparkles, User, RefreshCw } from "lucide-react";

interface Insight {
  id: string;
  type: "strategy" | "warning" | "opportunity" | "document";
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

function InsightCard({ insight }: { insight: Insight }) {
  const icons = {
    strategy: <Lightbulb className="h-5 w-5 text-yellow-500" />,
    warning: <AlertTriangle className="h-5 w-5 text-red-500" />,
    opportunity: <TrendingUp className="h-5 w-5 text-green-500" />,
    document: <FileText className="h-5 w-5 text-blue-500" />,
  };

  const priorityColors = {
    high: "destructive",
    medium: "default",
    low: "secondary",
  } as const;

  return (
    <Card className="group hover-elevate" data-testid={`insight-${insight.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-muted rounded-md">
            {icons[insight.type]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-medium">{insight.title}</h4>
              <Badge variant={priorityColors[insight.priority]}>
                {insight.priority}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{insight.description}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ChatInterface() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Hello! I'm your AI case coach. I can help you understand legal strategies, analyze your case documents, and provide guidance on divorce proceedings. How can I assist you today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    setTimeout(() => {
      const responses = [
        "Based on your case details, I recommend focusing on documenting all financial transactions carefully. This will be crucial for the property division phase.",
        "That's an important consideration. In divorce proceedings, courts typically look at the totality of circumstances when making custody decisions. Would you like me to explain the key factors?",
        "I understand your concern. Many clients face similar situations. The key is to maintain detailed records and communicate through proper channels. Would you like specific guidance on documentation best practices?",
        "From a strategic standpoint, it may be beneficial to consult with a financial expert regarding hidden assets. I can help you prepare questions for such a consultation.",
        "This is a common challenge in divorce cases. Let me suggest some strategies that have proven effective in similar situations.",
      ];

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: responses[Math.floor(Math.random() * responses.length)],
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setIsTyping(false);
    }, 1500);
  };

  return (
    <Card className="flex flex-col h-[500px]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          AI Case Coach
        </CardTitle>
        <CardDescription>Get AI-powered guidance for your case</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0">
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <div className={`p-2 rounded-full shrink-0 ${
                  message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}>
                  {message.role === "user" ? (
                    <User className="h-4 w-4" />
                  ) : (
                    <Bot className="h-4 w-4" />
                  )}
                </div>
                <div
                  className={`rounded-lg p-3 max-w-[80%] ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <p className="text-sm">{message.content}</p>
                  <p className="text-xs opacity-70 mt-1">
                    {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex gap-3">
                <div className="p-2 rounded-full bg-muted">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="rounded-lg p-3 bg-muted">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce delay-100" />
                    <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce delay-200" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
        <div className="flex gap-2 mt-4">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your case..."
            className="resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            data-testid="input-chat"
          />
          <Button
            onClick={sendMessage}
            disabled={!input.trim() || isTyping}
            size="icon"
            data-testid="button-send-chat"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AICoachPage() {
  const { environment } = useAuth();
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const sampleInsights: Insight[] = [
    {
      id: "1",
      type: "warning",
      title: "Missing Financial Documentation",
      description: "3 bank statements from the past year have not been uploaded. Complete financial records strengthen your case.",
      priority: "high",
    },
    {
      id: "2",
      type: "strategy",
      title: "Custody Schedule Optimization",
      description: "Based on your work schedule, a 2-2-3 custody arrangement may be more practical than the current proposal.",
      priority: "medium",
    },
    {
      id: "3",
      type: "opportunity",
      title: "Tax Implications",
      description: "Filing jointly this year could save approximately 15% in taxes. Consider discussing with your attorney.",
      priority: "medium",
    },
    {
      id: "4",
      type: "document",
      title: "Response Deadline Approaching",
      description: "Your response to the motion for temporary support is due in 5 days. Review and finalize your response.",
      priority: "high",
    },
  ];

  const runAnalysis = () => {
    setIsAnalyzing(true);
    setTimeout(() => {
      setIsAnalyzing(false);
    }, 2000);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24 md:pb-6" data-testid="page-ai-coach">
      

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="text-page-title">
            <Sparkles className="h-6 w-6 text-primary" />
            AI Coach
          </h1>
          <p className="text-sm text-muted-foreground">Get AI-powered strategy suggestions and case analysis.</p>
        </div>
        <Button onClick={runAnalysis} disabled={isAnalyzing} data-testid="button-analyze">
          {isAnalyzing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Analyze Case
            </>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-md">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">2</p>
                <p className="text-xs text-muted-foreground">High Priority</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-500/10 rounded-md">
                <Lightbulb className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">3</p>
                <p className="text-xs text-muted-foreground">Strategies</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-md">
                <TrendingUp className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">1</p>
                <p className="text-xs text-muted-foreground">Opportunities</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-md">
                <FileText className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">85%</p>
                <p className="text-xs text-muted-foreground">Case Readiness</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">AI Insights</h2>
          {sampleInsights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
        <ChatInterface />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            How AI Coach Works
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="p-3 bg-primary/10 rounded-full w-fit mx-auto mb-3">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <h4 className="font-medium mb-1">Document Analysis</h4>
              <p className="text-sm text-muted-foreground">
                AI reviews your uploaded documents to identify missing information and inconsistencies.
              </p>
            </div>
            <div className="text-center">
              <div className="p-3 bg-primary/10 rounded-full w-fit mx-auto mb-3">
                <Lightbulb className="h-6 w-6 text-primary" />
              </div>
              <h4 className="font-medium mb-1">Strategic Insights</h4>
              <p className="text-sm text-muted-foreground">
                Get personalized recommendations based on your case specifics and legal precedents.
              </p>
            </div>
            <div className="text-center">
              <div className="p-3 bg-primary/10 rounded-full w-fit mx-auto mb-3">
                <AlertTriangle className="h-6 w-6 text-primary" />
              </div>
              <h4 className="font-medium mb-1">Deadline Tracking</h4>
              <p className="text-sm text-muted-foreground">
                Never miss important dates with automated reminders and deadline alerts.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
