import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Download,
  FileText,
  AlertTriangle,
  Scale,
  Calendar,
  DollarSign
} from 'lucide-react';
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

interface SpouseObligation {
  id: string;
  category: string;
  vendor: string;
  amountGross: number;
  partyAOwed: number;
  partyBOwed: number;
  dueDate: string;
  status: string;
  createdAt: string;
  document?: {
    fileName: string;
    fileUrl: string;
  };
  rule?: {
    partyBPercentage: number;
    effectiveStartDate: string;
  };
  citation?: {
    pageNumber: number;
    snippet: string;
    explanation: string;
  };
}

interface DueFromSpouseData {
  totals: {
    outstanding: number;
    pastDue: number;
    pendingReimbursement: number;
    upcomingDue: number;
    openCount: number;
    overdueCount: number;
    disputedCount: number;
  };
  records: SpouseObligation[];
}

export function SpouseObligationsWidget() {
  const { data, isLoading } = useQuery<DueFromSpouseData>({
    queryKey: ['/api/obligations/due-from-spouse'],
  });

  if (isLoading) {
    return <Card className="animate-pulse h-[400px]" />;
  }

  const { totals, records } = data || {
    totals: { outstanding: 0, pastDue: 0, pendingReimbursement: 0, upcomingDue: 0, openCount: 0, overdueCount: 0, disputedCount: 0 },
    records: []
  };

  const outstandingCents = totals.outstanding;
  const pastDueCents = totals.pastDue;

  const exportReport = () => {
    // Generate simple CSV
    const rows = [
      ['Category', 'Vendor', 'Gross Amount', 'Percentage', 'Spouse Share', 'Due Date', 'Status'],
      ...records.map(r => [
        r.category,
        r.vendor || 'Unknown',
        (r.amountGross / 100).toFixed(2),
        r.rule?.partyBPercentage ? `${r.rule.partyBPercentage}%` : 'Fixed/Custom',
        ((r.partyBOwed || 0) / 100).toFixed(2),
        r.dueDate ? format(new Date(r.dueDate), 'MMM d, yyyy') : 'No Date',
        r.status
      ])
    ];

    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Spouse_Obligations_Ledger.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Executive Summary Card */}
      <Card className="border-2 border-primary/10 overflow-hidden shadow-lg bg-gradient-to-br from-background to-secondary/10">
        <CardHeader className="bg-primary/5 pb-4 border-b">
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl md:text-2xl font-bold flex items-center gap-2">
              <Scale className="h-6 w-6 text-primary" />
              Due From Spouse (Legal Ledger)
            </CardTitle>
            <Button variant="outline" size="sm" onClick={exportReport}>
              <Download className="mr-2 h-4 w-4" /> Export Report
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
            <div className="space-y-1">
              <span className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                Total Outstanding
              </span>
              <p className="text-3xl font-bold">{formatCurrency((outstandingCents || 0) / 100)}</p>
              <Badge variant="outline" className="mt-1">
                {totals.openCount} Open Obligations
              </Badge>
            </div>

            <div className="space-y-1">
              <span className="text-sm font-medium text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Past Due
              </span>
              <p className="text-3xl font-bold text-destructive">{formatCurrency((pastDueCents || 0) / 100)}</p>
              {totals.overdueCount > 0 && (
                <Badge variant="destructive" className="mt-1">
                  {totals.overdueCount} Overdue
                </Badge>
              )}
            </div>

            <div className="space-y-1">
              <span className="text-sm font-medium text-orange-500">
                Pending / Disputed
              </span>
              <p className="text-3xl font-bold">{formatCurrency((totals.pendingReimbursement || 0) / 100)}</p>
              <span className="text-xs text-muted-foreground">{totals.disputedCount} Records</span>
            </div>

            <div className="space-y-1">
              <span className="text-sm font-medium text-green-600 flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Upcoming
              </span>
              <p className="text-3xl font-bold text-green-600">{formatCurrency((totals.upcomingDue || 0) / 100)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Drilldown Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Detailed Obligation Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No spouse obligations recorded yet. Upload legal documents and receipts to begin auto-extraction.
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category / Vendor</TableHead>
                    <TableHead>Gross</TableHead>
                    <TableHead>%</TableHead>
                    <TableHead>Spouse Owes</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Source (Drilldown)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((record) => (
                    <TableRow key={record.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell>
                        <div className="font-medium capitalize">{record.category.replace('_', ' ')}</div>
                        <div className="text-xs text-muted-foreground">{record.vendor}</div>
                      </TableCell>
                      <TableCell>{formatCurrency((record.amountGross || 0) / 100)}</TableCell>
                      <TableCell>
                        {record.rule?.partyBPercentage !== undefined ? (
                          <Badge variant="secondary">{record.rule.partyBPercentage}%</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Fixed</span>
                        )}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {formatCurrency((record.partyBOwed || 0) / 100)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={record.status === 'paid' ? 'default' : record.status === 'disputed' ? 'outline' : 'secondary'}>
                          {record.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {record.dueDate ? format(new Date(record.dueDate), 'MM/dd/yyyy') : '-'}
                      </TableCell>
                      <TableCell>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 group">
                              <FileText className="h-4 w-4 mr-2" />
                              View Justification
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-3xl">
                            <DialogHeader>
                              <DialogTitle className="flex items-center gap-2">
                                <Scale className="h-5 w-5" />
                                Legal Source Justification
                              </DialogTitle>
                            </DialogHeader>
                            <div className="space-y-6 pt-4">
                              <div className="p-4 bg-muted/30 rounded-lg space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <p className="text-sm font-semibold text-muted-foreground">Source Document</p>
                                    <p className="font-medium text-primary">
                                      {record.document?.fileName || 'Extracted Document'}
                                    </p>
                                    {record.document?.fileUrl && (
                                      <a href={record.document.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                                        View Original PDF
                                      </a>
                                    )}
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold text-muted-foreground">Page Reference</p>
                                    <Badge variant="outline">Page {record.citation?.pageNumber || 'N/A'}</Badge>
                                  </div>
                                </div>
                                <div className="pt-4 border-t">
                                  <p className="text-sm font-semibold text-muted-foreground mb-2">Extracted Legal Text (Binding Phrasing)</p>
                                  <div className="p-3 bg-white border shadow-sm rounded italic text-sm text-slate-700">
                                    "{record.citation?.snippet || 'No direct text phrase retained in audit log.'}"
                                  </div>
                                </div>
                              </div>
                              
                              <div className="p-4 bg-blue-50/50 rounded-lg border border-blue-100">
                                <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                                  <DollarSign className="h-4 w-4" /> AI Evaluation Engine
                                </h3>
                                <p className="text-sm text-blue-800 leading-relaxed">
                                  {record.citation?.explanation || 
                                   `Evaluated under categorized rule ruleset for ${record.category}. The engine verified the invoice amount of ${formatCurrency((record.amountGross||0)/100)} against the active percentage map resulting in a formal obligation of ${formatCurrency((record.partyBOwed||0)/100)}.`}
                                </p>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
