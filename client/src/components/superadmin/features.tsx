import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, ToggleLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function SuperAdminFeatures({ adminRole }: { adminRole?: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isSuperAdmin = adminRole === 'super_admin';

  const { data: flags, isLoading } = useQuery({
    queryKey: ['/api/superadmin/features'],
    queryFn: async () => {
      const res = await fetch('/api/superadmin/features', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => {
      const res = await fetch(`/api/superadmin/features/${key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (_, vars) => {
      toast({ title: `Feature "${vars.key}" ${vars.enabled ? 'enabled' : 'disabled'} globally` });
      qc.invalidateQueries({ queryKey: ['/api/superadmin/features'] });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  if (isLoading)
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );

  return (
    <div className="space-y-4">
      {!isSuperAdmin && (
        <div className="text-sm text-muted-foreground bg-muted/50 rounded p-2">
          Global flag toggles require <code>super_admin</code> role.
        </div>
      )}

      <div className="text-sm text-muted-foreground bg-blue-50 dark:bg-blue-950/20 rounded p-3 border border-blue-200 dark:border-blue-900">
        <p className="font-medium text-blue-800 dark:text-blue-300 mb-1">Precedence Order</p>
        <p>Global default → Workspace override → User override</p>
        <p className="mt-1">
          Per-workspace and per-user toggles are managed via the Firms and Users panels.
        </p>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left p-3 font-medium">Feature Key</th>
              <th className="text-left p-3 font-medium">Description</th>
              <th className="text-left p-3 font-medium">Global Default</th>
              <th className="text-left p-3 font-medium">Last Updated By</th>
            </tr>
          </thead>
          <tbody>
            {flags?.map((flag: any) => (
              <tr key={flag.key} className="border-b hover:bg-muted/20 transition-colors">
                <td className="p-3 font-mono text-xs">{flag.key}</td>
                <td className="p-3 text-muted-foreground text-xs">{flag.description ?? '—'}</td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={flag.enabled}
                      onCheckedChange={(enabled) =>
                        isSuperAdmin && toggleMutation.mutate({ key: flag.key, enabled })
                      }
                      disabled={!isSuperAdmin || toggleMutation.isPending}
                    />
                    <Badge variant={flag.enabled ? 'default' : 'secondary'} className="text-xs">
                      {flag.enabled ? 'ON' : 'OFF'}
                    </Badge>
                  </div>
                </td>
                <td className="p-3 text-xs text-muted-foreground">{flag.updatedBy ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
