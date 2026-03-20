import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Download } from 'lucide-react';

export default function SuperAdminAuditLog() {
  const [actionFilter, setActionFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['/api/superadmin/audit-log', actionFilter, userFilter, fromDate, toDate, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (actionFilter) params.set('actionType', actionFilter);
      if (userFilter) params.set('userId', userFilter);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      const res = await fetch(`/api/superadmin/audit-log?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  const handleExport = async (fmt: 'csv' | 'json') => {
    const params = new URLSearchParams({ format: fmt, limit: '10000' });
    if (actionFilter) params.set('actionType', actionFilter);
    if (userFilter) params.set('userId', userFilter);
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    const res = await fetch(`/api/superadmin/audit-log?${params}`, { credentials: 'include' });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_log.${fmt}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const ACTION_COLOR: Record<string, string> = {
    firm: 'bg-blue-100   text-blue-800   dark:bg-blue-900/30',
    user: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30',
    feature: 'bg-green-100  text-green-800  dark:bg-green-900/30',
    plan: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30',
    billing: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30',
    admin: 'bg-red-100    text-red-800    dark:bg-red-900/30',
  };

  const colorForAction = (action: string) => {
    const prefix = action.split('.')[0];
    return ACTION_COLOR[prefix] ?? 'bg-gray-100 text-gray-800';
  };

  const totalPages = data ? Math.ceil(data.total / 50) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <Label className="text-xs">Action Filter</Label>
          <Input
            placeholder="firm.suspend…"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="h-8 w-40 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-8 w-36 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-8 w-36 text-sm"
          />
        </div>
        <Button size="sm" variant="outline" onClick={() => handleExport('csv')}>
          <Download className="h-3.5 w-3.5 mr-1" />
          CSV
        </Button>
        <Button size="sm" variant="outline" onClick={() => handleExport('json')}>
          <Download className="h-3.5 w-3.5 mr-1" />
          JSON
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left p-2 font-medium">Action</th>
              <th className="text-left p-2 font-medium">Actor</th>
              <th className="text-left p-2 font-medium">Target</th>
              <th className="text-left p-2 font-medium">Details</th>
              <th className="text-left p-2 font-medium">IP</th>
              <th className="text-left p-2 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {data?.entries?.map((entry: any) => (
              <tr key={entry.id} className="border-b hover:bg-muted/20 transition-colors">
                <td className="p-2">
                  <span
                    className={`px-1.5 py-0.5 rounded text-xs font-medium ${colorForAction(entry.actionType)}`}
                  >
                    {entry.actionType}
                  </span>
                </td>
                <td className="p-2 text-muted-foreground">{entry.actorEmail}</td>
                <td className="p-2 text-muted-foreground">
                  {entry.targetType && <span className="font-medium">{entry.targetType}/</span>}
                  <span className="font-mono text-xs truncate max-w-[80px] inline-block">
                    {entry.targetId ?? '—'}
                  </span>
                </td>
                <td className="p-2 max-w-[200px]">
                  <pre className="text-xs truncate">{JSON.stringify(entry.details ?? {})}</pre>
                </td>
                <td className="p-2 font-mono text-muted-foreground">{entry.ipAddress ?? '—'}</td>
                <td className="p-2 text-muted-foreground whitespace-nowrap">
                  {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{data?.total ?? 0} total entries</span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
