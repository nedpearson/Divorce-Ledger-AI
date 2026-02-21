import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useLocation, Redirect } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Shield, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Sub-panel imports
import SuperAdminOverview from "@/components/superadmin/overview";
import SuperAdminFirms from "@/components/superadmin/firms";
import SuperAdminUsers from "@/components/superadmin/users";
import SuperAdminPlans from "@/components/superadmin/plans";
import SuperAdminBilling from "@/components/superadmin/billing";
import SuperAdminFeatures from "@/components/superadmin/features";
import SuperAdminAuditLog from "@/components/superadmin/audit-log";
import SuperAdminAnalytics from "@/components/superadmin/analytics";

const SUPER_ADMIN_EMAIL = "nedpearson@gmail.com";

function isPlatformAdmin(user: any): boolean {
  return (
    user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase() ||
    user?.platformRole === "super_admin" ||
    user?.platformRole === "support_admin"
  );
}

export default function SuperAdminPage() {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const demoResetMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/superadmin/demo/reset", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        let message = "Failed to reset demo environment";
        try {
          const data = await res.json();
          if (data?.error) message = data.error;
        } catch {
          // ignore JSON parse errors
        }
        throw new Error(message);
      }
    },
    onSuccess: () => {
      toast({
        title: "Demo environment reset",
        description: "The demo environment was refreshed with clean sample data.",
      });
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: "Demo reset failed",
        description: err?.message || "An unexpected error occurred while resetting the demo.",
      });
    },
  });

  // Server-side verify platform admin status (source of truth)
  const { data: adminMe, isLoading: adminLoading, isError: adminError } = useQuery({
    queryKey: ["/api/superadmin/me"],
    queryFn: async () => {
      const res = await fetch("/api/superadmin/me", { credentials: "include" });
      if (!res.ok) throw new Error("Forbidden");
      return res.json();
    },
    retry: false,
    enabled: !!user,
  });

  if (isLoading || adminLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || adminError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8">
        <div className="p-3 rounded-full bg-destructive/10">
          <Shield className="h-8 w-8 text-destructive" />
        </div>
        <h1 className="text-xl font-semibold">Access Denied</h1>
        <p className="text-muted-foreground text-center max-w-sm">
          This console is restricted to platform administrators. Your access attempt has been logged.
        </p>
        <Button variant="outline" onClick={() => window.location.href = "/home"}>
          Return to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-orange-500/10 rounded-lg">
          <Shield className="h-6 w-6 text-orange-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Platform Super Admin</h1>
          <p className="text-sm text-muted-foreground">
            {adminMe?.email} • <Badge variant="outline" className="text-xs font-mono">{adminMe?.role}</Badge>
          </p>
        </div>
        <div className="ml-auto">
          <Badge className="bg-orange-500 text-white">PLATFORM ADMIN</Badge>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-6 flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="firms">Firms</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="demo">Demo Tools</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><SuperAdminOverview /></TabsContent>
        <TabsContent value="firms"><SuperAdminFirms adminRole={adminMe?.role} /></TabsContent>
        <TabsContent value="users"><SuperAdminUsers /></TabsContent>
        <TabsContent value="plans"><SuperAdminPlans adminRole={adminMe?.role} /></TabsContent>
        <TabsContent value="billing"><SuperAdminBilling /></TabsContent>
        <TabsContent value="features"><SuperAdminFeatures adminRole={adminMe?.role} /></TabsContent>
        <TabsContent value="audit"><SuperAdminAuditLog /></TabsContent>
        <TabsContent value="analytics"><SuperAdminAnalytics /></TabsContent>
        <TabsContent value="demo">
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle>Demo Environment Tools</CardTitle>
              <CardDescription>
                Reset the demo environment for investor or client demos. This clears
                demo-only data and reseeds a fresh, realistic scenario for the demo user.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="text-sm text-muted-foreground">
                This operation:
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Keeps the demo user account intact.</li>
                  <li>Clears demo environment data.</li>
                  <li>Re-seeds curated demo cases, violations, and financial data.</li>
                </ul>
              </div>
              <Button
                variant="destructive"
                disabled={demoResetMutation.isLoading}
                onClick={() => demoResetMutation.mutate()}
              >
                {demoResetMutation.isLoading ? "Resetting demo environment…" : "Reset Demo Environment"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
