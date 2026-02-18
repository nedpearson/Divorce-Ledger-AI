import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Lightbulb,
  Clock,
  CheckCircle,
  AlertCircle,
  TestTube,
  Check,
  X,
  Edit,
  Send,
  Trash2,
  Loader2,
  Eye,
  MessageSquare,
  User,
  Calendar,
  FileText,
} from "lucide-react";
import { format } from "date-fns";
import type { ImprovementRecommendation } from "@shared/schema";

const SUPER_ADMIN_EMAIL = "nedpearson@gmail.com";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: typeof Clock; color: string }> = {
  submitted: { label: "Submitted", variant: "secondary", icon: Clock, color: "bg-gray-500" },
  reviewing: { label: "Under Review", variant: "default", icon: Edit, color: "bg-blue-500" },
  testing: { label: "Testing", variant: "outline", icon: TestTube, color: "bg-purple-500" },
  approved: { label: "Approved", variant: "default", icon: CheckCircle, color: "bg-green-500" },
  implemented: { label: "Implemented", variant: "default", icon: Check, color: "bg-emerald-500" },
  rejected: { label: "Rejected", variant: "destructive", icon: X, color: "bg-red-500" },
};

export default function AdminRecommendationsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState<string>("all");
  const [selectedRec, setSelectedRec] = useState<ImprovementRecommendation | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [implementDialogOpen, setImplementDialogOpen] = useState(false);
  
  const [editedTitle, setEditedTitle] = useState("");
  const [editedBody, setEditedBody] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [testUserEmail, setTestUserEmail] = useState("");
  const [changelogEntry, setChangelogEntry] = useState("");

  const isAdmin = user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();

  const { data: recommendations = [], isLoading } = useQuery<ImprovementRecommendation[]>({
    queryKey: ["/api/admin/recommendations"],
    queryFn: async () => {
      const res = await fetch("/api/admin/recommendations", {
        headers: { "x-user-email": user?.email || "" }
      });
      if (!res.ok) throw new Error("Failed to fetch recommendations");
      return res.json();
    },
    enabled: isAdmin,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/recommendations/${id}`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/recommendations"] });
      toast({ title: "Updated", description: "Recommendation has been updated." });
      closeDialogs();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update.", variant: "destructive" });
    },
  });

  const sendToTestMutation = useMutation({
    mutationFn: async ({ id, testUserEmail }: { id: string; testUserEmail: string }) => {
      const res = await apiRequest("POST", `/api/admin/recommendations/${id}/send-to-test`, { testUserEmail });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/recommendations"] });
      toast({ title: "Sent to Testing", description: "Recommendation sent to test user for approval." });
      closeDialogs();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send to test.", variant: "destructive" });
    },
  });

  const implementMutation = useMutation({
    mutationFn: async ({ id, changelogEntry }: { id: string; changelogEntry: string }) => {
      const res = await apiRequest("POST", `/api/admin/recommendations/${id}/implement`, { changelogEntry });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/recommendations"] });
      toast({ title: "Implemented", description: "Feature marked as implemented and added to changelog." });
      closeDialogs();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to implement.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/recommendations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/recommendations"] });
      toast({ title: "Deleted", description: "Recommendation has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete.", variant: "destructive" });
    },
  });

  const closeDialogs = () => {
    setEditDialogOpen(false);
    setTestDialogOpen(false);
    setImplementDialogOpen(false);
    setSelectedRec(null);
  };

  const openEditDialog = (rec: ImprovementRecommendation) => {
    setSelectedRec(rec);
    setEditedTitle(rec.editedTitle || rec.title);
    setEditedBody(rec.editedBody || rec.body);
    setAdminNotes(rec.adminNotes || "");
    setEditDialogOpen(true);
  };

  const openTestDialog = (rec: ImprovementRecommendation) => {
    setSelectedRec(rec);
    setTestUserEmail(rec.testUserEmail || "");
    setTestDialogOpen(true);
  };

  const openImplementDialog = (rec: ImprovementRecommendation) => {
    setSelectedRec(rec);
    setChangelogEntry(rec.changelogEntry || rec.editedBody || rec.body);
    setImplementDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!selectedRec) return;
    updateMutation.mutate({
      id: selectedRec.id,
      updates: {
        editedTitle: editedTitle.trim(),
        editedBody: editedBody.trim(),
        adminNotes: adminNotes.trim(),
        status: "reviewing",
      },
    });
  };

  const handleSendToTest = () => {
    if (!selectedRec || !testUserEmail.trim()) return;
    sendToTestMutation.mutate({
      id: selectedRec.id,
      testUserEmail: testUserEmail.trim(),
    });
  };

  const handleImplement = () => {
    if (!selectedRec || !changelogEntry.trim()) return;
    implementMutation.mutate({
      id: selectedRec.id,
      changelogEntry: changelogEntry.trim(),
    });
  };

  const handleStatusChange = (rec: ImprovementRecommendation, newStatus: string) => {
    updateMutation.mutate({
      id: rec.id,
      updates: { status: newStatus },
    });
  };

  const filteredRecs = activeTab === "all" 
    ? recommendations 
    : recommendations.filter(r => r.status === activeTab);

  const statusCounts = recommendations.reduce((acc, rec) => {
    acc[rec.status] = (acc[rec.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (!isAdmin) {
    return (
      <div className="container py-12 text-center">
        <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
        <h1 className="text-2xl font-semibold mb-2">Access Denied</h1>
        <p className="text-muted-foreground">Only administrators can access this page.</p>
      </div>
    );
  }

  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Lightbulb className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Recommendations Admin</h1>
            <p className="text-muted-foreground">Review, edit, and implement user feedback</p>
          </div>
        </div>
        <Badge variant="outline" className="text-xs">
          {recommendations.length} total
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        {Object.entries(STATUS_CONFIG).map(([status, config]) => (
          <Card key={status} className={`cursor-pointer hover-elevate ${activeTab === status ? 'ring-2 ring-primary' : ''}`} onClick={() => setActiveTab(status)}>
            <CardContent className="p-3 text-center">
              <div className={`w-8 h-8 mx-auto rounded-full ${config.color} flex items-center justify-center mb-1`}>
                <config.icon className="h-4 w-4 text-white" />
              </div>
              <p className="text-2xl font-bold">{statusCounts[status] || 0}</p>
              <p className="text-xs text-muted-foreground">{config.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All ({recommendations.length})</TabsTrigger>
          <TabsTrigger value="submitted">Submitted</TabsTrigger>
          <TabsTrigger value="reviewing">Reviewing</TabsTrigger>
          <TabsTrigger value="testing">Testing</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="implemented">Implemented</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredRecs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No recommendations in this category</p>
            </div>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="space-y-4">
                {filteredRecs.map((rec) => {
                  const statusInfo = STATUS_CONFIG[rec.status] || STATUS_CONFIG.submitted;
                  const StatusIcon = statusInfo.icon;
                  return (
                    <Card key={rec.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-base">
                              {rec.editedTitle || rec.title}
                            </CardTitle>
                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                              <User className="h-3 w-3" />
                              <span>{rec.userEmail || "Anonymous"}</span>
                              <Calendar className="h-3 w-3 ml-2" />
                              <span>{format(new Date(rec.createdAt), "MMM d, yyyy")}</span>
                              <FileText className="h-3 w-3 ml-2" />
                              <span>{rec.inputType}</span>
                            </div>
                          </div>
                          <Badge variant={statusInfo.variant}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusInfo.label}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pb-2">
                        <p className="text-sm text-muted-foreground line-clamp-3">
                          {rec.editedBody || rec.body}
                        </p>
                        {rec.adminNotes && (
                          <div className="mt-2 p-2 bg-muted rounded text-xs">
                            <strong>Admin Notes:</strong> {rec.adminNotes}
                          </div>
                        )}
                        {rec.testFeedback && (
                          <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950 rounded text-xs">
                            <strong>Test Feedback:</strong> {rec.testFeedback}
                            {rec.testApproved !== null && (
                              <Badge variant={rec.testApproved ? "default" : "destructive"} className="ml-2">
                                {rec.testApproved ? "Approved" : "Rejected"}
                              </Badge>
                            )}
                          </div>
                        )}
                      </CardContent>
                      <CardFooter className="pt-2 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => openEditDialog(rec)} data-testid={`button-edit-${rec.id}`}>
                          <Edit className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                        
                        {(rec.status === "reviewing" || rec.status === "submitted") && (
                          <Button size="sm" variant="outline" onClick={() => openTestDialog(rec)} data-testid={`button-test-${rec.id}`}>
                            <TestTube className="h-3 w-3 mr-1" />
                            Send to Test
                          </Button>
                        )}
                        
                        {rec.status === "approved" && (
                          <Button size="sm" onClick={() => openImplementDialog(rec)} data-testid={`button-implement-${rec.id}`}>
                            <Check className="h-3 w-3 mr-1" />
                            Implement
                          </Button>
                        )}

                        <Select value={rec.status} onValueChange={(val) => handleStatusChange(rec, val)}>
                          <SelectTrigger className="w-32 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                              <SelectItem key={status} value={status}>
                                {config.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate(rec.id)} data-testid={`button-delete-${rec.id}`}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Recommendation</DialogTitle>
            <DialogDescription>Correct the wording and add notes before implementation</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title (Corrected)</Label>
              <Input
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                placeholder="Corrected title..."
                data-testid="input-edited-title"
              />
            </div>
            <div className="space-y-2">
              <Label>Description (Corrected)</Label>
              <Textarea
                value={editedBody}
                onChange={(e) => setEditedBody(e.target.value)}
                placeholder="Corrected description..."
                className="min-h-32"
                data-testid="input-edited-body"
              />
            </div>
            <div className="space-y-2">
              <Label>Admin Notes (Internal)</Label>
              <Textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Internal notes about this recommendation..."
                className="min-h-20"
                data-testid="input-admin-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialogs}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending} data-testid="button-save-edit">
              {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save & Mark as Reviewing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send to Test User</DialogTitle>
            <DialogDescription>Assign a test user to review this recommendation before implementation</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Test User Email</Label>
              <Input
                type="email"
                value={testUserEmail}
                onChange={(e) => setTestUserEmail(e.target.value)}
                placeholder="testuser@example.com"
                data-testid="input-test-email"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialogs}>Cancel</Button>
            <Button onClick={handleSendToTest} disabled={!testUserEmail.trim() || sendToTestMutation.isPending} data-testid="button-send-test">
              {sendToTestMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Send className="h-4 w-4 mr-2" />
              Send to Test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={implementDialogOpen} onOpenChange={setImplementDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Implemented</DialogTitle>
            <DialogDescription>This will add the feature to the public changelog for users to see</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Changelog Entry (Public)</Label>
              <Textarea
                value={changelogEntry}
                onChange={(e) => setChangelogEntry(e.target.value)}
                placeholder="Describe the improvement for users..."
                className="min-h-24"
                data-testid="input-changelog"
              />
              <p className="text-xs text-muted-foreground">This will be shown to all users in the Updates section</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialogs}>Cancel</Button>
            <Button onClick={handleImplement} disabled={!changelogEntry.trim() || implementMutation.isPending} data-testid="button-implement-confirm">
              {implementMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Check className="h-4 w-4 mr-2" />
              Mark Implemented
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
