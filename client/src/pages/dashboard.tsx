import { useState, useMemo, memo } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
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
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FinancialBreakdownWidget } from '@/components/financial-breakdown-widget';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import type { DashboardStats, Transaction, Alert as AlertType } from '@shared/schema';
import { useAuth } from '@/lib/auth';
import { FeedbackCTA } from '@/components/feedback-cta';
import { DrillDownValue } from '@/components/ui/drilldown-value';
import { DrilldownType } from '@/components/financial-drilldown-drawer';
import { useDrilldown } from '@/lib/drilldown-context';
import { RecordDetailDrawer } from '@/components/record-detail-drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { MissingBillsWidget } from '@/components/recurring-bills/MissingBillsWidget';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount / 100);
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
  drilldownType,
  incompleteCount,
}: {
  title: string;
  value: string;
  subtitle?: string;
  subtitleValue?: string;
  trend?: 'up' | 'down';
  trendValue?: string;
  icon: React.ElementType;
  onClick?: () => void;
  drilldownType?: DrilldownType;
  incompleteCount?: number;
}) {
  const { openDrilldown } = useDrilldown();

  const handleCardClick = () => {
    if (drilldownType) {
      openDrilldown({ type: drilldownType, title });
    } else if (onClick) {
      onClick();
    }
  };

  return (
    <Card
      className={`hover-elevate transition-all ${onClick || drilldownType ? 'cursor-pointer' : ''}`}
      onClick={handleCardClick}
      data-testid={`card-stat-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          {trend && (
            <Badge
              variant="outline"
              className={`text-xs ${
                trend === 'up'
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {trend === 'up' ? (
                <TrendingUp className="h-3 w-3 mr-1" />
              ) : (
                <TrendingDown className="h-3 w-3 mr-1" />
              )}
              {trendValue}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-1">{title}</p>
        <p className="text-2xl font-semibold tabular-nums">
          {drilldownType ? (
            <DrillDownValue type={drilldownType} title={title} value={value} />
          ) : (
            value
          )}
        </p>
        {subtitle && (
          <div className="flex items-center justify-between mt-2 pt-2 border-t text-xs">
            <span className="text-muted-foreground">{subtitle}</span>
            <span className="font-medium">
              {drilldownType ? (
                <DrillDownValue
                  type={drilldownType}
                  title={subtitle}
                  value={subtitleValue}
                  asBadge={true}
                />
              ) : (
                subtitleValue
              )}
            </span>
          </div>
        )}
        {incompleteCount !== undefined && incompleteCount > 0 && (
          <div className="flex items-center gap-1 mt-2 text-[10px] font-medium text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded-sm max-w-fit" title="Incomplete due to missing monthly bills">
            <AlertTriangle className="h-3 w-3" />
            <span>Missing {incompleteCount} Expected {incompleteCount === 1 ? 'Bill' : 'Bills'}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

const TransactionRow = memo(function TransactionRow({ 
  transaction,
  onClick
}: { 
  transaction: Transaction;
  onClick: (t: Transaction) => void;
}) {
  const isPositive = transaction.amount > 0;

  return (
    <button
      className="flex items-center gap-3 w-full p-3 hover-elevate rounded-md transition-colors text-left"
      data-testid={`row-transaction-${transaction.id}`}
      onClick={() => onClick(transaction)}
    >
      <div
        className={`p-2 rounded-lg ${
          isPositive ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
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
        className={`text-sm font-medium tabular-nums ${
          isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
        }`}
      >
        {isPositive ? '+' : ''}
        {formatCurrency(transaction.amount)}
      </span>
    </button>
  );
});

const severityConfig = {
  critical: {
    icon: AlertCircle,
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-600 dark:text-red-400',
    border: 'border-l-red-500',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'bg-yellow-100 dark:bg-yellow-900/30',
    text: 'text-yellow-600 dark:text-yellow-400',
    border: 'border-l-yellow-500',
  },
  info: {
    icon: Info,
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-l-blue-500',
  },
};

const AlertRow = memo(function AlertRow({ alert }: { alert: AlertType }) {
  const config =
    severityConfig[alert.severity as keyof typeof severityConfig] || severityConfig.info;
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
          <Badge variant="outline" className={`text-xs uppercase ${config.text}`}>
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
  drilldownType,
  suffix,
  action,
}: {
  title: string;
  amount: number;
  dueDate: string;
  isPaid: boolean;
  icon: React.ElementType;
  drilldownType?: DrilldownType;
  suffix?: string;
  action?: React.ReactNode;
}) {
  const { openDrilldown } = useDrilldown();

  const handleCardClick = () => {
    if (drilldownType) {
      openDrilldown({ type: drilldownType, title });
    }
  };

  return (
    <Card
      className={`hover-elevate ${drilldownType ? 'cursor-pointer' : ''}`}
      onClick={handleCardClick}
      data-testid={`card-payment-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
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
        <p className="text-2xl font-semibold tabular-nums">
          {drilldownType ? (
            <DrillDownValue
              type={drilldownType}
              title={title}
              value={suffix !== undefined ? `${formatCurrency(amount)}${suffix}` : `${formatCurrency(amount)}/mo`}
            />
          ) : (
            suffix !== undefined ? `${formatCurrency(amount)}${suffix}` : `${formatCurrency(amount)}/mo`
          )}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {isPaid ? `Paid: ${dueDate}` : `Due: ${dueDate}`}
        </p>
        <div className="flex gap-2 mt-3 text-xs w-full">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              handleCardClick();
            }}
          >
            {isPaid ? 'View Details' : 'Payment Plan'}
          </Button>
          {action}
        </div>
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
  const [, setLocation] = useLocation();
  const { environment, user } = useAuth();
  const defaultMode =
    user?.role === 'admin' || user?.role === 'staff' || user?.isAdmin ? 'firm' : 'client';
  const [viewMode, setViewMode] = useState<'client' | 'firm'>(defaultMode);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ['/api/dashboard/stats'],
  });

  const { data: obligationsSummary, isLoading: obligationsSummaryLoading } = useQuery<any>({
    queryKey: ['/api/obligations/summary'],
  });

  const { data: pendingObligations, isLoading: pendingObligationsLoading } = useQuery<any[]>({
    queryKey: ['/api/obligations/pending'],
  });

  const { data: transactions, isLoading: transactionsLoading } = useQuery<Transaction[]>({
    queryKey: ['/api/transactions/recent'],
  });

  const { data: alerts, isLoading: alertsLoading } = useQuery<AlertType[]>({
    queryKey: ['/api/alerts'],
  });

  const isLoading = statsLoading || transactionsLoading || alertsLoading || obligationsSummaryLoading || pendingObligationsLoading;

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
            {environment === 'demo' ? 'Platform Overview' : 'Dashboard'}
          </h1>
          <p className="text-sm text-muted-foreground">
            Overview of your financial position and case status
          </p>
        </div>

        {environment === 'demo' && (
          <div className="bg-muted p-1 rounded-lg flex items-center space-x-1 shrink-0 mt-2 sm:mt-0">
            <Button
              size="sm"
              variant={viewMode === 'client' ? 'default' : 'ghost'}
              onClick={() => setViewMode('client')}
              className="text-xs w-28"
            >
              Client View
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'firm' ? 'default' : 'ghost'}
              onClick={() => setViewMode('firm')}
              className="text-xs w-28"
            >
              Firm View
            </Button>
          </div>
        )}
      </div>

      {viewMode === 'firm' ? (
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
                    {
                      client: 'Alex Pearson',
                      status: 'Trial Prep',
                      docs: 14,
                      alert: 'Discovery Due',
                    },
                    {
                      client: 'Sarah Miller',
                      status: 'Mediation',
                      docs: 4,
                      alert: 'Waiting on client',
                    },
                    {
                      client: 'David Chen',
                      status: 'Filing',
                      docs: 8,
                      alert: 'Financials pending',
                    },
                  ].map((row, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-center p-3 border rounded-lg hover-elevate cursor-pointer bg-card"
                    >
                      <div>
                        <p className="font-medium text-sm">{row.client}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{row.status}</p>
                      </div>
                      <div className="text-right">
                        <Badge
                          variant={idx === 0 ? 'destructive' : 'outline'}
                          className="text-xs font-normal mb-1"
                        >
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
                    {
                      event: 'Pearson Status Conference',
                      time: 'Tomorrow, 9:00 AM',
                      location: '19th JDC',
                    },
                    { event: 'Miller Mediation', time: 'Friday, 1:00 PM', location: 'Zoom' },
                    { event: 'Chen Pre-trial', time: 'Next Mon, 10:30 AM', location: 'Dept 4' },
                  ].map((row, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-4 p-3 border rounded-lg bg-card hover-elevate cursor-pointer"
                    >
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
          <MissingBillsWidget />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Net Position"
              value={formatCurrency(obligationsSummary?.totals?.netPosition ?? 0)}
              subtitle="Asset Offset"
              subtitleValue={formatCurrency(obligationsSummary?.totals?.netPosition ?? 0)}
              icon={Wallet}
              trend={obligationsSummary?.totals?.netPosition >= 0 ? 'up' : 'down'}
              trendValue="Ledger"
              onClick={() => setLocation('/obligations')}
              incompleteCount={obligationsSummary?.totals?.hasMissingBills ? obligationsSummary?.totals?.missingBillsCount : undefined}
            />
            <StatCard
              title="Due From Spouse"
              value={formatCurrency(obligationsSummary?.totals?.dueFromSpouse ?? 0)}
              subtitle="Upcoming"
              subtitleValue={formatCurrency(obligationsSummary?.totals?.upcomingObligations ?? 0)}
              icon={TrendingUp}
              trend="up"
              onClick={() => setLocation('/obligations')}
              incompleteCount={obligationsSummary?.totals?.hasMissingBills ? obligationsSummary?.totals?.missingBillsCount : undefined}
            />
            <StatCard
              title="Due To Spouse"
              value={formatCurrency(obligationsSummary?.totals?.dueToSpouse ?? 0)}
              subtitle="Owed"
              subtitleValue="Obligation"
              icon={TrendingDown}
              trend="down"
              onClick={() => setLocation('/obligations')}
            />
            <StatCard
              title="Child Support Due"
              value={formatCurrency(obligationsSummary?.totals?.childSupportDue ?? 0)}
              subtitle="Overdue Arrears"
              subtitleValue={formatCurrency(obligationsSummary?.totals?.childSupportArrears ?? 0)}
              icon={Users}
              onClick={() => setLocation('/obligations')}
            />
            <StatCard
              title="Needs Review"
              value={pendingObligations?.length?.toString() || '0'}
              subtitle="Pending AI Scans"
              subtitleValue="Action Required"
              icon={AlertCircle}
              onClick={() => setLocation('/obligations')}
            />
            <StatCard
              title="Overdue Obligations"
              value={formatCurrency(obligationsSummary?.totals?.overdueObligations ?? 0)}
              subtitle="Past Due Items"
              subtitleValue={obligationsSummary?.totals?.overdueCount?.toString() || '0'}
              icon={AlertTriangle}
              onClick={() => setLocation('/obligations')}
            />
            <StatCard
              title="Pending Reimbursements"
              value={formatCurrency(obligationsSummary?.totals?.pendingReimbursements ?? 0)}
              subtitle="Awaiting Payout"
              subtitleValue="Requested"
              icon={DollarSign}
              onClick={() => setLocation('/obligations')}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PaymentCard
              title="Child Support"
              amount={obligationsSummary?.totals?.childSupportDue ?? 0}
              dueDate="View Schedule"
              isPaid={false}
              icon={Users}
            />
            <PaymentCard
              title="Total Assets"
              amount={stats?.totalAssets ?? 0}
              dueDate="Current Valuation"
              isPaid={true}
              icon={Landmark}
              drilldownType="assets"
              suffix=""
              action={
                <Button 
                  variant="default" 
                  className="flex-1 text-xs h-8 shadow-sm"
                  onClick={() => setLocation('/finances')}
                >
                  Add Asset
                </Button>
              }
            />
          </div>

          <div className="mt-8 mb-4">
            <FinancialBreakdownWidget />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    Recent Transactions
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => setLocation('/finances')}
                    data-testid="button-view-all-transactions"
                  >
                    View All
                    <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-1">
                  {transactions && transactions.length > 0 ? (
                    transactions
                      .slice(0, 5)
                      .map((transaction) => (
                        <TransactionRow 
                          key={transaction.id} 
                          transaction={transaction}
                          onClick={setSelectedTransaction} 
                        />
                      ))
                  ) : (
                    <EmptyState 
                      title="No recent transactions" 
                      description="Your latest financial actions will appear here." 
                      className="py-10 border-none bg-transparent"
                    />
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => setLocation('/violations')}
                    data-testid="button-view-all-alerts"
                  >
                    View All
                    <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {alerts && alerts.length > 0 ? (
                    alerts.slice(0, 4).map((alert) => <AlertRow key={alert.id} alert={alert} />)
                  ) : (
                    <EmptyState 
                      title="No active alerts" 
                      description="Your account is completely up to date." 
                      className="py-10 border-none bg-transparent"
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <div className="flex justify-center pt-4">
        <FeedbackCTA />
      </div>

      <RecordDetailDrawer
        open={!!selectedTransaction}
        onOpenChange={(open) => !open && setSelectedTransaction(null)}
        recordType={selectedTransaction && selectedTransaction.amount > 0 ? 'income' : 'expense'}
        record={selectedTransaction as any}
      />
    </div>
  );
}
