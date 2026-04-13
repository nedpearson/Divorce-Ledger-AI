import { useState } from 'react';
import { useLocation } from 'wouter';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  FileText,
  Download,
  Building2,
  Calendar,
  DollarSign,
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { useDrilldown } from '@/lib/drilldown-context';

export type DrilldownType = 'assets' | 'debts' | 'income' | 'expenses' | 'transactions' | 'child_support' | 'alimony';

interface FinancialRecord {
  id: string;
  name?: string;
  source?: string;
  category?: string;
  description?: string;
  amount: number;
  value?: number;
  vendor?: string | null;
  documentId?: string | null;
  date?: string;
  acquiredDate?: string;
  openedDate?: string;
  startDate?: string;
  ownership?: string;
  owner?: string;
  verified?: boolean;
  frequency?: string;
  type?: string;
}

interface FinancialDrilldownDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: DrilldownType;
  title: string;
  environment: string;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function getRecordName(record: FinancialRecord): string {
  return record.name || record.source || record.description || record.category || 'Unknown';
}

function getRecordAmount(record: FinancialRecord): number {
  return record.value || record.amount || 0;
}

function getRecordDate(record: FinancialRecord): string {
  return record.date || record.acquiredDate || record.openedDate || record.startDate || '-';
}

export function FinancialDrilldownDrawer({
  open,
  onOpenChange,
  type,
  title,
  environment,
}: FinancialDrilldownDrawerProps) {
  const [activeTab, setActiveTab] = useState('records');
  const [, setLocation] = useLocation();
  const { openDrilldown } = useDrilldown();

  const { data, isLoading, error } = useQuery<{ records: FinancialRecord[] }>({
    queryKey: [`/api/finances/${type}?env=${environment}`],
    enabled: open,
  });

  const records = data?.records || [];
  const total = records.reduce((sum, r) => sum + getRecordAmount(r), 0);
  const withDocuments = records.filter((r) => r.documentId).length;

  const exportData = () => {
    if (records.length === 0) return;
    const headers = [
      'Name/Source',
      'Category',
      'Amount',
      'Date',
      'Vendor',
      'Verified',
      'Documented',
    ];

    let csvContent = headers.join(',') + '\\n';
    records.forEach((r) => {
      csvContent +=
        [
          `"${getRecordName(r).replace(/"/g, '""')}"`,
          r.category || '-',
          (getRecordAmount(r) / 100).toFixed(2),
          getRecordDate(r),
          `"${(r.vendor || '-').replace(/"/g, '""')}"`,
          r.verified ? 'Yes' : 'No',
          r.documentId ? 'Yes' : 'No',
        ].join(',') + '\\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `drilldown_${type}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl" data-testid="drilldown-sheet">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2" data-testid="drilldown-title">
            <DollarSign className="h-5 w-5 text-primary" />
            {title}
          </SheetTitle>
          <div className="flex items-center justify-between">
            <SheetDescription>
              Detailed breakdown with vendor information and supporting documents
            </SheetDescription>
            <Button
              variant="outline"
              size="sm"
              onClick={exportData}
              disabled={records.length === 0}
              className="h-8"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export
            </Button>
          </div>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-muted p-3">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-lg font-semibold" data-testid="drilldown-total">
                {formatCurrency(total)}
              </p>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <p className="text-xs text-muted-foreground">Records</p>
              <p className="text-lg font-semibold" data-testid="drilldown-count">
                {records.length}
              </p>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <p className="text-xs text-muted-foreground">Documented</p>
              <p className="text-lg font-semibold" data-testid="drilldown-documented">
                {withDocuments}
              </p>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="records" data-testid="tab-records">
                Records
              </TabsTrigger>
              <TabsTrigger value="documents" data-testid="tab-documents">
                Documents
              </TabsTrigger>
            </TabsList>

            <TabsContent value="records" className="mt-4">
              <ScrollArea className="h-[400px]">
                {isLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : records.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground flex flex-col items-center gap-4">
                    <p>No records found</p>
                    <div className="text-xs text-left bg-zinc-900 text-zinc-300 p-4 rounded-md overflow-auto w-full max-w-sm">
                      <p><strong>Debug Info:</strong></p>
                      <p>queryKey: {`/api/finances/${type}?env=${environment}`}</p>
                      <p>isLoading: {String(isLoading)}</p>
                      <p>data: {JSON.stringify(data)}</p>
                      <p>error: {error ? JSON.stringify(error) : String(error)}</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {records.map((record) => (
                      <div
                        key={record.id}
                        onClick={() => openDrilldown({ layer: 4, sourceEntity: 'financial_record', identifier: record.id })}
                        className="rounded-lg border p-3 space-y-2 hover-elevate cursor-pointer border-zinc-800 hover:border-blue-500/50 transition-colors"
                        data-testid={`record-${record.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{getRecordName(record)}</p>
                            {record.category && (
                              <Badge variant="secondary" className="mt-1">
                                {record.category}
                              </Badge>
                            )}
                          </div>
                          <p className="text-lg font-semibold whitespace-nowrap flex-shrink-0 pl-2">
                            {formatCurrency(getRecordAmount(record))}
                          </p>
                        </div>

                        <Separator />

                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Building2 className="h-3.5 w-3.5" />
                            <span className="truncate">{record.vendor || 'Not specified'}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Calendar className="h-3.5 w-3.5" />
                            <span>{getRecordDate(record)}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          {record.verified !== undefined && (
                            <div className="flex items-center gap-1 text-sm">
                              {record.verified ? (
                                <>
                                  <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                                  <span className="text-green-500">Verified</span>
                                </>
                              ) : (
                                <>
                                  <XCircle className="h-3.5 w-3.5 text-amber-500" />
                                  <span className="text-amber-500">Unverified</span>
                                </>
                              )}
                            </div>
                          )}
                          {record.ownership && (
                            <Badge variant="outline" className="text-xs">
                              {record.ownership}
                            </Badge>
                          )}
                          {record.owner && (
                            <Badge variant="outline" className="text-xs">
                              {record.owner}
                            </Badge>
                          )}
                          {record.documentId && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1"
                              data-testid={`download-doc-${record.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                openDrilldown({ layer: 5, sourceEntity: 'document', identifier: record.documentId!.toString() });
                              }}
                            >
                              <FileText className="h-3.5 w-3.5" />
                              View PDF
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="documents" className="mt-4">
              <ScrollArea className="h-[400px]">
                {isLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {records.filter((r) => r.documentId).length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No supporting documents attached
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Record</TableHead>
                            <TableHead>Vendor</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {records
                            .filter((r) => r.documentId)
                            .map((record) => (
                              <TableRow key={record.id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => openDrilldown({ layer: 5, sourceEntity: 'document', identifier: record.documentId!.toString() })}>
                                <TableCell className="font-medium">
                                  {getRecordName(record)}
                                </TableCell>
                                <TableCell>{record.vendor || '-'}</TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="gap-1 z-10"
                                    data-testid={`download-${record.id}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openDrilldown({ layer: 5, sourceEntity: 'document', identifier: record.documentId!.toString() });
                                    }}
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                    PDF
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>

          <div className="pt-4 border-t">
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => {
                onOpenChange(false);
                setLocation('/finances');
              }}
              data-testid="button-close-drilldown"
            >
              <ExternalLink className="h-4 w-4" />
              View Full {title} in Finances
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
