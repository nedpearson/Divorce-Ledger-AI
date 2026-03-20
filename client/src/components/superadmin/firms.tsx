import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Loader2,
  Building2,
  CheckCircle,
  XCircle,
  PauseCircle,
  Search,
  ChevronRight,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  past_due: 'bg-yellow-100 text-yellow-800',
  canceled: 'bg-red-100 text-red-800',
  suspended: 'bg-orange-100 text-orange-800',
};

export default function SuperAdminFirms({ adminRole }: { adminRole?: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['/api/superadmin/workspaces', search, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50' });
      if (search) params.set('search', search);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      const res = await fetch(`/api/superadmin/workspaces?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['/api/superadmin/workspaces', selectedId],
    queryFn: async () => {
      const res = await fetch(`/api/superadmin/workspaces/${selectedId}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: !!selectedId,
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      const res = await fetch(`/api/superadmin/workspaces/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error('Action failed');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Action applied' });
      qc.invalidateQueries({ queryKey: ['/api/superadmin/workspaces'] });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const planMutation = useMutation({
    mutationFn: async ({ id, planName }: { id: string; planName: string }) => {
      const res = await fetch(`/api/superadmin/workspaces/${id}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ planName }),
      });
      if (!res.ok) throw new Error('Plan assignment failed');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Plan assigned' });
      qc.invalidateQueries({ queryKey: ['/api/superadmin/workspaces'] });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search workspaces…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="firm">Firms</SelectItem>
            <SelectItem value="consumer">Consumers</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* List */}
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {data?.workspaces?.map((ws: any) => (
            <Card
              key={ws.id}
              className={`cursor-pointer transition-colors ${selectedId === ws.id ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setSelectedId(ws.id)}
            >
              <CardContent className="p-3 flex items-center gap-3">
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{ws.name}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Badge variant="outline" className="text-xs">
                      {ws.type}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {ws.subscriptionTier}
                    </Badge>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[ws.subscriptionStatus ?? 'active'] ?? ''}`}
                    >
                      {ws.subscriptionStatus ?? 'active'}
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          ))}
          <p className="text-xs text-muted-foreground text-center">{data?.total ?? 0} total</p>
        </div>

        {/* Detail */}
        <div>
          {selectedId &&
            (detailLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading detail…
              </div>
            ) : (
              detail && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{detail.workspace?.name}</CardTitle>
                    <p className="text-xs text-muted-foreground font-mono">
                      {detail.workspace?.id}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Type:</span>{' '}
                        {detail.workspace?.type}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Tier:</span>{' '}
                        {detail.workspace?.subscriptionTier}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Members:</span>{' '}
                        {detail.members?.length ?? 0}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Matters:</span>{' '}
                        {detail.activeMatters}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Credits:</span>{' '}
                        {detail.workspace?.aiCreditsBalance}/{detail.workspace?.aiCreditsLimit}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Status:</span>{' '}
                        {detail.workspace?.subscriptionStatus}
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Actions</Label>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            statusMutation.mutate({ id: selectedId, action: 'approve' })
                          }
                        >
                          <CheckCircle className="h-3.5 w-3.5 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            statusMutation.mutate({ id: selectedId, action: 'suspend' })
                          }
                        >
                          <PauseCircle className="h-3.5 w-3.5 mr-1" />
                          Suspend
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() =>
                            statusMutation.mutate({ id: selectedId, action: 'reject' })
                          }
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">
                        Assign Plan
                      </Label>
                      <Select
                        onValueChange={(v) => planMutation.mutate({ id: selectedId, planName: v })}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Select plan…" />
                        </SelectTrigger>
                        <SelectContent>
                          {[
                            'free',
                            'individual',
                            'pro',
                            'firm_starter',
                            'firm_pro',
                            'firm_enterprise',
                          ].map((p) => (
                            <SelectItem key={p} value={p}>
                              {p}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {detail.auditTrail?.length > 0 && (
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">
                          Recent Activity
                        </Label>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {detail.auditTrail.map((entry: any) => (
                            <div
                              key={entry.id}
                              className="text-xs text-muted-foreground flex justify-between"
                            >
                              <span>{entry.actionType}</span>
                              <span>{new Date(entry.createdAt).toLocaleDateString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            ))}
          {!selectedId && (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2 border rounded-lg border-dashed">
              <Building2 className="h-8 w-8" />
              <p className="text-sm">Select a workspace to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
