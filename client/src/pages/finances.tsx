import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Plus,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Upload,
  MoreVertical,
  Pencil,
  Trash2,
  Loader2,
  Building2,
  Calendar,
  FileText,
  ChevronRight,
  Sparkles,
  RefreshCw,
  Flame,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FeedbackCTA } from "@/components/feedback-cta";
import { FinancialExtractionDialog } from "@/components/financial-extraction-dialog";
import type { Income, Expense, Asset, Debt } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { FinancialDrilldownDrawer, type DrilldownType } from "@/components/financial-drilldown-drawer";
import { RecordDetailDrawer } from "@/components/record-detail-drawer";

type RecordType = "income" | "expense" | "asset" | "debt";
type FinancialRecord = Income | Expense | Asset | Debt;

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

interface TabProps {
  onRecordClick: (record: FinancialRecord) => void;
}

interface IncomeFireflySyncLog {
  id: string;
  sourceType: string;
  sourceId: string;
  status: string;
  syncedAt: string;
}

interface IncomeFireflyStatus {
  connected: boolean;
  instanceUrl: string | null;
  autoSyncEnabled: boolean;
}

function IncomeTab({ onRecordClick }: TabProps) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [syncingIncomeId, setSyncingIncomeId] = useState<string | null>(null);
  const { toast } = useToast();
  const { user, environment } = useAuth();

  const { data: incomes, isLoading } = useQuery<Income[]>({
    queryKey: ["/api", "incomes", { environment, userId: user?.id }],
  });

  const { data: fireflyStatus } = useQuery<IncomeFireflyStatus>({
    queryKey: ["/api", "firefly", "status", { environment, userId: user?.id }],
    queryFn: async () => {
      const res = await fetch("/api/firefly/status", {
        credentials: "include",
        headers: {
          "X-Environment": environment,
          "X-User-Id": user?.id || "",
        },
      });
      if (!res.ok) return { connected: false, instanceUrl: null, autoSyncEnabled: false };
      return res.json();
    },
  });

  const { data: syncLogs } = useQuery<IncomeFireflySyncLog[]>({
    queryKey: ["/api", "firefly", "sync-logs", { environment, userId: user?.id }],
    queryFn: async () => {
      const res = await fetch("/api/firefly/sync-logs", {
        credentials: "include",
        headers: {
          "X-Environment": environment,
          "X-User-Id": user?.id || "",
        },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: fireflyStatus?.connected === true,
  });

  const syncIncomeToFirefly = useMutation({
    mutationFn: async (incomeId: string) => {
      setSyncingIncomeId(incomeId);
      const res = await fetch(`/api/firefly/sync/income/${incomeId}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "X-Environment": environment,
          "X-User-Id": user?.id || "",
        },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to sync");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api", "firefly", "sync-logs", { environment, userId: user?.id }] });
      toast({ title: "Income synced to Firefly III" });
      setSyncingIncomeId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Sync failed", description: error.message, variant: "destructive" });
      setSyncingIncomeId(null);
    },
  });

  const addIncome = useMutation({
    mutationFn: async (data: Partial<Income>) => {
      return apiRequest("POST", "/api/incomes", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api", "incomes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setIsAddOpen(false);
      toast({ title: "Income source added successfully" });
    },
  });

  const deleteIncome = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/incomes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api", "incomes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Income source removed" });
    },
  });

  const getIncomeSyncStatus = (incomeId: string) => {
    if (!syncLogs) return null;
    const log = syncLogs.find(log => log.sourceType === "income" && log.sourceId === incomeId);
    return log && log.status === "success" ? log : null;
  };

  const totalIncome = incomes?.reduce((sum, i) => sum + i.amount, 0) || 0;
  const yourIncome = incomes?.filter((i) => i.owner === "you").reduce((sum, i) => sum + i.amount, 0) || 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Monthly Income Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {incomes?.map((income) => (
              <div 
                key={income.id} 
                className="flex items-center gap-3 p-3 rounded-lg border hover-elevate cursor-pointer"
                data-testid={`row-income-${income.id}`}
                onClick={() => onRecordClick(income)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-medium truncate">
                      {income.source} ({income.owner === "you" ? "Your" : "Spouse"})
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums">{formatCurrency(income.amount)}/mo</span>
                      {income.verified ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2 flex-wrap">
                    <div className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      <span>{income.vendor || "Not specified"}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>{income.startDate || "No date"}</span>
                    </div>
                    {income.documentId && (
                      <div className="flex items-center gap-1 text-primary">
                        <FileText className="h-3 w-3" />
                        <span>PDF attached</span>
                      </div>
                    )}
                    {fireflyStatus?.connected && getIncomeSyncStatus(income.id) && (
                      <Badge variant="outline" className="text-xs py-0 px-1.5 gap-1">
                        <Flame className="h-2.5 w-2.5 text-orange-500" />
                        Synced
                      </Badge>
                    )}
                  </div>
                  <Progress
                    value={(income.amount / totalIncome) * 100}
                    className="h-2"
                  />
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" data-testid={`button-income-menu-${income.id}`} onClick={(e) => e.stopPropagation()}>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    {fireflyStatus?.connected && !getIncomeSyncStatus(income.id) && (
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          syncIncomeToFirefly.mutate(income.id);
                        }}
                        disabled={syncingIncomeId === income.id}
                      >
                        {syncingIncomeId === income.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Flame className="mr-2 h-4 w-4 text-orange-500" />
                        )}
                        Sync to Firefly III
                      </DropdownMenuItem>
                    )}
                    {fireflyStatus?.connected && getIncomeSyncStatus(income.id) && (
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          syncIncomeToFirefly.mutate(income.id);
                        }}
                        disabled={syncingIncomeId === income.id}
                      >
                        {syncingIncomeId === income.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        Re-sync to Firefly III
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => deleteIncome.mutate(income.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}

            <div className="border-t pt-4 mt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">TOTAL</span>
                <span className="font-semibold tabular-nums">{formatCurrency(totalIncome)}/mo</span>
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground mt-1">
                <span>Your Portion</span>
                <span className="tabular-nums">{formatCurrency(yourIncome)}/mo</span>
              </div>
            </div>
          </div>

          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="w-full mt-4" variant="outline" data-testid="button-add-income">
                <Plus className="mr-2 h-4 w-4" />
                Add Income Source
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Income Source</DialogTitle>
                <DialogDescription>
                  Add a new income source to track your finances.
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const dollarAmount = parseFloat(formData.get("amount") as string) || 0;
                  addIncome.mutate({
                    source: formData.get("source") as string,
                    amount: Math.round(dollarAmount * 100),
                    frequency: formData.get("frequency") as string,
                    owner: formData.get("owner") as string,
                    verified: false,
                    userId: "demo-user",
                  });
                }}
              >
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="source">Source</Label>
                    <Input id="source" name="source" placeholder="e.g., Salary, Bonus, Rental" required data-testid="input-income-source" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount (Monthly)</Label>
                    <Input id="amount" name="amount" type="number" placeholder="5000" required data-testid="input-income-amount" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="frequency">Frequency</Label>
                    <Select name="frequency" defaultValue="monthly">
                      <SelectTrigger data-testid="select-income-frequency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="biweekly">Bi-weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="annual">Annual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="owner">Owner</Label>
                    <Select name="owner" defaultValue="you">
                      <SelectTrigger data-testid="select-income-owner">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="you">You</SelectItem>
                        <SelectItem value="spouse">Spouse</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={addIncome.isPending} data-testid="button-submit-income">
                    {addIncome.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add Income
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}

interface FireflySyncLog {
  id: string;
  sourceType: string;
  sourceId: string;
  status: string;
  syncedAt: string;
}

interface FireflyStatus {
  connected: boolean;
  instanceUrl: string | null;
  autoSyncEnabled: boolean;
}

function ExpensesTab({ onRecordClick }: TabProps) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [syncingExpenseId, setSyncingExpenseId] = useState<string | null>(null);
  const { toast } = useToast();
  const { user, environment } = useAuth();

  const { data: expenses, isLoading } = useQuery<Expense[]>({
    queryKey: ["/api", "expenses", { environment, userId: user?.id }],
    queryFn: async () => {
      const res = await fetch("/api/expenses", {
        credentials: "include",
        headers: {
          "X-Environment": environment,
          "X-User-Id": user?.id || "",
        },
      });
      if (!res.ok) throw new Error("Failed to fetch expenses");
      return res.json();
    },
  });

  const { data: fireflyStatus } = useQuery<FireflyStatus>({
    queryKey: ["/api", "firefly", "status", { environment, userId: user?.id }],
    queryFn: async () => {
      const res = await fetch("/api/firefly/status", {
        credentials: "include",
        headers: {
          "X-Environment": environment,
          "X-User-Id": user?.id || "",
        },
      });
      if (!res.ok) return { connected: false, instanceUrl: null, autoSyncEnabled: false };
      return res.json();
    },
  });

  const { data: syncLogs } = useQuery<FireflySyncLog[]>({
    queryKey: ["/api", "firefly", "sync-logs", { environment, userId: user?.id }],
    queryFn: async () => {
      const res = await fetch("/api/firefly/sync-logs", {
        credentials: "include",
        headers: {
          "X-Environment": environment,
          "X-User-Id": user?.id || "",
        },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: fireflyStatus?.connected === true,
  });

  const syncExpenseToFirefly = useMutation({
    mutationFn: async (expenseId: string) => {
      setSyncingExpenseId(expenseId);
      const res = await fetch(`/api/firefly/sync/expense/${expenseId}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "X-Environment": environment,
          "X-User-Id": user?.id || "",
        },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to sync");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api", "firefly", "sync-logs", { environment, userId: user?.id }] });
      toast({ title: "Synced to Firefly III" });
      setSyncingExpenseId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Sync failed", description: error.message, variant: "destructive" });
      setSyncingExpenseId(null);
    },
  });

  const addExpense = useMutation({
    mutationFn: async (data: Partial<Expense>) => {
      return apiRequest("POST", "/api/expenses", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api", "expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setIsAddOpen(false);
      toast({ title: "Expense added successfully" });
    },
  });

  const deleteExpense = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/expenses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api", "expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Expense removed" });
    },
  });

  const getSyncStatus = (expenseId: string) => {
    if (!syncLogs) return null;
    const log = syncLogs.find(log => log.sourceType === "expense" && log.sourceId === expenseId);
    return log && log.status === "success" ? log : null;
  };

  const totalExpenses = expenses?.reduce((sum, e) => sum + e.amount, 0) || 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Monthly Expenses Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {expenses?.map((expense) => (
              <div 
                key={expense.id} 
                className="flex items-center gap-3 p-3 rounded-lg border hover-elevate cursor-pointer"
                data-testid={`row-expense-${expense.id}`}
                onClick={() => onRecordClick(expense)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-medium">{expense.category}</span>
                    <span className="text-sm font-semibold tabular-nums">{formatCurrency(expense.amount)}/mo</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{expense.description}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2 flex-wrap">
                    <div className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      <span>{expense.vendor || "Not specified"}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>{expense.startDate || "No date"}</span>
                    </div>
                    {expense.documentId && (
                      <div className="flex items-center gap-1 text-primary">
                        <FileText className="h-3 w-3" />
                        <span>PDF attached</span>
                      </div>
                    )}
                    {fireflyStatus?.connected && getSyncStatus(expense.id) && (
                      <Badge variant="outline" className="text-xs py-0 px-1.5 gap-1">
                        <Flame className="h-2.5 w-2.5 text-orange-500" />
                        Synced
                      </Badge>
                    )}
                  </div>
                  <Progress
                    value={(expense.amount / totalExpenses) * 100}
                    className="h-2"
                  />
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" data-testid={`button-expense-menu-${expense.id}`} onClick={(e) => e.stopPropagation()}>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    {fireflyStatus?.connected && !getSyncStatus(expense.id) && (
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          syncExpenseToFirefly.mutate(expense.id);
                        }}
                        disabled={syncingExpenseId === expense.id}
                      >
                        {syncingExpenseId === expense.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Flame className="mr-2 h-4 w-4 text-orange-500" />
                        )}
                        Sync to Firefly III
                      </DropdownMenuItem>
                    )}
                    {fireflyStatus?.connected && getSyncStatus(expense.id) && (
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          syncExpenseToFirefly.mutate(expense.id);
                        }}
                        disabled={syncingExpenseId === expense.id}
                      >
                        {syncingExpenseId === expense.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        Re-sync to Firefly III
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => deleteExpense.mutate(expense.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}

            <div className="border-t pt-4 mt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">TOTAL EXPENSES</span>
                <span className="font-semibold tabular-nums">{formatCurrency(totalExpenses)}/mo</span>
              </div>
            </div>
          </div>

          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="w-full mt-4" variant="outline" data-testid="button-add-expense">
                <Plus className="mr-2 h-4 w-4" />
                Add Expense
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Expense</DialogTitle>
                <DialogDescription>
                  Add a new expense to track your spending.
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const dollarAmount = parseFloat(formData.get("amount") as string) || 0;
                  addExpense.mutate({
                    category: formData.get("category") as string,
                    description: formData.get("description") as string,
                    amount: Math.round(dollarAmount * 100),
                    frequency: formData.get("frequency") as string,
                    owner: formData.get("owner") as string,
                    vendor: formData.get("vendor") as string,
                    startDate: formData.get("startDate") as string,
                    userId: "demo-user",
                  });
                }}
              >
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Select name="category" defaultValue="Housing">
                      <SelectTrigger data-testid="select-expense-category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Housing">Housing</SelectItem>
                        <SelectItem value="Utilities">Utilities</SelectItem>
                        <SelectItem value="Transportation">Transportation</SelectItem>
                        <SelectItem value="Healthcare">Healthcare</SelectItem>
                        <SelectItem value="Food">Food</SelectItem>
                        <SelectItem value="Insurance">Insurance</SelectItem>
                        <SelectItem value="Legal Fees">Legal Fees</SelectItem>
                        <SelectItem value="Childcare">Childcare</SelectItem>
                        <SelectItem value="Education">Education</SelectItem>
                        <SelectItem value="Entertainment">Entertainment</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Input id="description" name="description" placeholder="e.g., Monthly rent payment" required data-testid="input-expense-description" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="amount">Amount ($)</Label>
                      <Input id="amount" name="amount" type="number" placeholder="0" required data-testid="input-expense-amount" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="frequency">Frequency</Label>
                      <Select name="frequency" defaultValue="monthly">
                        <SelectTrigger data-testid="select-expense-frequency">
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
                    <Label htmlFor="owner">Paid By</Label>
                    <Select name="owner" defaultValue="you">
                      <SelectTrigger data-testid="select-expense-owner">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="you">You</SelectItem>
                        <SelectItem value="spouse">Spouse</SelectItem>
                        <SelectItem value="joint">Joint</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vendor">Vendor/Payee</Label>
                    <Input id="vendor" name="vendor" placeholder="e.g., ABC Property Management" data-testid="input-expense-vendor" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="startDate">Start Date</Label>
                    <Input id="startDate" name="startDate" type="date" data-testid="input-expense-date" />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={addExpense.isPending} data-testid="button-submit-expense">
                    {addExpense.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add Expense
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}

