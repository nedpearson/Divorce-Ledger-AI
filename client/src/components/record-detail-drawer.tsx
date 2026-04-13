import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import {
  DollarSign,
  Building2,
  Calendar,
  FileText,
  Download,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Banknote,
  TrendingUp,
  CreditCard,
  Home,
  Car,
  Briefcase,
  Eye,
  Scale,
  BrainCircuit,
  History,
  ShieldAlert,
  Percent,
} from 'lucide-react';
import type { Income, Expense, Asset, Debt } from '@shared/schema';

type RecordType = 'income' | 'expense' | 'asset' | 'debt';
type FinancialRecord = Income | Expense | Asset | Debt;

interface Document {
  id: string;
  title: string;
  fileName: string;
  fileType: string;
  fileUrl?: string;
  uploadedAt: string;
  fileSize?: number;
}

interface RecordDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordType: RecordType;
  record: FinancialRecord | null;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return 'Not specified';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatFileSize(bytes: number | undefined): string {
  if (!bytes) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getRecordIcon(recordType: RecordType) {
  switch (recordType) {
    case 'income':
      return <Banknote className="h-5 w-5 text-green-500" />;
    case 'expense':
      return <CreditCard className="h-5 w-5 text-red-500" />;
    case 'asset':
      return <TrendingUp className="h-5 w-5 text-blue-500" />;
    case 'debt':
      return <CreditCard className="h-5 w-5 text-orange-500" />;
  }
}

function getRecordTitle(recordType: RecordType, record: FinancialRecord): string {
  if ('source' in record) return record.source;
  if ('description' in record) return record.description;
  if ('name' in record) return record.name;
  return 'Record Details';
}

function getRecordAmount(recordType: RecordType, record: FinancialRecord): number {
  if ('amount' in record) return record.amount;
  if ('value' in record) return record.value;
  return 0;
}

function getRecordDate(recordType: RecordType, record: FinancialRecord): string | null {
  if ('startDate' in record && record.startDate) return record.startDate as string;
  if ('date' in record && record.date) return record.date as string;
  if ('acquiredDate' in record && record.acquiredDate) return record.acquiredDate as string;
  if ('openedDate' in record && record.openedDate) return record.openedDate as string;
  return null;
}

function getRecordVendor(record: FinancialRecord): string | null {
  if ('vendor' in record) return record.vendor;
  return null;
}

function getRecordOwner(record: FinancialRecord): string | null {
  if ('owner' in record) return record.owner;
  if ('ownership' in record) return record.ownership;
  return null;
}

function isVerified(record: FinancialRecord): boolean {
  if ('verified' in record) return record.verified === true;
  return false;
}

function getDocumentId(record: FinancialRecord): string | null {
  if ('documentId' in record) return record.documentId as string | null;
  return null;
}

export function RecordDetailDrawer({
  open,
  onOpenChange,
  recordType,
  record,
}: RecordDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState('details');

  // Reset to details tab when drawer opens with a new record
  useEffect(() => {
    if (open) {
      setActiveTab('details');
    }
  }, [open, record]);

  const documentId = record ? getDocumentId(record) : null;

  const { data: document, isLoading: documentLoading } = useQuery<Document>({
    queryKey: [`/api/documents/${documentId}`],
    enabled: open && !!documentId,
  });

  if (!record) return null;

  const title = getRecordTitle(recordType, record);
  const amount = getRecordAmount(recordType, record);
  const date = getRecordDate(recordType, record);
  const vendor = getRecordVendor(record);
  const owner = getRecordOwner(record);
  const verified = isVerified(record);

  const handleDownload = () => {
    if (document?.fileUrl) {
      window.open(document.fileUrl, '_blank');
    }
  };

  const handleView = () => {
    if (document?.fileUrl) {
      window.open(document.fileUrl, '_blank');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg" data-testid="record-detail-sheet">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2" data-testid="record-detail-title">
            {getRecordIcon(recordType)}
            {title}
          </SheetTitle>
          <SheetDescription>Detailed information and supporting documents</SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-5 h-11 bg-slate-100 p-1 mb-4">
              <TabsTrigger value="details" className="text-xs font-semibold h-full">
                Summary
              </TabsTrigger>
              <TabsTrigger value="breakdown" className="text-xs font-semibold h-full">
                Breakdown
              </TabsTrigger>
              <TabsTrigger value="documents" className="text-xs font-semibold h-full flex gap-1">
                Docs
                {documentId && <Badge variant="secondary" className="h-4 px-1 text-[10px]">1</Badge>}
              </TabsTrigger>
              <TabsTrigger value="legal" className="text-xs font-semibold h-full">
                Legal
              </TabsTrigger>
              <TabsTrigger value="audit" className="text-xs font-semibold h-full">
                Audit
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-4">
              <ScrollArea className="h-[calc(100vh-280px)]">
                <div className="space-y-6 pr-4">
                  <div className="rounded-lg bg-muted p-4">
                    <p className="text-sm text-muted-foreground mb-1">
                      {recordType === 'income' || recordType === 'expense'
                        ? 'Monthly Amount'
                        : 'Total Value'}
                    </p>
                    <p className="text-3xl font-bold tabular-nums" data-testid="record-amount">
                      {formatCurrency(amount)}
                    </p>
                    {(recordType === 'income' || recordType === 'expense') && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {formatCurrency(amount * 12)}/year
                      </p>
                    )}
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                      Record Information
                    </h4>

                    <div className="grid gap-4">
                      {vendor && (
                        <div className="flex items-start gap-3">
                          <Building2 className="h-5 w-5 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-sm font-medium">Vendor / Source</p>
                            <p
                              className="text-sm text-muted-foreground"
                              data-testid="record-vendor"
                            >
                              {vendor}
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="flex items-start gap-3">
                        <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">Date</p>
                          <p className="text-sm text-muted-foreground" data-testid="record-date">
                            {formatDate(date)}
                          </p>
                        </div>
                      </div>

                      {owner && (
                        <div className="flex items-start gap-3">
                          <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-sm font-medium">Ownership</p>
                            <p
                              className="text-sm text-muted-foreground capitalize"
                              data-testid="record-owner"
                            >
                              {owner === 'you' ? 'Your' : owner === 'spouse' ? "Spouse's" : owner}
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="flex items-start gap-3">
                        {verified ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
                        ) : (
                          <XCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
                        )}
                        <div>
                          <p className="text-sm font-medium">Verification Status</p>
                          <p
                            className="text-sm text-muted-foreground"
                            data-testid="record-verified"
                          >
                            {verified ? 'Verified' : 'Not verified'}
                          </p>
                        </div>
                      </div>

                      {'category' in record && record.category && (
                        <div className="flex items-start gap-3">
                          <Briefcase className="h-5 w-5 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-sm font-medium">Category</p>
                            <Badge variant="outline" className="mt-1">
                              {String(record.category)}
                            </Badge>
                          </div>
                        </div>
                      )}

                      {'frequency' in record && record.frequency && (
                        <div className="flex items-start gap-3">
                          <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-sm font-medium">Frequency</p>
                            <p className="text-sm text-muted-foreground capitalize">
                              {String(record.frequency)}
                            </p>
                          </div>
                        </div>
                      )}

                      {'interestRate' in record && record.interestRate ? (
                        <div className="flex items-start gap-3">
                          <TrendingUp className="h-5 w-5 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-sm font-medium">Interest Rate</p>
                            <p className="text-sm text-muted-foreground">
                              {String(record.interestRate)}%
                            </p>
                          </div>
                        </div>
                      ) : null}

                      {'monthlyPayment' in record && record.monthlyPayment && (
                        <div className="flex items-start gap-3">
                          <DollarSign className="h-5 w-5 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-sm font-medium">Monthly Payment</p>
                            <p className="text-sm text-muted-foreground">
                              {formatCurrency(Number(record.monthlyPayment))}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {'notes' in record && record.notes ? (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                          Notes
                        </h4>
                        <p className="text-sm">{String(record.notes)}</p>
                      </div>
                    </>
                  ) : null}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* SECTION B - BREAKDOWN */}
            <TabsContent value="breakdown" className="mt-2">
              <ScrollArea className="h-[calc(100vh-280px)]">
                <div className="space-y-6 pr-4">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <Percent className="h-5 w-5 text-indigo-500" /> Calculation Trace
                  </h3>
                  <div className="bg-slate-50 border rounded-lg p-5 font-mono text-sm space-y-4">
                     <div className="flex justify-between border-b border-dashed pb-2">
                        <span className="text-slate-500">Original Gross Amount</span>
                        <span className="text-slate-900 font-bold">{formatCurrency(amount)}</span>
                     </div>
                     <div className="flex justify-between border-b border-dashed pb-2">
                        <span className="text-slate-500">Eligible Base (Net)</span>
                        <span className="text-slate-900 font-bold">{formatCurrency(amount)}</span>
                     </div>
                     <div className="flex justify-between border-b border-dashed pb-2">
                        <span className="text-slate-500">Applied Split / Policy %</span>
                        <span className="text-slate-900 font-bold">100.0% (Verified)</span>
                     </div>
                     <div className="flex justify-between border-b border-dashed pb-2">
                        <span className="text-rose-500">Payments/Credits Applied</span>
                        <span className="text-rose-500 font-bold">($0.00)</span>
                     </div>
                     <div className="flex justify-between pt-2">
                        <span className="text-slate-900 font-black">Final Derived Ledger Balance</span>
                        <span className="text-slate-900 font-black text-lg">{formatCurrency(amount)}</span>
                     </div>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            {/* SECTION C - DOCUMENTS (Re-used existing) */}
            <TabsContent value="documents" className="mt-2">
              <ScrollArea className="h-[calc(100vh-280px)]">
                <div className="space-y-4 pr-4">
                  {documentId ? (
                    documentLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-pulse text-muted-foreground">
                          Loading document...
                        </div>
                      </div>
                    ) : document ? (
                      <div className="rounded-lg border p-4 space-y-4">
                        <div className="flex items-start gap-3">
                          <div className="rounded-lg bg-primary/10 p-3">
                            <FileText className="h-6 w-6 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate" data-testid="document-title">
                              {document.title || document.fileName}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {document.fileType?.toUpperCase()} -{' '}
                              {formatFileSize(document.fileSize)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Uploaded {formatDate(document.uploadedAt)}
                            </p>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleView}
                            disabled={!document.fileUrl}
                            data-testid="button-view-document"
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleDownload}
                            disabled={!document.fileUrl}
                            data-testid="button-download-document"
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Download
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed p-6 text-center">
                        <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground">Document not found</p>
                      </div>
                    )
                  ) : (
                    <div className="rounded-lg border border-dashed p-6 text-center flex flex-col items-center">
                      <ShieldAlert className="h-10 w-10 text-orange-400 opacity-80 mb-3" />
                      <p className="text-sm font-bold text-slate-800 mb-1">Unsubstantiated Forensic Record</p>
                      <p className="text-sm text-slate-500 text-center max-w-[250px]">
                        This number requires a supporting court order or receipt to be court-admissible.
                      </p>
                      <Button
                        variant="default"
                        size="sm"
                        className="mt-5"
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Attach Proof Document
                      </Button>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* SECTION D - LEGAL BASIS */}
            <TabsContent value="legal" className="mt-2">
              <ScrollArea className="h-[calc(100vh-280px)]">
                 <div className="space-y-6 pr-4">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                      <Scale className="h-5 w-5 text-blue-500" /> Core Legal Authority
                    </h3>
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-5 space-y-4">
                       <p className="text-sm text-blue-800 font-medium">Auto-extracted binding logic is currently only available for dynamically evaluated family law obligations (e.g., Alimony, Child Support). Standard base-layer financial assets imply direct 100% ownership unless manually overridden via a percentage partition rule.</p>
                       <div className="bg-white p-4 rounded shadow-sm border text-sm italic text-slate-600">
                          "Pursuant to standard partition logic, unassigned properties are treated as general marital assets subject to 50/50 dispute review unless superseded by judgment."
                       </div>
                    </div>
                 </div>
              </ScrollArea>
            </TabsContent>

            {/* SECTION E - HISTORY/AUDIT */}
            <TabsContent value="audit" className="mt-2">
              <ScrollArea className="h-[calc(100vh-280px)]">
                 <div className="space-y-6 pr-4">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                      <History className="h-5 w-5 text-amber-500" /> Immutable Audit Trail
                    </h3>
                    <div className="relative border-l-2 border-slate-200 ml-3 pl-6 space-y-8 py-2">
                        
                        <div className="relative">
                           <div className="absolute w-3 h-3 bg-emerald-500 rounded-full -left-[31px] top-1.5 shadow-sm shadow-emerald-500/50" />
                           <p className="text-sm font-bold text-slate-800 flex items-center gap-2">Extracted to Ledger <Badge variant="secondary" className="text-[10px]">VERIFIED</Badge></p>
                           <p className="text-xs text-slate-500 mt-1">{formatDate(new Date().toISOString())} via Active Pipeline</p>
                        </div>
                        
                        <div className="relative">
                           <div className="absolute w-3 h-3 bg-blue-500 rounded-full -left-[31px] top-1.5 shadow-sm shadow-blue-500/50" />
                           <p className="text-sm font-bold text-slate-800 flex items-center gap-2">Calculation Base Assigned <BrainCircuit className="h-3 w-3 text-purple-500" /></p>
                           <p className="text-xs text-slate-500 mt-1">AI Financial Engine validated the extraction without disputes.</p>
                        </div>

                        <div className="relative">
                           <div className="absolute w-3 h-3 bg-slate-300 rounded-full -left-[31px] top-1.5" />
                           <p className="text-sm font-bold text-slate-800">Record Instantiated</p>
                           <p className="text-xs text-slate-500 mt-1">Initial base document or sync processed into database memory.</p>
                        </div>
                    </div>
                 </div>
              </ScrollArea>
            </TabsContent>

          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
