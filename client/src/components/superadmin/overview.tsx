import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Loader2,
  Users,
  Building2,
  Scale,
  CreditCard,
  TrendingUp,
  AlertCircle,
  Zap,
} from 'lucide-react';

function StatCard({
  title,
  value,
  icon: Icon,
  sub,
}: {
  title: string;
  value: string | number;
  icon: any;
  sub?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function SuperAdminOverview() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/superadmin/overview'],
    queryFn: async () => {
      const res = await fetch('/api/superadmin/overview', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load overview');
      return res.json();
    },
    refetchInterval: 60_000,
  });

  if (isLoading)
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading overview…
      </div>
    );
  if (error) return <div className="text-destructive text-sm">Failed to load overview data.</div>;

  const mrr = data ? `$${(data.mrrCents / 100).toLocaleString()}` : '$0';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Users" value={data?.users ?? 0} icon={Users} />
        <StatCard title="Firms" value={data?.firms ?? 0} icon={Building2} />
        <StatCard title="Consumers" value={data?.consumers ?? 0} icon={Users} />
        <StatCard title="Active Matters" value={data?.activeMatters ?? 0} icon={Scale} />
        <StatCard
          title="MRR Estimate"
          value={mrr}
          icon={TrendingUp}
          sub="Active subscriptions only"
        />
        <StatCard title="Active Subs" value={data?.activeSubscriptions ?? 0} icon={CreditCard} />
        <StatCard
          title="Delinquent"
          value={data?.delinquentCount ?? 0}
          icon={AlertCircle}
          sub="past_due"
        />
        <StatCard
          title="Credits (30d)"
          value={(data?.creditsConsumed30d ?? 0).toLocaleString()}
          icon={Zap}
          sub="AI credits consumed"
        />
      </div>
    </div>
  );
}
