import { useState, useMemo, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  AlertCircle,
  AlertTriangle,
  Info,
  ChevronRight,
  Wallet,
  CreditCard,
  DollarSign,
  Home,
  Users,
  Heart,
  Calendar,
  CheckCircle2,
  Briefcase,
  Landmark,
  FileText,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { DashboardStats, Transaction, Alert as AlertType } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { FinancialDrilldownDrawer, type DrilldownType } from "@/components/financial-drilldown-drawer";
import { FeedbackCTA } from "@/components/feedback-cta";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

const StatCard = memo(function StatCard({
  title,
  value,
  subtitle,
  subtitleValue,
  trend,
  trendValue,
  icon: Icon,
  onClick,
}: {
  title: string;
  value: string;
  subtitle?: string;
  subtitleValue?: string;
  trend?: "up" | "down";
  trendValue?: string;
  icon: React.ElementType;
  onClick?: () => void;
}) {
  return (
    <Card
      className={`hover-elevate cursor-pointer transition-all ${onClick ? "" : ""}`}
      onClick={onClick}
      data-testid={`card-stat-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          {trend && (
            <Badge
              variant="outline"
              className={`text-xs ${trend === "up"
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
                }`}
            >
              {trend === "up" ? (
                <TrendingUp className="h-3 w-3 mr-1" />
              ) : (
                <TrendingDown className="h-3 w-3 mr-1" />
              )}
              {trendValue}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-1">{title}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {subtitle && (
          <div className="flex items-center justify-between mt-2 pt-2 border-t text-xs">
            <span className="text-muted-foreground">{subtitle}</span>
            <span className="font-medium">{subtitleValue}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

const TransactionRow = memo(function TransactionRow({ transaction }: { transaction: Transaction }) {
  const isPositive = transaction.amount > 0;

  return (
    <button
      className="flex items-center gap-3 w-full p-3 hover-elevate rounded-md transition-colors text-left"
      data-testid={`row-transaction-${transaction.id}`}
    >
      <div
        className={`p-2 rounded-lg ${isPositive ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30"
          }`}
      >
        {isPositive ? (
          <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
        ) : (
          <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{transaction.description}</p>
        <p className="text-xs text-muted-foreground">{transaction.date}</p>
      </div>
      <span
        className={`text-sm font-medium tabular-nums ${isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
          }`}
      >
        {isPositive ? "+" : ""}
        {formatCurrency(transaction.amount)}
      </span>
    </button>
  );
});

const severityConfig = {
  critical: {
    icon: AlertCircle,
    bg: "bg-red-100 dark:bg-red-900/30",
    text: "text-red-600 dark:text-red-400",
    border: "border-l-red-500",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-yellow-100 dark:bg-yellow-900/30",
    text: "text-yellow-600 dark:text-yellow-400",
    border: "border-l-yellow-500",
  },
  info: {
    icon: Info,
    bg: "bg-blue-100 dark:bg-blue-900/30",
    text: "text-blue-600 dark:text-blue-400",
    border: "border-l-blue-500",
  },
};

const AlertRow = memo(function AlertRow({ alert }: { alert: AlertType }) {
  const config = severityConfig[alert.severity as keyof typeof severityConfig] || severityConfig.info;
  const Icon = config.icon;

  return (
    <button
      className={`flex items-center gap-3 w-full p-3 hover-elevate rounded-md transition-colors text-left border-l-4 ${config.border}`}
      data-testid={`row-alert-${alert.id}`}
    >
      <div className={`p-2 rounded-lg ${config.bg}`}>
        <Icon className={`h-4 w-4 ${config.text}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={`text-xs uppercase ${config.text}`}
          >
            {alert.severity}
          </Badge>
        </div>
        <p className="text-sm font-medium mt-1">{alert.title}</p>
        <p className="text-xs text-muted-foreground truncate">{alert.description}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
});

const PaymentCard = memo(function PaymentCard({
  title,
  amount,
  dueDate,
  isPaid,
  icon: Icon,
}: {
  title: string;
  amount: number;
  dueDate: string;
  isPaid: boolean;
  icon: React.ElementType;
}) {
  return (
    <Card className="hover-elevate cursor-pointer" data-testid={`card-payment-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm font-medium">{title}</span>
          </div>
          {isPaid ? (
            <Badge variant="outline" className="text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Paid
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Due
            </Badge>
          )}
        </div>
        <p className="text-2xl font-semibold tabular-nums">{formatCurrency(amount)}/mo</p>
        <p className="text-xs text-muted-foreground mt-1">
          {isPaid ? `Paid: ${dueDate}` : `Due: ${dueDate}`}
        </p>
        <Button variant="outline" size="sm" className="w-full mt-3 text-xs">
          {isPaid ? "View Details" : "Payment Plan"}
        </Button>
      </CardContent>
    </Card>
  );
});

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-8 w-8 rounded-lg mb-3" />
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-32 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { environment, user } = useAuth();
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [drilldownType, setDrilldownType] = useState<DrilldownType>("assets");
  const [drilldownTitle, setDrilldownTitle] = useState("Assets");
  const defaultMode = (user?.role === "admin" || user?.role === "staff" || user?.isAdmin) ? "firm" : "client";
  const [viewMode, setViewMode] = useState<"client" | "firm">(defaultMode);

  const openDrilldown = (type: DrilldownType, title: string) => {
    setDrilldownType(type);
    setDrilldownTitle(title);
    setDrilldownOpen(true);
  };

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: transactions, isLoading: transactionsLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions/recent"],
  });

  const { data: alerts, isLoading: alertsLoading } = useQuery<AlertType[]>({
    queryKey: ["/api/alerts"],
  });

  const isLoading = statsLoading || transactionsLoading || alertsLoading;

  const totalAssets = useMemo(() => stats?.totalAssets || 0, [stats]);
  const maritalAssets = useMemo(() => stats?.maritalAssets || 0, [stats]);
  const totalDebts = useMemo(() => stats?.totalDebts || 0, [stats]);
  const monthlyIncome = useMemo(() => stats?.monthlyIncome || 0, [stats]);
  const monthlyExpenses = useMemo(() => stats?.monthlyExpenses || 0, [stats]);

  if (isLoading) {
    return (
      <div className="p-6">
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24 md:pb-6">

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold mb-1" data-testid="text-page-title">
            {environment === "demo" ? "Platform Overview" : "Dashboard"}
          </h1>
          <p className="text-sm text-muted-foreground">Overview of your financial position and case status</p>
        </div>

        {environment === "demo" && (
          <div className="bg-muted p-1 rounded-lg flex items-center space-x-1 shrink-0 mt-2 sm:mt-0">
            <Button
              size="sm"
              variant={viewMode === "client" ? "default" : "ghost"}
              onClick={() => setViewMode("client")}
              className="text-xs w-28"
            >
              Client View
            </Button>
            <Button
              size="sm"
              variant={viewMode === "firm" ? "default" : "ghost"}
              onClick={() => setViewMode("firm")}
              className="text-xs w-28"
            >
              Firm View
            </Button>
          </div>
        )}
      </div>

      {viewMode === "firm" ? (
        <div className="space-y-6 mt-6 animate-in fade-in duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Active Matters"
              value="14"
              subtitle="Pending Court Dates"
              subtitleValue="3"
              icon={Briefcase}
            />
            <StatCard
              title="Recent Uploads"
              value="28"
              subtitle="Unread Documents"
              subtitleValue="12"
              trend="up"
              trendValue="8%"
              icon={FileText}
            />
            <StatCard
              title="Unbilled Time"
              value="$12,450"
              subtitle="WIP Hours"
              subtitleValue="32.5"
              icon={Clock}
            />
            <StatCard
              title="Trust Balance"
              value="$45,000"
              subtitle="Needs Replenishment"
              subtitleValue="2"
              trend="down"
              trendValue="1%"
              icon={Landmark}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    High-Priority Clients
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-3 mt-4">
                  {[
                    { client: "Alex Pearson", status: "Trial Prep", docs: 14, alert: "Discovery Due" },
                    { client: "Sarah Miller", status: "Mediation", docs: 4, alert: "Waiting on client" },
                    { client: "David Chen", status: "Filing", docs: 8, alert: "Financials pending" }
                  ].map((row, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 border rounded-lg hover-elevate cursor-pointer bg-card">
                      <div>
                        <p className="font-medium text-sm">{row.client}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{row.status}</p>
                      </div>
                      <div className="text-right">
                        <Badge variant={idx === 0 ? "destructive" : "outline"} className="text-xs font-normal mb-1">
                          {row.alert}
                        </Badge>
                        <p className="text-xs text-muted-foreground">{row.docs} new docs</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    Upcoming Firm Schedule
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-3 mt-4">
                  {[
                    { event: "Pearson Status Conference", time: "Tomorrow, 9:00 AM", location: "19th JDC" },
                    { event: "Miller Mediation", time: "Friday, 1:00 PM", location: "Zoom" },
                    { event: "Chen Pre-trial", time: "Next Mon, 10:30 AM", location: "Dept 4" }
                  ].map((row, idx) => (
                    <div key={idx} className="flex items-start gap-4 p-3 border rounded-lg bg-card hover-elevate cursor-pointer">
                      <div className="bg-primary/10 p-2 rounded-lg mt-0.5">
                        <Calendar className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{row.event}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span>{row.time}</span>
                          <span>•</span>
                          <span>{row.location}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="space-y-6 mt-6 animate-in fade-in duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Assets"
              value={formatCurrency(totalAssets)}
              subtitle="Marital Assets"
              subtitleValue={formatCurrency(maritalAssets)}
              trend="up"
              trendValue="3%"
              icon={Wallet}
              onClick={() => openDrilldown("assets", "Assets")}
            />
            <StatCard
              title="Total Debts"
              value={formatCurrency(totalDebts)}
              subtitle="Monthly Payment"
              subtitleValue={formatCurrency(3200)}
              trend="down"
              trendValue="2%"
              icon={CreditCard}
              onClick={() => openDrilldown("debts", "Debts")}
            />
            <StatCard
              title="Monthly Income"
              value={formatCurrency(monthlyIncome)}
              subtitle="Your Portion"
              subtitleValue={formatCurrency(monthlyIncome * 0.55)}
              icon={DollarSign}
              onClick={() => openDrilldown("income", "Income")}
            />
            <StatCard
              title="Monthly Expenses"
              value={formatCurrency(monthlyExpenses)}
              subtitle="Unaccounted"
              subtitleValue={formatCurrency(2100)}
              icon={Home}
              onClick={() => openDrilldown("expenses", "Expenses")}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PaymentCard
              title="Child Support"
              amount={stats?.childSupportOwed ?? 0}
              dueDate="Jan 5"
              isPaid={false}
              icon={Users}
            />
            <PaymentCard
              title="Alimony"
              amount={stats?.alimonyOwed ?? 0}
              dueDate="Jan 3"
              isPaid={true}
              icon={Heart}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    Recent Transactions
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="text-xs" data-testid="button-view-all-transactions">
                    View All
                    <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-1">
                  {transactions && transactions.length > 0 ? (
                    transactions.slice(0, 5).map((transaction) => (
                      <TransactionRow key={transaction.id} transaction={transaction} />
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No recent transactions
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    Violations & Alerts
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="text-xs" data-testid="button-view-all-alerts">
                    View All
                    <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {alerts && alerts.length > 0 ? (
                    alerts.slice(0, 4).map((alert) => (
                      <AlertRow key={alert.id} alert={alert} />
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No active alerts
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <FinancialDrilldownDrawer
        open={drilldownOpen}
        onOpenChange={setDrilldownOpen}
        type={drilldownType}
        title={drilldownTitle}
        environment={environment}
      />

      <div className="flex justify-center pt-4">
        <FeedbackCTA />
      </div>
    </div>
  );
}