function AssetsTab({ onRecordClick }: TabProps) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const { toast } = useToast();
  const { user, environment } = useAuth();

  const { data: assets, isLoading } = useQuery<Asset[]>({
    queryKey: ["/api", "assets", { environment, userId: user?.id }],
    queryFn: async () => {
      const res = await fetch("/api/assets", {
        credentials: "include",
        headers: {
          "X-Environment": environment,
          "X-User-Id": user?.id || "",
        },
      });
      if (!res.ok) throw new Error("Failed to fetch assets");
      return res.json();
    },
  });

  const addAsset = useMutation({
    mutationFn: async (data: Partial<Asset>) => {
      return apiRequest("POST", "/api/assets", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api", "assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setIsAddOpen(false);
      toast({ title: "Asset added successfully" });
    },
  });

  const totalAssets = assets?.reduce((sum, a) => sum + a.value, 0) || 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const categories = Array.from(new Set(assets?.map((a) => a.category) || []));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Assets</p>
            <p className="text-2xl font-semibold tabular-nums">{formatCurrency(totalAssets)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Marital Assets</p>
            <p className="text-2xl font-semibold tabular-nums">
              {formatCurrency(assets?.filter((a) => a.ownership === "joint").reduce((s, a) => s + a.value, 0) || 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Separate Assets</p>
            <p className="text-2xl font-semibold tabular-nums">
              {formatCurrency(assets?.filter((a) => a.ownership !== "joint").reduce((s, a) => s + a.value, 0) || 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {categories.map((category) => (
        <Card key={category}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">{category}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {assets
                ?.filter((a) => a.category === category)
                .map((asset) => (
                  <div
                    key={asset.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer"
                    data-testid={`row-asset-${asset.id}`}
                    onClick={() => onRecordClick(asset)}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{asset.name}</p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                          <div className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            <span>{asset.vendor || "Not specified"}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>{asset.acquiredDate || "No date"}</span>
                          </div>
                          {asset.documentId && (
                            <div className="flex items-center gap-1 text-primary">
                              <FileText className="h-3 w-3" />
                              <span>PDF</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">
                            {asset.ownership}
                          </Badge>
                          {asset.verified && (
                            <Badge variant="outline" className="text-xs text-green-600">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Verified
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold tabular-nums">
                        {formatCurrency(asset.value)}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogTrigger asChild>
          <Button className="w-full" variant="outline" data-testid="button-add-asset">
            <Plus className="mr-2 h-4 w-4" />
            Add Asset
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Asset</DialogTitle>
            <DialogDescription>
              Add a new asset to track your net worth.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              addAsset.mutate({
                name: formData.get("name") as string,
                category: formData.get("category") as string,
                value: parseInt(formData.get("value") as string),
                ownership: formData.get("ownership") as string,
                vendor: formData.get("vendor") as string,
                acquiredDate: formData.get("acquiredDate") as string,
                verified: false,
                userId: "demo-user",
              });
            }}
          >
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Asset Name</Label>
                <Input id="name" name="name" placeholder="e.g., Primary Residence" required data-testid="input-asset-name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select name="category" defaultValue="Real Estate">
                  <SelectTrigger data-testid="select-asset-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Real Estate">Real Estate</SelectItem>
                    <SelectItem value="Vehicles">Vehicles</SelectItem>
                    <SelectItem value="Bank Accounts">Bank Accounts</SelectItem>
                    <SelectItem value="Investments">Investments</SelectItem>
                    <SelectItem value="Retirement">Retirement</SelectItem>
                    <SelectItem value="Personal Property">Personal Property</SelectItem>
                    <SelectItem value="Business">Business</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="value">Value ($)</Label>
                <Input id="value" name="value" type="number" placeholder="0" required data-testid="input-asset-value" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ownership">Ownership</Label>
                <Select name="ownership" defaultValue="joint">
                  <SelectTrigger data-testid="select-asset-ownership">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="joint">Joint</SelectItem>
                    <SelectItem value="you">You</SelectItem>
                    <SelectItem value="spouse">Spouse</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="vendor">Institution/Location</Label>
                <Input id="vendor" name="vendor" placeholder="e.g., First National Bank" data-testid="input-asset-vendor" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="acquiredDate">Acquired Date</Label>
                <Input id="acquiredDate" name="acquiredDate" type="date" data-testid="input-asset-date" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={addAsset.isPending} data-testid="button-submit-asset">
                {addAsset.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add Asset
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DebtsTab({ onRecordClick }: TabProps) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const { toast } = useToast();
  const { user, environment } = useAuth();

  const { data: debts, isLoading } = useQuery<Debt[]>({
    queryKey: ["/api", "debts", { environment, userId: user?.id }],
    queryFn: async () => {
      const res = await fetch("/api/debts", {
        credentials: "include",
        headers: {
          "X-Environment": environment,
          "X-User-Id": user?.id || "",
        },
      });
      if (!res.ok) throw new Error("Failed to fetch debts");
      return res.json();
    },
  });

  const addDebt = useMutation({
    mutationFn: async (data: Partial<Debt>) => {
      return apiRequest("POST", "/api/debts", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api", "debts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setIsAddOpen(false);
      toast({ title: "Debt added successfully" });
    },
  });

  const totalDebts = debts?.reduce((sum, d) => sum + d.amount, 0) || 0;
  const totalMonthly = debts?.reduce((sum, d) => sum + (d.monthlyPayment || 0), 0) || 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Debts</p>
            <p className="text-2xl font-semibold tabular-nums text-red-600 dark:text-red-400">
              {formatCurrency(totalDebts)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Monthly Payments</p>
            <p className="text-2xl font-semibold tabular-nums">{formatCurrency(totalMonthly)}/mo</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">All Debts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {debts?.map((debt) => (
              <div
                key={debt.id}
                className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer"
                data-testid={`row-debt-${debt.id}`}
                onClick={() => onRecordClick(debt)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{debt.name}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                    <div className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      <span>{debt.vendor || "Not specified"}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>{debt.openedDate || "No date"}</span>
                    </div>
                    {debt.documentId && (
                      <div className="flex items-center gap-1 text-primary">
                        <FileText className="h-3 w-3" />
                        <span>PDF</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className="text-xs">
                      {debt.category}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {debt.ownership}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums text-red-600 dark:text-red-400">
                      {formatCurrency(debt.amount)}
                    </p>
                    {debt.monthlyPayment && (
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {formatCurrency(debt.monthlyPayment)}/mo
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogTrigger asChild>
          <Button className="w-full" variant="outline" data-testid="button-add-debt">
            <Plus className="mr-2 h-4 w-4" />
            Add Debt
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Debt</DialogTitle>
            <DialogDescription>
              Add a new debt to track your liabilities.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              addDebt.mutate({
                name: formData.get("name") as string,
                category: formData.get("category") as string,
                amount: parseInt(formData.get("amount") as string),
                monthlyPayment: parseInt(formData.get("monthlyPayment") as string) || 0,
                ownership: formData.get("ownership") as string,
                vendor: formData.get("vendor") as string,
                openedDate: formData.get("openedDate") as string,
                userId: "demo-user",
              });
            }}
          >
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Debt Name</Label>
                <Input id="name" name="name" placeholder="e.g., Home Mortgage" required data-testid="input-debt-name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select name="category" defaultValue="Mortgage">
                  <SelectTrigger data-testid="select-debt-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Mortgage">Mortgage</SelectItem>
                    <SelectItem value="Auto Loan">Auto Loan</SelectItem>
                    <SelectItem value="Credit Card">Credit Card</SelectItem>
                    <SelectItem value="Student Loan">Student Loan</SelectItem>
                    <SelectItem value="Personal Loan">Personal Loan</SelectItem>
                    <SelectItem value="Medical Debt">Medical Debt</SelectItem>
                    <SelectItem value="Tax Debt">Tax Debt</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Total Balance ($)</Label>
                  <Input id="amount" name="amount" type="number" placeholder="0" required data-testid="input-debt-amount" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="monthlyPayment">Monthly Payment ($)</Label>
                  <Input id="monthlyPayment" name="monthlyPayment" type="number" placeholder="0" data-testid="input-debt-monthly" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ownership">Ownership</Label>
                <Select name="ownership" defaultValue="joint">
                  <SelectTrigger data-testid="select-debt-ownership">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="joint">Joint</SelectItem>
                    <SelectItem value="you">You</SelectItem>
                    <SelectItem value="spouse">Spouse</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="vendor">Lender/Creditor</Label>
                <Input id="vendor" name="vendor" placeholder="e.g., First National Bank" data-testid="input-debt-vendor" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="openedDate">Date Opened</Label>
                <Input id="openedDate" name="openedDate" type="date" data-testid="input-debt-date" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={addDebt.isPending} data-testid="button-submit-debt">
                {addDebt.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add Debt
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Finances() {
  const { environment } = useAuth();
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<FinancialRecord | null>(null);
  const [selectedRecordType, setSelectedRecordType] = useState<RecordType>("income");
  const [scanDialogOpen, setScanDialogOpen] = useState(false);

  const handleRecordClick = (record: FinancialRecord, type: RecordType) => {
    setSelectedRecord(record);
    setSelectedRecordType(type);
    setDetailOpen(true);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24 md:pb-6">
      

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold mb-1" data-testid="text-page-title">Finances</h1>
          <p className="text-sm text-muted-foreground">
            Track income, expenses, assets, and debts
          </p>
        </div>
        <Button 
          onClick={() => setScanDialogOpen(true)}
          size="sm" 
          data-testid="button-scan-document"
        >
          <Sparkles className="mr-2 h-4 w-4" />
          Scan Document
        </Button>
      </div>

      <Tabs defaultValue="income" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 max-w-md">
          <TabsTrigger value="income" data-testid="tab-income">Income</TabsTrigger>
          <TabsTrigger value="expenses" data-testid="tab-expenses">Expenses</TabsTrigger>
          <TabsTrigger value="assets" data-testid="tab-assets">Assets</TabsTrigger>
          <TabsTrigger value="debts" data-testid="tab-debts">Debts</TabsTrigger>
        </TabsList>

        <TabsContent value="income">
          <IncomeTab onRecordClick={(record) => handleRecordClick(record, "income")} />
        </TabsContent>
        <TabsContent value="expenses">
          <ExpensesTab onRecordClick={(record) => handleRecordClick(record, "expense")} />
        </TabsContent>
        <TabsContent value="assets">
          <AssetsTab onRecordClick={(record) => handleRecordClick(record, "asset")} />
        </TabsContent>
        <TabsContent value="debts">
          <DebtsTab onRecordClick={(record) => handleRecordClick(record, "debt")} />
        </TabsContent>
      </Tabs>

      <RecordDetailDrawer
        open={detailOpen}
        onOpenChange={setDetailOpen}
        recordType={selectedRecordType}
        record={selectedRecord}
      />

      <FinancialExtractionDialog
        open={scanDialogOpen}
        onOpenChange={setScanDialogOpen}
      />

      <div className="flex justify-center pt-4">
        <FeedbackCTA />
      </div>
    </div>
  );
}
