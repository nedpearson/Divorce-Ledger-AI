import { useQuery, useMutation } from '@tanstack/react-query';
import { AlertTriangle, XCircle, ShieldCheck, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { SecurityAlert } from '@shared/schema';

export function GlobalSecurityBanner() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const { data: alerts, isLoading } = useQuery<SecurityAlert[]>({
    queryKey: ['/api/security-alerts'],
    enabled: isAuthenticated,
    refetchInterval: 30000, 
  });

  const resolveMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const res = await apiRequest('POST', `/api/alerts/${alertId}/resolve`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/security-alerts'] });
      toast({ title: 'Security issue resolved' });
    },
    onError: () => {
      toast({ title: 'Failed to resolve security issue', variant: 'destructive' });
    }
  });

  if (!isAuthenticated || isLoading || !alerts || alerts.length === 0) {
    return null;
  }

  // Render the top most critical alert
  const sortedAlerts = [...alerts].sort((a, b) => {
    const weights: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    return (weights[b.severity] || 0) - (weights[a.severity] || 0);
  });

  const activeAlert = sortedAlerts[0];

  const getAlertStyles = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-500 text-white dark:bg-red-900 border-red-600';
      case 'high':
        return 'bg-orange-500 text-white dark:bg-orange-900 border-orange-600';
      case 'medium':
        return 'bg-yellow-500 text-white dark:bg-yellow-900 border-yellow-600';
      default:
        return 'bg-blue-500 text-white dark:bg-blue-900 border-blue-600';
    }
  };

  const getAlertIcon = (severity: string) => {
    if (severity === 'critical') return <XCircle className="h-5 w-5" />;
    return <AlertTriangle className="h-5 w-5" />;
  };

  return (
    <div className={`border-b text-sm py-2.5 px-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm w-full shrink-0 z-[90] ${getAlertStyles(activeAlert.severity)}`}>
      <div className="flex items-center gap-2.5 flex-1 min-w-0 font-medium">
        {getAlertIcon(activeAlert.severity)}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2">
          <span className="font-bold uppercase tracking-wide text-xs opacity-90">
            {activeAlert.type.replace(/_/g, ' ')}
          </span>
          <span className="opacity-95 hidden sm:inline">•</span>
          <span className="truncate max-w-xl">{activeAlert.message}</span>
        </div>
      </div>
      
      <div className="flex items-center justify-end gap-2 shrink-0 w-full sm:w-auto mt-2 sm:mt-0">
        <Button 
          variant="secondary" 
          size="sm" 
          className="h-8 max-w-[140px] w-full text-xs font-semibold"
          onClick={() => resolveMutation.mutate(activeAlert.id)}
          disabled={resolveMutation.isPending}
        >
          {resolveMutation.isPending ? 'Resolving...' : (
             <>
               <Check className="mr-1.5 h-3.5 w-3.5" />
               Acknowledge & Fix
             </>
          )}
        </Button>
      </div>
    </div>
  );
}
