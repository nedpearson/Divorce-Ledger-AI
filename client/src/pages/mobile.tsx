import React, { useState, useRef, useEffect, lazy, Suspense } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";

// UI Components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle, CardDescription, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

// Hooks and Utilities
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useOfflineSync } from "@/hooks/use-offline-sync";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft,
  FileText,
  AlertTriangle,
  Scale,
  Bell,
  Upload,
  Camera,
  Sparkles,
  FolderOpen,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Plus,
  Edit,
  Trash2,
  MapPin,
  Calendar,
  Image,
  File,
  Brain,
  Tag,
  ChevronRight,
  Shield,
  Send,
  Eye,
  DollarSign,
  Users,
  TrendingDown,
  Lightbulb,
  Lock,
  Briefcase,
  Building,
  CreditCard,
  Wallet,
  TrendingUp,
  Heart,
  Baby,
  ChevronDown,
  ChevronUp,
  Home,
  Car,
  Landmark,
  Receipt,
  X,
  WifiOff,
  RefreshCw,
  Download,
} from "lucide-react";
import type { Document, MobileViolationReport, Reimbursement, W2Record, Asset, Debt, Income, Expense, ChildSupportPayment, DashboardStats } from "@shared/schema";

// Supabase URL logic for all mobile API endpoints
const SUPABASE_API = process.env.NEXT_PUBLIC_SUPABASE_API_URL || "";
const apiUrl = (endpoint: string) => SUPABASE_API ? `${SUPABASE_API}${endpoint}` : endpoint;

const MobileAppBanner = lazy(() => import("@/components/mobile-app-banner").then(m => ({ default: m.MobileAppHeaderButton })));

// Build auth headers (X-User-Id + X-Environment) for inline fetch() calls on the mobile page.
// Mirrors getAuthHeaders() in queryClient.ts so that API routes requiring X-User-Id work
// when accessed from a phone (which has its own session cookie but stores userId in localStorage).
function getMobileHeaders(environment: string): Record<string, string> {
  const headers: Record<string, string> = { "X-Environment": environment };
  try {
    const userStr = localStorage.getItem("user");
    if (userStr) {
      const user = JSON.parse(userStr);
      if (user?.id) headers["X-User-Id"] = user.id;
    }
  } catch {
    // ignore
  }
  return headers;
}

interface MobileViewProps {
  isDemoMode?: boolean;
}

const DOCUMENT_CATEGORIES = [
  { value: "financial_statement", label: "Financial Statement", icon: FileText },
  { value: "tax_return", label: "Tax Return", icon: FileText },
  { value: "bank_statement", label: "Bank Statement", icon: FileText },
  { value: "property_deed", label: "Property Deed", icon: FileText },
  { value: "court_order", label: "Court Order", icon: Shield },
  { value: "custody_agreement", label: "Custody Agreement", icon: FileText },
  { value: "correspondence", label: "Correspondence", icon: FileText },
  { value: "evidence_photo", label: "Evidence Photo", icon: Image },
  { value: "evidence_video", label: "Evidence Video", icon: FileText },
  { value: "legal_filing", label: "Legal Filing", icon: Shield },
  { value: "medical_record", label: "Medical Record", icon: FileText },
  { value: "employment_record", label: "Employment Record", icon: FileText },
  { value: "insurance_document", label: "Insurance Document", icon: FileText },
  { value: "asset_valuation", label: "Asset Valuation", icon: FileText },
  { value: "debt_statement", label: "Debt Statement", icon: FileText },
  { value: "other", label: "Other", icon: File },
];

const VIOLATION_TYPES = [
  "Custody Violation",
  "Financial Misconduct",
  "Communication Violation",
  "Parenting Time Violation",
  "Child Support Violation",
  "Property Violation",
  "Other",
];

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function getCategoryIcon(category: string) {
  const iconMap: Record<string, typeof Home> = {
    "Real Estate": Home,
    "Vehicle": Car,
    "Retirement": Landmark,
    "Investment": TrendingUp,
    "Bank Account": Building,
    "Personal Property": Wallet,
    "Mortgage": Home,
    "Auto Loan": Car,
    "Credit Card": CreditCard,
    "Student Loan": Landmark,
    "Medical": Heart,
    "Salary": Briefcase,
    "Bonus": DollarSign,
    "Investment Income": TrendingUp,
    "Housing": Home,
    "Transportation": Car,
    "Food": Receipt,
    "Utilities": Building,
    "Healthcare": Heart,
    "Entertainment": Wallet,
    "Other": DollarSign,
  };
  return iconMap[category] || DollarSign;
}

type DrillDownType = "assets" | "debts" | "income" | "expenses" | "childSupport" | null;

