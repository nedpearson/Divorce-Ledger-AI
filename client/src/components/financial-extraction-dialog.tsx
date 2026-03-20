import { useState, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Upload, Sparkles, AlertTriangle, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/lib/auth';

interface FinancialExtraction {
  recordType: 'income' | 'expense' | 'asset' | 'debt' | 'unknown';
  category: string;
  description: string;
  amount: number | null;
  vendor: string | null;
  date: string | null;
  frequency: 'monthly' | 'weekly' | 'biweekly' | 'quarterly' | 'annually' | 'one-time';
  confidence: number;
  extractedText: string;
}

interface FinancialExtractionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EXPENSE_CATEGORIES = [
  'Housing',
  'Utilities',
  'Transportation',
  'Healthcare',
  'Food',
  'Insurance',
  'Legal Fees',
  'Childcare',
  'Education',
  'Entertainment',
  'Other',
];

const INCOME_SOURCES = [
  'Salary',
  'Wages',
  'Bonus',
  'Commission',
  'Investment',
  'Rental',
  'Child Support',
  'Alimony',
  'Business',
  'Social Security',
  'Other',
];

const ASSET_CATEGORIES = [
  'Real Estate',
  'Vehicle',
  'Bank Account',
  'Investment',
  'Retirement',
  'Business',
  'Personal Property',
  'Jewelry',
  'Art',
  'Other',
];

const DEBT_CATEGORIES = [
  'Mortgage',
  'Auto Loan',
  'Credit Card',
  'Student Loan',
  'Personal Loan',
  'Medical Debt',
  'Tax Debt',
  'Business Debt',
  'Other',
];

export function FinancialExtractionDialog({ open, onOpenChange }: FinancialExtractionDialogProps) {
  const [step, setStep] = useState<'upload' | 'analyzing' | 'review'>('upload');
  const [extraction, setExtraction] = useState<FinancialExtraction | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    recordType: 'expense' as 'income' | 'expense' | 'asset' | 'debt',
    category: '',
    description: '',
    amount: '',
    vendor: '',
    date: '',
    frequency: 'monthly',
    owner: 'you',
  });

  const analyzeMutation = useMutation({
    mutationFn: async (file: File) => {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          const base64Data = result.split(',')[1] || '';
          resolve(base64Data);
        };
        reader.readAsDataURL(file);
      });

      const response = await apiRequest('POST', '/api/capture/extract-financial', {
        fileName: file.name,
        fileType: file.type,
        base64Data: base64,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success && data.data) {
        const ext = data.data as FinancialExtraction;
        setExtraction(ext);
        setFormData({
          recordType: ext.recordType === 'unknown' ? 'expense' : ext.recordType,
          category: ext.category || '',
          description: ext.description || '',
          amount: ext.amount?.toString() || '',
          vendor: ext.vendor || '',
          date: ext.date || '',
          frequency: ext.frequency || 'monthly',
          owner: 'you',
        });
        setStep('review');
      } else {
        setStep('review');
        toast({
          title: 'Analysis completed',
          description: 'Please fill in the details manually.',
        });
      }
    },
    onError: () => {
      setStep('review');
      toast({
        title: 'Analysis failed',
        description: 'Please fill in the details manually.',
        variant: 'destructive',
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const endpoint = `/api/${formData.recordType}s`;
      const userId = user?.id || localStorage.getItem('userId') || 'demo-user';
      const payload: Record<string, unknown> = {
        amount: parseInt(formData.amount) || 0,
        verified: false,
        userId,
      };

      if (formData.recordType === 'income') {
        payload.source = formData.category;
        payload.frequency = formData.frequency;
        payload.owner = formData.owner;
        payload.vendor = formData.vendor;
        payload.startDate = formData.date;
      } else if (formData.recordType === 'expense') {
        payload.category = formData.category;
        payload.description = formData.description;
        payload.frequency = formData.frequency;
        payload.owner = formData.owner;
        payload.vendor = formData.vendor;
        payload.startDate = formData.date;
      } else if (formData.recordType === 'asset') {
        payload.name = formData.description;
        payload.category = formData.category;
        payload.ownership = formData.owner;
        payload.value = parseInt(formData.amount) || 0;
        delete payload.amount;
      } else if (formData.recordType === 'debt') {
        payload.creditor = formData.vendor || formData.description;
        payload.category = formData.category;
        payload.balance = parseInt(formData.amount) || 0;
        payload.interestRate = '0';
        payload.minimumPayment = 0;
        delete payload.amount;
      }

      return apiRequest('POST', endpoint, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/incomes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/expenses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/assets'] });
      queryClient.invalidateQueries({ queryKey: ['/api/debts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/stats'] });
      toast({
        title: 'Record saved',
        description: `${formData.recordType.charAt(0).toUpperCase() + formData.recordType.slice(1)} added successfully.`,
      });
      handleClose();
    },
    onError: () => {
      toast({
        title: 'Failed to save',
        description: 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setStep('analyzing');
      analyzeMutation.mutate(file);
    }
  };

  const handleClose = () => {
    setStep('upload');
    setExtraction(null);
    setSelectedFile(null);
    setFormData({
      recordType: 'expense',
      category: '',
      description: '',
      amount: '',
      vendor: '',
      date: '',
      frequency: 'monthly',
      owner: 'you',
    });
    onOpenChange(false);
  };

  const getCategoriesForType = () => {
    switch (formData.recordType) {
      case 'income':
        return INCOME_SOURCES;
      case 'expense':
        return EXPENSE_CATEGORIES;
      case 'asset':
        return ASSET_CATEGORIES;
      case 'debt':
        return DEBT_CATEGORIES;
      default:
        return EXPENSE_CATEGORIES;
    }
  };

  useEffect(() => {
    if (!open) {
      setStep('upload');
      setExtraction(null);
      setSelectedFile(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Scan Document
          </DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Upload a document to automatically extract financial data.'}
            {step === 'analyzing' && 'Analyzing your document...'}
            {step === 'review' && 'Review and approve the extracted data.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="py-8">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="image/*,.pdf"
              className="hidden"
              data-testid="input-scan-file"
            />
            <Button
              variant="outline"
              size="lg"
              className="w-full h-32 border-dashed flex flex-col gap-2"
              onClick={() => fileInputRef.current?.click()}
              data-testid="button-select-file"
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span>Click to upload document</span>
              <span className="text-xs text-muted-foreground">PDF, JPG, PNG supported</span>
            </Button>
          </div>
        )}

        {step === 'analyzing' && (
          <div className="py-12 flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Analyzing {selectedFile?.name}...</p>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4">
            {extraction && extraction.confidence < 0.6 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Low confidence extraction. Please review carefully.
                </AlertDescription>
              </Alert>
            )}

            {extraction && extraction.confidence >= 0.6 && (
              <Alert className="border-green-500/50 bg-green-500/10">
                <Check className="h-4 w-4 text-green-500" />
                <AlertDescription className="text-green-600 dark:text-green-400">
                  AI extracted data with {Math.round(extraction.confidence * 100)}% confidence
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label>Record Type</Label>
              <Select
                value={formData.recordType}
                onValueChange={(v) =>
                  setFormData({
                    ...formData,
                    recordType: v as typeof formData.recordType,
                    category: '',
                  })
                }
              >
                <SelectTrigger data-testid="select-record-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">Income</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="asset">Asset</SelectItem>
                  <SelectItem value="debt">Debt</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={formData.category}
                onValueChange={(v) => setFormData({ ...formData, category: v })}
              >
                <SelectTrigger data-testid="select-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {getCategoriesForType().map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="e.g., Monthly rent payment"
                data-testid="input-description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Amount ($)</Label>
                <Input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="0"
                  data-testid="input-amount"
                />
              </div>
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select
                  value={formData.frequency}
                  onValueChange={(v) => setFormData({ ...formData, frequency: v })}
                >
                  <SelectTrigger data-testid="select-frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Bi-weekly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="annually">Annually</SelectItem>
                    <SelectItem value="one-time">One-time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Vendor/Payee</Label>
              <Input
                value={formData.vendor}
                onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                placeholder="e.g., ABC Company"
                data-testid="input-vendor"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  data-testid="input-date"
                />
              </div>
              <div className="space-y-2">
                <Label>Owner</Label>
                <Select
                  value={formData.owner}
                  onValueChange={(v) => setFormData({ ...formData, owner: v })}
                >
                  <SelectTrigger data-testid="select-owner">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="you">You</SelectItem>
                    <SelectItem value="spouse">Spouse</SelectItem>
                    <SelectItem value="joint">Joint</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {step === 'review' && (
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !formData.category || !formData.amount}
              data-testid="button-approve-save"
            >
              {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Approve & Save
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
