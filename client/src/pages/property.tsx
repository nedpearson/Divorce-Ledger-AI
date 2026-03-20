import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { DrillDownValue } from '@/components/ui/drilldown-value';
import {
  Home,
  Building,
  Car,
  DollarSign,
  TrendingUp,
  TrendingDown,
  PieChart,
  Loader2,
  CreditCard,
  Wallet,
  Download,
} from 'lucide-react';
import type { Asset, Debt } from '@shared/schema';

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function getAssetIcon(category: string) {
  switch (category.toLowerCase()) {
    case 'real_estate':
    case 'home':
      return <Home className="h-5 w-5" />;
    case 'vehicle':
    case 'car':
      return <Car className="h-5 w-5" />;
    case 'investment':
    case 'retirement':
      return <TrendingUp className="h-5 w-5" />;
    case 'business':
      return <Building className="h-5 w-5" />;
    default:
      return <Wallet className="h-5 w-5" />;
  }
}

function AssetCard({ asset }: { asset: Asset }) {
  return (
    <Card data-testid={`card-asset-${asset.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="p-2 bg-green-500/10 rounded-md text-green-500">
            {getAssetIcon(asset.category)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="font-medium">{asset.name}</h3>
              <p className="text-lg font-bold text-green-600 dark:text-green-400">
                {formatCurrency(asset.value)}
              </p>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="outline">{asset.category}</Badge>
              <Badge variant={asset.ownership === 'joint' ? 'default' : 'secondary'}>
                {asset.ownership}
              </Badge>
              {asset.verified && (
                <Badge variant="default" className="bg-green-500">
                  Verified
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DebtCard({ debt }: { debt: Debt }) {
  return (
    <Card data-testid={`card-debt-${debt.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="p-2 bg-red-500/10 rounded-md text-red-500">
            <CreditCard className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="font-medium">{debt.name}</h3>
              <p className="text-lg font-bold text-red-600 dark:text-red-400">
                {formatCurrency(debt.amount)}
              </p>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="outline">{debt.category}</Badge>
              <Badge variant={debt.ownership === 'joint' ? 'default' : 'secondary'}>
                {debt.ownership}
              </Badge>
              {debt.monthlyPayment && (
                <span className="text-xs text-muted-foreground">
                  {formatCurrency(debt.monthlyPayment)}/mo
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PropertyPage() {
  const { environment } = useAuth();

  const { data: assets, isLoading: assetsLoading } = useQuery<Asset[]>({
    queryKey: ['/api/assets'],
  });

  const { data: debts, isLoading: debtsLoading } = useQuery<Debt[]>({
    queryKey: ['/api/debts'],
  });

  const isLoading = assetsLoading || debtsLoading;
  const allAssets = assets || [];
  const allDebts = debts || [];

  const totalAssets = allAssets.reduce((sum, a) => sum + a.value, 0);
  const totalDebts = allDebts.reduce((sum, d) => sum + d.amount, 0);
  const netWorth = totalAssets - totalDebts;

  const jointAssets = allAssets.filter((a) => a.ownership === 'joint');
  const separateAssets = allAssets.filter((a) => a.ownership !== 'joint');
  const jointDebts = allDebts.filter((d) => d.ownership === 'joint');
  const separateDebts = allDebts.filter((d) => d.ownership !== 'joint');

  const jointAssetValue = jointAssets.reduce((sum, a) => sum + a.value, 0);
  const jointDebtValue = jointDebts.reduce((sum, d) => sum + d.amount, 0);
  const maritalNetWorth = jointAssetValue - jointDebtValue;

  const assetsByCategory = allAssets.reduce(
    (acc, asset) => {
      if (!acc[asset.category]) acc[asset.category] = 0;
      acc[asset.category] += asset.value;
      return acc;
    },
    {} as Record<string, number>
  );

  const exportData = () => {
    if (allAssets.length === 0 && allDebts.length === 0) return;
    const headers = ['Type', 'Name', 'Category', 'Value/Amount', 'Ownership', 'Verified'];

    let csvContent = headers.join(',') + '\n';
    allAssets.forEach((a) => {
      csvContent +=
        [
          'Asset',
          `"${a.name.replace(/"/g, '""')}"`,
          a.category,
          (a.value / 100).toFixed(2),
          a.ownership,
          a.verified ? 'Yes' : 'No',
        ].join(',') + '\n';
    });
    allDebts.forEach((d) => {
      csvContent +=
        [
          'Debt',
          `"${d.name.replace(/"/g, '""')}"`,
          d.category,
          (d.amount / 100).toFixed(2),
          d.ownership,
          '-',
        ].join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `property_settlement_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24 md:pb-6" data-testid="page-property">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">
            Property Settlement
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage asset division and equitable distribution tracking.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportData}
            disabled={allAssets.length === 0 && allDebts.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-500/10 rounded-md">
                    <TrendingUp className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                      <DrillDownValue
                        type="assets"
                        title="Total Assets"
                        value={formatCurrency(totalAssets)}
                      />
                    </p>
                    <p className="text-xs text-muted-foreground">Total Assets</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-500/10 rounded-md">
                    <TrendingDown className="h-5 w-5 text-red-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                      <DrillDownValue
                        type="debts"
                        title="Total Debts"
                        value={formatCurrency(totalDebts)}
                      />
                    </p>
                    <p className="text-xs text-muted-foreground">Total Debts</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 rounded-md">
                    <DollarSign className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p
                      className={`text-2xl font-bold ${netWorth >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                    >
                      {formatCurrency(netWorth)}
                    </p>
                    <p className="text-xs text-muted-foreground">Net Worth</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500/10 rounded-md">
                    <PieChart className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <p
                      className={`text-2xl font-bold ${maritalNetWorth >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                    >
                      {formatCurrency(maritalNetWorth)}
                    </p>
                    <p className="text-xs text-muted-foreground">Marital Net Worth</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Asset Breakdown by Category</CardTitle>
                <CardDescription>Distribution of assets across categories</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {Object.entries(assetsByCategory).map(([category, value]) => {
                  const percentage = totalAssets > 0 ? (value / totalAssets) * 100 : 0;
                  return (
                    <div key={category} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="capitalize">{category.replace('_', ' ')}</span>
                        <span className="font-medium">
                          <DrillDownValue
                            type="assets"
                            title={`${category.replace('_', ' ')} Assets`}
                            value={formatCurrency(value)}
                          />
                        </span>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </div>
                  );
                })}
                {Object.keys(assetsByCategory).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No assets recorded
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Division Summary</CardTitle>
                <CardDescription>Joint vs Separate Property</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-foreground">
                    <span>Joint Assets</span>
                    <span className="font-medium">
                      <DrillDownValue
                        type="assets"
                        title="Joint Assets"
                        value={formatCurrency(jointAssetValue)}
                      />
                    </span>
                  </div>
                  <div className="flex justify-between text-sm text-foreground">
                    <span>Separate Assets</span>
                    <span className="font-medium">
                      <DrillDownValue
                        type="assets"
                        title="Separate Assets"
                        value={formatCurrency(separateAssets.reduce((s, a) => s + a.value, 0))}
                      />
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Joint Debts</span>
                    <span className="font-medium text-red-600">
                      <DrillDownValue
                        type="debts"
                        title="Joint Debts"
                        value={formatCurrency(jointDebtValue)}
                      />
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Separate Debts</span>
                    <span className="font-medium text-red-600">
                      <DrillDownValue
                        type="debts"
                        title="Separate Debts"
                        value={formatCurrency(separateDebts.reduce((s, d) => s + d.amount, 0))}
                      />
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="assets" className="space-y-4">
            <TabsList>
              <TabsTrigger value="assets" data-testid="tab-assets">
                Assets ({allAssets.length})
              </TabsTrigger>
              <TabsTrigger value="debts" data-testid="tab-debts">
                Debts ({allDebts.length})
              </TabsTrigger>
              <TabsTrigger value="joint" data-testid="tab-joint">
                Marital Property ({jointAssets.length + jointDebts.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="assets" className="space-y-3">
              {allAssets.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No assets recorded. Add assets in the Finances section.
                  </CardContent>
                </Card>
              ) : (
                allAssets.map((asset) => <AssetCard key={asset.id} asset={asset} />)
              )}
            </TabsContent>
            <TabsContent value="debts" className="space-y-3">
              {allDebts.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No debts recorded. Add debts in the Finances section.
                  </CardContent>
                </Card>
              ) : (
                allDebts.map((debt) => <DebtCard key={debt.id} debt={debt} />)
              )}
            </TabsContent>
            <TabsContent value="joint" className="space-y-3">
              <h3 className="text-lg font-medium mt-2">Joint Assets</h3>
              {jointAssets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No joint assets</p>
              ) : (
                jointAssets.map((asset) => <AssetCard key={asset.id} asset={asset} />)
              )}
              <h3 className="text-lg font-medium mt-4">Joint Debts</h3>
              {jointDebts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No joint debts</p>
              ) : (
                jointDebts.map((debt) => <DebtCard key={debt.id} debt={debt} />)
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
