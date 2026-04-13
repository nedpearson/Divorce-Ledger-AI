import { useQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  Plus,
  DollarSign,
  Calendar,
  CheckCircle,
  Clock,
  AlertTriangle,
  Loader2,
  TrendingDown,
  TrendingUp,
  Landmark,
  Trash2,
  CheckSquare,
} from 'lucide-react';
import { format } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function AddObligationDialog({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('child_support');
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState('due_from_spouse');
  const [dueDate, setDueDate] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState('monthly');
  const [notes, setNotes] = useState('');
  const [generateHistorical, setGenerateHistorical] = useState(false);
  const [historicalStartDate, setHistoricalStartDate] = useState('');
  const [historicalEndDate, setHistoricalEndDate] = useState('');

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/obligations', data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Obligation Created', description: 'The formal obligation has been saved.' });
      setOpen(false);
      setCategory('child_support');
      setTitle('');
      setAmount('');
      setDueDate('');
      setNotes('');
      onSuccess();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to record obligation.', variant: 'destructive' });
    },
  });

  const handleSubmit = () => {
    createMutation.mutate({
      title,
      category,
      amountGross: amount,
      direction,
      dueDate,
      isRecurring,
      recurrenceFrequency: isRecurring ? recurrenceFrequency : null,
      notes,
      historicalStartDate: generateHistorical ? historicalStartDate : null,
      historicalEndDate: generateHistorical ? historicalEndDate : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-obligation">
          <Plus className="h-4 w-4 mr-2" />
          Create Obligation
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Financial Obligation</DialogTitle>
          <DialogDescription>Define a structured financial responsibility.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Obligation Source Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Monthly Child Support" />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="child_support">Child Support</SelectItem>
                  <SelectItem value="medical">Uninsured Medical</SelectItem>
                  <SelectItem value="tuition">Tuition</SelectItem>
                  <SelectItem value="extracurricular">Extracurricular</SelectItem>
                  <SelectItem value="reimbursement">Reimbursement</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Who Pays?</Label>
              <Select value={direction} onValueChange={setDirection}>
                <SelectTrigger>
                  <SelectValue placeholder="Direction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="due_from_spouse">Spouse pays User</SelectItem>
                  <SelectItem value="due_to_spouse">User pays Spouse</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Gross Obligation Amount</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>First Due Date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>

          <div className="flex items-center space-x-2 mt-4 pt-2 border-t">
            <Checkbox id="recurring" checked={isRecurring} onCheckedChange={(val) => setIsRecurring(!!val)} />
            <div className="grid gap-1.5 leading-none">
              <label htmlFor="recurring" className="text-sm font-medium leading-none cursor-pointer">
                Recurring Schedule
              </label>
              <p className="text-sm text-muted-foreground">Will automatically duplicate on the frequency below.</p>
            </div>
          </div>

          {isRecurring && (
            <div className="space-y-4 pl-6">
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select value={recurrenceFrequency} onValueChange={setRecurrenceFrequency}>
                  <SelectTrigger>
                    <SelectValue placeholder="Frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Bi-weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2 border-t pt-2 mt-2">
                <Checkbox id="historical" checked={generateHistorical} onCheckedChange={(val) => setGenerateHistorical(!!val)} />
                <label htmlFor="historical" className="text-sm font-medium leading-none cursor-pointer">Generate Historical Past Due</label>
              </div>
              
              {generateHistorical && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input type="date" value={historicalStartDate} onChange={(e) => setHistoricalStartDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input type="date" value={historicalEndDate} onChange={(e) => setHistoricalEndDate(e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2 pt-2 border-t">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Court order details..." />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!amount || !dueDate || !title || createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Obligation
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ObligationsPage() {
  const { toast } = useToast();
  const { data: summary, isLoading, refetch } = useQuery<any>({
    queryKey: ['/api/obligations/summary'],
  });

  const payMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('POST', `/api/obligations/${id}/pay`);
      if (!res.ok) throw new Error('Failed to pay');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Payment Marked', description: 'Obligation has been marked as fully paid.' });
      refetch();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update payment status.', variant: 'destructive' });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('DELETE', `/api/obligations/${id}`);
      if (!res.ok) throw new Error('Failed to delete');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Deleted', description: 'Obligation removed from the ledger.' });
      refetch();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete obligation.', variant: 'destructive' });
    }
  });

  if (isLoading) {
    return <div className="p-6">Loading ledger totals...</div>;
  }

  const { totals, records } = summary || { totals: {}, records: [] };

  const activeLedger = records.filter((r: any) => r.status !== 'paid');

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24 md:pb-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Obligations & Unified Ledger</h1>
          <p className="text-sm text-muted-foreground">
            Central orchestration for all parsed legal obligations, child support, and category allocations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AddObligationDialog onSuccess={() => refetch()} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="hover-elevate">
           <CardContent className="p-6">
              <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Due From Spouse</h3>
                    <p className="text-4xl font-bold text-green-600 dark:text-green-500 tabular-nums">
                       {formatCurrency(totals?.dueFromSpouse || 0)}
                    </p>
                  </div>
                  <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-xl">
                      <TrendingUp className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
              </div>
           </CardContent>
        </Card>
        
        <Card className="hover-elevate">
           <CardContent className="p-6">
              <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Due To Spouse</h3>
                    <p className="text-4xl font-bold text-red-600 dark:text-red-500 tabular-nums">
                       {formatCurrency(totals?.dueToSpouse || 0)}
                    </p>
                  </div>
                  <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-xl">
                      <TrendingDown className="h-6 w-6 text-red-600 dark:text-red-400" />
                  </div>
              </div>
           </CardContent>
        </Card>

        <Card className="bg-primary/5 border-primary/20 hover-elevate">
           <CardContent className="p-6">
              <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-sm font-medium text-primary mb-1">Net Position</h3>
                    <p className="text-4xl font-bold text-primary tabular-nums">
                       {formatCurrency(totals?.netPosition || 0)}
                    </p>
                  </div>
                  <div className="p-3 bg-primary/20 rounded-xl">
                      <Landmark className="h-6 w-6 text-primary" />
                  </div>
              </div>
           </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="ledger" className="w-full mt-6">
        <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent flex-wrap overflow-x-auto pb-px">
          <TabsTrigger value="ledger" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-3 pt-2 px-6">
             Open Ledger
          </TabsTrigger>
          <TabsTrigger value="child_support" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-3 pt-2 px-6">
             Child Support Flow
          </TabsTrigger>
          <TabsTrigger value="rules" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-3 pt-2 px-6">
             Percentage Rules
          </TabsTrigger>
        </TabsList>
        <TabsContent value="ledger" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Detailed Open Balance Ledger</CardTitle>
              <CardDescription>Line-item breakdown of outstanding owed values.</CardDescription>
            </CardHeader>
            <CardContent>
              {activeLedger.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">All obligations have been resolved.</div>
              ) : (
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Obligation</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Total Cost</TableHead>
                    <TableHead>Balance Owed</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeLedger.map((record: any) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">
                        {record.title || record.vendor}
                        {record.isArrearage && <Badge variant="destructive" className="ml-2">Arrears</Badge>}
                      </TableCell>
                      <TableCell>{record.category.replace('_', ' ')}</TableCell>
                      <TableCell>
                        {record.direction === 'due_from_spouse' ? 
                          <span className="text-green-600 flex items-center"><TrendingUp className="w-3 h-3 mr-1"/> From Spouse</span> : 
                          <span className="text-red-600 flex items-center"><TrendingDown className="w-3 h-3 mr-1"/> To Spouse</span>
                        }
                      </TableCell>
                      <TableCell>{formatCurrency(record.amountGross)}</TableCell>
                      <TableCell className="font-bold">{formatCurrency(record.remainingBalance ?? record.amountGross)}</TableCell>
                      <TableCell>{record.dueDate ? format(new Date(record.dueDate), 'MMM d, yy') : '-'}</TableCell>
                      <TableCell>
                         {record.status === 'overdue' ? <Badge variant="destructive">Overdue</Badge> : <Badge variant="secondary">Pending</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="icon" variant="outline" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => payMutation.mutate(record.id)} disabled={payMutation.isPending || deleteMutation.isPending} title="Mark as Paid">
                            <CheckSquare className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="outline" className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => deleteMutation.mutate(record.id)} disabled={payMutation.isPending || deleteMutation.isPending} title="Delete">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="child_support" className="pt-4">
           {/* Detailed Child Support Split out */}
           <Card>
             <CardHeader>
               <CardTitle>Dedicated Child Support Flow</CardTitle>
               <CardDescription>Specifically track recurring maintenance distinct from one-off ledger objects.</CardDescription>
             </CardHeader>
             <CardContent>
                 <div className="grid grid-cols-3 gap-4 mb-6">
                     <div className="p-4 bg-muted rounded-lg border">
                         <p className="text-sm text-muted-foreground mb-1">Current Support Arrears</p>
                         <p className="text-2xl font-bold text-red-600">{formatCurrency(totals?.childSupportArrears || 0)}</p>
                     </div>
                     <div className="p-4 bg-muted rounded-lg border">
                         <p className="text-sm text-muted-foreground mb-1">Standard Due Ongoing</p>
                         <p className="text-2xl font-bold">{formatCurrency((totals?.childSupportDue || 0) - (totals?.childSupportArrears || 0))}</p>
                     </div>
                 </div>
                 
                 <Table>
                    <TableHeader>
                      <TableRow>
                         <TableHead>Type</TableHead>
                         <TableHead>Interval</TableHead>
                         <TableHead>Gross</TableHead>
                         <TableHead>Owed</TableHead>
                         <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                       {activeLedger.filter((r: any) => r.category === 'child_support').map((record: any) => (
                           <TableRow key={record.id}>
                              <TableCell>{record.isArrearage ? 'Court Ordered Arrears' : 'Standard Child Support'}</TableCell>
                              <TableCell>{record.isRecurring ? record.recurrenceFrequency : 'One-time'}</TableCell>
                              <TableCell>{formatCurrency(record.amountGross)}</TableCell>
                              <TableCell className="font-semibold">{formatCurrency(record.remainingBalance)}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button size="icon" variant="outline" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => payMutation.mutate(record.id)} disabled={payMutation.isPending || deleteMutation.isPending} title="Mark as Paid">
                                    <CheckSquare className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="outline" className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => deleteMutation.mutate(record.id)} disabled={payMutation.isPending || deleteMutation.isPending} title="Delete">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                           </TableRow>
                       ))}
                    </TableBody>
                 </Table>
             </CardContent>
           </Card>
        </TabsContent>
        <TabsContent value="rules" className="pt-4">
           <Card>
             <CardHeader>
               <CardTitle>Category Percentage Allocation Rules</CardTitle>
               <CardDescription>Automatically route unstructured parsed expenses.</CardDescription>
               <Button size="sm" variant="outline" className="w-fit" onClick={() => alert('WIP: Rule Engine configuration modal')}>Add New Rule</Button>
             </CardHeader>
             <CardContent>
                 <div className="p-8 text-center text-muted-foreground mt-4 border border-dashed rounded-lg">
                    Rules engine actively binds to parsed documents. Navigate to Document Uploads to preview matching.
                 </div>
             </CardContent>
           </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
