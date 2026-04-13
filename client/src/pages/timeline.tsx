import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, isValid } from 'date-fns';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import type { Violation, Transaction } from '@shared/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle,
  DollarSign,
  CheckCircle,
  Clock,
  MapPin,
  FileText,
  Scale,
  Download,
  Loader2,
  Zap,
  TrendingUp,
  Info,
} from 'lucide-react';
import { useDrilldown } from '@/lib/drilldown-context';

type TimelineEvent = {
  id: string;
  type: 'violation' | 'transaction' | 'document';
  date: Date;
  title: string;
  description: string;
  status?: string;
  category?: string;
  amount?: number;
  location?: string;
};

type Pattern = {
  type: string;
  description: string;
  severity: 'low' | 'moderate' | 'high' | 'critical';
  count: number;
  recommendation: string;
  occurrences: Array<{ date: string; description: string }>;
};

type PatternResponse = {
  patterns: Pattern[];
  totalViolations: number;
};

export default function Timeline() {
  const { environment } = useAuth();
  const { toast } = useToast();
  const { openDrilldown } = useDrilldown();
  const [isExporting, setIsExporting] = useState(false);

  const { data: violations, isLoading: violationsLoading } = useQuery<Violation[]>({
    queryKey: ['/api/violations', environment],
    queryFn: async () => {
      const res = await fetch(`/api/violations?environment=${environment}`, {
        credentials: 'include',
        headers: { 'X-Environment': environment || 'demo' },
      });
      if (!res.ok) throw new Error('Failed to fetch violations');
      return res.json();
    },
  });

  const { data: transactions, isLoading: transactionsLoading } = useQuery<Transaction[]>({
    queryKey: ['/api/transactions', environment],
    queryFn: async () => {
      const res = await fetch(`/api/transactions?environment=${environment}`, {
        credentials: 'include',
        headers: { 'X-Environment': environment || 'demo' },
      });
      if (!res.ok) throw new Error('Failed to fetch transactions');
      return res.json();
    },
  });

  const { data: patternsData, isLoading: patternsLoading } = useQuery<PatternResponse>({
    queryKey: [`/api/patterns?environment=${environment}`],
  });

  const isLoading = violationsLoading || transactionsLoading || patternsLoading;

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const response = await fetch(`/api/filings/export?environment=${environment}`);
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `court-filing-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({ title: 'PDF exported successfully' });
    } catch (error) {
      toast({ title: 'Failed to export PDF', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const events: TimelineEvent[] = [];

  if (violations) {
    violations.forEach((v) => {
      events.push({
        id: `violation-${v.id}`,
        type: 'violation',
        date: new Date(v.timestamp),
        title: (v.type || 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        description: v.description || 'No description provided',
        status: v.status,
        location: v.location || undefined,
      });
    });
  }

  if (transactions) {
    transactions.forEach((t) => {
      events.push({
        id: `transaction-${t.id}`,
        type: 'transaction',
        date: new Date(t.date),
        title: t.description || 'Unknown Transaction',
        description: t.category || '',
        category: t.type || '',
        amount: t.amount,
      });
    });
  }

  events.sort((a, b) => b.date.getTime() - a.date.getTime());

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'violation':
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case 'transaction':
        return <DollarSign className="h-4 w-4 text-primary" />;
      case 'document':
        return <FileText className="h-4 w-4 text-blue-500" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status?: string) => {
    if (!status) return null;
    switch (status) {
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'reviewed':
        return <Badge variant="outline">Reviewed</Badge>;
      case 'approved':
        return <Badge className="bg-green-600 text-white">Approved</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <Badge className="bg-red-600 text-white">Critical</Badge>;
      case 'high':
        return <Badge className="bg-orange-500 text-white">High</Badge>;
      case 'moderate':
        return <Badge className="bg-yellow-500 text-black">Moderate</Badge>;
      case 'low':
        return <Badge variant="secondary">Low</Badge>;
      default:
        return <Badge variant="secondary">{severity}</Badge>;
    }
  };

  const approvedViolations = violations?.filter((v) => v.status === 'approved').length || 0;
  const pendingViolations = violations?.filter((v) => v.status === 'pending').length || 0;
  const patterns = patternsData?.patterns || [];

  return (
    <div className="p-4 md:p-6 space-y-4 pb-24 md:pb-6">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Scale className="h-5 w-5" />
            Case Timeline
          </h1>
          <p className="text-sm text-muted-foreground">
            Complete chronological view of case evidence and financial activity
          </p>
        </div>
        <Button onClick={handleExportPDF} disabled={isExporting} data-testid="button-export-pdf">
          {isExporting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          Export Court Filing
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{approvedViolations}</p>
                <p className="text-xs text-muted-foreground">Court-Ready Evidence</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{pendingViolations}</p>
                <p className="text-xs text-muted-foreground">Pending Review</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{events.length}</p>
                <p className="text-xs text-muted-foreground">Total Events</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {patterns.length > 0 && (
        <Card className="border-2 border-yellow-500/50 dark:border-yellow-500/30">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              AI Pattern Detection
              <Badge variant="secondary" className="ml-1">
                {patterns.length} {patterns.length === 1 ? 'Pattern' : 'Patterns'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-3">
            {patterns.map((pattern, index) => (
              <div
                key={index}
                className="border rounded-md p-3 space-y-2 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => {
                  openDrilldown({
                    layer: 2,
                    sourceEntity: 'workflow_state',
                    identifier: 'violation_pattern',
                    context: { filters: { category: pattern.type } }
                  });
                }}
                data-testid={`pattern-alert-${index}`}
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">{pattern.description}</span>
                    {getSeverityBadge(pattern.severity)}
                  </div>
                  <span className="text-xs text-muted-foreground">{pattern.count} occurrences</span>
                </div>
                <div className="flex items-start gap-2 text-sm bg-muted/50 rounded p-2">
                  <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <span>{pattern.recommendation}</span>
                </div>
                {pattern.occurrences.length > 0 && (
                  <div className="text-xs text-muted-foreground pl-6">
                    Recent:{' '}
                    {pattern.occurrences.slice(0, 2).map((o, i) => (
                      <span key={i}>
                        {i > 0 && ', '}
                        {isValid(new Date(o.date)) ? format(new Date(o.date), 'MMM d') : 'Unknown Date'}
                      </span>
                    ))}
                    {pattern.occurrences.length > 2 && ` +${pattern.occurrences.length - 2} more`}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base">Timeline Events</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : events.length > 0 ? (
            <div className="relative">
              <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />
              <div className="space-y-4">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className="relative pl-8 cursor-pointer hover:bg-muted/10 transition-colors rounded-md p-1 -ml-1"
                    onClick={() => {
                       const actualId = event.id.split('-')[1];
                       openDrilldown({
                         layer: 4,
                         sourceEntity: event.type === 'violation' ? 'workflow_state' : 
                                       event.type === 'transaction' ? 'financial_record' : 'document',
                         identifier: actualId,
                         context: { filters: { title: event.title, description: event.description } }
                       });
                    }}
                    data-testid={`timeline-event-${event.id}`}
                  >
                    <div className="absolute left-0 top-1 p-1.5 rounded-full bg-background border">
                      {getEventIcon(event.type)}
                    </div>
                    <div className="border rounded-md p-3 space-y-1 hover-elevate bg-card">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{event.title}</span>
                          {getStatusBadge(event.status)}
                          {event.type === 'violation' && (
                            <Badge variant="destructive" className="text-xs">
                              Violation
                            </Badge>
                          )}
                        </div>
                        {event.amount !== undefined && (
                          <span
                            className={`font-medium text-sm ${
                              event.amount > 0 ? 'text-green-600' : 'text-red-600'
                            }`}
                          >
                            {event.amount > 0 ? '+' : ''}$
                            {Math.abs(event.amount / 100).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{event.description}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {isValid(event.date) ? format(event.date, 'MMM d, yyyy') : 'Unknown Date'}
                        </span>
                        {event.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {event.location}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Scale className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No timeline events yet</p>
              <p className="text-sm">Document violations and add transactions to build your case</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
