import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, TrendingUp, DollarSign, Activity } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function fmt$(n: number) {
  return '$' + (n / 100).toFixed(2);
}
function fmtPct(n: number) {
  return (n * 100).toFixed(1) + '%';
}

function UsageSection() {
  const [window, setWindow] = useState('30d');
  const { data, isLoading } = useQuery({
    queryKey: ['/api/superadmin/analytics/usage', window],
    queryFn: async () => {
      const res = await fetch(`/api/superadmin/analytics/usage?window=${window}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  const byAction: Record<string, number> = data?.byAction ?? {};
  const totalCredits: number = data?.totalCredits ?? 0;
  const totalCostCents: number = data?.totalCostCents ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4" />
          <h3 className="font-semibold text-sm">Credit Usage</h3>
        </div>
        <div className="flex gap-1">
          {['7d', '30d', '90d'].map((w) => (
            <Button
              key={w}
              size="sm"
              variant={window === w ? 'default' : 'outline'}
              className="h-6 px-2 text-xs"
              onClick={() => setWindow(w)}
            >
              {w}
            </Button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border p-3 bg-muted/20">
          <div className="text-xs text-muted-foreground">Total Credits Used</div>
          <div className="text-2xl font-bold">{totalCredits.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border p-3 bg-muted/20">
          <div className="text-xs text-muted-foreground">Estimated AI Cost</div>
          <div className="text-2xl font-bold">{fmt$(totalCostCents)}</div>
        </div>
      </div>

      {/* By action table */}
      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      )}
      {Object.keys(byAction).length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left p-2 font-medium text-xs">Action</th>
                <th className="text-right p-2 font-medium text-xs">Credits</th>
                <th className="text-right p-2 font-medium text-xs">Share</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(byAction)
                .sort((a, b) => (b[1] as number) - (a[1] as number))
                .map(([action, credits]) => (
                  <tr key={action} className="border-b hover:bg-muted/20">
                    <td className="p-2 font-mono text-xs">{action}</td>
                    <td className="p-2 text-right">{(credits as number).toLocaleString()}</td>
                    <td className="p-2 text-right text-muted-foreground">
                      {totalCredits > 0 ? fmtPct((credits as number) / totalCredits) : '—'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* By workspace */}
      {data?.byWorkspace?.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <div className="bg-muted/50 border-b px-2 py-1.5 text-xs font-medium">
            Top Workspaces by Usage
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2 font-medium text-xs">Workspace</th>
                <th className="text-right p-2 font-medium text-xs">Credits</th>
                <th className="text-right p-2 font-medium text-xs">Cost</th>
              </tr>
            </thead>
            <tbody>
              {data.byWorkspace.slice(0, 10).map((row: any) => (
                <tr key={row.workspaceId} className="border-b hover:bg-muted/20">
                  <td className="p-2 text-xs text-muted-foreground">
                    {row.workspaceName ?? row.workspaceId}
                  </td>
                  <td className="p-2 text-right text-xs">{row.credits.toLocaleString()}</td>
                  <td className="p-2 text-right text-xs">{fmt$(row.costCents ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProfitabilitySection() {
  const { data, isLoading } = useQuery({
    queryKey: ['/api/superadmin/analytics/profitability'],
    queryFn: async () => {
      const res = await fetch('/api/superadmin/analytics/profitability', {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  if (isLoading)
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );

  const plans: any[] = data?.plans ?? [];
  const summary = data?.summary;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <DollarSign className="h-4 w-4" />
        <h3 className="font-semibold text-sm">Profitability by Plan</h3>
        <span className="text-xs text-muted-foreground">
          (light / typical / heavy usage scenarios)
        </span>
      </div>

      {summary && (
        <div className="grid grid-cols-3 gap-3">
          {(['light', 'typical', 'heavy'] as const).map((scenario) => {
            const s = summary[scenario];
            return (
              <div
                key={scenario}
                className={`rounded-lg border p-3 ${s?.marginPct > 0.2 ? 'bg-green-50 dark:bg-green-900/10 border-green-200' : s?.marginPct > 0 ? 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200' : 'bg-red-50 dark:bg-red-900/10 border-red-200'}`}
              >
                <div className="text-xs font-medium capitalize mb-1">{scenario}</div>
                <div className="text-lg font-bold">{fmt$(s?.netCents ?? 0)}</div>
                <div className="text-xs text-muted-foreground">
                  {fmtPct(s?.marginPct ?? 0)} margin
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left p-2 font-medium">Plan</th>
              <th className="text-right p-2 font-medium">Price/mo</th>
              <th className="text-right p-2 font-medium">Seats</th>
              <th className="text-right p-2 font-medium">Credits Incl.</th>
              <th className="text-right p-2 font-medium">Light Margin</th>
              <th className="text-right p-2 font-medium">Typical Margin</th>
              <th className="text-right p-2 font-medium">Heavy Margin</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan: any) => (
              <tr key={plan.id} className="border-b hover:bg-muted/20">
                <td className="p-2 font-medium">{plan.name}</td>
                <td className="p-2 text-right">{fmt$(plan.priceMonthCents)}</td>
                <td className="p-2 text-right">{plan.workspaceCount ?? 0}</td>
                <td className="p-2 text-right">{plan.creditsPerMonth?.toLocaleString() ?? '—'}</td>
                {(['light', 'typical', 'heavy'] as const).map((scenario) => {
                  const margin = plan.scenarios?.[scenario]?.marginPct ?? 0;
                  const color =
                    margin > 0.3
                      ? 'text-green-600'
                      : margin > 0
                        ? 'text-yellow-600'
                        : 'text-red-600';
                  return (
                    <td key={scenario} className={`p-2 text-right font-medium ${color}`}>
                      {fmtPct(margin)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data?.creditCostModel && (
        <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
          Cost model: {fmt$(data.creditCostModel.costPerCreditCents)} / credit &middot; Light ×
          {data.creditCostModel.scenarioMultiplier?.light ?? 0.3} &middot; Typical ×
          {data.creditCostModel.scenarioMultiplier?.typical ?? 0.6} &middot; Heavy ×
          {data.creditCostModel.scenarioMultiplier?.heavy ?? 1.0}
        </div>
      )}
    </div>
  );
}

export default function SuperAdminAnalytics() {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5" />
        <h2 className="text-base font-semibold">Usage &amp; Profitability Analytics</h2>
      </div>
      <UsageSection />
      <hr />
      <ProfitabilitySection />
    </div>
  );
}
