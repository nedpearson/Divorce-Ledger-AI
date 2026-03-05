import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Scale, Plus, FileText, Gavel, FileSignature, AlertTriangle, Clock, CheckCircle, Loader2, Download, Eye, Trash2 } from "lucide-react";
import type { LegalDocument } from "@shared/schema";
import { format } from "date-fns";

const documentTypes = [
  { value: "court_order", label: "Court Order", icon: Gavel },
  { value: "agreement", label: "Settlement Agreement", icon: FileSignature },
  { value: "petition", label: "Petition/Motion", icon: FileText },
  { value: "response", label: "Response/Answer", icon: FileText },
  { value: "discovery", label: "Discovery Documents", icon: FileText },
  { value: "financial_disclosure", label: "Financial Disclosure", icon: FileText },
  { value: "custody_plan", label: "Parenting/Custody Plan", icon: FileText },
  { value: "other", label: "Other Legal Document", icon: FileText },
];

const statusOptions = [
  { value: "draft", label: "Draft", variant: "secondary" as const },
  { value: "pending", label: "Pending Review", variant: "outline" as const },
  { value: "filed", label: "Filed", variant: "default" as const },
  { value: "active", label: "Active/In Effect", variant: "default" as const },
  { value: "expired", label: "Expired", variant: "secondary" as const },
];

function AddLegalDocumentDialog({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [description, setDescription] = useState("");
  const [courtCase, setCourtCase] = useState("");
  const [status, setStatus] = useState("draft");

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/legal-documents", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Document Added", description: "Legal document has been added successfully." });
      setOpen(false);
      setTitle("");
      setDocumentType("");
      setDescription("");
      setCourtCase("");
      setStatus("draft");
      onSuccess();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add document.", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-legal-document">
          <Plus className="h-4 w-4 mr-2" />
          Add Document
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Legal Document</DialogTitle>
          <DialogDescription>Add a court filing, agreement, or legal document.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Document Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Final Divorce Decree"
              data-testid="input-legal-title"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="documentType">Document Type</Label>
            <Select value={documentType} onValueChange={setDocumentType}>
              <SelectTrigger data-testid="select-legal-type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {documentTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger data-testid="select-legal-status">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="courtCase">Case Number</Label>
            <Input
              id="courtCase"
              value={courtCase}
              onChange={(e) => setCourtCase(e.target.value)}
              placeholder="e.g., 2024-DR-12345"
              data-testid="input-court-case"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief summary of the document..."
              className="resize-none"
              data-testid="input-legal-description"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={() => createMutation.mutate({ title, documentType, description, courtCase, status })}
            disabled={!title || !documentType || createMutation.isPending}
            data-testid="button-save-legal"
          >
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Document
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LegalDocumentCard({ document, onDelete }: { document: LegalDocument; onDelete: () => void }) {
  const { toast } = useToast();
  const typeInfo = documentTypes.find((t) => t.value === document.documentType) || documentTypes[documentTypes.length - 1];
  const statusInfo = statusOptions.find((s) => s.value === document.status) || statusOptions[0];
  const TypeIcon = typeInfo.icon;

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/legal-documents/${document.id}`);
    },
    onSuccess: () => {
      toast({ title: "Deleted", description: "Document has been removed." });
      onDelete();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete document.", variant: "destructive" });
    },
  });

  return (
    <Card className="group" data-testid={`card-legal-${document.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="p-2 bg-muted rounded-md">
            <TypeIcon className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium">{document.title}</h3>
              <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{document.description || "No description"}</p>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
              <span>{typeInfo.label}</span>
              {document.courtCase && <span>Case: {document.courtCase}</span>}
              <span>{format(new Date(document.createdAt), "MMM d, yyyy")}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" data-testid={`button-view-legal-${document.id}`}>
              <Eye className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" data-testid={`button-download-legal-${document.id}`}>
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              data-testid={`button-delete-legal-${document.id}`}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LegalPage() {
  const { environment } = useAuth();
  const [activeTab, setActiveTab] = useState("all");

  const { data: documents, isLoading, refetch } = useQuery<LegalDocument[]>({
    queryKey: ["/api/legal-documents"],
  });

  const allDocuments = documents || [];
  const activeDocuments = allDocuments.filter((d) => d.status === "active" || d.status === "filed");
  const pendingDocuments = allDocuments.filter((d) => d.status === "pending" || d.status === "draft");
  const courtOrders = allDocuments.filter((d) => d.documentType === "court_order");
  const agreements = allDocuments.filter((d) => d.documentType === "agreement" || d.documentType === "custody_plan");

  const exportData = () => {
    if (!allDocuments || allDocuments.length === 0) return;
    const headers = ["Title", "Type", "Status", "Description", "Case Number", "Date Added"];
    const csvContent = [
      headers.join(","),
      ...allDocuments.map(d =>
        [
          `"${d.title.replace(/"/g, '""')}"`,
          documentTypes.find(t => t.value === d.documentType)?.label || d.documentType,
          statusOptions.find(s => s.value === d.status)?.label || d.status,
          `"${(d.description || "").replace(/"/g, '""')}"`,
          `"${(d.courtCase || "").replace(/"/g, '""')}"`,
          format(new Date(d.createdAt), "yyyy-MM-dd")
        ].join(",")
      )
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `legal_documents_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24 md:pb-6" data-testid="page-legal">


      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Legal Documents</h1>
          <p className="text-sm text-muted-foreground">View agreements, court filings, and settlement documents.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportData} disabled={allDocuments.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <AddLegalDocumentDialog onSuccess={() => refetch()} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-md">
                <FileText className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{allDocuments.length}</p>
                <p className="text-xs text-muted-foreground">Total Documents</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-md">
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeDocuments.length}</p>
                <p className="text-xs text-muted-foreground">Active/Filed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-500/10 rounded-md">
                <Clock className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingDocuments.length}</p>
                <p className="text-xs text-muted-foreground">Pending/Draft</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-md">
                <Gavel className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{courtOrders.length}</p>
                <p className="text-xs text-muted-foreground">Court Orders</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : allDocuments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="p-4 bg-muted rounded-full mb-4">
              <Scale className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No Legal Documents</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
              Start by adding your court orders, agreements, and other legal documents.
            </p>
            <AddLegalDocumentDialog onSuccess={() => refetch()} />
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="all" data-testid="tab-all-legal">All ({allDocuments.length})</TabsTrigger>
            <TabsTrigger value="court_orders" data-testid="tab-court-orders">Court Orders ({courtOrders.length})</TabsTrigger>
            <TabsTrigger value="agreements" data-testid="tab-agreements">Agreements ({agreements.length})</TabsTrigger>
            <TabsTrigger value="pending" data-testid="tab-pending">Pending ({pendingDocuments.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="all" className="space-y-3">
            {allDocuments.map((doc) => (
              <LegalDocumentCard key={doc.id} document={doc} onDelete={() => refetch()} />
            ))}
          </TabsContent>
          <TabsContent value="court_orders" className="space-y-3">
            {courtOrders.map((doc) => (
              <LegalDocumentCard key={doc.id} document={doc} onDelete={() => refetch()} />
            ))}
          </TabsContent>
          <TabsContent value="agreements" className="space-y-3">
            {agreements.map((doc) => (
              <LegalDocumentCard key={doc.id} document={doc} onDelete={() => refetch()} />
            ))}
          </TabsContent>
          <TabsContent value="pending" className="space-y-3">
            {pendingDocuments.map((doc) => (
              <LegalDocumentCard key={doc.id} document={doc} onDelete={() => refetch()} />
            ))}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
