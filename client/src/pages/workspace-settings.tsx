import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Building, User, CreditCard, Users, Loader2, Crown, Zap, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Workspace {
  id: string;
  name: string;
  type: "consumer" | "firm";
  subscriptionTier: string;
  subscriptionStatus: string;
}

interface Entitlements {
  matters: { used: number; limit: number };
  seats: { used: number; limit: number };
  storage: { used: number; limit: number };
  aiCredits: { used: number; limit: number; resetsAt?: string };
}

export default function WorkspaceSettings() {
  const { toast } = useToast();
  const params = useParams();
  const workspaceId = params.workspaceId as string | undefined;

  const { data: workspace, isLoading: workspaceLoading } = useQuery<Workspace>({
    queryKey: ["/api/workspaces", workspaceId],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/workspaces/${workspaceId}`);
      return response.json();
    },
    enabled: !!workspaceId,
  });

  const { data: entitlements, isLoading: entitlementsLoading } = useQuery<Entitlements>({
    queryKey: ["/api/workspaces", workspaceId, "entitlements"],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/workspaces/${workspaceId}/entitlements`);
      return response.json();
    },
    enabled: !!workspaceId,
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/billing/workspace/portal", { workspaceId });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to open portal",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  if (workspaceLoading || entitlementsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!workspace || !entitlements) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Workspace not found</CardTitle>
            <CardDescription>The workspace you're looking for doesn't exist.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const getProgressColor = (used: number, limit: number) => {
    const percentage = (used / limit) * 100;
    if (percentage >= 90) return "bg-red-500";
    if (percentage >= 75) return "bg-yellow-500";
    return "bg-green-500";
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            {workspace.type === "firm" ? (
              <Building className="h-6 w-6" />
            ) : (
              <User className="h-6 w-6" />
            )}
            <h1 className="text-3xl font-bold">{workspace.name}</h1>
          </div>
          <p className="text-muted-foreground">
            {workspace.type === "firm" ? "Law Firm Workspace" : "Individual Workspace"}
          </p>
        </div>
        <Badge variant={workspace.subscriptionStatus === "active" ? "default" : "secondary"}>
          {workspace.subscriptionStatus}
        </Badge>
      </div>

      <Tabs defaultValue="subscription" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="subscription">
            <CreditCard className="h-4 w-4 mr-2" />
            Subscription
          </TabsTrigger>
          <TabsTrigger value="usage">
            <Zap className="h-4 w-4 mr-2" />
            Usage
          </TabsTrigger>
          <TabsTrigger value="members">
            <Users className="h-4 w-4 mr-2" />
            Members
          </TabsTrigger>
        </TabsList>

        <TabsContent value="subscription" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Crown className="h-5 w-5 text-amber-500" />
                    Current Plan
                  </CardTitle>
                  <CardDescription className="mt-2">
                    {workspace.subscriptionTier || "Free"}
                  </CardDescription>
                </div>
                <Button
                  onClick={() => portalMutation.mutate()}
                  disabled={portalMutation.isPending}
                >
                  {portalMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Manage Subscription
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>• Manage your billing information</p>
                <p>• Update payment method</p>
                <p>• View invoices and history</p>
                <p>• Cancel or change subscription</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-purple-500" />
                AI Credits
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span>
                  {entitlements.aiCredits.used.toLocaleString()} / {entitlements.aiCredits.limit.toLocaleString()} used
                </span>
                <span className="text-muted-foreground">
                  {Math.round((entitlements.aiCredits.used / entitlements.aiCredits.limit) * 100)}%
                </span>
              </div>
              <Progress
                value={(entitlements.aiCredits.used / entitlements.aiCredits.limit) * 100}
                className={getProgressColor(entitlements.aiCredits.used, entitlements.aiCredits.limit)}
              />
              {entitlements.aiCredits.resetsAt && (
                <p className="text-xs text-muted-foreground">
                  Resets: {new Date(entitlements.aiCredits.resetsAt).toLocaleDateString()}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Matters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span>
                  {entitlements.matters.used} / {entitlements.matters.limit === -1 ? "Unlimited" : entitlements.matters.limit}
                </span>
                {entitlements.matters.limit !== -1 && (
                  <span className="text-muted-foreground">
                    {Math.round((entitlements.matters.used / entitlements.matters.limit) * 100)}%
                  </span>
                )}
              </div>
              {entitlements.matters.limit !== -1 && (
                <Progress
                  value={(entitlements.matters.used / entitlements.matters.limit) * 100}
                  className={getProgressColor(entitlements.matters.used, entitlements.matters.limit)}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Team Seats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span>
                  {entitlements.seats.used} / {entitlements.seats.limit === -1 ? "Unlimited" : entitlements.seats.limit}
                </span>
                {entitlements.seats.limit !== -1 && (
                  <span className="text-muted-foreground">
                    {Math.round((entitlements.seats.used / entitlements.seats.limit) * 100)}%
                  </span>
                )}
              </div>
              {entitlements.seats.limit !== -1 && (
                <Progress
                  value={(entitlements.seats.used / entitlements.seats.limit) * 100}
                  className={getProgressColor(entitlements.seats.used, entitlements.seats.limit)}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Storage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span>
                  {(entitlements.storage.used / 1024 / 1024).toFixed(2)} MB / {(entitlements.storage.limit / 1024 / 1024).toFixed(0)} MB
                </span>
                <span className="text-muted-foreground">
                  {Math.round((entitlements.storage.used / entitlements.storage.limit) * 100)}%
                </span>
              </div>
              <Progress
                value={(entitlements.storage.used / entitlements.storage.limit) * 100}
                className={getProgressColor(entitlements.storage.used, entitlements.storage.limit)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>Manage workspace members and their roles</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Member management coming soon...</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
