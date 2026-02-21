import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Edit2, Save, X, PackageOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function SuperAdminPlans({ adminRole }: { adminRole?: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [editData, setEditData] = useState<Record<string, any>>({});

  const isSuperAdmin = adminRole === "super_admin";

  const { data: plans, isLoading } = useQuery({
    queryKey: ["/api/superadmin/plans"],
    queryFn: async () => {
      const res = await fetch("/api/superadmin/plans", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ planId, data }: { planId: string; data: any }) => {
      const res = await fetch(`/api/superadmin/plans/${planId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Plan updated" });
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["/api/superadmin/plans"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const startEdit = (plan: any) => {
    setEditing(plan.id);
    setEditData({
      displayName:      plan.displayName ?? plan.name,
      priceCents:       plan.priceCents,
      stripePriceId:    plan.stripePriceId ?? "",
      aiCreditsMonthly: plan.aiCreditsMonthly,
      mattersLimit:     plan.mattersLimit ?? "",
      seatsLimit:       plan.seatsLimit ?? "",
    });
  };

  if (isLoading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>;

  return (
    <div className="space-y-4">
      {!isSuperAdmin && (
        <div className="text-sm text-muted-foreground bg-muted/50 rounded p-2">
          Viewing as <code>{adminRole}</code> — plan edits require <code>super_admin</code>.
        </div>
      )}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans?.map((plan: any) => (
          <Card key={plan.id} className={!plan.isActive ? "opacity-60" : ""}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">{plan.displayName ?? plan.name}</CardTitle>
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className="text-xs">{plan.workspaceType}</Badge>
                  {!plan.isActive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {editing === plan.id ? (
                <div className="space-y-2">
                  {[
                    { key: "displayName",      label: "Display Name",       type: "text"   },
                    { key: "priceCents",        label: "Price (cents)",      type: "number" },
                    { key: "stripePriceId",     label: "Stripe Price ID",    type: "text"   },
                    { key: "aiCreditsMonthly",  label: "AI Credits/month",   type: "number" },
                    { key: "mattersLimit",      label: "Matters Limit",      type: "number" },
                    { key: "seatsLimit",        label: "Seats Limit",        type: "number" },
                  ].map(({ key, label, type }) => (
                    <div key={key}>
                      <Label className="text-xs">{label}</Label>
                      <Input
                        type={type}
                        value={editData[key] ?? ""}
                        onChange={e => setEditData(d => ({ ...d, [key]: type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value }))}
                        className="h-7 text-sm"
                      />
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={() => updateMutation.mutate({ planId: plan.id, data: editData })} disabled={updateMutation.isPending}>
                      <Save className="h-3.5 w-3.5 mr-1" />Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}><X className="h-3.5 w-3.5 mr-1" />Cancel</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Price</span><span>${(plan.priceCents / 100).toFixed(2)}/mo</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">AI Credits</span><span>{plan.aiCreditsMonthly?.toLocaleString()}/mo</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Matters</span><span>{plan.mattersLimit ?? "∞"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Seats</span><span>{plan.seatsLimit ?? "∞"}</span></div>
                    {plan.stripePriceId && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Stripe</span><span className="font-mono text-xs truncate max-w-[120px]">{plan.stripePriceId}</span></div>
                    )}
                  </div>
                  {isSuperAdmin && (
                    <Button size="sm" variant="outline" className="w-full mt-2" onClick={() => startEdit(plan)}>
                      <Edit2 className="h-3.5 w-3.5 mr-1" />Edit Plan
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
