import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useRecurringBills } from '@/hooks/use-recurring-bills';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import type { RecurringBillCycle } from '@shared/schema';

export function MissingBillsWidget() {
  const { dashboardStats, isLoadingStats } = useRecurringBills();

  if (isLoadingStats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Missing Bills Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse flex space-x-4">
            <div className="flex-1 space-y-4 py-1">
              <div className="h-4 bg-muted rounded w-3/4"></div>
              <div className="space-y-2">
                <div className="h-4 bg-muted rounded"></div>
                <div className="h-4 bg-muted rounded w-5/6"></div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!dashboardStats || (dashboardStats as any).totalExpected === 0) {
    return null; // Don't show widget if no templates exist
  }

  const { totalExpected, totalMissing, cycles } = dashboardStats as any;

  return (
    <Card className="border-l-4 border-l-red-500">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            Missing Monthly Bills
          </CardTitle>
          <Badge variant={totalMissing > 0 ? "destructive" : "secondary"}>
            {totalMissing} / {totalExpected} Missing
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 mt-2">
          {cycles?.map(({ cycle, template }: any) => (
            <div key={cycle.id} className="flex justify-between items-center text-sm border-b pb-2 last:border-0 last:pb-0">
              <div className="flex flex-col">
                <span className="font-semibold">{template.billName}</span>
                <span className="text-muted-foreground text-xs">{template.vendorName}</span>
              </div>
              <div>
                {cycle.status === 'missing' ? (
                  <Badge variant="outline" className="text-red-500 border-red-200 bg-red-50">Needs Upload</Badge>
                ) : cycle.status === 'uploaded' ? (
                  <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Uploaded
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
                    <Clock className="w-3 h-3 mr-1" />
                    Pending
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
