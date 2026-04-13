import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  DollarSign,
  TrendingDown,
  TrendingUp,
  BrainCircuit,
  MessageSquare,
  Clock,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { DrillDownValue } from '@/components/ui/drilldown-value';

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
    outstanding: number; // Due From Spouse
    pastDue: number;
    pendingReimbursement: number;
    upcomingDue: number;
    dueToSpouse: number;
    netPosition: number;
    openCount: number;
    overdueCount: number;
    disputedCount: number;
  };
  records: SpouseObligation[];
}

function calculateInsights(data: DueFromSpouseData) {
  const insights = [];
  
  if (data.totals.overdueCount > 0) {
    // Find largest overdue
    const overdue = data.records.filter(r => r.dueDate && new Date(r.dueDate) < new Date() && r.status === 'pending');
    overdue.sort((a,b) => (b.partyBOwed || 0) - (a.partyBOwed || 0));
    if (overdue.length > 0) {
       insights.push(`Largest overdue obligation is ${overdue[0].category.replace('_', ' ')} (${formatCurrency((overdue[0].partyBOwed||0)/100)}).`);
    }
  }

  if (data.totals.disputedCount > 0) {
    insights.push(`${data.totals.disputedCount} obligations are pending manual review or flagged as disputed.`);
  }

  // Find most recent addition
  const sortedByDate = [...data.records].sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (sortedByDate.length > 0) {
    const newest = sortedByDate[0];
    insights.push(`Balance last updated heavily after ${newest.document?.fileName || 'new document'} parsed on ${format(new Date(newest.createdAt), 'MMM do')}.`);
  }

  return insights;
}

