import { Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { LineageMetadata } from '@shared/schema';
import { Card, CardContent } from '@/components/ui/card';

export function LineagePanel({ lineage }: { lineage: LineageMetadata }) {
  if (!lineage) return null;

  return (
    <Card className="bg-muted/10 border-muted shadow-none">
      <CardContent className="p-4 space-y-3 pt-4">
        <div className="flex items-start gap-2">
          <Info className="h-4 w-4 text-blue-500 mt-1 shrink-0" />
          <div className="space-y-1">
            <h4 className="text-sm font-semibold leading-none">Origin Traceability</h4>
            <p className="text-sm text-muted-foreground">{lineage.description}</p>
          </div>
        </div>

        {lineage.formula && (
          <div className="pl-6 space-y-1">
            <span className="text-xs uppercase font-medium text-muted-foreground tracking-wider">Formula</span>
            <div className="font-mono text-xs bg-muted/30 p-2 rounded-md border border-muted/50 text-foreground overflow-x-auto">
              {lineage.formula}
            </div>
          </div>
        )}

        {lineage.sqlExtract && (
          <div className="pl-6 space-y-1">
            <span className="text-xs uppercase font-medium text-muted-foreground tracking-wider">Aggregation Filter</span>
            <div className="font-mono text-xs text-muted-foreground bg-muted/20 p-2 rounded-md border border-muted/50 overflow-x-auto">
              {lineage.sqlExtract}
            </div>
          </div>
        )}

        <div className="pl-6 flex flex-wrap gap-2 text-xs text-muted-foreground pt-1">
          {lineage.lastUpdated && (
            <span>Last computed: <span className="text-foreground">{new Date(lineage.lastUpdated).toLocaleString()}</span></span>
          )}
          {lineage.authorId && (
            <span>Author: <span className="text-foreground">{lineage.authorId}</span></span>
          )}
          {lineage.contributingRecordCount !== undefined && (
            <span>Derived from: <span className="text-foreground">{lineage.contributingRecordCount} records</span></span>
          )}
        </div>

        {lineage.anomalies && lineage.anomalies.length > 0 && (
          <div className="pl-6 pt-2">
            <div className="flex flex-wrap gap-1.5">
              {lineage.anomalies.map((anomaly, idx) => (
                <Badge key={idx} variant="destructive" className="bg-amber-500/10 text-amber-600 border-amber-500/20 font-normal hover:bg-amber-500/20">
                  {anomaly}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
