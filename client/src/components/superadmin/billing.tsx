import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, ExternalLink, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUS_COLORS: Record<string, string> = {
  active:   "bg-green-100 text-green-800 dark:bg-green-900/30",
  past_due: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30",
  canceled: "bg-red-100 text-red-800 dark:bg-red-900/30",
  suspended:"bg-orange-100 text-orange-800 dark:bg-orange-900/30",
};

export default function SuperAdminBilling() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [graceTarget, setGraceTarget] = useState<string | null>(null);
  const [graceDays, setGraceDays] = useState("7");
  const [graceReason, setGraceReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["/api/superadmin/billing", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/superadmin/billing?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const graceMutation = useMutation({
    mutationFn: async ({ workspaceId, days, reason }: { workspaceId: string; days: number; reason: string }) => {
      const res = await fetch(`/api/superadmin/billing/${workspaceId}/grace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ days, reason }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Grace period applied" });
      setGraceTarget(null);
      qc.invalidateQueries({ queryKey: ["/api/superadmin/billing"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="past_due">Past Due</SelectItem>
            <SelectItem value="canceled">Canceled</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{data?.length ?? 0} workspaces</span>
      </div>

      {isLoading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left p-2 font-medium">Workspace</th>
              <th className="text-left p-2 font-medium">Type</th>
              <th className="text-left p-2 font-medium">Plan</th>
              <th className="text-left p-2 font-medium">Status</th>
              <th className="text-left p-2 font-medium">Credits</th>
              <th className="text-left p-2 font-medium">Stripe</th>
              <th className="text-left p-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((ws: any) => (
              <tr key={ws.id} className="border-b hover:bg-muted/30 transition-colors">
                <td className="p-2">
                  <p className="font-medium truncate max-w-[160px]">{ws.name}</p>
                  <p className="text-xs text-muted-foreground font-mono truncate max-w-[160px]">{ws.id}</p>
                </td>
                <td className="p-2"><Badge variant="outline" className="text-xs">{ws.type}</Badge></td>
                <td className="p-2 text-xs">{ws.subscriptionTier}</td>
                <td className="p-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[ws.subscriptionStatus ?? "active"] ?? ""}`}>
                    {ws.subscriptionStatus ?? "active"}
                  </span>
                </td>
                <td className="p-2 text-xs">{ws.aiCreditsBalance}/{ws.aiCreditsLimit}</td>
                <td className="p-2">
                  {ws.stripeCustomerId ? (
                    <a
                      href={`https://dashboard.stripe.com/customers/${ws.stripeCustomerId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Customer <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </td>
                <td className="p-2">
                  <Dialog open={graceTarget === ws.id} onOpenChange={open => setGraceTarget(open ? ws.id : null)}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="h-7 text-xs">
                        <Clock className="h-3 w-3 mr-1" />Grace
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Apply Grace Period — {ws.name}</DialogTitle></DialogHeader>
                      <div className="space-y-3 pt-2">
                        <div>
                          <Label>Days</Label>
                          <Input type="number" value={graceDays} onChange={e => setGraceDays(e.target.value)} min={1} max={90} />
                        </div>
                        <div>
                          <Label>Reason</Label>
                          <Input value={graceReason} onChange={e => setGraceReason(e.target.value)} placeholder="e.g. Payment processing delay" />
                        </div>
                        <Button
                          onClick={() => graceMutation.mutate({ workspaceId: ws.id, days: Number(graceDays), reason: graceReason })}
                          disabled={graceMutation.isPending || !graceReason}
                          className="w-full"
                        >
                          Apply Grace Period
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
