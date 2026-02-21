import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Search, User, Key, LogOut, PauseCircle, PlayCircle, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function SuperAdminUsers() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/superadmin/users", search],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "50" });
      if (search) params.set("search", search);
      const res = await fetch(`/api/superadmin/users?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: userDetail, isLoading: detailLoading } = useQuery({
    queryKey: ["/api/superadmin/users", selectedUserId],
    queryFn: async () => {
      const res = await fetch(`/api/superadmin/users/${selectedUserId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedUserId,
  });

  const actionMutation = useMutation({
    mutationFn: async ({ userId, action, reason }: { userId: string; action: string; reason?: string }) => {
      const res = await fetch(`/api/superadmin/users/${userId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action, reason }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      setActionResult(data);
      toast({ title: "Action completed" });
      qc.invalidateQueries({ queryKey: ["/api/superadmin/users"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const ACTION_BUTTONS = [
    { action: "password_reset", label: "Send Reset", icon: Key },
    { action: "invite_resend",  label: "Resend Invite", icon: Mail },
    { action: "force_signout",  label: "Force Sign-Out", icon: LogOut },
    { action: "suspend",        label: "Suspend", icon: PauseCircle },
    { action: "unsuspend",      label: "Unsuspend", icon: PlayCircle },
  ];

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by email or name…" className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {isLoading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>}

      <div className="grid md:grid-cols-2 gap-4">
        {/* List */}
        <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
          {data?.users?.map((u: any) => (
            <div
              key={u.id}
              className={`p-3 border rounded-lg cursor-pointer transition-colors hover:bg-muted/50 ${selectedUserId === u.id ? "ring-2 ring-primary bg-muted/30" : ""}`}
              onClick={() => { setSelectedUserId(u.id); setActionResult(null); }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{u.fullName}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant={u.status === "active" ? "default" : "destructive"} className="text-xs">{u.status}</Badge>
                  {u.platformRole && <Badge variant="outline" className="text-xs font-mono">{u.platformRole}</Badge>}
                </div>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground text-center pt-1">{data?.total ?? 0} users</p>
        </div>

        {/* Detail */}
        <div>
          {selectedUserId && !detailLoading && userDetail ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{userDetail.user?.fullName}</CardTitle>
                <p className="text-xs text-muted-foreground">{userDetail.user?.email}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">Tier:</span> {userDetail.user?.subscriptionTier}</div>
                  <div><span className="text-muted-foreground">Status:</span> {userDetail.user?.status}</div>
                  <div><span className="text-muted-foreground">Joined:</span> {userDetail.user?.createdAt ? new Date(userDetail.user.createdAt).toLocaleDateString() : "—"}</div>
                  <div><span className="text-muted-foreground">Last login:</span> {userDetail.user?.lastLoginAt ? new Date(userDetail.user.lastLoginAt).toLocaleDateString() : "—"}</div>
                </div>

                {userDetail.memberships?.length > 0 && (
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Workspace Memberships</Label>
                    {userDetail.memberships.map((m: any) => (
                      <div key={m.workspaceId} className="text-xs flex justify-between py-0.5 border-b last:border-0">
                        <span>{m.workspaceName}</span>
                        <Badge variant="outline" className="text-xs">{m.role}</Badge>
                      </div>
                    ))}
                  </div>
                )}

                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">Support Actions (server-side logged)</Label>
                  <div className="flex flex-wrap gap-2">
                    {ACTION_BUTTONS.map(({ action, label, icon: Icon }) => (
                      <Button
                        key={action}
                        size="sm"
                        variant={action === "suspend" ? "destructive" : "outline"}
                        disabled={actionMutation.isPending}
                        onClick={() => actionMutation.mutate({ userId: selectedUserId, action })}
                      >
                        <Icon className="h-3.5 w-3.5 mr-1.5" />{label}
                      </Button>
                    ))}
                  </div>
                </div>

                {actionResult?.detail?.resetToken && (
                  <div className="text-xs bg-muted rounded p-2 font-mono break-all">
                    <p className="font-semibold mb-1">Reset Token:</p>
                    <p>{actionResult.detail.resetToken}</p>
                    <p className="text-muted-foreground mt-1">Expires: {actionResult.detail.expiresAt}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : selectedUserId && detailLoading ? (
            <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2 border rounded-lg border-dashed">
              <User className="h-8 w-8" />
              <p className="text-sm">Select a user to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
