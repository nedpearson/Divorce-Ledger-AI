import { useState, useDeferredValue } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { Search, Users, Shield, ShieldCheck, Ban, CheckCircle, RefreshCw, Loader2, Crown } from "lucide-react";
import { format } from "date-fns";

interface UserMetadata {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isAdmin: boolean;
  status: string;
  subscriptionTier: string;
  subscriptionStatus: string;
  createdAt: string | null;
  lastLoginAt: string | null;
  casesCount: number;
  violationsCountThisMonth: number;
  voiceTranscriptionsThisMonth: number;
  mediaUploadsThisMonth: number;
  environment: string;
}

export default function AdminUsers() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [selectedUser, setSelectedUser] = useState<UserMetadata | null>(null);
  const [dialogAction, setDialogAction] = useState<"status" | "tier" | "role" | "reset" | null>(null);
  const [newStatus, setNewStatus] = useState<string>("");
  const [newTier, setNewTier] = useState<string>("");
  const [newIsAdmin, setNewIsAdmin] = useState<boolean>(false);

  const { data, isLoading, error } = useQuery<{ users: UserMetadata[] }>({
    queryKey: ["/api/admin/users"],
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: string }) => {
      return apiRequest("PATCH", `/api/admin/users/${userId}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Status Updated", description: "User status has been updated successfully." });
      closeDialog();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update status", variant: "destructive" });
    },
  });

  const updateTierMutation = useMutation({
    mutationFn: async ({ userId, tier }: { userId: string; tier: string }) => {
      return apiRequest("PATCH", `/api/admin/users/${userId}/tier`, { tier });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Tier Updated", description: "User subscription tier has been updated successfully." });
      closeDialog();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update tier", variant: "destructive" });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) => {
      return apiRequest("PATCH", `/api/admin/users/${userId}/role`, { isAdmin });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Role Updated", description: "User admin status has been updated successfully." });
      closeDialog();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update role", variant: "destructive" });
    },
  });

  const resetUsageMutation = useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      return apiRequest("POST", `/api/admin/users/${userId}/reset-usage`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Usage Reset", description: "User monthly usage counts have been reset." });
      closeDialog();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to reset usage", variant: "destructive" });
    },
  });

  const closeDialog = () => {
    setSelectedUser(null);
    setDialogAction(null);
    setNewStatus("");
    setNewTier("");
    setNewIsAdmin(false);
  };

  const openStatusDialog = (user: UserMetadata) => {
    setSelectedUser(user);
    setNewStatus(user.status);
    setDialogAction("status");
  };

  const openTierDialog = (user: UserMetadata) => {
    setSelectedUser(user);
    setNewTier(user.subscriptionTier);
    setDialogAction("tier");
  };

  const openRoleDialog = (user: UserMetadata) => {
    setSelectedUser(user);
    setNewIsAdmin(user.isAdmin);
    setDialogAction("role");
  };

  const openResetDialog = (user: UserMetadata) => {
    setSelectedUser(user);
    setDialogAction("reset");
  };

  const handleConfirmAction = () => {
    if (!selectedUser) return;

    switch (dialogAction) {
      case "status":
        updateStatusMutation.mutate({ userId: selectedUser.id, status: newStatus });
        break;
      case "tier":
        updateTierMutation.mutate({ userId: selectedUser.id, tier: newTier });
        break;
      case "role":
        updateRoleMutation.mutate({ userId: selectedUser.id, isAdmin: newIsAdmin });
        break;
      case "reset":
        resetUsageMutation.mutate({ userId: selectedUser.id });
        break;
    }
  };

  const filteredUsers = data?.users?.filter((u) => {
    const matchesSearch =
      u.email.toLowerCase().includes(deferredSearchQuery.toLowerCase()) ||
      u.fullName.toLowerCase().includes(deferredSearchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || u.status === statusFilter;
    const matchesTier = tierFilter === "all" || u.subscriptionTier === tierFilter;
    return matchesSearch && matchesStatus && matchesTier;
  }) || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="default" className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Active</Badge>;
      case "suspended":
        return <Badge variant="destructive"><Ban className="h-3 w-3 mr-1" />Suspended</Badge>;
      case "pending":
        return <Badge variant="secondary">Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTierBadge = (tier: string) => {
    const tierColors: Record<string, string> = {
      free: "bg-gray-500",
      individual: "bg-blue-500",
      pro: "bg-purple-500",
      team: "bg-orange-500",
      enterprise: "bg-yellow-600",
    };
    return (
      <Badge className={tierColors[tier] || "bg-gray-500"}>
        {tier.charAt(0).toUpperCase() + tier.slice(1)}
      </Badge>
    );
  };

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-destructive">
              <Shield className="h-12 w-12 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
              <p>You do not have permission to view this page.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 pb-24 md:pb-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6" />
            Admin - User Management
          </h1>
          <p className="text-muted-foreground text-sm">
            Manage users, permissions, and subscription plans
          </p>
        </div>
        <Badge variant="outline" className="text-sm">
          <Users className="h-4 w-4 mr-1" />
          {data?.users?.length || 0} Total Users
        </Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">User Directory</CardTitle>
          <CardDescription>
            View and manage all registered users. Documents and private data are not visible to admins.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-users"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
            <Select value={tierFilter} onValueChange={setTierFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-tier-filter">
                <SelectValue placeholder="Tier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tiers</SelectItem>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="individual">Individual</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="team">Team</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No users found matching your criteria
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((u) => (
                      <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                        <TableCell>
                          <div>
                            <div className="font-medium flex items-center gap-2">
                              {u.fullName}
                              {u.isAdmin && (
                                <Crown className="h-4 w-4 text-yellow-500" />
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">{u.email}</div>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(u.status)}</TableCell>
                        <TableCell>{getTierBadge(u.subscriptionTier)}</TableCell>
                        <TableCell>
                          {u.isAdmin ? (
                            <Badge variant="outline" className="border-yellow-500 text-yellow-600">
                              <ShieldCheck className="h-3 w-3 mr-1" />
                              Admin
                            </Badge>
                          ) : (
                            <Badge variant="outline">Client</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div>Cases: {u.casesCount}</div>
                            <div className="text-muted-foreground">
                              Violations: {u.violationsCountThisMonth}/mo
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {u.createdAt ? format(new Date(u.createdAt), "MMM d, yyyy") : "N/A"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openStatusDialog(u)}
                              disabled={u.id === user?.id}
                              data-testid={`button-status-${u.id}`}
                            >
                              Status
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openTierDialog(u)}
                              data-testid={`button-tier-${u.id}`}
                            >
                              Tier
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openRoleDialog(u)}
                              disabled={u.id === user?.id}
                              data-testid={`button-role-${u.id}`}
                            >
                              Role
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openResetDialog(u)}
                              data-testid={`button-reset-${u.id}`}
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogAction !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogAction === "status" && "Update User Status"}
              {dialogAction === "tier" && "Update Subscription Tier"}
              {dialogAction === "role" && "Update Admin Role"}
              {dialogAction === "reset" && "Reset Usage Counts"}
            </DialogTitle>
            <DialogDescription>
              {selectedUser && (
                <span>
                  Modifying: <strong>{selectedUser.fullName}</strong> ({selectedUser.email})
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {dialogAction === "status" && (
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger data-testid="select-new-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            )}

            {dialogAction === "tier" && (
              <Select value={newTier} onValueChange={setNewTier}>
                <SelectTrigger data-testid="select-new-tier">
                  <SelectValue placeholder="Select tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free ($0/mo)</SelectItem>
                  <SelectItem value="individual">Individual ($12/mo)</SelectItem>
                  <SelectItem value="pro">Pro ($49/mo)</SelectItem>
                  <SelectItem value="team">Team ($149/mo)</SelectItem>
                  <SelectItem value="enterprise">Enterprise ($399/mo)</SelectItem>
                </SelectContent>
              </Select>
            )}

            {dialogAction === "role" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Admins can manage users, permissions, and plans but cannot see user documents.
                </p>
                <Select 
                  value={newIsAdmin ? "admin" : "client"} 
                  onValueChange={(v) => setNewIsAdmin(v === "admin")}
                >
                  <SelectTrigger data-testid="select-new-role">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client">Client (Standard User)</SelectItem>
                    <SelectItem value="admin">Admin (Management Access)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {dialogAction === "reset" && (
              <p className="text-sm text-muted-foreground">
                This will reset the user's monthly violation count and usage metrics to zero.
                This action cannot be undone.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} data-testid="button-cancel">
              Cancel
            </Button>
            <Button
              onClick={handleConfirmAction}
              disabled={
                updateStatusMutation.isPending ||
                updateTierMutation.isPending ||
                updateRoleMutation.isPending ||
                resetUsageMutation.isPending
              }
              data-testid="button-confirm"
            >
              {(updateStatusMutation.isPending ||
                updateTierMutation.isPending ||
                updateRoleMutation.isPending ||
                resetUsageMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
