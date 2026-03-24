import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Users,
  DollarSign,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { useDrilldown } from '@/lib/drilldown-context';

interface RevenueSummary {
  currentMrr: number;
  currentArr: number;
  monthlyGrowth: number;
  avgRevenuePerUser: number;
}

interface MRRData {
  month: string;
  mrr: number;
  arr: number;
  growth: number;
  tierBreakdown: Record<string, number>;
}

interface CohortData {
  cohort: string;
  users: number;
  month1: number;
  month2: number;
  month3: number;
  month6: number;
  month12: number;
}

interface ChurnSummary {
  currentChurnRate: number;
  averageLTV: number;
  atRiskUsers: number;
  retentionRate: number;
}

interface ChurnData {
  month: string;
  churnRate: number;
  churnedUsers: number;
  retainedUsers: number;
  ltv: number;
}

interface AtRiskUser {
  userId: number;
  email: string;
  tier: string;
  riskScore: number;
  riskFactors: string[];
  daysSinceActivity: number;
  violationCount: number;
}

interface ViolationPattern {
  category: string;
  count: number;
  avgSeverity: number;
  trend: 'up' | 'down' | 'stable';
}

interface TierMigration {
  month: string;
  upgrades: number;
  downgrades: number;
  netMigration: number;
}

interface DashboardSummary {
  revenue: { mrr: number; arr: number; avgRevenuePerUser: number };
  users: { total: number; paid: number; conversionRate: number; atRisk: number };
  violations: { total: number; last30Days: number; avgPerUser: number };
  tierDistribution: Record<string, number>;
}

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function MetricCard({
  title,
  value,
  subtitle,
  trend,
  icon: Icon,
}: {
  title: string;
  value: string;
  subtitle?: string;
  trend?: number;
  icon: any;
}) {
  const { openDrilldown } = useDrilldown();

  const handleDrilldown = () => {
    openDrilldown({
      layer: 1,
      sourceEntity: 'kpi_metric',
      identifier: title.toLowerCase().replace(/\s+/g, '_')
    });
  };

  return (
    <Card 
      data-testid={`card-metric-${title.toLowerCase().replace(/\s+/g, '-')}`}
      onClick={handleDrilldown}
      className="cursor-pointer hover-elevate transition-all"
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {(subtitle || trend !== undefined) && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
            {trend !== undefined && (
              <>
                {trend >= 0 ? (
                  <ArrowUpRight className="h-3 w-3 text-green-500" />
                ) : (
                  <ArrowDownRight className="h-3 w-3 text-red-500" />
                )}
                <span className={trend >= 0 ? 'text-green-500' : 'text-red-500'}>
                  {Math.abs(trend).toFixed(1)}%
                </span>
              </>
            )}
            {subtitle && <span>{subtitle}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RevenueTab() {
  const { openDrilldown } = useDrilldown();
  const { data, isLoading } = useQuery<{ summary: RevenueSummary; monthlyData: MRRData[] }>({
    queryKey: ['/api/analytics/dashboard/revenue'],
  });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const { summary, monthlyData } = data || { summary: {} as RevenueSummary, monthlyData: [] };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Monthly Recurring Revenue"
          value={formatCurrency(summary.currentMrr)}
          trend={summary.monthlyGrowth}
          icon={DollarSign}
        />
        <MetricCard
          title="Annual Recurring Revenue"
          value={formatCurrency(summary.currentArr)}
          subtitle="Projected"
          icon={TrendingUp}
        />
        <MetricCard
          title="Monthly Growth"
          value={`${summary.monthlyGrowth?.toFixed(1) || 0}%`}
          icon={TrendingUp}
        />
        <MetricCard
          title="Avg Revenue Per User"
          value={formatCurrency(summary.avgRevenuePerUser || 0)}
          icon={Users}
        />
      </div>

      <Card data-testid="card-mrr-chart">
        <CardHeader>
          <CardTitle>MRR Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis tickFormatter={(v) => `$${(v / 100).toLocaleString()}`} className="text-xs" />
              <Tooltip
                formatter={(value: number) => formatCurrency(value)}
                labelFormatter={(label) => `Month: ${label}`}
              />
              <Area
                type="monotone"
                dataKey="mrr"
                stroke="hsl(var(--chart-1))"
                fill="hsl(var(--chart-1))"
                fillOpacity={0.3}
                activeDot={{
                  onClick: (event: any, payload: any) => {
                    if (payload && payload.payload) {
                      openDrilldown({
                        layer: 2,
                        sourceEntity: 'chart_segment',
                        identifier: 'mrr_trend',
                        context: { filters: { month: payload.payload.month } }
                      });
                    }
                  }
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card data-testid="card-revenue-growth">
        <CardHeader>
          <CardTitle>Month-over-Month Growth</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis tickFormatter={(v) => `${v}%`} className="text-xs" />
              <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
              <Bar 
                dataKey="growth" 
                fill="hsl(var(--chart-2))" 
                radius={[4, 4, 0, 0]} 
                onClick={(data) => {
                  openDrilldown({
                    layer: 2,
                    sourceEntity: 'chart_segment',
                    identifier: 'revenue_growth',
                    context: { filters: { month: data.month } }
                  });
                }}
                className="cursor-pointer"
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function ChurnLTVTab() {
  const { openDrilldown } = useDrilldown();
  const { data: churnData, isLoading: churnLoading } = useQuery<{
    summary: ChurnSummary;
    monthlyData: ChurnData[];
  }>({
    queryKey: ['/api/analytics/dashboard/churn-ltv'],
  });

  const { data: atRiskData, isLoading: atRiskLoading } = useQuery<{ atRiskUsers: AtRiskUser[] }>({
    queryKey: ['/api/analytics/dashboard/at-risk-users'],
  });

  if (churnLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const { summary, monthlyData } = churnData || { summary: {} as ChurnSummary, monthlyData: [] };
  const { atRiskUsers } = atRiskData || { atRiskUsers: [] };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Current Churn Rate"
          value={`${summary.currentChurnRate?.toFixed(1) || 0}%`}
          icon={TrendingDown}
        />
        <MetricCard
          title="Average LTV"
          value={formatCurrency(summary.averageLTV || 0)}
          icon={DollarSign}
        />
        <MetricCard
          title="Retention Rate"
          value={`${summary.retentionRate?.toFixed(1) || 100}%`}
          icon={Users}
        />
        <MetricCard
          title="At-Risk Users"
          value={String(summary.atRiskUsers || 0)}
          icon={AlertTriangle}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="card-churn-trend">
          <CardHeader>
            <CardTitle>Churn Rate Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis tickFormatter={(v) => `${v}%`} className="text-xs" />
                <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                <Line
                  type="monotone"
                  dataKey="churnRate"
                  stroke="hsl(var(--chart-3))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card data-testid="card-ltv-trend">
          <CardHeader>
            <CardTitle>LTV Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis tickFormatter={(v) => formatCurrency(v)} className="text-xs" />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Area
                  type="monotone"
                  dataKey="ltv"
                  stroke="hsl(var(--chart-4))"
                  fill="hsl(var(--chart-4))"
                  fillOpacity={0.3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-at-risk-users">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            At-Risk Users
          </CardTitle>
        </CardHeader>
        <CardContent>
          {atRiskLoading ? (
            <div className="animate-pulse space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-muted rounded" />
              ))}
            </div>
          ) : atRiskUsers.length === 0 ? (
            <p className="text-muted-foreground text-sm">No at-risk users identified</p>
          ) : (
            <div className="space-y-3">
              {atRiskUsers.slice(0, 10).map((user) => (
                <div
                  key={user.userId}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  data-testid={`row-at-risk-${user.userId}`}
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-medium text-sm">{user.email}</span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        {user.tier}
                      </Badge>
                      {user.riskFactors.map((factor, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {factor}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">
                      {user.daysSinceActivity}d inactive
                    </span>
                    <Badge
                      variant={
                        user.riskScore >= 70
                          ? 'destructive'
                          : user.riskScore >= 50
                            ? 'secondary'
                            : 'outline'
                      }
                    >
                      {user.riskScore}% risk
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ViolationsTab() {
  const { openDrilldown } = useDrilldown();
  const { data, isLoading } = useQuery<{
    patterns: ViolationPattern[];
    severityDistribution: { level: string; count: number }[];
    totalViolations: number;
  }>({
    queryKey: ['/api/analytics/dashboard/violation-patterns'],
  });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-64 bg-muted rounded-lg" />
      </div>
    );
  }

  const { patterns, severityDistribution, totalViolations } = data || {
    patterns: [],
    severityDistribution: [],
    totalViolations: 0,
  };

  const pieData = severityDistribution.map((s, i) => ({ ...s, fill: COLORS[i % COLORS.length] }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Total Violations (30d)"
          value={formatNumber(totalViolations)}
          icon={AlertTriangle}
        />
        <MetricCard title="Categories" value={String(patterns.length)} icon={TrendingUp} />
        <MetricCard
          title="Avg Severity"
          value={(
            patterns.reduce((sum, p) => sum + p.avgSeverity, 0) / Math.max(patterns.length, 1)
          ).toFixed(1)}
          icon={AlertTriangle}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="card-violation-patterns">
          <CardHeader>
            <CardTitle>Violation Patterns by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={patterns} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" className="text-xs" />
                <YAxis dataKey="category" type="category" width={120} className="text-xs" />
                <Tooltip />
                <Bar 
                  dataKey="count" 
                  fill="hsl(var(--chart-1))" 
                  radius={[0, 4, 4, 0]}
                  onClick={(data) => {
                    openDrilldown({
                      layer: 2,
                      sourceEntity: 'workflow_state',
                      identifier: 'violation_pattern',
                      context: { filters: { category: data.category } }
                    });
                  }}
                  className="cursor-pointer"
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card data-testid="card-severity-distribution">
          <CardHeader>
            <CardTitle>Severity Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="count"
                  nameKey="level"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ level, count }) => `${level}: ${count}`}
                  onClick={(data) => {
                    openDrilldown({
                      layer: 2,
                      sourceEntity: 'workflow_state',
                      identifier: 'severity_distribution',
                      context: { filters: { level: data.level } }
                    });
                  }}
                  className="cursor-pointer focus:outline-none"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-pattern-details">
        <CardHeader>
          <CardTitle>Pattern Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {patterns.map((pattern) => (
              <div
                key={pattern.category}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium">{pattern.category}</span>
                  {pattern.trend === 'up' && <TrendingUp className="h-4 w-4 text-red-500" />}
                  {pattern.trend === 'down' && <TrendingDown className="h-4 w-4 text-green-500" />}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">{pattern.count} violations</span>
                  <Badge
                    variant={
                      pattern.avgSeverity >= 7
                        ? 'destructive'
                        : pattern.avgSeverity >= 4
                          ? 'secondary'
                          : 'outline'
                    }
                  >
                    Severity: {pattern.avgSeverity.toFixed(1)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TierMigrationsTab() {
  const { openDrilldown } = useDrilldown();
  const { data, isLoading } = useQuery<{
    summary: {
      totalUpgrades: number;
      totalDowngrades: number;
      upgradeRate: number;
      conversionRate: number;
    };
    monthlyData: TierMigration[];
  }>({
    queryKey: ['/api/analytics/dashboard/tier-migrations'],
  });

  const { data: cohortData } = useQuery<{ cohorts: CohortData[] }>({
    queryKey: ['/api/analytics/dashboard/cohorts'],
  });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const { summary, monthlyData } = data || {
    summary: { totalUpgrades: 0, totalDowngrades: 0, upgradeRate: 0, conversionRate: 0 },
    monthlyData: [],
  };
  const { cohorts } = cohortData || { cohorts: [] };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Upgrades"
          value={String(summary.totalUpgrades)}
          icon={ArrowUpRight}
        />
        <MetricCard
          title="Total Downgrades"
          value={String(summary.totalDowngrades)}
          icon={ArrowDownRight}
        />
        <MetricCard
          title="Conversion Rate"
          value={`${summary.conversionRate?.toFixed(1) || 0}%`}
          icon={TrendingUp}
        />
        <MetricCard
          title="Net Migration"
          value={String(summary.totalUpgrades - summary.totalDowngrades)}
          icon={Users}
        />
      </div>

      <Card data-testid="card-migration-trend">
        <CardHeader>
          <CardTitle>Tier Migration Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Legend />
              <Bar
                dataKey="upgrades"
                name="Upgrades"
                fill="hsl(var(--chart-2))"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="downgrades"
                name="Downgrades"
                fill="hsl(var(--chart-3))"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card data-testid="card-cohort-retention">
        <CardHeader>
          <CardTitle>Cohort Retention Matrix</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-medium">Cohort</th>
                  <th className="text-center p-2 font-medium">Users</th>
                  <th className="text-center p-2 font-medium">Month 1</th>
                  <th className="text-center p-2 font-medium">Month 2</th>
                  <th className="text-center p-2 font-medium">Month 3</th>
                  <th className="text-center p-2 font-medium">Month 6</th>
                  <th className="text-center p-2 font-medium">Month 12</th>
                </tr>
              </thead>
              <tbody>
                {cohorts.slice(0, 6).map((cohort) => (
                  <tr key={cohort.cohort} className="border-b hover-elevate">
                    <td className="p-2 font-medium">{cohort.cohort}</td>
                    <td className="text-center p-2">{cohort.users}</td>
                    <td className="text-center p-2">
                      <Badge
                        variant={
                          cohort.month1 >= 80
                            ? 'default'
                            : cohort.month1 >= 50
                              ? 'secondary'
                              : 'outline'
                        }
                      >
                        {cohort.month1}%
                      </Badge>
                    </td>
                    <td className="text-center p-2">
                      <Badge
                        variant={
                          cohort.month2 >= 70
                            ? 'default'
                            : cohort.month2 >= 40
                              ? 'secondary'
                              : 'outline'
                        }
                      >
                        {cohort.month2}%
                      </Badge>
                    </td>
                    <td className="text-center p-2">
                      <Badge
                        variant={
                          cohort.month3 >= 60
                            ? 'default'
                            : cohort.month3 >= 30
                              ? 'secondary'
                              : 'outline'
                        }
                      >
                        {cohort.month3}%
                      </Badge>
                    </td>
                    <td className="text-center p-2">
                      <Badge
                        variant={
                          cohort.month6 >= 40
                            ? 'default'
                            : cohort.month6 >= 20
                              ? 'secondary'
                              : 'outline'
                        }
                      >
                        {cohort.month6}%
                      </Badge>
                    </td>
                    <td className="text-center p-2">
                      <Badge
                        variant={
                          cohort.month12 >= 30
                            ? 'default'
                            : cohort.month12 >= 10
                              ? 'secondary'
                              : 'outline'
                        }
                      >
                        {cohort.month12}%
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AnalyticsDashboard() {
  const { data: summary, isLoading } = useQuery<DashboardSummary>({
    queryKey: ['/api/analytics/dashboard/summary'],
  });

  return (
    <div
      className="container mx-auto p-4 md:p-6 space-y-6 pb-24 md:pb-6"
      data-testid="page-analytics-dashboard"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Business Analytics</h1>
          <p className="text-muted-foreground">
            Revenue, churn, violations, and tier migration insights
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="animate-pulse space-y-4">
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 bg-muted rounded-lg" />
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="MRR"
            value={formatCurrency(summary?.revenue.mrr || 0)}
            icon={DollarSign}
          />
          <MetricCard
            title="Paid Users"
            value={String(summary?.users.paid || 0)}
            subtitle={`${summary?.users.conversionRate?.toFixed(1)}% conversion`}
            icon={Users}
          />
          <MetricCard
            title="Violations (30d)"
            value={String(summary?.violations.last30Days || 0)}
            icon={AlertTriangle}
          />
          <MetricCard
            title="At-Risk Users"
            value={String(summary?.users.atRisk || 0)}
            icon={AlertTriangle}
          />
        </div>
      )}

      <Tabs defaultValue="revenue" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="revenue" data-testid="tab-revenue">
            Revenue
          </TabsTrigger>
          <TabsTrigger value="churn" data-testid="tab-churn">
            Churn & LTV
          </TabsTrigger>
          <TabsTrigger value="violations" data-testid="tab-violations">
            Violations
          </TabsTrigger>
          <TabsTrigger value="migrations" data-testid="tab-migrations">
            Tier Migrations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="revenue" className="mt-6">
          <RevenueTab />
        </TabsContent>

        <TabsContent value="churn" className="mt-6">
          <ChurnLTVTab />
        </TabsContent>

        <TabsContent value="violations" className="mt-6">
          <ViolationsTab />
        </TabsContent>

        <TabsContent value="migrations" className="mt-6">
          <TierMigrationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