function FinancialDrillDown({
  type,
  isOpen,
  onClose,
  environment
}: {
  type: DrillDownType;
  isOpen: boolean;
  onClose: () => void;
  environment: string;
}) {
  const headers: Record<string, { icon: typeof DollarSign; title: string; description: string }> = {
    assets: { icon: Building, title: "Total Assets", description: "All assets owned by both parties" },
    debts: { icon: CreditCard, title: "Total Debts", description: "All debts owed by both parties" },
    income: { icon: TrendingUp, title: "Monthly Income", description: "Combined monthly income sources" },
    expenses: { icon: Receipt, title: "Monthly Expenses", description: "Combined monthly expenses" },
    childSupport: { icon: Baby, title: "Child Support", description: "Child support payment history" },
  };

  const { data: assets, isLoading: assetsLoading } = useQuery<Asset[]>({
    queryKey: ["/api/mobile/assets", environment],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/mobile/assets"), {
        headers: getMobileHeaders(environment),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch assets");
      return res.json();
    },
    enabled: type === "assets",
  });

  const { data: debts, isLoading: debtsLoading } = useQuery<Debt[]>({
    queryKey: ["/api/mobile/debts", environment],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/mobile/debts"), {
        headers: getMobileHeaders(environment),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch debts");
      return res.json();
    },
    enabled: type === "debts",
  });

  const { data: incomes, isLoading: incomesLoading } = useQuery<Income[]>({
    queryKey: ["/api/mobile/incomes", environment],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/mobile/incomes"), {
        headers: getMobileHeaders(environment),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch incomes");
      return res.json();
    },
    enabled: type === "income",
  });

  const { data: expenses, isLoading: expensesLoading } = useQuery<Expense[]>({
    queryKey: ["/api/mobile/expenses", environment],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/mobile/expenses"), {
        headers: getMobileHeaders(environment),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch expenses");
      return res.json();
    },
    enabled: type === "expenses",
  });

  const { data: childSupport, isLoading: childSupportLoading } = useQuery<ChildSupportPayment[]>({
    queryKey: ["/api/mobile/child-support", environment],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/mobile/child-support"), {
        headers: getMobileHeaders(environment),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch child support");
      return res.json();
    },
    enabled: type === "childSupport",
  });

  if (!type) return null;

  const headerInfo = headers[type];
  const HeaderIcon = headerInfo.icon;

  const isLoading =
    (type === "assets" && assetsLoading) ||
    (type === "debts" && debtsLoading) ||
    (type === "income" && incomesLoading) ||
    (type === "expenses" && expensesLoading) ||
    (type === "childSupport" && childSupportLoading);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="space-y-3 p-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      );
    }

    switch (type) {
      case "assets":
        return (
          <div className="space-y-2 p-4">
            {(!assets || assets.length === 0) ? (
              <div className="text-center py-8 text-muted-foreground">
                <Building className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No assets recorded</p>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center px-2 py-1 text-xs text-muted-foreground border-b">
                  <span>Asset</span>
                  <span>Value</span>
                </div>
                {assets.map((asset) => {
                  const CategoryIcon = getCategoryIcon(asset.category);
                  return (
                    <Card key={asset.id} className="hover-elevate" data-testid={`asset-item-${asset.id}`}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                              <CategoryIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{asset.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <Badge variant="outline" className="text-xs">{asset.category}</Badge>
                                <Badge variant={asset.ownership === "Joint" ? "secondary" : "outline"} className="text-xs">
                                  {asset.ownership}
                                </Badge>
                                {asset.verified && (
                                  <CheckCircle className="h-3 w-3 text-green-500" />
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-green-600 dark:text-green-400 tabular-nums">
                              {formatCurrency(asset.value)}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                <div className="flex justify-between items-center px-3 py-3 mt-2 bg-muted/50 rounded-lg">
                  <span className="font-medium">Total Assets</span>
                  <span className="font-bold text-green-600 dark:text-green-400 tabular-nums">
                    {formatCurrency(assets.reduce((sum, a) => sum + a.value, 0))}
                  </span>
                </div>
              </>
            )}
          </div>
        );

      case "debts":
        return (
          <div className="space-y-2 p-4">
            {(!debts || debts.length === 0) ? (
              <div className="text-center py-8 text-muted-foreground">
                <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No debts recorded</p>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center px-2 py-1 text-xs text-muted-foreground border-b">
                  <span>Debt</span>
                  <span>Balance</span>
                </div>
                {debts.map((debt) => {
                  const CategoryIcon = getCategoryIcon(debt.category);
                  return (
                    <Card key={debt.id} className="hover-elevate" data-testid={`debt-item-${debt.id}`}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                              <CategoryIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{debt.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <Badge variant="outline" className="text-xs">{debt.category}</Badge>
                                <Badge variant={debt.ownership === "Joint" ? "secondary" : "outline"} className="text-xs">
                                  {debt.ownership}
                                </Badge>
                              </div>
                              {debt.monthlyPayment && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Monthly: {formatCurrency(debt.monthlyPayment)}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-red-600 dark:text-red-400 tabular-nums">
                              {formatCurrency(debt.amount)}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                <div className="flex justify-between items-center px-3 py-3 mt-2 bg-muted/50 rounded-lg">
                  <span className="font-medium">Total Debts</span>
                  <span className="font-bold text-red-600 dark:text-red-400 tabular-nums">
                    {formatCurrency(debts.reduce((sum, d) => sum + d.amount, 0))}
                  </span>
                </div>
              </>
            )}
          </div>
        );

      case "income":
        return (
          <div className="space-y-2 p-4">
            {(!incomes || incomes.length === 0) ? (
              <div className="text-center py-8 text-muted-foreground">
                <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No income sources recorded</p>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center px-2 py-1 text-xs text-muted-foreground border-b">
                  <span>Source</span>
                  <span>Amount</span>
                </div>
                {incomes.map((income) => (
                  <Card key={income.id} className="hover-elevate" data-testid={`income-item-${income.id}`}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                            <Briefcase className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{income.source}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="outline" className="text-xs">{income.frequency}</Badge>
                              <Badge variant={income.owner === "Spouse" ? "secondary" : "outline"} className="text-xs">
                                {income.owner}
                              </Badge>
                              {income.verified && (
                                <CheckCircle className="h-3 w-3 text-green-500" />
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                            {formatCurrency(income.amount)}
                          </p>
                          <p className="text-xs text-muted-foreground">/{income.frequency}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                <div className="flex justify-between items-center px-3 py-3 mt-2 bg-muted/50 rounded-lg">
                  <span className="font-medium">Total Monthly Income</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                    {formatCurrency(
                      incomes.reduce((sum, i) => {
                        let monthly = i.amount;
                        if (i.frequency === "Annually") monthly = i.amount / 12;
                        if (i.frequency === "Weekly") monthly = i.amount * 4;
                        if (i.frequency === "Biweekly") monthly = i.amount * 2;
                        return sum + monthly;
                      }, 0)
                    )}
                  </span>
                </div>
              </>
            )}
          </div>
        );

      case "expenses":
        return (
          <div className="space-y-2 p-4">
            {(!expenses || expenses.length === 0) ? (
              <div className="text-center py-8 text-muted-foreground">
                <Receipt className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No expenses recorded</p>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center px-2 py-1 text-xs text-muted-foreground border-b">
                  <span>Expense</span>
                  <span>Amount</span>
                </div>
                {expenses.map((expense) => {
                  const CategoryIcon = getCategoryIcon(expense.category);
                  return (
                    <Card key={expense.id} className="hover-elevate" data-testid={`expense-item-${expense.id}`}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                              <CategoryIcon className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{expense.description}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <Badge variant="outline" className="text-xs">{expense.category}</Badge>
                                <Badge variant="outline" className="text-xs">{expense.frequency}</Badge>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-orange-600 dark:text-orange-400 tabular-nums">
                              {formatCurrency(expense.amount)}
                            </p>
                            <p className="text-xs text-muted-foreground">/{expense.frequency}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                <div className="flex justify-between items-center px-3 py-3 mt-2 bg-muted/50 rounded-lg">
                  <span className="font-medium">Total Monthly Expenses</span>
                  <span className="font-bold text-orange-600 dark:text-orange-400 tabular-nums">
                    {formatCurrency(
                      expenses.reduce((sum, e) => {
                        let monthly = e.amount;
                        if (e.frequency === "Annually") monthly = e.amount / 12;
                        if (e.frequency === "Weekly") monthly = e.amount * 4;
                        if (e.frequency === "Biweekly") monthly = e.amount * 2;
                        return sum + monthly;
                      }, 0)
                    )}
                  </span>
                </div>
              </>
            )}
          </div>
        );

      case "childSupport":
        return (
          <div className="space-y-2 p-4">
            {(!childSupport || childSupport.length === 0) ? (
              <div className="text-center py-8 text-muted-foreground">
                <Baby className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No child support payments recorded</p>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center px-2 py-1 text-xs text-muted-foreground border-b">
                  <span>Payment</span>
                  <span>Amount</span>
                </div>
                {childSupport.map((payment) => (
                  <Card key={payment.id} className="hover-elevate" data-testid={`child-support-item-${payment.id}`}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`p-2 rounded-lg ${payment.status === "paid"
                            ? "bg-green-100 dark:bg-green-900/30"
                            : payment.status === "overdue"
                              ? "bg-red-100 dark:bg-red-900/30"
                              : "bg-yellow-100 dark:bg-yellow-900/30"
                            }`}>
                            <Baby className={`h-4 w-4 ${payment.status === "paid"
                              ? "text-green-600 dark:text-green-400"
                              : payment.status === "overdue"
                                ? "text-red-600 dark:text-red-400"
                                : "text-yellow-600 dark:text-yellow-400"
                              }`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">
                              {payment.childName || payment.paymentType}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge
                                variant={
                                  payment.status === "paid" ? "default" :
                                    payment.status === "overdue" ? "destructive" : "secondary"
                                }
                                className="text-xs"
                              >
                                {payment.status}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                Due: {new Date(payment.dueDate).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-purple-600 dark:text-purple-400 tabular-nums">
                            {formatCurrency(payment.amount)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                <div className="flex justify-between items-center px-3 py-3 mt-2 bg-muted/50 rounded-lg">
                  <span className="font-medium">Total Owed</span>
                  <span className="font-bold text-purple-600 dark:text-purple-400 tabular-nums">
                    {formatCurrency(
                      childSupport
                        .filter((p) => p.status !== "paid")
                        .reduce((sum, p) => sum + p.amount, 0)
                    )}
                  </span>
                </div>
              </>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl" data-testid={`sheet-${type}-drilldown`}>
        <SheetHeader className="pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <HeaderIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <SheetTitle>{headerInfo.title}</SheetTitle>
              <SheetDescription className="text-xs">{headerInfo.description}</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <ScrollArea className="h-full mt-4">
          {renderContent()}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function FinancialSummaryBar({ isDemoMode, environment }: { isDemoMode: boolean; environment: string }) {
  const [expanded, setExpanded] = useState(false);
  const [drillDownType, setDrillDownType] = useState<DrillDownType>(null);

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/mobile/financial-summary", environment],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/mobile/financial-summary"), {
        headers: getMobileHeaders(environment),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch financial summary");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 border-b">
        <div className="flex items-center gap-2 mb-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-4" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      </div>
    );
  }

  const metrics = [
    {
      key: "assets" as DrillDownType,
      label: "Assets",
      value: stats?.totalAssets || 0,
      icon: Building,
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-100 dark:bg-green-900/30"
    },
    {
      key: "debts" as DrillDownType,
      label: "Debts",
      value: stats?.totalDebts || 0,
      icon: CreditCard,
      color: "text-red-600 dark:text-red-400",
      bgColor: "bg-red-100 dark:bg-red-900/30"
    },
    {
      key: "income" as DrillDownType,
      label: "Income",
      value: stats?.monthlyIncome || 0,
      icon: TrendingUp,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-100 dark:bg-blue-900/30"
    },
    {
      key: "expenses" as DrillDownType,
      label: "Expenses",
      value: stats?.monthlyExpenses || 0,
      icon: Receipt,
      color: "text-orange-600 dark:text-orange-400",
      bgColor: "bg-orange-100 dark:bg-orange-900/30"
    },
    {
      key: "childSupport" as DrillDownType,
      label: "Child Support",
      value: stats?.childSupportOwed || 0,
      icon: Baby,
      color: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-100 dark:bg-purple-900/30"
    },
  ];

  const visibleMetrics = expanded ? metrics : metrics.slice(0, 3);

  return (
    <>
      <div className="border-b bg-muted/30" data-testid="financial-summary-bar">
        <div className="px-4 py-2">
          <button
            className="flex items-center justify-between w-full text-sm font-medium text-muted-foreground"
            onClick={() => setExpanded(!expanded)}
            data-testid="button-toggle-financial-summary"
          >
            <span className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Financial Summary
            </span>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>

        <div className={`grid gap-2 px-4 pb-3 ${expanded ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {visibleMetrics.map((metric) => {
            const MetricIcon = metric.icon;
            return (
              <button
                key={metric.key}
                onClick={() => setDrillDownType(metric.key)}
                className="p-2 rounded-lg bg-background border hover-elevate active-elevate-2 text-left transition-all"
                data-testid={`button-drilldown-${metric.key}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className={`p-1 rounded ${metric.bgColor}`}>
                    <MetricIcon className={`h-3 w-3 ${metric.color}`} />
                  </div>
                  <span className="text-xs text-muted-foreground truncate">{metric.label}</span>
                </div>
                <p className={`text-sm font-semibold tabular-nums ${metric.color}`}>
                  {formatCurrency(metric.value)}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <FinancialDrillDown
        type={drillDownType}
        isOpen={drillDownType !== null}
        onClose={() => setDrillDownType(null)}
        environment={environment}
      />
    </>
  );
}

interface MobileHeaderProps {
  title: string;
  onBack?: () => void;
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  onSync: () => void;
  isInstallable: boolean;
  onInstall: () => void;
}

function MobileHeader({
  title,
  onBack,
  isOnline,
  pendingCount,
  isSyncing,
  onSync,
  isInstallable,
  onInstall,
}: MobileHeaderProps) {
  return (
    <header className="sticky top-0 z-sticky bg-background border-b px-4 py-3" data-testid="mobile-header">
      <div className="flex items-center gap-3">
        {onBack && (
          <Button size="icon" variant="ghost" onClick={onBack} data-testid="button-mobile-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="flex items-center gap-2 flex-1">
          <Scale className="h-5 w-5 text-primary" />
          <span className="font-semibold">{title}</span>
        </div>

        {/* Offline indicator */}
        {!isOnline && (
          <div className="flex items-center gap-1 text-amber-500" title="You are offline" data-testid="offline-indicator">
            <WifiOff className="h-4 w-4" />
          </div>
        )}

        {/* Sync button */}
        <Button
          size="icon"
          variant={pendingCount > 0 ? "default" : "ghost"}
          onClick={onSync}
          disabled={isSyncing || !isOnline}
          title={
            !isOnline
              ? "Cannot sync while offline"
              : pendingCount > 0
                ? `Sync ${pendingCount} pending change${pendingCount !== 1 ? "s" : ""}`
                : "Sync data"
          }
          data-testid="button-sync"
          className="relative"
        >
          <RefreshCw className={`h-5 w-5 ${isSyncing ? "animate-spin" : ""}`} />
          {pendingCount > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center font-bold">
              {pendingCount > 9 ? "9+" : pendingCount}
            </span>
          )}
        </Button>

        {/* Install PWA button — shown only when browser fires beforeinstallprompt */}
        {isInstallable && (
          <Button
            size="icon"
            variant="ghost"
            onClick={onInstall}
            title="Add to Home Screen"
            data-testid="button-install-pwa"
          >
            <Download className="h-5 w-5" />
          </Button>
        )}

        <Button size="icon" variant="ghost" data-testid="button-mobile-notifications">
          <Bell className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}

function OfflineBanner({ isOnline, pendingCount }: { isOnline: boolean; pendingCount: number }) {
  if (isOnline) return null;
  return (
    <div
      className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 flex items-center gap-2"
      data-testid="offline-banner"
    >
      <WifiOff className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
      <span className="text-sm text-amber-700 dark:text-amber-400">
        You are offline.{" "}
        {pendingCount > 0
          ? `${pendingCount} change${pendingCount !== 1 ? "s" : ""} will sync when you reconnect.`
          : "Data shown is from your last sync."}
      </span>
    </div>
  );
}

function DocumentCard({ doc, onView }: { doc: Document; onView: (doc: Document) => void }) {
  const getCategoryInfo = (category: string | null) => {
    const found = DOCUMENT_CATEGORIES.find((c) => c.value === category);
    return found || { label: category || "Unknown", icon: File };
  };

  const categoryInfo = getCategoryInfo(doc.aiCategory);
  const CategoryIcon = categoryInfo.icon;

  const getAnalysisStatusBadge = () => {
    switch (doc.aiAnalysisStatus) {
      case "completed":
        return (
          <Badge variant="default" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
            <Sparkles className="h-3 w-3 mr-1" />
            AI Analyzed
          </Badge>
        );
      case "analyzing":
        return (
          <Badge variant="secondary">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Analyzing...
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  return (
    <Card className="hover-elevate cursor-pointer" onClick={() => onView(doc)} data-testid={`card-document-${doc.id}`}>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <CategoryIcon className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate text-sm">{doc.fileName || doc.title}</p>
            <p className="text-xs text-muted-foreground truncate">{categoryInfo.label}</p>
            {doc.aiConfidence && (
              <p className="text-xs text-muted-foreground mt-1">
                Confidence: {Math.round(doc.aiConfidence * 100)}%
              </p>
            )}
          </div>
          <div className="shrink-0">{getAnalysisStatusBadge()}</div>
        </div>
        {doc.aiSummary && (
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{doc.aiSummary}</p>
        )}
        {doc.aiSuggestedTags && doc.aiSuggestedTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {doc.aiSuggestedTags.slice(0, 3).map((tag, idx) => (
              <Badge key={idx} variant="outline" className="text-xs">
                <Tag className="h-2.5 w-2.5 mr-1" />
                {tag}
              </Badge>
            ))}
            {doc.aiSuggestedTags.length > 3 && (
              <Badge variant="outline" className="text-xs">+{doc.aiSuggestedTags.length - 3}</Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DocumentDetailDialog({ doc, isOpen, onClose }: { doc: Document | null; isOpen: boolean; onClose: () => void }) {
  if (!doc) return null;

  const getCategoryInfo = (category: string | null) => {
    const found = DOCUMENT_CATEGORIES.find((c) => c.value === category);
    return found || { label: category || "Unknown", icon: File };
  };

  const categoryInfo = getCategoryInfo(doc.aiCategory);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            AI Document Analysis
          </DialogTitle>
          <DialogDescription>{doc.fileName || doc.title}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Category</Label>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary">{categoryInfo.label}</Badge>
              {doc.aiConfidence && (
                <span className="text-xs text-muted-foreground">
                  ({Math.round(doc.aiConfidence * 100)}% confidence)
                </span>
              )}
            </div>
          </div>
          {doc.aiSummary && (
            <div>
              <Label className="text-xs text-muted-foreground">Summary</Label>
              <p className="text-sm mt-1">{doc.aiSummary}</p>
            </div>
          )}
          {doc.aiSuggestedTags && doc.aiSuggestedTags.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground">Suggested Tags</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {doc.aiSuggestedTags.map((tag, idx) => (
                  <Badge key={idx} variant="outline">
                    <Tag className="h-3 w-3 mr-1" />
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
            <span>Type: {doc.fileType || "Unknown"}</span>
            <span>Size: {doc.fileSize ? (doc.fileSize / 1024).toFixed(1) : "0"} KB</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-close-document-detail">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViolationReportCard({ report, onEdit, onDelete, onSubmit }: {
  report: MobileViolationReport;
  onEdit: (report: MobileViolationReport) => void;
  onDelete: (id: string) => void;
  onSubmit: (id: string) => void;
}) {
  const getStatusBadge = () => {
    switch (report.status) {
      case "submitted":
        return (
          <Badge variant="default" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle className="h-3 w-3 mr-1" />
            Submitted
          </Badge>
        );
      case "draft":
        return (
          <Badge variant="secondary">
            <Edit className="h-3 w-3 mr-1" />
            Draft
          </Badge>
        );
      default:
        return <Badge variant="outline">{report.status}</Badge>;
    }
  };

  return (
    <Card className="hover-elevate" data-testid={`card-violation-${report.id}`}>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{report.title || "Untitled Report"}</p>
            <p className="text-xs text-muted-foreground">{report.violationType}</p>
            {report.location && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <MapPin className="h-3 w-3" />
                <span className="truncate">{report.location}</span>
              </div>
            )}
          </div>
          <div className="shrink-0">{getStatusBadge()}</div>
        </div>
        {report.description && (
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{report.description}</p>
        )}
        {report.status === "draft" && (
          <div className="flex items-center gap-2 mt-3">
            <Button size="sm" variant="outline" className="flex-1" onClick={() => onEdit(report)} data-testid={`button-edit-violation-${report.id}`}>
              <Edit className="h-3 w-3 mr-1" />
              Edit
            </Button>
            <Button size="sm" variant="default" className="flex-1" onClick={() => onSubmit(report.id)} data-testid={`button-submit-violation-${report.id}`}>
              <Send className="h-3 w-3 mr-1" />
              Submit
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => onDelete(report.id)} data-testid={`button-delete-violation-${report.id}`}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
        {report.severity && report.severity !== "medium" && (
          <div className="mt-2 p-2 bg-primary/5 rounded-md">
            <div className="flex items-center gap-1 text-xs">
              <Sparkles className="h-3 w-3 text-primary" />
              <span className="font-medium">Severity:</span>
              <span className="capitalize">{report.severity}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CreateViolationDialog({ isOpen, onClose, onSave, editingReport }: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<MobileViolationReport>) => void;
  editingReport: MobileViolationReport | null;
}) {
  const [title, setTitle] = useState("");
  const [violationType, setViolationType] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [occurredDate, setOccurredDate] = useState(new Date().toISOString().split("T")[0]);

  // Reset form state when dialog opens or editingReport changes
  useEffect(() => {
    if (isOpen) {
      setTitle(editingReport?.title || "");
      setViolationType(editingReport?.violationType || "");
      setDescription(editingReport?.description || "");
      setLocation(editingReport?.location || "");
      setOccurredDate(
        editingReport?.occurredAt
          ? new Date(editingReport.occurredAt).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0]
      );
    }
  }, [isOpen, editingReport]);

  const handleSave = () => {
    onSave({
      title,
      violationType,
      description,
      location,
      occurredAt: new Date(occurredDate),
      status: "draft",
    });
    setTitle("");
    setViolationType("");
    setDescription("");
    setLocation("");
    setOccurredDate(new Date().toISOString().split("T")[0]);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editingReport ? "Edit Violation Report" : "Create Violation Report"}</DialogTitle>
          <DialogDescription>
            {editingReport
              ? "Update the details of your violation report."
              : "Document a violation for your case. You can save as draft and submit later."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="violation-title">Title</Label>
            <Input
              id="violation-title"
              placeholder="Brief title for the violation"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="input-violation-title"
            />
          </div>
          <div>
            <Label htmlFor="violation-type">Violation Type</Label>
            <Select value={violationType} onValueChange={setViolationType}>
              <SelectTrigger id="violation-type" data-testid="select-violation-type">
                <SelectValue placeholder="Select violation type" />
              </SelectTrigger>
              <SelectContent>
                {VIOLATION_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="violation-date">Incident Date</Label>
            <Input
              id="violation-date"
              type="date"
              value={occurredDate}
              onChange={(e) => setOccurredDate(e.target.value)}
              data-testid="input-violation-date"
            />
          </div>
          <div>
            <Label htmlFor="violation-location">Location (Optional)</Label>
            <Input
              id="violation-location"
              placeholder="Where did this occur?"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              data-testid="input-violation-location"
            />
          </div>
          <div>
            <Label htmlFor="violation-description">Description</Label>
            <Textarea
              id="violation-description"
              placeholder="Describe what happened in detail..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              data-testid="input-violation-description"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-violation">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!title || !violationType || !description} data-testid="button-save-violation">
            {editingReport ? "Update" : "Save Draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocumentsTab({ isDemoMode }: { isDemoMode: boolean }) {
  const { environment, user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const { data: documents = [], isLoading } = useQuery<Document[]>({
    queryKey: ["/api/mobile/documents"],
    enabled: !isDemoMode,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", file.type);
      formData.append("size", file.size.toString());
      formData.append("environment", environment || "live");
      formData.append("analyzeWithAI", "true");

      // Use Supabase deployment URL
      const SUPABASE_API = process.env.NEXT_PUBLIC_SUPABASE_API_URL || "";
      const apiUrl = (endpoint: string) => SUPABASE_API ? `${SUPABASE_API}${endpoint}` : endpoint;

      const response = await fetch(apiUrl("/api/mobile/documents"), {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: getMobileHeaders(environment),
      });

      if (!response.ok) {
        let errorMsg = "Upload failed";
        try {
          const error = await response.json();
          errorMsg = error.message || errorMsg;
        } catch (e) {
          // fallback
        }
        throw new Error(errorMsg);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/documents"] });
      toast({ title: "Document uploaded", description: "AI analysis is in progress..." });
    },
    onError: (error: Error) => {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleViewDocument = (doc: Document) => {
    setSelectedDoc(doc);
    setShowDetail(true);
  };

  const groupedDocs = documents.reduce((acc, doc) => {
    const category = doc.aiCategory || "unclassified";
    if (!acc[category]) acc[category] = [];
    acc[category].push(doc);
    return acc;
  }, {} as Record<string, Document[]>);

  if (isDemoMode) {
    return (
      <div className="p-4 space-y-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 text-center">
            <Brain className="h-12 w-12 text-primary mx-auto mb-3" />
            <h3 className="font-semibold mb-1">AI-Powered Document Analysis</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Upload documents and let AI automatically categorize and analyze them for your case.
            </p>
            <ul className="text-left text-sm space-y-2 mb-4">
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Auto-categorize into 16 document types
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Extract key information and summaries
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Identify potential evidence for your case
              </li>
            </ul>
            <Button disabled className="w-full" data-testid="button-demo-upload">
              Sign in to upload documents
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
        />
        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            data-testid="button-upload-document"
          >
            {uploadMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Upload Document
          </Button>
          <Button variant="outline" size="icon" onClick={() => fileInputRef.current?.click()} data-testid="button-camera-upload">
            <Camera className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {isLoading ? (
            <>
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <Skeleton className="h-10 w-10 rounded-lg" />
                      <div className="flex-1">
                        <Skeleton className="h-4 w-32 mb-2" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                      <Skeleton className="h-6 w-20" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          ) : documents.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-6 text-center">
                <FolderOpen className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <h3 className="font-medium mb-1">No documents yet</h3>
                <p className="text-sm text-muted-foreground">
                  Upload your first document to get AI-powered analysis
                </p>
              </CardContent>
            </Card>
          ) : (
            Object.entries(groupedDocs).map(([category, docs]) => {
              const categoryInfo = DOCUMENT_CATEGORIES.find((c) => c.value === category) || {
                label: category === "unclassified" ? "Unclassified" : category,
              };
              return (
                <div key={category}>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <FolderOpen className="h-4 w-4" />
                    {categoryInfo.label}
                    <Badge variant="secondary" className="text-xs">{docs.length}</Badge>
                  </h3>
                  <div className="space-y-2">
                    {docs.map((doc) => (
                      <DocumentCard key={doc.id} doc={doc} onView={handleViewDocument} />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      <DocumentDetailDialog
        doc={selectedDoc}
        isOpen={showDetail}
        onClose={() => setShowDetail(false)}
      />
    </div>
  );
}

function ViolationsTab({ isDemoMode }: { isDemoMode: boolean }) {
  const { environment } = useAuth();
  const { toast } = useToast();
  const { queueMutation: queueOffline } = useOfflineSync();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingReport, setEditingReport] = useState<MobileViolationReport | null>(null);

  const { data: reports = [], isLoading } = useQuery<MobileViolationReport[]>({
    queryKey: ["/api/mobile/violations"],
    enabled: !isDemoMode,
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<MobileViolationReport>) => {
      if (!navigator.onLine) {
        await queueOffline({
          method: "POST",
          url: "/api/mobile/violations",
          body: { ...data, environment: environment || "live" },
          description: `Create violation: ${data.title || "Untitled"}`,
        });
        return { queued: true };
      }
      try {
        return await apiRequest("POST", "/api/mobile/violations", {
          ...data,
          environment: environment || "live",
        });
      } catch (error: any) {
        throw new Error(error?.message || "Failed to save violation report");
      }
    },
    onSuccess: (result: any) => {
      if (result?.queued) {
        toast({ title: "Saved offline", description: "Will sync automatically when you reconnect." });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/mobile/violations"] });
        toast({ title: "Report saved", description: "Your violation report has been saved as a draft." });
      }
      setShowCreateDialog(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<MobileViolationReport> }) => {
      if (!navigator.onLine) {
        await queueOffline({
          method: "PATCH",
          url: `/api/mobile/violations/${id}`,
          body: data,
          description: `Update violation ${id}`,
        });
        return { queued: true };
      }
      try {
        return await apiRequest("PATCH", `/api/mobile/violations/${id}`, data);
      } catch (error: any) {
        throw new Error(error?.message || "Failed to update violation report");
      }
    },
    onSuccess: (result: any) => {
      if (result?.queued) {
        toast({ title: "Saved offline", description: "Will sync automatically when you reconnect." });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/mobile/violations"] });
        toast({ title: "Report updated" });
      }
      setEditingReport(null);
      setShowCreateDialog(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!navigator.onLine) {
        await queueOffline({
          method: "DELETE",
          url: `/api/mobile/violations/${id}`,
          description: `Delete violation ${id}`,
        });
        queryClient.setQueryData(["/api/mobile/violations"], (old: MobileViolationReport[] = []) =>
          old.filter((r) => r.id !== id)
        );
        return { queued: true };
      }
      try {
        return await apiRequest("DELETE", `/api/mobile/violations/${id}`);
      } catch (error: any) {
        throw new Error(error?.message || "Failed to delete violation report");
      }
    },
    onSuccess: (result: any) => {
      if (!result?.queued) {
        queryClient.invalidateQueries({ queryKey: ["/api/mobile/violations"] });
        toast({ title: "Report deleted" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (id: string) => {
      try {
        return await apiRequest("POST", `/api/mobile/violations/${id}/submit`);
      } catch (error: any) {
        throw new Error(error?.message || "Failed to submit violation report");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/violations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/violations", environment] });
      toast({ title: "Report submitted", description: "Your violation report has been submitted to your case." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to submit", description: error.message, variant: "destructive" });
    },
  });

  const handleSave = (data: Partial<MobileViolationReport>) => {
    if (editingReport) {
      updateMutation.mutate({ id: editingReport.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (report: MobileViolationReport) => {
    setEditingReport(report);
    setShowCreateDialog(true);
  };

  const draftReports = reports.filter((r) => r.status === "draft");
  const submittedReports = reports.filter((r) => r.status === "submitted");

  if (isDemoMode) {
    return (
      <div className="p-4 space-y-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 text-center">
            <AlertTriangle className="h-12 w-12 text-primary mx-auto mb-3" />
            <h3 className="font-semibold mb-1">Document Violations On-The-Go</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Quickly create violation reports from anywhere with AI-powered classification.
            </p>
            <ul className="text-left text-sm space-y-2 mb-4">
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Save drafts and submit when ready
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                AI classifies severity and type
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Attach photos and evidence
              </li>
            </ul>
            <Button disabled className="w-full" data-testid="button-demo-create-violation">
              Sign in to create violation reports
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <Button
          className="w-full"
          onClick={() => {
            setEditingReport(null);
            setShowCreateDialog(true);
          }}
          data-testid="button-create-violation"
          aria-label="Create new violation report"
        >
          <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
          New Violation Report
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {isLoading ? (
            <>
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <Skeleton className="h-10 w-10 rounded-lg" />
                      <div className="flex-1">
                        <Skeleton className="h-4 w-32 mb-2" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                      <Skeleton className="h-6 w-20" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          ) : reports.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-6 text-center">
                <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <h3 className="font-medium mb-1">No violation reports</h3>
                <p className="text-sm text-muted-foreground">
                  Create a report to document court order violations
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {draftReports.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <Edit className="h-4 w-4" />
                    Drafts
                    <Badge variant="secondary" className="text-xs">{draftReports.length}</Badge>
                  </h3>
                  <div className="space-y-2">
                    {draftReports.map((report) => (
                      <ViolationReportCard
                        key={report.id}
                        report={report}
                        onEdit={handleEdit}
                        onDelete={(id) => deleteMutation.mutate(id)}
                        onSubmit={(id) => submitMutation.mutate(id)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {submittedReports.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Submitted
                    <Badge variant="secondary" className="text-xs">{submittedReports.length}</Badge>
                  </h3>
                  <div className="space-y-2">
                    {submittedReports.map((report) => (
                      <ViolationReportCard
                        key={report.id}
                        report={report}
                        onEdit={handleEdit}
                        onDelete={(id) => deleteMutation.mutate(id)}
                        onSubmit={(id) => submitMutation.mutate(id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      <CreateViolationDialog
        isOpen={showCreateDialog}
        onClose={() => {
          setShowCreateDialog(false);
          setEditingReport(null);
        }}
        onSave={handleSave}
        editingReport={editingReport}
      />
    </div>
  );
}

// ========================================
// Combined Violations, Reimbursements & Income Tab
// ========================================

function ViolationsAndReimbursementsTab({ isDemoMode }: { isDemoMode: boolean }) {
  const [view, setView] = useState<"violations" | "reimbursements" | "income">("violations");

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-2">
        <div className="flex bg-muted rounded-lg p-1" data-testid="toggle-violations-reimbursements">
          <button
            onClick={() => setView("violations")}
            className={`flex-1 flex items-center justify-center gap-1 py-2 px-2 rounded-md text-xs font-medium transition-colors ${view === "violations"
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground"
              }`}
            data-testid="toggle-violations"
          >
            <AlertTriangle className="h-3 w-3" />
            Violations
          </button>
          <button
            onClick={() => setView("reimbursements")}
            className={`flex-1 flex items-center justify-center gap-1 py-2 px-2 rounded-md text-xs font-medium transition-colors ${view === "reimbursements"
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground"
              }`}
            data-testid="toggle-reimbursements"
          >
            <DollarSign className="h-3 w-3" />
            Money
          </button>
          <button
            onClick={() => setView("income")}
            className={`flex-1 flex items-center justify-center gap-1 py-2 px-2 rounded-md text-xs font-medium transition-colors ${view === "income"
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground"
              }`}
            data-testid="toggle-income"
          >
            <Briefcase className="h-3 w-3" />
            Income
          </button>
        </div>
      </div>
      {view === "violations" ? (
        <ViolationsTab isDemoMode={isDemoMode} />
      ) : view === "reimbursements" ? (
        <ReimbursementsTab isDemoMode={isDemoMode} />
      ) : (
        <IncomeTab isDemoMode={isDemoMode} />
      )}
    </div>
  );
}

// ========================================
// Reimbursements Tab
// ========================================

function ReimbursementCard({ reimbursement, onEdit, onDelete }: {
  reimbursement: Reimbursement;
  onEdit: (r: Reimbursement) => void;
  onDelete: (id: string) => void;
}) {
  const getCategoryLabel = (category: string) => {
    const found = DOCUMENT_CATEGORIES.find((c) => c.value === category);
    return found?.label || category.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Paid</Badge>;
      case "disputed":
        return <Badge variant="destructive">Disputed</Badge>;
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  return (
    <Card className="hover-elevate" data-testid={`card-reimbursement-${reimbursement.id}`}>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <DollarSign className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-sm truncate">{reimbursement.description}</p>
                <p className="text-xs text-muted-foreground">{getCategoryLabel(reimbursement.category)}</p>
              </div>
              {getStatusBadge(reimbursement.status)}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-lg font-semibold text-primary">{formatCurrency(reimbursement.amount)}</span>
              <span className="text-xs text-muted-foreground">owed by {reimbursement.owedBy}</span>
            </div>
            {reimbursement.dueDate && (
              <p className="text-xs text-muted-foreground mt-1">
                <Calendar className="h-3 w-3 inline mr-1" />
                Due: {new Date(reimbursement.dueDate).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <Button size="sm" variant="outline" className="flex-1" onClick={() => onEdit(reimbursement)} data-testid={`button-edit-reimbursement-${reimbursement.id}`}>
            <Edit className="h-3 w-3 mr-1" />
            Edit
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => onDelete(reimbursement.id)} data-testid={`button-delete-reimbursement-${reimbursement.id}`}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateReimbursementDialog({ isOpen, onClose, onSave, editingReimbursement }: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<Reimbursement>) => void;
  editingReimbursement: Reimbursement | null;
}) {
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [owedBy, setOwedBy] = useState("");
  const [status, setStatus] = useState("pending");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (isOpen) {
      setCategory(editingReimbursement?.category || "");
      setDescription(editingReimbursement?.description || "");
      setAmount(editingReimbursement ? (editingReimbursement.amount / 100).toString() : "");
      setOwedBy(editingReimbursement?.owedBy || "");
      setStatus(editingReimbursement?.status || "pending");
      setDueDate(editingReimbursement?.dueDate ? new Date(editingReimbursement.dueDate).toISOString().split("T")[0] : "");
      setNotes(editingReimbursement?.notes || "");
    }
  }, [isOpen, editingReimbursement]);

  const handleSave = () => {
    onSave({
      category,
      description,
      amount: parseFloat(amount),
      owedBy,
      status,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      notes: notes || undefined,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editingReimbursement ? "Edit Reimbursement" : "Add Reimbursement"}</DialogTitle>
          <DialogDescription>
            Track reimbursements owed to you by category. Enter the amount you are owed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="reimburse-category">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="reimburse-category" data-testid="select-reimbursement-category">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="reimburse-description">Description</Label>
            <Input
              id="reimburse-description"
              placeholder="e.g., Medical bills from January"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              data-testid="input-reimbursement-description"
            />
          </div>
          <div>
            <Label htmlFor="reimburse-amount">Amount ($)</Label>
            <Input
              id="reimburse-amount"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              data-testid="input-reimbursement-amount"
            />
          </div>
          <div>
            <Label htmlFor="reimburse-owedby">Owed By</Label>
            <Select value={owedBy} onValueChange={setOwedBy}>
              <SelectTrigger id="reimburse-owedby" data-testid="select-reimbursement-owedby">
                <SelectValue placeholder="Who owes this?" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Ex-Spouse">Ex-Spouse</SelectItem>
                <SelectItem value="Joint">Joint (50/50)</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="reimburse-status">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="reimburse-status" data-testid="select-reimbursement-status">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="disputed">Disputed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="reimburse-due">Due Date (Optional)</Label>
            <Input
              id="reimburse-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              data-testid="input-reimbursement-duedate"
            />
          </div>
          <div>
            <Label htmlFor="reimburse-notes">Notes (Optional)</Label>
            <Textarea
              id="reimburse-notes"
              placeholder="Additional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              data-testid="input-reimbursement-notes"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-reimbursement">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!category || !description || !amount || !owedBy} data-testid="button-save-reimbursement">
            {editingReimbursement ? "Update" : "Add Reimbursement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReimbursementsTab({ isDemoMode }: { isDemoMode: boolean }) {
  const { toast } = useToast();
  const { queueMutation: queueOffline } = useOfflineSync();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingReimbursement, setEditingReimbursement] = useState<Reimbursement | null>(null);

  const { data: reimbursementsList = [], isLoading } = useQuery<Reimbursement[]>({
    queryKey: ["/api/mobile/reimbursements"],
    enabled: !isDemoMode,
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<Reimbursement>) => {
      if (!navigator.onLine) {
        await queueOffline({
          method: "POST",
          url: "/api/mobile/reimbursements",
          body: data,
          description: `Create reimbursement: ${data.description || "Untitled"}`,
        });
        return { queued: true };
      }
      return apiRequest("POST", "/api/mobile/reimbursements", data);
    },
    onSuccess: (result: any) => {
      if (result?.queued) {
        toast({ title: "Saved offline", description: "Will sync automatically when you reconnect." });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/mobile/reimbursements"] });
        toast({ title: "Reimbursement added", description: "Your reimbursement has been saved." });
      }
      setShowCreateDialog(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Reimbursement> }) => {
      if (!navigator.onLine) {
        await queueOffline({
          method: "PATCH",
          url: `/api/mobile/reimbursements/${id}`,
          body: data,
          description: `Update reimbursement ${id}`,
        });
        return { queued: true };
      }
      return apiRequest("PATCH", `/api/mobile/reimbursements/${id}`, data);
    },
    onSuccess: (result: any) => {
      if (result?.queued) {
        toast({ title: "Saved offline", description: "Will sync automatically when you reconnect." });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/mobile/reimbursements"] });
        toast({ title: "Reimbursement updated" });
      }
      setEditingReimbursement(null);
      setShowCreateDialog(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!navigator.onLine) {
        await queueOffline({
          method: "DELETE",
          url: `/api/mobile/reimbursements/${id}`,
          description: `Delete reimbursement ${id}`,
        });
        queryClient.setQueryData(["/api/mobile/reimbursements"], (old: Reimbursement[] = []) =>
          old.filter((r) => r.id !== id)
        );
        return { queued: true };
      }
      return apiRequest("DELETE", `/api/mobile/reimbursements/${id}`);
    },
    onSuccess: (result: any) => {
      if (!result?.queued) {
        queryClient.invalidateQueries({ queryKey: ["/api/mobile/reimbursements"] });
        toast({ title: "Reimbursement deleted" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
    },
  });

  const handleSave = (data: Partial<Reimbursement>) => {
    if (editingReimbursement) {
      updateMutation.mutate({ id: editingReimbursement.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (reimbursement: Reimbursement) => {
    setEditingReimbursement(reimbursement);
    setShowCreateDialog(true);
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  };

  const totalOwed = reimbursementsList.filter(r => r.status !== "paid").reduce((sum, r) => sum + r.amount, 0);
  const pendingCount = reimbursementsList.filter(r => r.status === "pending").length;
  const disputedCount = reimbursementsList.filter(r => r.status === "disputed").length;

  // Group by category
  const byCategory = reimbursementsList.reduce((acc, r) => {
    if (!acc[r.category]) acc[r.category] = [];
    acc[r.category].push(r);
    return acc;
  }, {} as Record<string, Reimbursement[]>);

  if (isDemoMode) {
    return (
      <div className="p-4 space-y-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 text-center">
            <DollarSign className="h-12 w-12 text-primary mx-auto mb-3" />
            <h3 className="font-semibold mb-1">Track Reimbursements Owed</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Keep track of money owed to you, organized by document category.
            </p>
            <ul className="text-left text-sm space-y-2 mb-4">
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Track by category (medical, child expenses, etc.)
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Mark as pending, paid, or disputed
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Set due dates and add notes
              </li>
            </ul>
            <Button disabled className="w-full" data-testid="button-demo-create-reimbursement">
              Sign in to track reimbursements
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-2xl font-bold text-primary">{formatCurrency(totalOwed)}</p>
            <p className="text-xs text-muted-foreground">Total owed to you</p>
          </div>
          <div className="flex gap-2">
            {pendingCount > 0 && <Badge variant="secondary">{pendingCount} pending</Badge>}
            {disputedCount > 0 && <Badge variant="destructive">{disputedCount} disputed</Badge>}
          </div>
        </div>
        <Button
          className="w-full"
          onClick={() => {
            setEditingReimbursement(null);
            setShowCreateDialog(true);
          }}
          data-testid="button-create-reimbursement"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Reimbursement
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {isLoading ? (
            <>
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <Skeleton className="h-10 w-10 rounded-lg" />
                      <div className="flex-1">
                        <Skeleton className="h-4 w-32 mb-2" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                      <Skeleton className="h-6 w-20" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          ) : reimbursementsList.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-6 text-center">
                <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <h3 className="font-medium mb-1">No reimbursements</h3>
                <p className="text-sm text-muted-foreground">
                  Add reimbursements owed to you by category
                </p>
              </CardContent>
            </Card>
          ) : (
            Object.entries(byCategory).map(([cat, items]) => (
              <div key={cat}>
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  {DOCUMENT_CATEGORIES.find(c => c.value === cat)?.label || cat}
                  <Badge variant="secondary" className="text-xs">{items.length}</Badge>
                  <span className="ml-auto text-sm text-primary font-semibold">
                    {formatCurrency(items.reduce((sum, r) => sum + r.amount, 0))}
                  </span>
                </h3>
                <div className="space-y-2">
                  {items.map((reimbursement) => (
                    <ReimbursementCard
                      key={reimbursement.id}
                      reimbursement={reimbursement}
                      onEdit={handleEdit}
                      onDelete={(id) => deleteMutation.mutate(id)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <CreateReimbursementDialog
        isOpen={showCreateDialog}
        onClose={() => {
          setShowCreateDialog(false);
          setEditingReimbursement(null);
        }}
        onSave={handleSave}
        editingReimbursement={editingReimbursement}
      />
    </div>
  );
}

// ========================================
// Income Tab - W2 Records & Strategies
// ========================================

function W2DetailDialog({ isOpen, onClose, record, linkedDocument }: {
  isOpen: boolean;
  onClose: () => void;
  record: W2Record | null;
  linkedDocument: Document | null;
}) {
  const formatCurrency = (cents: number | null | undefined) => {
    if (cents === null || cents === undefined) return "$0.00";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  };

  if (!record) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            W-2 Details
          </DialogTitle>
          <DialogDescription>
            {record.taxYear} - {record.employerName}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Badge variant={record.party === "self" ? "default" : "secondary"}>
              {record.party === "self" ? "Your W-2" : "Spouse's W-2"}
            </Badge>
            {record.verified && (
              <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                <CheckCircle className="h-3 w-3 mr-1" />
                Verified
              </Badge>
            )}
          </div>

          <Card className="bg-muted/50">
            <CardContent className="p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Wages & Tips (Box 1)</span>
                <span className="font-bold text-lg text-primary">{formatCurrency(record.wagesAndTips)}</span>
              </div>
              {record.federalWithheld && record.federalWithheld > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Federal Withheld (Box 2)</span>
                  <span className="font-medium">{formatCurrency(record.federalWithheld)}</span>
                </div>
              )}
              {record.socialSecurityWages && record.socialSecurityWages > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">SS Wages (Box 3)</span>
                  <span className="font-medium">{formatCurrency(record.socialSecurityWages)}</span>
                </div>
              )}
              {record.medicareWages && record.medicareWages > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Medicare Wages (Box 5)</span>
                  <span className="font-medium">{formatCurrency(record.medicareWages)}</span>
                </div>
              )}
              {record.stateWages && record.stateWages > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">State Wages (Box 16)</span>
                  <span className="font-medium">{formatCurrency(record.stateWages)}</span>
                </div>
              )}
              {record.otherCompensation && record.otherCompensation > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Other Comp (Box 14)</span>
                  <span className="font-medium">{formatCurrency(record.otherCompensation)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {record.employerEin && (
            <div className="text-sm">
              <span className="text-muted-foreground">Employer EIN: </span>
              <span className="font-mono">{record.employerEin}</span>
            </div>
          )}

          {record.notes && (
            <div className="text-sm">
              <span className="text-muted-foreground">Notes: </span>
              <span>{record.notes}</span>
            </div>
          )}

          <div className="border-t pt-4">
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Source Document
            </h4>
            {linkedDocument ? (
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{linkedDocument.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Uploaded {new Date(linkedDocument.createdAt).toLocaleDateString()}
                      </p>
                      {linkedDocument.aiAnalysisStatus === "completed" && (
                        <Badge variant="secondary" className="mt-1 text-xs">
                          <Brain className="h-3 w-3 mr-1" />
                          AI Analyzed
                        </Badge>
                      )}
                    </div>
                    <Button size="icon" variant="ghost" asChild>
                      <a href={linkedDocument.fileUrl || "#"} target="_blank" rel="noopener noreferrer">
                        <Eye className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed">
                <CardContent className="p-3 text-center text-sm text-muted-foreground">
                  <XCircle className="h-6 w-6 mx-auto mb-1 opacity-50" />
                  No document linked
                </CardContent>
              </Card>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose} data-testid="button-close-w2-detail">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function W2Card({ record, onEdit, onDelete, onViewDetail, linkedDocument }: {
  record: W2Record;
  onEdit: (r: W2Record) => void;
  onDelete: (id: string) => void;
  onViewDetail: (r: W2Record) => void;
  linkedDocument?: Document | null;
}) {
  const formatCurrency = (cents: number | null) => {
    if (cents === null) return "$0.00";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  };

  return (
    <Card className="hover-elevate" data-testid={`card-w2-${record.id}`}>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${record.party === "self" ? "bg-primary/10" : "bg-orange-100 dark:bg-orange-900/30"
            }`}>
            <Briefcase className={`h-5 w-5 ${record.party === "self" ? "text-primary" : "text-orange-600"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-sm truncate">{record.employerName}</p>
                <p className="text-xs text-muted-foreground">{record.taxYear} W-2</p>
              </div>
              <Badge variant={record.party === "self" ? "default" : "secondary"}>
                {record.party === "self" ? "You" : "Spouse"}
              </Badge>
            </div>
            <button
              onClick={() => onViewDetail(record)}
              className="text-lg font-semibold text-primary mt-1 underline decoration-dotted underline-offset-2 hover:decoration-solid cursor-pointer flex items-center gap-1"
              data-testid={`button-view-w2-detail-${record.id}`}
            >
              {formatCurrency(record.wagesAndTips)}
              {linkedDocument && <FileText className="h-3 w-3 text-muted-foreground" />}
            </button>
            {record.otherCompensation && record.otherCompensation > 0 && (
              <button
                onClick={() => onViewDetail(record)}
                className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:decoration-solid cursor-pointer"
                data-testid={`button-view-w2-other-${record.id}`}
              >
                + {formatCurrency(record.otherCompensation)} other comp
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <Button size="sm" variant="outline" className="flex-1" onClick={() => onEdit(record)} data-testid={`button-edit-w2-${record.id}`}>
            <Edit className="h-3 w-3 mr-1" />
            Edit
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => onDelete(record.id)} data-testid={`button-delete-w2-${record.id}`}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateW2Dialog({ isOpen, onClose, onSave, editingRecord, documents }: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<W2Record>) => void;
  editingRecord: W2Record | null;
  documents: Document[];
}) {
  const [party, setParty] = useState("self");
  const [taxYear, setTaxYear] = useState(new Date().getFullYear().toString());
  const [employerName, setEmployerName] = useState("");
  const [wagesAndTips, setWagesAndTips] = useState("");
  const [federalWithheld, setFederalWithheld] = useState("");
  const [otherCompensation, setOtherCompensation] = useState("");
  const [notes, setNotes] = useState("");
  const [documentId, setDocumentId] = useState("");

  useEffect(() => {
    if (isOpen) {
      setParty(editingRecord?.party || "self");
      setTaxYear(editingRecord?.taxYear?.toString() || new Date().getFullYear().toString());
      setEmployerName(editingRecord?.employerName || "");
      setWagesAndTips(editingRecord ? (editingRecord.wagesAndTips / 100).toString() : "");
      setFederalWithheld(editingRecord?.federalWithheld ? (editingRecord.federalWithheld / 100).toString() : "");
      setOtherCompensation(editingRecord?.otherCompensation ? (editingRecord.otherCompensation / 100).toString() : "");
      setNotes(editingRecord?.notes || "");
      setDocumentId(editingRecord?.documentId || "");
    }
  }, [isOpen, editingRecord]);

  const handleSave = () => {
    onSave({
      party,
      taxYear: parseInt(taxYear),
      employerName,
      wagesAndTips: parseFloat(wagesAndTips),
      federalWithheld: federalWithheld ? parseFloat(federalWithheld) : undefined,
      otherCompensation: otherCompensation ? parseFloat(otherCompensation) : 0,
      notes: notes || undefined,
      documentId: documentId || undefined,
    });
  };

  const taxDocs = documents.filter(d =>
    d.category === "tax_return" || d.category === "employment_record" || d.category === "financial_statement"
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingRecord ? "Edit W-2" : "Add W-2 Income"}</DialogTitle>
          <DialogDescription>
            Enter W-2 details for you or your spouse to compare incomes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Whose W-2 is this?</Label>
            <Select value={party} onValueChange={setParty}>
              <SelectTrigger data-testid="select-w2-party">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="self">My W-2</SelectItem>
                <SelectItem value="spouse">Spouse's W-2</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="w2-year">Tax Year</Label>
              <Input
                id="w2-year"
                type="number"
                value={taxYear}
                onChange={(e) => setTaxYear(e.target.value)}
                data-testid="input-w2-year"
              />
            </div>
            <div>
              <Label htmlFor="w2-employer">Employer Name</Label>
              <Input
                id="w2-employer"
                placeholder="Company name"
                value={employerName}
                onChange={(e) => setEmployerName(e.target.value)}
                data-testid="input-w2-employer"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="w2-wages">Wages & Tips (Box 1)</Label>
            <Input
              id="w2-wages"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={wagesAndTips}
              onChange={(e) => setWagesAndTips(e.target.value)}
              data-testid="input-w2-wages"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="w2-federal">Federal Withheld</Label>
              <Input
                id="w2-federal"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={federalWithheld}
                onChange={(e) => setFederalWithheld(e.target.value)}
                data-testid="input-w2-federal"
              />
            </div>
            <div>
              <Label htmlFor="w2-other">Other Comp (Box 14)</Label>
              <Input
                id="w2-other"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={otherCompensation}
                onChange={(e) => setOtherCompensation(e.target.value)}
                data-testid="input-w2-other"
              />
            </div>
          </div>
          <div>
            <Label>Link Source Document (Optional)</Label>
            <Select value={documentId} onValueChange={setDocumentId}>
              <SelectTrigger data-testid="select-w2-document">
                <SelectValue placeholder="Select uploaded W-2 document" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No document</SelectItem>
                {taxDocs.map((doc) => (
                  <SelectItem key={doc.id} value={doc.id}>
                    {doc.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Link to an uploaded PDF for proof
            </p>
          </div>
          <div>
            <Label htmlFor="w2-notes">Notes (Optional)</Label>
            <Textarea
              id="w2-notes"
              placeholder="Additional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              data-testid="input-w2-notes"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-w2">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!party || !taxYear || !employerName || !wagesAndTips} data-testid="button-save-w2">
            {editingRecord ? "Update" : "Add W-2"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IncomeTab({ isDemoMode }: { isDemoMode: boolean }) {
  const { toast } = useToast();
  const { queueMutation: queueOffline } = useOfflineSync();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingRecord, setEditingRecord] = useState<W2Record | null>(null);
  const [showStrategies, setShowStrategies] = useState(false);
  const [detailRecord, setDetailRecord] = useState<W2Record | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);

  const { data: w2Records = [], isLoading } = useQuery<W2Record[]>({
    queryKey: ["/api/mobile/w2-records"],
    enabled: !isDemoMode,
  });

  const { data: documents = [] } = useQuery<Document[]>({
    queryKey: ["/api/mobile/documents"],
    enabled: !isDemoMode,
  });

  const getLinkedDocument = (documentId: string | null | undefined) => {
    if (!documentId) return null;
    return documents.find(d => d.id === documentId) || null;
  };

  const createMutation = useMutation({
    mutationFn: async (data: Partial<W2Record>) => {
      if (!navigator.onLine) {
        await queueOffline({
          method: "POST",
          url: "/api/mobile/w2-records",
          body: data,
          description: `Create W-2: ${data.employerName || "Unknown employer"}`,
        });
        return { queued: true };
      }
      return apiRequest("POST", "/api/mobile/w2-records", data);
    },
    onSuccess: (result: any) => {
      if (result?.queued) {
        toast({ title: "Saved offline", description: "Will sync automatically when you reconnect." });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/mobile/w2-records"] });
        toast({ title: "W-2 added", description: "Income record has been saved." });
      }
      setShowCreateDialog(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<W2Record> }) => {
      if (!navigator.onLine) {
        await queueOffline({
          method: "PATCH",
          url: `/api/mobile/w2-records/${id}`,
          body: data,
          description: `Update W-2 ${id}`,
        });
        return { queued: true };
      }
      return apiRequest("PATCH", `/api/mobile/w2-records/${id}`, data);
    },
    onSuccess: (result: any) => {
      if (result?.queued) {
        toast({ title: "Saved offline", description: "Will sync automatically when you reconnect." });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/mobile/w2-records"] });
        toast({ title: "W-2 updated" });
      }
      setEditingRecord(null);
      setShowCreateDialog(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!navigator.onLine) {
        await queueOffline({
          method: "DELETE",
          url: `/api/mobile/w2-records/${id}`,
          description: `Delete W-2 ${id}`,
        });
        queryClient.setQueryData(["/api/mobile/w2-records"], (old: W2Record[] = []) =>
          old.filter((r) => r.id !== id)
        );
        return { queued: true };
      }
      return apiRequest("DELETE", `/api/mobile/w2-records/${id}`);
    },
    onSuccess: (result: any) => {
      if (!result?.queued) {
        queryClient.invalidateQueries({ queryKey: ["/api/mobile/w2-records"] });
        toast({ title: "W-2 deleted" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
    },
  });

  const handleSave = (data: Partial<W2Record>) => {
    if (editingRecord) {
      updateMutation.mutate({ id: editingRecord.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (record: W2Record) => {
    setEditingRecord(record);
    setShowCreateDialog(true);
  };

  const handleViewDetail = (record: W2Record) => {
    setDetailRecord(record);
    setShowDetailDialog(true);
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  };

  const selfRecords = w2Records.filter(r => r.party === "self");
  const spouseRecords = w2Records.filter(r => r.party === "spouse");
  const selfTotal = selfRecords.reduce((sum, r) => sum + r.wagesAndTips, 0);
  const spouseTotal = spouseRecords.reduce((sum, r) => sum + r.wagesAndTips, 0);
  const incomeDiff = selfTotal - spouseTotal;

  if (isDemoMode) {
    return (
      <div className="p-4 space-y-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 text-center">
            <Users className="h-12 w-12 text-primary mx-auto mb-3" />
            <h3 className="font-semibold mb-1">Compare W-2 Income</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Track and compare both parties' W-2 income to justify support calculations.
            </p>
            <ul className="text-left text-sm space-y-2 mb-4">
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Enter W-2 details for both parties
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                See income comparison at a glance
              </li>
              <li className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Premium: AI income strategy tips</span>
              </li>
            </ul>
            <Button disabled className="w-full" data-testid="button-demo-create-w2">
              Sign in to track income
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-primary/10">
            <p className="text-xs text-muted-foreground">Your Income</p>
            <p className="text-xl font-bold text-primary">{formatCurrency(selfTotal)}</p>
          </div>
          <div className="p-3 rounded-lg bg-orange-100 dark:bg-orange-900/30">
            <p className="text-xs text-muted-foreground">Spouse Income</p>
            <p className="text-xl font-bold text-orange-600">{formatCurrency(spouseTotal)}</p>
          </div>
        </div>
        {(selfTotal > 0 || spouseTotal > 0) && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Difference:</span>
            <span className={`font-semibold ${incomeDiff > 0 ? "text-red-500" : "text-green-500"}`}>
              {incomeDiff > 0 ? "You earn " : "Spouse earns "}
              {formatCurrency(Math.abs(incomeDiff))} more
            </span>
          </div>
        )}
        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={() => {
              setEditingRecord(null);
              setShowCreateDialog(true);
            }}
            data-testid="button-create-w2"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add W-2
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowStrategies(!showStrategies)}
            data-testid="button-toggle-strategies"
          >
            <Lightbulb className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {showStrategies && (
            <Card className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-amber-200 dark:border-amber-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  Income Presentation Strategies
                </CardTitle>
                <CardDescription className="text-xs">
                  Pro tips for presenting income favorably
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <TrendingDown className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Highlight Variable Income</p>
                    <p className="text-xs text-muted-foreground">Bonuses and commissions can be excluded from base calculations in many jurisdictions.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <TrendingDown className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Document Business Expenses</p>
                    <p className="text-xs text-muted-foreground">Self-employment income can be reduced by legitimate business deductions.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <TrendingDown className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Consider Tax-Advantaged Contributions</p>
                    <p className="text-xs text-muted-foreground">401(k), HSA, and FSA contributions reduce taxable income.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <TrendingDown className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Review Spouse's Unreported Income</p>
                    <p className="text-xs text-muted-foreground">Cash income, side jobs, or underreported tips may need documentation.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {isLoading ? (
            <>
              {[1, 2].map((i) => (
                <Card key={i}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <Skeleton className="h-10 w-10 rounded-lg" />
                      <div className="flex-1">
                        <Skeleton className="h-4 w-32 mb-2" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                      <Skeleton className="h-6 w-16" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          ) : w2Records.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-6 text-center">
                <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <h3 className="font-medium mb-1">No W-2 Records</h3>
                <p className="text-sm text-muted-foreground">
                  Add W-2 income records for both parties to compare earnings
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {selfRecords.length > 0 && (
                <div>
                  <h3 className="font-medium mb-2 flex items-center gap-2">
                    Your W-2s
                    <Badge variant="default" className="text-xs">{selfRecords.length}</Badge>
                  </h3>
                  <div className="space-y-2">
                    {selfRecords.map((record) => (
                      <W2Card
                        key={record.id}
                        record={record}
                        onEdit={handleEdit}
                        onDelete={(id) => deleteMutation.mutate(id)}
                        onViewDetail={handleViewDetail}
                        linkedDocument={getLinkedDocument(record.documentId)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {spouseRecords.length > 0 && (
                <div>
                  <h3 className="font-medium mb-2 flex items-center gap-2">
                    Spouse's W-2s
                    <Badge variant="secondary" className="text-xs">{spouseRecords.length}</Badge>
                  </h3>
                  <div className="space-y-2">
                    {spouseRecords.map((record) => (
                      <W2Card
                        key={record.id}
                        record={record}
                        onEdit={handleEdit}
                        onDelete={(id) => deleteMutation.mutate(id)}
                        onViewDetail={handleViewDetail}
                        linkedDocument={getLinkedDocument(record.documentId)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      <CreateW2Dialog
        isOpen={showCreateDialog}
        onClose={() => {
          setShowCreateDialog(false);
          setEditingRecord(null);
        }}
        onSave={handleSave}
        editingRecord={editingRecord}
        documents={documents}
      />

      <W2DetailDialog
        isOpen={showDetailDialog}
        onClose={() => {
          setShowDetailDialog(false);
          setDetailRecord(null);
        }}
        record={detailRecord}
        linkedDocument={detailRecord ? getLinkedDocument(detailRecord.documentId) : null}
      />
    </div>
  );
}

export default function MobileView() {
  const [, setLocation] = useLocation();
  const { environment } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("documents");

  const {
    isOnline,
    pendingCount,
    isSyncing,
    sync,
    isInstallable,
    installApp,
  } = useOfflineSync();

  const isDemoMode = environment === "demo";

  const handleBack = () => {
    setLocation("/dashboard");
  };

  const handleSync = async () => {
    const result = await sync();
    if (result.flushed > 0) {
      toast({
        title: "Sync complete",
        description: `${result.flushed} change${result.flushed !== 1 ? "s" : ""} synced successfully.`,
      });
    } else if (result.failed > 0) {
      toast({
        title: "Some changes failed to sync",
        description: result.errors.slice(0, 2).join("; "),
        variant: "destructive",
      });
    } else if (result.flushed === 0 && result.failed === 0) {
      toast({ title: "All up to date", description: "No pending changes to sync." });
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col" data-testid="page-mobile">
      <MobileHeader
        title="Divorce Ledger"
        onBack={handleBack}
        isOnline={isOnline}
        pendingCount={pendingCount}
        isSyncing={isSyncing}
        onSync={handleSync}
        isInstallable={isInstallable}
        onInstall={installApp}
      />

      <OfflineBanner isOnline={isOnline} pendingCount={pendingCount} />

      <FinancialSummaryBar isDemoMode={isDemoMode} environment={environment} />
      <Suspense fallback={<div className="p-4 text-center">Loading...</div>}>
        <MobileAppBanner />
      </Suspense>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="grid grid-cols-2 mx-4 mt-2" data-testid="tabs-mobile-navigation">
          <TabsTrigger value="documents" className="flex items-center gap-2" data-testid="tab-documents">
            <FileText className="h-4 w-4" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="violations" className="flex items-center gap-2" data-testid="tab-violations">
            <AlertTriangle className="h-4 w-4" />
            Violations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="flex-1 mt-0 data-[state=active]:flex flex-col">
          <DocumentsTab isDemoMode={isDemoMode} />
        </TabsContent>

        <TabsContent value="violations" className="flex-1 mt-0 data-[state=active]:flex flex-col">
          <ViolationsAndReimbursementsTab isDemoMode={isDemoMode} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
