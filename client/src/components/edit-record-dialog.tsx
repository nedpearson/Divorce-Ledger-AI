import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type RecordType = 'income' | 'expense' | 'asset' | 'debt';

const ENDPOINT_MAP: Record<RecordType, string> = {
  income: '/api/incomes',
  expense: '/api/expenses',
  asset: '/api/assets',
  debt: '/api/debts',
};

// ─── DELETE CONFIRMATION DIALOG ──────────────────────────────────────────────

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordType: RecordType;
  recordId: string;
  recordName?: string;
}

export function DeleteConfirmDialog({ open, onOpenChange, recordType, recordId, recordName }: DeleteConfirmDialogProps) {
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('DELETE', `${ENDPOINT_MAP[recordType]}/${recordId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api', `${recordType}s`] });
      queryClient.invalidateQueries({ queryKey: ['/api', recordType === 'income' ? 'incomes' : recordType === 'expense' ? 'expenses' : recordType === 'asset' ? 'assets' : 'debts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/stats'] });
      toast({ title: `${recordType.charAt(0).toUpperCase() + recordType.slice(1)} deleted` });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: 'Delete failed', variant: 'destructive' });
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {recordType}?</AlertDialogTitle>
          <AlertDialogDescription>
            {recordName
              ? `Are you sure you want to delete "${recordName}"? This action cannot be undone.`
              : `Are you sure you want to delete this ${recordType}? This action cannot be undone.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── EDIT RECORD DIALOG ──────────────────────────────────────────────────────

interface EditRecordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordType: RecordType;
  record: any;
}

export function EditRecordDialog({ open, onOpenChange, recordType, record }: EditRecordDialogProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState<Record<string, string>>({});

  // Sync form data when dialog opens with new record
  useEffect(() => {
    if (record && open) {
      const initial: Record<string, string> = {};
      if (recordType === 'income') {
        initial.source = record.source || '';
        initial.amount = String((record.amount || 0) / 100);
        initial.frequency = record.frequency || 'monthly';
        initial.owner = record.owner || 'you';
        initial.vendor = record.vendor || '';
      } else if (recordType === 'expense') {
        initial.category = record.category || '';
        initial.description = record.description || '';
        initial.amount = String((record.amount || 0) / 100);
        initial.frequency = record.frequency || 'monthly';
        initial.owner = record.owner || 'you';
        initial.vendor = record.vendor || '';
      } else if (recordType === 'asset') {
        initial.name = record.name || '';
        initial.category = record.category || '';
        initial.value = String((record.value || 0) / 100);
        initial.ownership = record.ownership || 'joint';
        initial.vendor = record.vendor || '';
      } else if (recordType === 'debt') {
        initial.name = record.name || '';
        initial.category = record.category || '';
        initial.amount = String((record.amount || 0) / 100);
        initial.monthlyPayment = String((record.monthlyPayment || 0) / 100);
        initial.ownership = record.ownership || 'joint';
        initial.vendor = record.vendor || '';
      }
      setFormData(initial);
    }
  }, [record, open, recordType]);

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      return apiRequest('PATCH', `${ENDPOINT_MAP[recordType]}/${record.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api'] });
      toast({ title: `${recordType.charAt(0).toUpperCase() + recordType.slice(1)} updated` });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: 'Update failed', variant: 'destructive' });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, any> = {};

    if (recordType === 'income') {
      payload.source = formData.source;
      payload.amount = Math.round(parseFloat(formData.amount || '0') * 100);
      payload.frequency = formData.frequency;
      payload.owner = formData.owner;
      if (formData.vendor) payload.vendor = formData.vendor;
    } else if (recordType === 'expense') {
      payload.category = formData.category;
      payload.description = formData.description;
      payload.amount = Math.round(parseFloat(formData.amount || '0') * 100);
      payload.frequency = formData.frequency;
      payload.owner = formData.owner;
      if (formData.vendor) payload.vendor = formData.vendor;
    } else if (recordType === 'asset') {
      payload.name = formData.name;
      payload.category = formData.category;
      payload.value = Math.round(parseFloat(formData.value || '0') * 100);
      payload.ownership = formData.ownership;
      if (formData.vendor) payload.vendor = formData.vendor;
    } else if (recordType === 'debt') {
      payload.name = formData.name;
      payload.category = formData.category;
      payload.amount = Math.round(parseFloat(formData.amount || '0') * 100);
      payload.monthlyPayment = Math.round(parseFloat(formData.monthlyPayment || '0') * 100);
      payload.ownership = formData.ownership;
      if (formData.vendor) payload.vendor = formData.vendor;
    }

    updateMutation.mutate(payload);
  };

  const set = (key: string, value: string) => setFormData((prev) => ({ ...prev, [key]: value }));

  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {recordType.charAt(0).toUpperCase() + recordType.slice(1)}</DialogTitle>
          <DialogDescription>Update the details below and save.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* INCOME FIELDS */}
            {recordType === 'income' && (
              <>
                <div className="space-y-2">
                  <Label>Source</Label>
                  <Input value={formData.source || ''} onChange={(e) => set('source', e.target.value)} required data-testid="edit-income-source" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Amount ($)</Label>
                    <Input type="number" step="0.01" value={formData.amount || ''} onChange={(e) => set('amount', e.target.value)} required data-testid="edit-income-amount" />
                  </div>
                  <div className="space-y-2">
                    <Label>Frequency</Label>
                    <Select value={formData.frequency} onValueChange={(v) => set('frequency', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="biweekly">Bi-weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="annual">Annual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Owner</Label>
                  <Select value={formData.owner} onValueChange={(v) => set('owner', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="you">You</SelectItem>
                      <SelectItem value="spouse">Spouse</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* EXPENSE FIELDS */}
            {recordType === 'expense' && (
              <>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={formData.category} onValueChange={(v) => set('category', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['Housing', 'Utilities', 'Transportation', 'Healthcare', 'Food', 'Insurance', 'Legal Fees', 'Childcare', 'Education', 'Entertainment', 'Other'].map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input value={formData.description || ''} onChange={(e) => set('description', e.target.value)} data-testid="edit-expense-description" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Amount ($)</Label>
                    <Input type="number" step="0.01" value={formData.amount || ''} onChange={(e) => set('amount', e.target.value)} required data-testid="edit-expense-amount" />
                  </div>
                  <div className="space-y-2">
                    <Label>Frequency</Label>
                    <Select value={formData.frequency} onValueChange={(v) => set('frequency', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="annually">Annually</SelectItem>
                        <SelectItem value="one-time">One-time</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Vendor</Label>
                  <Input value={formData.vendor || ''} onChange={(e) => set('vendor', e.target.value)} data-testid="edit-expense-vendor" />
                </div>
              </>
            )}

            {/* ASSET FIELDS */}
            {recordType === 'asset' && (
              <>
                <div className="space-y-2">
                  <Label>Asset Name</Label>
                  <Input value={formData.name || ''} onChange={(e) => set('name', e.target.value)} required data-testid="edit-asset-name" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={formData.category} onValueChange={(v) => set('category', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['Real Estate', 'Vehicles', 'Bank Accounts', 'Investments', 'Retirement', 'Personal Property', 'Business', 'Other'].map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Value ($)</Label>
                    <Input type="number" step="0.01" value={formData.value || ''} onChange={(e) => set('value', e.target.value)} required data-testid="edit-asset-value" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Ownership</Label>
                  <Select value={formData.ownership} onValueChange={(v) => set('ownership', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="joint">Joint</SelectItem>
                      <SelectItem value="you">You</SelectItem>
                      <SelectItem value="spouse">Spouse</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Institution</Label>
                  <Input value={formData.vendor || ''} onChange={(e) => set('vendor', e.target.value)} data-testid="edit-asset-vendor" />
                </div>
              </>
            )}

            {/* DEBT FIELDS */}
            {recordType === 'debt' && (
              <>
                <div className="space-y-2">
                  <Label>Debt Name</Label>
                  <Input value={formData.name || ''} onChange={(e) => set('name', e.target.value)} required data-testid="edit-debt-name" />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={formData.category} onValueChange={(v) => set('category', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['Mortgage', 'Auto Loan', 'Credit Card', 'Student Loan', 'Personal Loan', 'Medical Debt', 'Tax Debt', 'Other'].map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Total Balance ($)</Label>
                    <Input type="number" step="0.01" value={formData.amount || ''} onChange={(e) => set('amount', e.target.value)} required data-testid="edit-debt-amount" />
                  </div>
                  <div className="space-y-2">
                    <Label>Monthly Payment ($)</Label>
                    <Input type="number" step="0.01" value={formData.monthlyPayment || ''} onChange={(e) => set('monthlyPayment', e.target.value)} data-testid="edit-debt-monthly" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Ownership</Label>
                  <Select value={formData.ownership} onValueChange={(v) => set('ownership', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="joint">Joint</SelectItem>
                      <SelectItem value="you">You</SelectItem>
                      <SelectItem value="spouse">Spouse</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Lender/Creditor</Label>
                  <Input value={formData.vendor || ''} onChange={(e) => set('vendor', e.target.value)} data-testid="edit-debt-vendor" />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-edit">
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
