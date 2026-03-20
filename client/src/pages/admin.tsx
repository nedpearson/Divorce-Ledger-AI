import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2,
  LogIn,
  Trash2,
  Database,
  Eye,
  EyeOff,
  Edit2,
  Save,
  X,
  Shield,
  Plus,
  Users,
  UserPlus,
  ShieldAlert,
  ShieldCheck,
  LogOut,
  MapPin,
  Smartphone,
} from 'lucide-react';
import { queryClient } from '@/lib/queryClient';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface TestUser {
  id: string;
  email: string;
  password: string;
  fullName: string;
  environment: string;
}

interface LiveUser {
  id: string;
  email: string;
  fullName: string;
  environment: string;
  subscriptionTier: string;
  status: string;
  createdAt: string | null;
  lastLoginAt: string | null;
}

interface SecurityEvent {
  id: string;
  userId: string;
  userEmail?: string;
  eventType: string;
  eventStatus: string;
  ipAddress: string | null;
  deviceFingerprint: string | null;
  userAgent: string | null;
  createdAt: string;
}

export default function AdminPanel() {
  const { toast } = useToast();
  const [adminToken, setAdminToken] = useState<string | null>(() =>
    localStorage.getItem('adminToken')
  );
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ email: string; password: string; fullName: string }>({
    email: '',
    password: '',
    fullName: '',
  });

  // 2FA state
  const [show2fa, setShow2fa] = useState(false);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [maskedPhone, setMaskedPhone] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [rememberCredentials, setRememberCredentials] = useState(
    () => localStorage.getItem('adminRememberCredentials') === 'true'
  );

  // Load remembered credentials on mount
  useEffect(() => {
    if (localStorage.getItem('adminRememberCredentials') === 'true') {
      const savedEmail = localStorage.getItem('adminSavedEmail') || '';
      const savedPassword = localStorage.getItem('adminSavedPassword') || '';
      setLoginEmail(savedEmail);
      setLoginPassword(savedPassword);
    }
  }, []);

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    email: '',
    password: '',
    fullName: '',
    tier: 'enterprise',
  });
  const [editingLiveUser, setEditingLiveUser] = useState<string | null>(null);
  const [editLiveForm, setEditLiveForm] = useState({
    email: '',
    password: '',
    fullName: '',
    tier: 'enterprise',
  });

  const {
    data: testUsers,
    refetch,
    isLoading,
    isError,
  } = useQuery<TestUser[]>({
    queryKey: ['/api/admin/test-users', adminToken],
    queryFn: async () => {
      if (!adminToken) return [];
      const res = await fetch('/api/admin/test-users', {
        headers: { 'X-Admin-Token': adminToken },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        setAdminToken(null);
        throw new Error('Session expired');
      }
      if (!res.ok) throw new Error('Failed to fetch test users');
      return res.json();
    },
    enabled: !!adminToken,
    retry: false,
    staleTime: 0,
  });

  const {
    data: liveUsersData,
    refetch: refetchLive,
    isLoading: isLoadingLive,
    isError: isErrorLive,
  } = useQuery<LiveUser[]>({
    queryKey: ['/api/admin/live-users', adminToken],
    queryFn: async () => {
      if (!adminToken) return [];
      const res = await fetch('/api/admin/live-users', {
        headers: { 'X-Admin-Token': adminToken },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        setAdminToken(null);
        throw new Error('Session expired');
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch live users');
      }
      return Array.isArray(data) ? data : data.users || [];
    },
    enabled: !!adminToken,
    retry: false,
    staleTime: 0,
  });

  const liveUsers = liveUsersData;

  const handleAdminLogin = async () => {
    setIsLoggingIn(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      // Save only email if remember is checked (never store password)
      if (rememberCredentials) {
        localStorage.setItem('adminRememberCredentials', 'true');
        localStorage.setItem('adminSavedEmail', loginEmail);
      } else {
        localStorage.removeItem('adminRememberCredentials');
        localStorage.removeItem('adminSavedEmail');
      }

      // Check if 2FA is required
      if (data.requires2fa) {
        setChallengeId(data.challengeId);
        setMaskedPhone(data.maskedPhone);
        setShow2fa(true);
        toast({ title: 'Verification Code Sent', description: `Code sent to ${data.maskedPhone}` });
        return;
      }

      // No 2FA required - login successful
      setAdminToken(data.adminToken);
      localStorage.setItem('adminToken', data.adminToken);
      toast({ title: 'Admin Login Successful', description: 'Welcome to the admin panel' });
      refetch();
      refetchLive();
    } catch (error: any) {
      toast({
        title: 'Login Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleVerify2fa = async () => {
    if (!challengeId || !verificationCode) return;

    setIsVerifying(true);
    try {
      const res = await fetch('/api/admin/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId, code: verificationCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Verification failed');
      }

      // 2FA successful
      setAdminToken(data.adminToken);
      localStorage.setItem('adminToken', data.adminToken);
      setShow2fa(false);
      setChallengeId(null);
      setVerificationCode('');
      toast({ title: 'Admin Login Successful', description: 'Welcome to the admin panel' });
      refetch();
      refetchLive();
    } catch (error: any) {
      toast({
        title: 'Verification Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCancel2fa = () => {
    setShow2fa(false);
    setChallengeId(null);
    setVerificationCode('');
  };

  const handleLogout = () => {
    setAdminToken(null);
    localStorage.removeItem('adminToken');
    toast({ title: 'Logged Out', description: 'Admin session ended' });
  };

  const quickLoginMutation = useMutation({
    mutationFn: async ({ userId, isLive }: { userId: string; isLive: boolean }) => {
      const endpoint = isLive
        ? `/api/admin/live-users/${userId}/quick-login`
        : `/api/admin/test-users/${userId}/quick-login`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'X-Admin-Token': adminToken! },
      });
      if (!res.ok) throw new Error('Failed to generate quick login');
      return res.json();
    },
    onSuccess: async (data) => {
      const res = await fetch('/api/auth/quick-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: data.loginToken }),
      });

      if (res.ok) {
        const loginData = await res.json();
        localStorage.setItem('userId', loginData.user.id);
        localStorage.setItem('userEmail', loginData.user.email);
        localStorage.setItem('environment', loginData.environment);
        localStorage.setItem('userName', loginData.user.fullName || '');
        localStorage.setItem('subscriptionTier', loginData.user.subscriptionTier || 'free');
        toast({ title: 'Logged In', description: `Now logged in as ${loginData.user.email}` });
        window.location.href = '/';
      }
    },
    onError: (error: any) => {
      toast({ title: 'Quick Login Failed', description: error.message, variant: 'destructive' });
    },
  });

  const seedDataMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/admin/test-users/${userId}/seed-data`, {
        method: 'POST',
        headers: { 'X-Admin-Token': adminToken! },
      });
      if (!res.ok) throw new Error('Failed to seed data');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Sample Data Added', description: 'Test user now has sample financial data' });
    },
    onError: (error: any) => {
      toast({ title: 'Seed Failed', description: error.message, variant: 'destructive' });
    },
  });

  const eraseDataMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/admin/test-users/${userId}/erase`, {
        method: 'POST',
        headers: { 'X-Admin-Token': adminToken! },
      });
      if (!res.ok) throw new Error('Failed to erase data');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Data Erased', description: 'Test user data has been cleared' });
    },
    onError: (error: any) => {
      toast({ title: 'Erase Failed', description: error.message, variant: 'destructive' });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, updates }: { userId: string; updates: typeof editForm }) => {
      const res = await fetch(`/api/admin/test-users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': adminToken!,
        },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update user');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'User Updated', description: 'Test user credentials updated' });
      setEditingUser(null);
      refetch();
    },
    onError: (error: any) => {
      toast({ title: 'Update Failed', description: error.message, variant: 'destructive' });
    },
  });

  const createLiveUserMutation = useMutation({
    mutationFn: async (data: typeof newUserForm) => {
      const res = await fetch('/api/admin/live-users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': adminToken!,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create user');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Account Created', description: 'New live user account is ready' });
      setShowCreateDialog(false);
      setNewUserForm({ email: '', password: '', fullName: '', tier: 'enterprise' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/live-users'] });
    },
    onError: (error: any) => {
      toast({ title: 'Creation Failed', description: error.message, variant: 'destructive' });
    },
  });

  const updateLiveUserMutation = useMutation({
    mutationFn: async ({ userId, updates }: { userId: string; updates: typeof editLiveForm }) => {
      const res = await fetch(`/api/admin/live-users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': adminToken!,
        },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update user');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Account Updated', description: 'Live user account updated' });
      setEditingLiveUser(null);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/live-users'] });
    },
    onError: (error: any) => {
      toast({ title: 'Update Failed', description: error.message, variant: 'destructive' });
    },
  });

  const deleteLiveUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/admin/live-users/${userId}`, {
        method: 'DELETE',
        headers: { 'X-Admin-Token': adminToken! },
      });
      if (!res.ok) throw new Error('Failed to delete user');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Account Deleted', description: 'Live user account has been removed' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/live-users'] });
    },
    onError: (error: any) => {
      toast({ title: 'Delete Failed', description: error.message, variant: 'destructive' });
    },
  });

  const togglePasswordVisibility = (userId: string) => {
    setShowPasswords((prev) => ({ ...prev, [userId]: !prev[userId] }));
  };

  const startEditing = (user: TestUser) => {
    setEditingUser(user.id);
    setEditForm({ email: user.email, password: user.password, fullName: user.fullName });
  };

  const cancelEditing = () => {
    setEditingUser(null);
    setEditForm({ email: '', password: '', fullName: '' });
  };

  const saveEdit = (userId: string) => {
    updateUserMutation.mutate({ userId, updates: editForm });
  };

  const startEditingLive = (user: LiveUser) => {
    setEditingLiveUser(user.id);
    setEditLiveForm({
      email: user.email,
      password: '',
      fullName: user.fullName,
      tier: user.subscriptionTier,
    });
  };

  const cancelEditingLive = () => {
    setEditingLiveUser(null);
    setEditLiveForm({ email: '', password: '', fullName: '', tier: 'enterprise' });
  };

  const saveEditLive = (userId: string) => {
    const updates: any = {
      email: editLiveForm.email,
      fullName: editLiveForm.fullName,
      tier: editLiveForm.tier,
    };
    if (editLiveForm.password) {
      updates.password = editLiveForm.password;
    }
    updateLiveUserMutation.mutate({ userId, updates });
  };

  if (!adminToken) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              {show2fa ? (
                <Smartphone className="w-6 h-6 text-primary" />
              ) : (
                <Shield className="w-6 h-6 text-primary" />
              )}
            </div>
            <CardTitle>{show2fa ? 'Verify Your Identity' : 'Admin Console'}</CardTitle>
            <CardDescription>
              {show2fa
                ? `Enter the 6-digit code sent to ${maskedPhone}`
                : 'Sign in to manage users and accounts'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {show2fa ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="code">Verification Code</Label>
                  <Input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="123456"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={(e) =>
                      e.key === 'Enter' && verificationCode.length === 6 && handleVerify2fa()
                    }
                    className="text-center text-2xl tracking-widest"
                    data-testid="input-admin-2fa-code"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleCancel2fa}
                    data-testid="button-admin-2fa-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleVerify2fa}
                    disabled={isVerifying || verificationCode.length !== 6}
                    data-testid="button-admin-2fa-verify"
                  >
                    {isVerifying ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      'Verify'
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@example.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    data-testid="input-admin-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
                    data-testid="input-admin-password"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="remember"
                    checked={rememberCredentials}
                    onCheckedChange={(checked) => setRememberCredentials(checked === true)}
                    data-testid="checkbox-admin-remember"
                  />
                  <Label
                    htmlFor="remember"
                    className="text-sm text-muted-foreground cursor-pointer"
                  >
                    Remember my credentials
                  </Label>
                </div>
                <Button
                  className="w-full"
                  onClick={handleAdminLogin}
                  disabled={isLoggingIn || !loginEmail || !loginPassword}
                  data-testid="button-admin-login"
                >
                  {isLoggingIn ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    <>
                      <LogIn className="mr-2 h-4 w-4" />
                      Sign In
                    </>
                  )}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Admin Console</h1>
            <p className="text-muted-foreground">Manage live and test user accounts</p>
          </div>
          <Button variant="outline" onClick={handleLogout} data-testid="button-admin-logout">
            Log Out
          </Button>
        </div>

        <Tabs defaultValue="live" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="live" className="gap-2">
              <Users className="h-4 w-4" />
              Live Accounts
            </TabsTrigger>
            <TabsTrigger value="test" className="gap-2">
              <Database className="h-4 w-4" />
              Test Accounts
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2" data-testid="tab-admin-security">
              <Shield className="h-4 w-4" />
              Security
            </TabsTrigger>
          </TabsList>

          <TabsContent value="live" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle>Live User Accounts</CardTitle>
                    <CardDescription>
                      Real accounts with full access. Each user has isolated data storage.
                    </CardDescription>
                  </div>
                  <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                    <DialogTrigger asChild>
                      <Button data-testid="button-create-live-user">
                        <UserPlus className="h-4 w-4 mr-2" />
                        Create Account
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Create Live Account</DialogTitle>
                        <DialogDescription>
                          Create a new user account with full access to all features.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 pt-4">
                        <div className="space-y-2">
                          <Label>Full Name</Label>
                          <Input
                            placeholder="John Doe"
                            value={newUserForm.fullName}
                            onChange={(e) =>
                              setNewUserForm({ ...newUserForm, fullName: e.target.value })
                            }
                            data-testid="input-new-fullname"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Email</Label>
                          <Input
                            type="email"
                            placeholder="user@example.com"
                            value={newUserForm.email}
                            onChange={(e) =>
                              setNewUserForm({ ...newUserForm, email: e.target.value })
                            }
                            data-testid="input-new-email"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Password</Label>
                          <Input
                            type="text"
                            placeholder="Create a password"
                            value={newUserForm.password}
                            onChange={(e) =>
                              setNewUserForm({ ...newUserForm, password: e.target.value })
                            }
                            data-testid="input-new-password"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Subscription Tier</Label>
                          <Select
                            value={newUserForm.tier}
                            onValueChange={(v) => setNewUserForm({ ...newUserForm, tier: v })}
                          >
                            <SelectTrigger data-testid="select-new-tier">
                              <SelectValue placeholder="Select tier" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="free">Free</SelectItem>
                              <SelectItem value="individual">Individual ($12/mo)</SelectItem>
                              <SelectItem value="pro">Pro ($49/mo)</SelectItem>
                              <SelectItem value="team">Team ($149/mo)</SelectItem>
                              <SelectItem value="enterprise">Enterprise (Full Access)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          className="w-full"
                          onClick={() => createLiveUserMutation.mutate(newUserForm)}
                          disabled={
                            createLiveUserMutation.isPending ||
                            !newUserForm.email ||
                            !newUserForm.password ||
                            !newUserForm.fullName
                          }
                          data-testid="button-submit-create"
                        >
                          {createLiveUserMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Plus className="h-4 w-4 mr-2" />
                          )}
                          Create Account
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {isLoadingLive && (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-muted-foreground">Loading live users...</span>
                    </div>
                  )}
                  {isErrorLive && (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">Failed to load live users.</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => refetchLive()}
                      >
                        Try Again
                      </Button>
                    </div>
                  )}
                  {!isLoadingLive && !isErrorLive && (!liveUsers || liveUsers.length === 0) && (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground mb-4">No live accounts yet.</p>
                      <p className="text-sm text-muted-foreground">
                        Click "Create Account" to add your first live user.
                      </p>
                    </div>
                  )}
                  {liveUsers?.map((user) => (
                    <div
                      key={user.id}
                      className="border rounded-lg p-4 space-y-3"
                      data-testid={`card-live-user-${user.id}`}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="default">{user.subscriptionTier}</Badge>
                          <span className="font-medium">{user.fullName}</span>
                          <span className="text-sm text-muted-foreground">({user.email})</span>
                        </div>
                        {editingLiveUser !== user.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => startEditingLive(user)}
                            data-testid={`button-edit-live-${user.id}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>

                      {editingLiveUser === user.id ? (
                        <div className="space-y-3 pt-2 border-t">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <Label>Full Name</Label>
                              <Input
                                value={editLiveForm.fullName}
                                onChange={(e) =>
                                  setEditLiveForm({ ...editLiveForm, fullName: e.target.value })
                                }
                                data-testid={`input-edit-live-name-${user.id}`}
                              />
                            </div>
                            <div>
                              <Label>Email</Label>
                              <Input
                                value={editLiveForm.email}
                                onChange={(e) =>
                                  setEditLiveForm({ ...editLiveForm, email: e.target.value })
                                }
                                data-testid={`input-edit-live-email-${user.id}`}
                              />
                            </div>
                            <div>
                              <Label>New Password (leave blank to keep current)</Label>
                              <Input
                                type="text"
                                placeholder="New password"
                                value={editLiveForm.password}
                                onChange={(e) =>
                                  setEditLiveForm({ ...editLiveForm, password: e.target.value })
                                }
                                data-testid={`input-edit-live-password-${user.id}`}
                              />
                            </div>
                            <div>
                              <Label>Subscription Tier</Label>
                              <Select
                                value={editLiveForm.tier}
                                onValueChange={(v) => setEditLiveForm({ ...editLiveForm, tier: v })}
                              >
                                <SelectTrigger data-testid={`select-edit-live-tier-${user.id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="free">Free</SelectItem>
                                  <SelectItem value="individual">Individual</SelectItem>
                                  <SelectItem value="pro">Pro</SelectItem>
                                  <SelectItem value="team">Team</SelectItem>
                                  <SelectItem value="enterprise">Enterprise</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => saveEditLive(user.id)}
                              disabled={updateLiveUserMutation.isPending}
                              data-testid={`button-save-live-${user.id}`}
                            >
                              {updateLiveUserMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4 mr-1" />
                              )}
                              Save
                            </Button>
                            <Button variant="ghost" size="sm" onClick={cancelEditingLive}>
                              <X className="h-4 w-4 mr-1" />
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2 pt-2 border-t">
                          <Button
                            size="sm"
                            onClick={() =>
                              quickLoginMutation.mutate({ userId: user.id, isLive: true })
                            }
                            disabled={quickLoginMutation.isPending}
                            data-testid={`button-quick-login-live-${user.id}`}
                          >
                            {quickLoginMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            ) : (
                              <LogIn className="h-4 w-4 mr-1" />
                            )}
                            Quick Login
                          </Button>

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={deleteLiveUserMutation.isPending}
                                data-testid={`button-delete-live-${user.id}`}
                              >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Delete Account
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Account?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete {user.fullName}'s account and ALL
                                  their data. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteLiveUserMutation.mutate(user.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete Account
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      )}

                      <div className="text-xs text-muted-foreground pt-1">
                        Created:{' '}
                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                        {user.lastLoginAt &&
                          ` | Last login: ${new Date(user.lastLoginAt).toLocaleDateString()}`}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="test" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Test User Accounts</CardTitle>
                <CardDescription>
                  Isolated sandbox accounts for testing. Each has its own data environment.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {isLoading && (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-muted-foreground">Loading test users...</span>
                    </div>
                  )}
                  {isError && (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">Failed to load test users.</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => refetch()}
                      >
                        Try Again
                      </Button>
                    </div>
                  )}
                  {!isLoading && !isError && (!testUsers || testUsers.length === 0) && (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">No test users found.</p>
                    </div>
                  )}
                  {testUsers?.map((user) => (
                    <div
                      key={user.id}
                      className="border rounded-lg p-4 space-y-3"
                      data-testid={`card-test-user-${user.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{user.environment}</Badge>
                          <span className="font-medium">{user.fullName}</span>
                        </div>
                        {editingUser !== user.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => startEditing(user)}
                            data-testid={`button-edit-${user.id}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>

                      {editingUser === user.id ? (
                        <div className="space-y-3 pt-2 border-t">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                              <Label>Email</Label>
                              <Input
                                value={editForm.email}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, email: e.target.value })
                                }
                                data-testid={`input-edit-email-${user.id}`}
                              />
                            </div>
                            <div>
                              <Label>Password</Label>
                              <Input
                                value={editForm.password}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, password: e.target.value })
                                }
                                data-testid={`input-edit-password-${user.id}`}
                              />
                            </div>
                            <div>
                              <Label>Full Name</Label>
                              <Input
                                value={editForm.fullName}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, fullName: e.target.value })
                                }
                                data-testid={`input-edit-name-${user.id}`}
                              />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => saveEdit(user.id)}
                              disabled={updateUserMutation.isPending}
                              data-testid={`button-save-${user.id}`}
                            >
                              {updateUserMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4 mr-1" />
                              )}
                              Save
                            </Button>
                            <Button variant="ghost" size="sm" onClick={cancelEditing}>
                              <X className="h-4 w-4 mr-1" />
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Email:</span>
                              <p className="font-mono">{user.email}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Password:</span>
                              <div className="flex items-center gap-2">
                                <p className="font-mono">
                                  {showPasswords[user.id] ? user.password : '••••••'}
                                </p>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => togglePasswordVisibility(user.id)}
                                  data-testid={`button-toggle-password-${user.id}`}
                                >
                                  {showPasswords[user.id] ? (
                                    <EyeOff className="h-3 w-3" />
                                  ) : (
                                    <Eye className="h-3 w-3" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2 pt-2 border-t">
                            <Button
                              size="sm"
                              onClick={() =>
                                quickLoginMutation.mutate({ userId: user.id, isLive: false })
                              }
                              disabled={quickLoginMutation.isPending}
                              data-testid={`button-quick-login-${user.id}`}
                            >
                              {quickLoginMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                              ) : (
                                <LogIn className="h-4 w-4 mr-1" />
                              )}
                              Quick Login
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => seedDataMutation.mutate(user.id)}
                              disabled={seedDataMutation.isPending}
                              data-testid={`button-seed-${user.id}`}
                            >
                              {seedDataMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                              ) : (
                                <Database className="h-4 w-4 mr-1" />
                              )}
                              Add Sample Data
                            </Button>

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={eraseDataMutation.isPending}
                                  data-testid={`button-erase-${user.id}`}
                                >
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  Erase Data
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Erase All Data?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently delete all data for {user.fullName}'s
                                    sandbox. The account will remain but start fresh with no data.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => eraseDataMutation.mutate(user.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Erase All Data
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Main Demo Account</CardTitle>
                <CardDescription>
                  The primary demo account with pre-populated sample data
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                  <div>
                    <span className="text-muted-foreground">Email:</span>
                    <p className="font-mono">demo@divorceledger.live</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Password:</span>
                    <p className="font-mono">demo123</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  This account resets daily at midnight UTC with fresh sample data.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="space-y-4 mt-4">
            <SecurityDashboard adminToken={adminToken} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function SecurityDashboard({ adminToken }: { adminToken: string | null }) {
  const { toast } = useToast();

  const { data: eventsData, isLoading: eventsLoading } = useQuery<{ events: SecurityEvent[] }>({
    queryKey: ['/api/admin/security/events', adminToken],
    queryFn: async () => {
      const response = await fetch('/api/admin/security/events', {
        headers: {
          'X-Admin-Token': adminToken || '',
        },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch security events');
      }
      return data;
    },
    enabled: !!adminToken,
  });

  const { data: liveUsersSecurity } = useQuery<LiveUser[]>({
    queryKey: ['/api/admin/live-users-security', adminToken],
    queryFn: async () => {
      const response = await fetch('/api/admin/live-users', {
        headers: {
          'X-Admin-Token': adminToken || '',
        },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch live users');
      }
      return Array.isArray(data) ? data : data.users || [];
    },
    enabled: !!adminToken,
  });

  const revokeUserSessionsMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch(`/api/admin/security/users/${userId}/revoke-sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': adminToken || '',
        },
      });
      if (!response.ok) throw new Error('Failed to revoke sessions');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/security/events'] });
      toast({
        title: 'Sessions Revoked',
        description: 'All sessions for this user have been terminated.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to revoke sessions. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const getEventIcon = (eventType: string, status: string) => {
    if (status === 'failure') {
      return <ShieldAlert className="h-4 w-4 text-destructive" />;
    }
    if (eventType.includes('login') || eventType.includes('2fa')) {
      return <ShieldCheck className="h-4 w-4 text-green-500" />;
    }
    if (eventType.includes('revoke') || eventType.includes('block')) {
      return <LogOut className="h-4 w-4 text-amber-500" />;
    }
    return <Shield className="h-4 w-4" />;
  };

  const formatEventType = (eventType: string) => {
    return eventType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const formatTimeAgo = (date: string) => {
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return then.toLocaleDateString();
  };

  const events = eventsData?.events || [];
  const users = liveUsersSecurity || [];
  const usersMap = users.reduce(
    (acc, user) => ({ ...acc, [user.id]: user }),
    {} as Record<string, LiveUser>
  );

  const eventStats = {
    total: events.length,
    logins: events.filter((e) => e.eventType.includes('login')).length,
    failures: events.filter((e) => e.eventStatus === 'failure').length,
    revocations: events.filter(
      (e) => e.eventType.includes('revoke') || e.eventType.includes('block')
    ).length,
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{eventStats.total}</div>
            <p className="text-xs text-muted-foreground">Total Events</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{eventStats.logins}</div>
            <p className="text-xs text-muted-foreground">Login Events</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-destructive">{eventStats.failures}</div>
            <p className="text-xs text-muted-foreground">Failed Attempts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-amber-600">{eventStats.revocations}</div>
            <p className="text-xs text-muted-foreground">Revocations</p>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-admin-security-events">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security Event Log
          </CardTitle>
          <CardDescription>All security events across all users in the system</CardDescription>
        </CardHeader>
        <CardContent>
          {eventsLoading ? (
            <div className="animate-pulse space-y-2">
              <div className="h-10 bg-muted rounded" />
              <div className="h-10 bg-muted rounded" />
              <div className="h-10 bg-muted rounded" />
            </div>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No security events recorded yet.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {events.slice(0, 50).map((event) => {
                const user = usersMap[event.userId];
                return (
                  <div
                    key={event.id}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                    data-testid={`admin-event-${event.id}`}
                  >
                    <div className="flex items-center gap-3">
                      {getEventIcon(event.eventType, event.eventStatus)}
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{formatEventType(event.eventType)}</p>
                          {user && (
                            <Badge variant="outline" className="text-xs">
                              {user.email}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {event.ipAddress && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {event.ipAddress}
                            </span>
                          )}
                          <span>{formatTimeAgo(event.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                    <Badge
                      variant={event.eventStatus === 'success' ? 'secondary' : 'destructive'}
                      className="text-xs"
                    >
                      {event.eventStatus}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-admin-user-sessions">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            User Session Management
          </CardTitle>
          <CardDescription>Force logout users from all their sessions</CardDescription>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users found.</p>
          ) : (
            <div className="space-y-2">
              {users.slice(0, 20).map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                  data-testid={`admin-user-session-${user.id}`}
                >
                  <div>
                    <p className="text-sm font-medium">{user.fullName}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid={`button-revoke-user-${user.id}`}
                      >
                        <LogOut className="h-4 w-4 mr-2" />
                        Force Logout
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Force logout this user?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will terminate all active sessions for {user.fullName} ({user.email}
                          ). They will need to sign in again.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => revokeUserSessionsMutation.mutate(user.id)}
                          data-testid="button-confirm-force-logout"
                        >
                          Force Logout
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
