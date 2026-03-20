import { useQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useAuth } from '@/lib/auth';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  Users,
  Plus,
  DollarSign,
  Calendar,
  CheckCircle,
  Clock,
  AlertTriangle,
  Loader2,
  TrendingUp,
  TrendingDown,
  Download,
} from 'lucide-react';
import type { ChildSupportPayment } from '@shared/schema';
import { DrillDownValue } from '@/components/ui/drilldown-value';
import { format } from 'date-fns';

const paymentTypes = [
  { value: 'child_support', label: 'Child Support' },
  { value: 'medical', label: 'Medical Expenses' },
  { value: 'education', label: 'Education' },
  { value: 'extracurricular', label: 'Extracurricular Activities' },
  { value: 'childcare', label: 'Childcare' },
  { value: 'other', label: 'Other' },
];

const paymentMethods = [
  { value: 'direct_deposit', label: 'Direct Deposit' },
  { value: 'check', label: 'Check' },
  { value: 'cash', label: 'Cash' },
  { value: 'wage_garnishment', label: 'Wage Garnishment' },
  { value: 'child_support_agency', label: 'Child Support Agency' },
  { value: 'other', label: 'Other' },
];

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function AddPaymentDialog({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [paymentType, setPaymentType] = useState('child_support');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [paidDate, setPaidDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [childName, setChildName] = useState('');
  const [notes, setNotes] = useState('');

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/child-support-payments', data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Payment Recorded', description: 'Child support payment has been recorded.' });
      setOpen(false);
      setPaymentType('child_support');
      setAmount('');
      setDueDate('');
      setPaidDate('');
      setPaymentMethod('');
      setChildName('');
      setNotes('');
      onSuccess();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to record payment.', variant: 'destructive' });
    },
  });

  const handleSubmit = () => {
    const amountCents = Math.round(parseFloat(amount) * 100);
    createMutation.mutate({
      paymentType,
      amount: amountCents,
      dueDate,
      paidDate: paidDate || null,
      paymentMethod: paymentMethod || null,
      childName: childName || null,
      notes: notes || null,
      status: paidDate ? 'paid' : 'pending',
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-payment">
          <Plus className="h-4 w-4 mr-2" />
          Record Payment
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Child Support Payment</DialogTitle>
          <DialogDescription>Track a child support payment or obligation.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="paymentType">Payment Type</Label>
            <Select value={paymentType} onValueChange={setPaymentType}>
              <SelectTrigger data-testid="select-payment-type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {paymentTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="amount">Amount</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="pl-9"
                data-testid="input-payment-amount"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                data-testid="input-due-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paidDate">Paid Date (optional)</Label>
              <Input
                id="paidDate"
                type="date"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
                data-testid="input-paid-date"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="paymentMethod">Payment Method</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger data-testid="select-payment-method">
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                {paymentMethods.map((method) => (
                  <SelectItem key={method.value} value={method.value}>
                    {method.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="childName">Child Name (optional)</Label>
            <Input
              id="childName"
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
              placeholder="Child's name"
              data-testid="input-child-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes..."
              data-testid="input-payment-notes"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!amount || !dueDate || createMutation.isPending}
            data-testid="button-save-payment"
          >
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Payment
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'paid':
      return (
        <Badge variant="default" className="flex items-center gap-1">
          <CheckCircle className="h-3 w-3" />
          Paid
        </Badge>
      );
    case 'pending':
      return (
        <Badge variant="outline" className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Pending
        </Badge>
      );
    case 'overdue':
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Overdue
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export default function ChildSupportPage() {
  const { environment } = useAuth();
  const { toast } = useToast();

  const {
    data: payments,
    isLoading,
    refetch,
  } = useQuery<ChildSupportPayment[]>({
    queryKey: ['/api/child-support-payments'],
  });

  const allPayments = payments || [];

  const totalPaid = allPayments
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + p.amount, 0);

  const totalPending = allPayments
    .filter((p) => p.status === 'pending')
    .reduce((sum, p) => sum + p.amount, 0);

  const overduePayments = allPayments.filter(
    (p) => p.status === 'pending' && new Date(p.dueDate) < new Date()
  );

  const totalOverdue = overduePayments.reduce((sum, p) => sum + p.amount, 0);

  const markAsPaid = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('PATCH', `/api/child-support-payments/${id}`, {
        status: 'paid',
        paidDate: new Date().toISOString(),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Payment Updated', description: 'Payment marked as paid.' });
      refetch();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update payment.', variant: 'destructive' });
    },
  });

  const exportData = () => {
    if (!allPayments || allPayments.length === 0) return;
    const headers = [
      'Type',
      'Amount',
      'Due Date',
      'Paid Date',
      'Status',
      'Method',
      'Child',
      'Notes',
    ];
    const csvContent = [
      headers.join(','),
      ...allPayments.map((p) => {
        const isOverdue = p.status === 'pending' && new Date(p.dueDate) < new Date();
        const displayStatus = isOverdue ? 'overdue' : p.status;
        return [
          paymentTypes.find((t) => t.value === p.paymentType)?.label || p.paymentType,
          (p.amount / 100).toFixed(2),
          format(new Date(p.dueDate), 'yyyy-MM-dd'),
          p.paidDate ? format(new Date(p.paidDate), 'yyyy-MM-dd') : '',
          displayStatus,
          paymentMethods.find((m) => m.value === p.paymentMethod)?.label || p.paymentMethod || '',
          `"${(p.childName || '').replace(/"/g, '""')}"`,
          `"${(p.notes || '').replace(/"/g, '""')}"`,
        ].join(',');
      }),
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `child_support_payments_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24 md:pb-6" data-testid="page-child-support">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">
            Child Support
          </h1>
          <p className="text-sm text-muted-foreground">
            Track child support payments, modifications, and custody arrangements.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportData}
            disabled={allPayments.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <AddPaymentDialog onSuccess={() => refetch()} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-md">
                <TrendingUp className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  <DrillDownValue
                    type="transactions"
                    title="Total Paid"
                    value={formatCurrency(totalPaid)}
                  />
                </p>
                <p className="text-xs text-muted-foreground">Total Paid</p>
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
                <p className="text-2xl font-bold">
                  <DrillDownValue
                    type="transactions"
                    title="Pending"
                    value={formatCurrency(totalPending)}
                  />
                </p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-md">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  <DrillDownValue
                    type="transactions"
                    title="Overdue"
                    value={formatCurrency(totalOverdue)}
                  />
                </p>
                <p className="text-xs text-muted-foreground">Overdue</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-md">
                <Calendar className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{allPayments.length}</p>
                <p className="text-xs text-muted-foreground">Total Records</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : allPayments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="p-4 bg-muted rounded-full mb-4">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No Payments Recorded</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
              Start tracking child support payments and obligations.
            </p>
            <AddPaymentDialog onSuccess={() => refetch()} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Payment History</CardTitle>
            <CardDescription>All child support payments and obligations</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Paid Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allPayments.map((payment) => {
                  const isOverdue =
                    payment.status === 'pending' && new Date(payment.dueDate) < new Date();
                  const displayStatus = isOverdue ? 'overdue' : payment.status;

                  return (
                    <TableRow key={payment.id} data-testid={`row-payment-${payment.id}`}>
                      <TableCell>
                        {paymentTypes.find((t) => t.value === payment.paymentType)?.label ||
                          payment.paymentType}
                        {payment.childName && (
                          <p className="text-xs text-muted-foreground">{payment.childName}</p>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(payment.amount)}
                      </TableCell>
                      <TableCell>{format(new Date(payment.dueDate), 'MMM d, yyyy')}</TableCell>
                      <TableCell>
                        {payment.paidDate ? format(new Date(payment.paidDate), 'MMM d, yyyy') : '-'}
                      </TableCell>
                      <TableCell>{getStatusBadge(displayStatus)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {paymentMethods.find((m) => m.value === payment.paymentMethod)?.label ||
                          '-'}
                      </TableCell>
                      <TableCell>
                        {payment.status === 'pending' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => markAsPaid.mutate(payment.id)}
                            disabled={markAsPaid.isPending}
                            data-testid={`button-mark-paid-${payment.id}`}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Mark Paid
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