export function SpouseObligationsWidget() {
  const { data, isLoading } = useQuery<DueFromSpouseData>({
    queryKey: ['/api/obligations/due-from-spouse'],
  });

  if (isLoading) {
    return <Card className="animate-pulse h-[500px]" />;
  }

  const { totals, records } = data || {
    totals: { outstanding: 0, pastDue: 0, pendingReimbursement: 0, upcomingDue: 0, dueToSpouse: 0, netPosition: 0, openCount: 0, overdueCount: 0, disputedCount: 0 },
    records: []
  };

  const insights = data ? calculateInsights(data) : [];

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
    link.setAttribute("download", "Forensic_Spouse_Ledger.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 fade-in-0 animate-in duration-500">
      
      {/* Premium Hero Section */}
      <Card className="border-0 shadow-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-50 overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-5">
           <Scale className="w-64 h-64" />
        </div>
        
        <CardHeader className="pb-2 relative z-10 border-b border-slate-700/50">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-3xl font-extrabold tracking-tight flex items-center gap-3 text-white">
                DUE FROM SPOUSE
              </CardTitle>
              <CardDescription className="text-slate-400 mt-2 text-sm font-medium">
                Live Forensic Analysis. Calculated from court orders, uploaded bills, and extracted legal parameters.
              </CardDescription>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" size="sm" onClick={exportReport} className="shadow-lg shadow-black/20 hover:-translate-y-0.5 transition-transform">
                <Download className="mr-2 h-4 w-4" /> Court-Ready Export
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="pt-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Main Total Highlight */}
            <div className="lg:col-span-4 flex flex-col justify-center space-y-2 border-r border-slate-700/50 pr-6">
              <span className="text-sm font-semibold tracking-wider text-emerald-400 uppercase">
                Total Outstanding Balance
              </span>
              <DrillDownValue
                type="child_support"
                title="Outstanding Due From Spouse"
                className="text-6xl font-black text-white tracking-tighter cursor-pointer hover:text-emerald-300"
                value={formatCurrency((totals.outstanding || 0) / 100)}
              />
              <div className="flex items-center gap-2 mt-4 text-slate-300 text-sm">
                <ShieldCheck className="h-4 w-4 text-blue-400" />
                <span>Legally Traceable Ledger</span>
              </div>
            </div>

            {/* Sub Metrics Grid */}
            <div className="lg:col-span-8 grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="space-y-2 bg-slate-800/40 p-4 rounded-xl backdrop-blur-sm border border-slate-700/30">
                <span className="text-xs font-semibold text-rose-400 flex items-center gap-1.5 uppercase tracking-wider">
                  <AlertTriangle className="h-3.5 w-3.5" /> Past Due
                </span>
                <DrillDownValue type="child_support" title="Past Due Overdue" className="text-2xl font-bold text-white hover:text-rose-300" value={formatCurrency((totals.pastDue || 0) / 100)} />
                <p className="text-xs text-slate-400 font-medium">{totals.overdueCount} Overdue Items</p>
              </div>

              <div className="space-y-2 bg-slate-800/40 p-4 rounded-xl backdrop-blur-sm border border-slate-700/30">
                <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wider">
                  <Calendar className="h-3.5 w-3.5" /> Upcoming
                </span>
                <DrillDownValue type="child_support" title="Upcoming Obligations" className="text-2xl font-bold text-white hover:text-emerald-300" value={formatCurrency((totals.upcomingDue || 0) / 100)} />
                <p className="text-xs text-slate-400 font-medium">Inside Grace Period</p>
              </div>

              <div className="space-y-2 bg-slate-800/40 p-4 rounded-xl backdrop-blur-sm border border-slate-700/30">
                <span className="text-xs font-semibold text-orange-400 flex items-center gap-1.5 uppercase tracking-wider">
                  <MessageSquare className="h-3.5 w-3.5" /> Disputed
                </span>
                <DrillDownValue type="child_support" title="Disputed or Flagged" className="text-2xl font-bold text-white hover:text-orange-300" value={formatCurrency((totals.pendingReimbursement || 0) / 100)} />
                <p className="text-xs text-slate-400 font-medium">{totals.disputedCount} Flagged Items</p>
              </div>
              
              <div className="space-y-2 bg-blue-500/10 p-4 rounded-xl backdrop-blur-sm border border-blue-500/20">
                <span className="text-xs font-semibold text-blue-300 flex items-center gap-1.5 uppercase tracking-wider">
                  <Scale className="h-3.5 w-3.5" /> Net Position
                </span>
                <DrillDownValue type="alimony" title="Global Net Position" className="text-2xl font-bold text-white hover:text-blue-300" value={formatCurrency((totals.netPosition || 0) / 100)} />
                <p className="text-xs text-blue-200/50 font-medium">After ${formatCurrency((totals.dueToSpouse||0)/100)} owed</p>
              </div>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* Grid Layout below Hero */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Column: Smart Insights */}
        <div className="lg:col-span-1 space-y-6">
           <Card className="border shadow-sm bg-blue-50/30 dark:bg-blue-950/20 overflow-hidden">
             <div className="h-1 w-full bg-blue-500"></div>
             <CardHeader className="pb-3">
               <CardTitle className="text-base font-semibold text-blue-900 dark:text-blue-200 flex items-center gap-2">
                 <BrainCircuit className="h-4 w-4 text-blue-600" />
                 Intelligence Brief
               </CardTitle>
             </CardHeader>
             <CardContent>
                <ul className="space-y-4">
                  {insights.map((ins, i) => (
                    <li key={i} className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed flex items-start gap-2">
                       <div className="min-w-[4px] mt-1.5 h-1.5 rounded-full bg-blue-400" />
                       {ins}
                    </li>
                  ))}
                  {insights.length === 0 && (
                     <p className="text-sm text-slate-500">Insufficient data volume to generate strategic insights.</p>
                  )}
                </ul>
             </CardContent>
           </Card>
        </div>

        {/* Right Column: Drilldown Table */}
        <div className="lg:col-span-3">
          <Card className="shadow-md border-slate-200 dark:border-slate-800 h-full">
            <CardHeader className="pb-0 pt-5 px-6">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold">Investigative Ledger</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-4 px-0">
              {records.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto opacity-20 mb-3" />
                  <p className="font-medium">No verified spouse obligations found.</p>
                  <p className="text-sm">Upload receipts or court orders to begin AI processing.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                      <TableRow className="border-b-2">
                        <TableHead className="pl-6 font-semibold">Category</TableHead>
                        <TableHead className="font-semibold text-right">Gross</TableHead>
                        <TableHead className="font-semibold text-center">Rule %</TableHead>
                        <TableHead className="font-semibold">Spouse Owes</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                        <TableHead className="font-semibold">Due</TableHead>
                        <TableHead className="font-semibold text-right pr-6">Proof</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {records.map((record) => {
                        
                        // Fallback logic
                        let spouseAmount = record.partyBOwed || 0; 
                        let percentage = record.rule?.partyBPercentage;
                        if (spouseAmount === 0 && record.amountGross && percentage) {
                           spouseAmount = Math.round(record.amountGross * (percentage / 100));
                        }

                        // Determine status styling
                        let statusColor = "bg-slate-100 text-slate-700";
                        if (record.status === 'pending') {
                           if (record.dueDate && new Date(record.dueDate) < new Date()) {
                              statusColor = "bg-rose-100 text-rose-700 border-rose-200";
                           } else {
                              statusColor = "bg-emerald-100 text-emerald-700";
                           }
                        } else if (record.status === 'paid') {
                           statusColor = "bg-blue-100 text-blue-700";
                        } else if (record.status === 'disputed') {
                           statusColor = "bg-orange-100 text-orange-700";
                        }

                        return (
                        <TableRow key={record.id} className="group hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                          <TableCell className="pl-6 py-4">
                            <div className="font-semibold text-slate-900 dark:text-slate-100 capitalize">{record.category.replace('_', ' ')}</div>
                            <div className="text-xs font-medium text-slate-500 mt-0.5 max-w-[200px] truncate">{record.vendor || 'Authorized Expense'}</div>
                          </TableCell>
                          <TableCell className="text-right py-4 text-slate-600 font-medium">
                            {formatCurrency((record.amountGross || 0) / 100)}
                          </TableCell>
                          <TableCell className="text-center py-4">
                            {percentage !== undefined ? (
                              <Badge variant="secondary" className="font-mono bg-slate-100 hover:bg-slate-200 text-slate-700">{percentage}%</Badge>
                            ) : (
                              <span className="text-xs font-medium text-slate-400">Custom</span>
                            )}
                          </TableCell>
                          <TableCell className="py-4">
                             <div className="font-bold text-slate-900 dark:text-slate-100 text-base">
                              {formatCurrency(spouseAmount / 100)}
                             </div>
                          </TableCell>
                          <TableCell className="py-4">
                            <Badge variant="outline" className={`font-semibold border-transparent ${statusColor}`}>
                              {record.status === 'pending' && record.dueDate && new Date(record.dueDate) < new Date() ? 'Overdue' : record.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-4 text-sm text-slate-600 font-medium">
                            {record.dueDate ? format(new Date(record.dueDate), 'MMM d, yy') : '-'}
                          </TableCell>
                          <TableCell className="pr-6 py-4 text-right">
                            
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm" className="shadow-sm border-slate-300 hover:bg-slate-100 hover:text-slate-900">
                                  <Scale className="h-3.5 w-3.5 mr-2" />
                                  Evidence
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-4xl p-0 overflow-hidden border-0 shadow-2xl">
                                <div className="flex h-[600px]">
                                   {/* Left Panel: Financial Calculation */}
                                   <div className="w-1/3 bg-slate-900 text-white p-6 flex flex-col justify-between">
                                      <div>
                                        <div className="flex items-center gap-2 text-blue-400 mb-6">
                                          <Scale className="h-5 w-5" />
                                          <h3 className="font-bold tracking-tight">Legal Basis</h3>
                                        </div>
                                        
                                        <div className="space-y-4">
                                           <div>
                                             <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Net Eligible Expense</p>
                                             <p className="text-2xl font-light">{formatCurrency((record.amountGross||0)/100)}</p>
                                           </div>
                                           <div>
                                             <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Court-Ordered Share</p>
                                             <p className="text-2xl font-light">{percentage !== undefined ? `${percentage}%` : 'Extracted Fixed'}</p>
                                           </div>
                                           <div className="h-px bg-slate-700 my-4" />
                                           <div>
                                             <p className="text-xs text-emerald-400 font-bold uppercase tracking-wider">Spouse Owes (Initial)</p>
                                             <p className="text-3xl font-bold text-white">{formatCurrency(spouseAmount/100)}</p>
                                           </div>
                                           <div>
                                             <p className="text-xs text-rose-400 font-bold uppercase tracking-wider mt-4">Credits Applied</p>
                                             <p className="text-xl font-light text-slate-300">$0.00</p>
                                           </div>
                                           <div className="h-px bg-slate-700 my-4" />
                                           <div>
                                             <p className="text-xs text-blue-400 font-bold uppercase tracking-wider">Remaining Balance</p>
                                             <p className="text-3xl font-black text-white">{formatCurrency(spouseAmount/100)}</p>
                                           </div>
                                        </div>
                                      </div>

                                      <div className="mt-8 pt-4 border-t border-slate-700/50">
                                        <p className="text-xs text-slate-500 font-mono flex items-center gap-2">
                                          <ShieldCheck className="h-3 w-3" />
                                          ID: {record.id.split('-')[0]}
                                        </p>
                                      </div>
                                   </div>

                                   {/* Right Panel: Source Evidence */}
                                   <div className="w-2/3 bg-white p-8 overflow-y-auto">
                                      <h2 className="text-2xl font-bold text-slate-900 mb-6">Court Document Proof</h2>
                                      
                                      <div className="space-y-8">
                                        
                                        {/* Source File */}
                                        <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 flex items-center justify-between">
                                          <div className="flex items-center gap-3">
                                            <div className="p-3 bg-white rounded-lg shadow-sm border border-slate-200">
                                              <FileText className="h-6 w-6 text-blue-600" />
                                            </div>
                                            <div>
                                              <p className="text-sm font-bold text-slate-900">{record.document?.fileName || 'Auto-Extracted Judgment'}</p>
                                              <p className="text-xs font-medium text-slate-500">Page Reference: {record.citation?.pageNumber || 'Implicit'}</p>
                                            </div>
                                          </div>
                                          {record.document?.fileUrl && (
                                            <Button variant="outline" size="sm" asChild>
                                              <a href={record.document.fileUrl} target="_blank" rel="noopener noreferrer">
                                                View Original
                                              </a>
                                            </Button>
                                          )}
                                        </div>

                                        {/* Exact Legal Phrasing */}
                                        <div>
                                          <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                                            Binding Legal Phrasing
                                          </h4>
                                          <div className="relative">
                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-400 rounded-l" />
                                            <div className="bg-amber-50 text-amber-900 p-5 pl-6 rounded-r-lg font-serif italic text-base leading-relaxed border border-amber-100">
                                               "{record.citation?.snippet || 'No explicit text block retained in extraction buffer. Refer directly to uploaded document.'}"
                                            </div>
                                          </div>
                                        </div>

                                        {/* AI Engine Justification */}
                                        <div>
                                          <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                                            <BrainCircuit className="h-4 w-4 text-purple-500" />
                                            Forensic AI Rationale
                                          </h4>
                                          <div className="bg-purple-50/50 p-5 rounded-lg border border-purple-100 text-slate-700 text-sm leading-relaxed">
                                            {record.citation?.explanation || 
                                              "The Forensic Engine evaluated the base expenditure against extracted court rules applying to the category. The percentage burden was algorithmically verified and the final remaining due amount was posted to the ledger for tracking."}
                                          </div>
                                        </div>

                                        {/* Event Timeline */}
                                        <div>
                                          <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                                            <Clock className="h-4 w-4 text-indigo-500" />
                                            Event Timeline
                                          </h4>
                                          <div className="space-y-4 pl-2">
                                            <div className="relative pl-6 border-l-2 border-indigo-100 pb-2">
                                              <div className="absolute w-3 h-3 bg-white border-2 border-indigo-400 rounded-full -left-[7px] top-1" />
                                              <p className="text-sm font-bold text-slate-800">Document Processed</p>
                                              <p className="text-xs text-slate-500 mt-0.5">{format(new Date(record.createdAt), 'MMM d, yyyy h:mm a')}</p>
                                            </div>
                                            <div className="relative pl-6 border-l-2 border-indigo-100 pb-2">
                                              <div className="absolute w-3 h-3 bg-white border-2 border-indigo-400 rounded-full -left-[7px] top-1" />
                                              <p className="text-sm font-bold text-slate-800">Spouse Responsibility Verified</p>
                                              <p className="text-xs text-slate-500 mt-0.5">Automated confirmation executed.</p>
                                            </div>
                                            {(record.status === 'pending' && record.dueDate && new Date(record.dueDate) < new Date()) && (
                                              <div className="relative pl-6 border-l-2 border-transparent">
                                                <div className="absolute w-3 h-3 bg-rose-500 rounded-full -left-[7px] top-1 shadow-sm shadow-rose-500/50" />
                                                <p className="text-sm font-bold text-rose-600">Overdue Event Triggered</p>
                                                <p className="text-xs text-rose-500/70 mt-0.5">Missed required payment deadline.</p>
                                              </div>
                                            )}
                                          </div>
                                        </div>

                                      </div>
                                   </div>
                                </div>
                              </DialogContent>
                            </Dialog>

                          </TableCell>
                        </TableRow>
                      )})}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>

    </div>
  );
}
