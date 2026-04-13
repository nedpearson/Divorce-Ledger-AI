import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';
import { TrendingUp, TrendingDown, Users, PieChart, Info, Scale, ArrowRight, ShieldCheck, Download, Calendar, DollarSign, BrainCircuit, AlertTriangle, FileText, Clock, MessageSquare } from 'lucide-react';
import { DrillDownValue } from '@/components/ui/drilldown-value';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount / 100);
}

export function FinancialBreakdownWidget() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ['/api/obligations/summary'],
  });

  if (isLoading) {
    return <Card className="animate-pulse h-[500px]" />;
  }

  const { totals, records } = data || { totals: {}, records: [] };

  const dueFromSpouse = records.filter((r: any) => r.direction === 'due_from_spouse' && r.status !== 'paid');
  const dueToSpouse = records.filter((r: any) => r.direction === 'due_to_spouse' && r.status !== 'paid');
  const childSupport = records.filter((r: any) => r.category === 'child_support' || r.category === 'alimony');

  // Group by category for Category Allocation Summary
  const categoryAllocations = [...records.reduce((acc: Map<string, number>, r: any) => {
    const amt = r.remainingBalance ?? r.amountGross;
    if (amt > 0) {
      acc.set(r.category, (acc.get(r.category) || 0) + amt);
    }
    return acc;
  }, new Map())].map(([category, amount]) => ({ category, amount }));

  return (
    <div className="space-y-6 fade-in-0 animate-in duration-500">
      <h2 className="text-xl font-bold px-1">Detailed Breakdown</h2>
      
      <Tabs defaultValue="due_from" className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-12 bg-muted/50 p-1">
          <TabsTrigger value="due_from" className="h-full font-medium">Due &gt; Spouse</TabsTrigger>
          <TabsTrigger value="due_to" className="h-full font-medium">Due &lt; Spouse</TabsTrigger>
          <TabsTrigger value="child_support" className="h-full font-medium">Child Support</TabsTrigger>
          <TabsTrigger value="allocations" className="h-full font-medium">Allocations</TabsTrigger>
        </TabsList>
        
        <TabsContent value="due_from" className="mt-4">
          <Card className="border-0 shadow-xl overflow-hidden">
             <CardHeader className="bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/20 dark:to-slate-900 border-b">
                <div className="flex justify-between items-center">
                   <div>
                      <CardTitle className="text-green-800 dark:text-green-400 font-bold flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" /> Detailed: Due From Spouse
                      </CardTitle>
                      <CardDescription className="text-green-700/70 dark:text-green-500/70 mt-1">Outstanding amounts the spouse is legally required to pay.</CardDescription>
                   </div>
                   <div className="text-right">
                      <p className="text-3xl font-black text-green-700 dark:text-green-400">{formatCurrency(totals?.dueFromSpouse || 0)}</p>
                   </div>
                </div>
             </CardHeader>
             <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-slate-50 dark:bg-slate-900">
                    <TableRow>
                      <TableHead className="pl-6">Category</TableHead>
                      <TableHead>Vendor/Desc</TableHead>
                      <TableHead>Rule %</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead className="text-right">Amount Owed</TableHead>
                      <TableHead className="text-right pr-6">Proof</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dueFromSpouse.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No outstanding bills due from spouse.</TableCell></TableRow>
                    ) : (
                      dueFromSpouse.map((r: any) => (
                        <TableRow key={r.id}>
                           <TableCell className="pl-6 font-medium capitalize">{r.category.replace('_', ' ')}</TableCell>
                           <TableCell className="text-slate-500">{r.vendor || r.title || 'N/A'}</TableCell>
                           <TableCell>{r.rule?.partyBPercentage !== undefined ? `${r.rule.partyBPercentage}%` : 'Custom'}</TableCell>
                           <TableCell>{r.dueDate ? format(new Date(r.dueDate), 'MMM d, yy') : '-'}</TableCell>
                           <TableCell className="text-right font-bold">{formatCurrency(r.remainingBalance ?? r.amountGross)}</TableCell>
                           <TableCell className="pr-6 py-2 text-right">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="outline" size="sm" className="shadow-sm hover:bg-slate-100 text-xs h-8">
                                    <Scale className="h-3 w-3 mr-1" /> Evidence
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-4xl p-0 overflow-hidden border-0 shadow-2xl">
                                  <div className="flex h-[550px]">
                                     <div className="w-1/3 bg-slate-900 text-white p-6 flex flex-col justify-between">
                                        <div>
                                          <div className="flex items-center gap-2 text-blue-400 mb-6"><Scale className="h-5 w-5" /><h3 className="font-bold">Legal Basis</h3></div>
                                          <div className="space-y-4">
                                             <div><p className="text-xs text-slate-400 uppercase">Gross Expense</p><p className="text-xl font-light">{formatCurrency(r.amountGross)}</p></div>
                                             <div><p className="text-xs text-slate-400 uppercase">Spouse Share %</p><p className="text-xl font-light">{r.rule?.partyBPercentage !== undefined ? `${r.rule.partyBPercentage}%` : 'Default/Fixed'}</p></div>
                                             <div className="h-px bg-slate-700 my-2" />
                                             <div><p className="text-xs text-emerald-400 font-bold uppercase">Balance</p><p className="text-3xl font-bold">{formatCurrency(r.remainingBalance ?? r.amountGross)}</p></div>
                                          </div>
                                        </div>
                                     </div>
                                     <div className="w-2/3 bg-white p-8 overflow-y-auto">
                                        <h2 className="text-2xl font-bold mb-6">Source Justification</h2>
                                        <div className="border rounded-xl p-4 bg-slate-50 flex justify-between items-center mb-6">
                                           <div className="flex items-center gap-3"><FileText className="h-6 w-6 text-blue-600" />
                                             <div><p className="text-sm font-bold">{r.document?.fileName || 'Extracted Component'}</p></div>
                                           </div>
                                           {r.document?.fileUrl && <Button variant="outline" size="sm" asChild><a href={r.document.fileUrl} target="_blank">View File</a></Button>}
                                        </div>
                                        <div>
                                          <h4 className="text-sm font-bold uppercase flex items-center gap-2 mb-3"><AlertTriangle className="h-4 w-4 text-amber-500" /> Court Phrasing</h4>
                                          <div className="bg-amber-50 p-5 rounded-lg border border-amber-100 font-serif italic">"{r.citation?.snippet || 'Data parsed automatically by ledger rules engine.'}"</div>
                                        </div>
                                     </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                           </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
             </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="due_to" className="mt-4">
          <Card className="border-0 shadow-xl overflow-hidden">
             <CardHeader className="bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/20 dark:to-slate-900 border-b">
                <div className="flex justify-between items-center">
                   <div>
                      <CardTitle className="text-red-800 dark:text-red-400 font-bold flex items-center gap-2">
                        <TrendingDown className="h-5 w-5" /> Detailed: Due To Spouse
                      </CardTitle>
                      <CardDescription className="text-red-700/70 dark:text-red-500/70 mt-1">Outstanding amounts you are legally required to pay the spouse.</CardDescription>
                   </div>
                   <div className="text-right">
                      <p className="text-3xl font-black text-red-700 dark:text-red-400">{formatCurrency(totals?.dueToSpouse || 0)}</p>
                   </div>
                </div>
             </CardHeader>
             <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-slate-50 dark:bg-slate-900">
                    <TableRow>
                      <TableHead className="pl-6">Category</TableHead>
                      <TableHead>Vendor/Desc</TableHead>
                      <TableHead>Rule %</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead className="text-right">Amount Owed</TableHead>
                      <TableHead className="text-right pr-6">Proof</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dueToSpouse.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No outstanding bills you owe the spouse.</TableCell></TableRow>
                    ) : (
                      dueToSpouse.map((r: any) => (
                        <TableRow key={r.id}>
                           <TableCell className="pl-6 font-medium capitalize">{r.category.replace('_', ' ')}</TableCell>
                           <TableCell className="text-slate-500">{r.vendor || r.title || 'N/A'}</TableCell>
                           <TableCell>{r.rule?.partyAPercentage !== undefined ? `${r.rule.partyAPercentage}%` : 'Custom'}</TableCell>
                           <TableCell>{r.dueDate ? format(new Date(r.dueDate), 'MMM d, yy') : '-'}</TableCell>
                           <TableCell className="text-right font-bold">{formatCurrency(r.remainingBalance ?? r.amountGross)}</TableCell>
                           <TableCell className="pr-6 py-2 text-right">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="outline" size="sm" className="shadow-sm hover:bg-slate-100 text-xs h-8">
                                    <Scale className="h-3 w-3 mr-1" /> Evidence
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-4xl p-0 overflow-hidden border-0 shadow-2xl">
                                  <div className="flex h-[550px]">
                                     <div className="w-1/3 bg-slate-900 text-white p-6 flex flex-col justify-between">
                                        <div>
                                          <div className="flex items-center gap-2 text-blue-400 mb-6"><Scale className="h-5 w-5" /><h3 className="font-bold">Legal Basis</h3></div>
                                          <div className="space-y-4">
                                             <div><p className="text-xs text-slate-400 uppercase">Gross Expense</p><p className="text-xl font-light">{formatCurrency(r.amountGross)}</p></div>
                                             <div><p className="text-xs text-slate-400 uppercase">Your Share %</p><p className="text-xl font-light">{r.rule?.partyAPercentage !== undefined ? `${r.rule.partyAPercentage}%` : 'Default/Fixed'}</p></div>
                                             <div className="h-px bg-slate-700 my-2" />
                                             <div><p className="text-xs text-emerald-400 font-bold uppercase">Balance</p><p className="text-3xl font-bold">{formatCurrency(r.remainingBalance ?? r.amountGross)}</p></div>
                                          </div>
                                        </div>
                                     </div>
                                     <div className="w-2/3 bg-white p-8 overflow-y-auto">
                                        <h2 className="text-2xl font-bold mb-6">Source Justification</h2>
                                        <div className="border rounded-xl p-4 bg-slate-50 flex justify-between items-center mb-6">
                                           <div className="flex items-center gap-3"><FileText className="h-6 w-6 text-blue-600" />
                                             <div><p className="text-sm font-bold">{r.document?.fileName || 'Extracted Component'}</p></div>
                                           </div>
                                           {r.document?.fileUrl && <Button variant="outline" size="sm" asChild><a href={r.document.fileUrl} target="_blank">View File</a></Button>}
                                        </div>
                                        <div>
                                          <h4 className="text-sm font-bold uppercase flex items-center gap-2 mb-3"><AlertTriangle className="h-4 w-4 text-amber-500" /> Court Phrasing</h4>
                                          <div className="bg-amber-50 p-5 rounded-lg border border-amber-100 font-serif italic">"{r.citation?.snippet || 'Data parsed automatically by ledger rules engine.'}"</div>
                                        </div>
                                     </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                           </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
             </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="child_support" className="mt-4">
          <Card className="border-0 shadow-xl overflow-hidden">
             <CardHeader className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/20 dark:to-slate-900 border-b">
                <div className="flex justify-between items-center">
                   <div>
                      <CardTitle className="text-blue-800 dark:text-blue-400 font-bold flex items-center gap-2">
                        <Users className="h-5 w-5" /> Child Support Obligations
                      </CardTitle>
                      <CardDescription className="text-blue-700/70 dark:text-blue-500/70 mt-1">Maintenance, Arrears, and Alimony Tracking.</CardDescription>
                   </div>
                   <div className="text-right">
                      <p className="text-3xl font-black text-blue-700 dark:text-blue-400">{formatCurrency(totals?.childSupportDue || 0)}</p>
                   </div>
                </div>
             </CardHeader>
             <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-slate-50 dark:bg-slate-900">
                    <TableRow>
                      <TableHead className="pl-6">Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead className="text-right pr-6">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {childSupport.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No child support records found.</TableCell></TableRow>
                    ) : (
                      childSupport.map((r: any) => (
                        <TableRow key={r.id}>
                           <TableCell className="pl-6 font-medium capitalize">
                              {r.category.replace('_', ' ')}
                              {r.isArrearage && <Badge variant="destructive" className="ml-2">Arrears</Badge>}
                           </TableCell>
                           <TableCell>
                             {r.status === 'paid' ? <Badge className="bg-blue-500">Paid</Badge> : <Badge variant="outline">Pending</Badge>}
                           </TableCell>
                           <TableCell>{r.dueDate ? format(new Date(r.dueDate), 'MMM d, yyyy') : '-'}</TableCell>
                           <TableCell className="text-right pr-6 font-bold">{formatCurrency(r.remainingBalance ?? r.amountGross)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
             </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="allocations" className="mt-4">
          <Card className="border-0 shadow-xl overflow-hidden">
             <CardHeader className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 dark:from-indigo-950/20 dark:to-slate-900 border-b">
                <div className="flex justify-between items-center">
                   <div>
                      <CardTitle className="text-indigo-800 dark:text-indigo-400 font-bold flex items-center gap-2">
                        <PieChart className="h-5 w-5" /> Category Allocation Summary
                      </CardTitle>
                      <CardDescription className="text-indigo-700/70 dark:text-indigo-500/70 mt-1">Distribution of total active obligations by category.</CardDescription>
                   </div>
                </div>
             </CardHeader>
             <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-slate-50 dark:bg-slate-900">
                    <TableRow>
                      <TableHead className="pl-6">Category</TableHead>
                      <TableHead className="text-right pr-6">Total Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categoryAllocations.length === 0 ? (
                      <TableRow><TableCell colSpan={2} className="text-center py-8 text-muted-foreground">No allocations found.</TableCell></TableRow>
                    ) : (
                      categoryAllocations.map((a: any) => (
                        <TableRow key={a.category}>
                           <TableCell className="pl-6 font-medium capitalize">{a.category.replace('_', ' ')}</TableCell>
                           <TableCell className="text-right pr-6 font-bold">{formatCurrency(a.amount)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
             </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
