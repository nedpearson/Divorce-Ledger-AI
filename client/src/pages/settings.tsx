import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import { apiRequest, queryClient, getQueryFn } from '@/lib/queryClient';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Link2,
  Link2Off,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Clock,
  User,
  Shield,
  CreditCard,
  Key,
  Loader2,
  Trash2,
  RotateCcw,
  Database,
  Smartphone,
  Monitor,
  Laptop,
  Globe,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  MapPin,
} from 'lucide-react';
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
import { SiQuickbooks } from 'react-icons/si';
import { Switch } from '@/components/ui/switch';
import { Flame } from 'lucide-react';

interface QuickBooksStatus {
  connected: boolean;
  companyName: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  apiCallsRemaining: number;
  configured: boolean;
}

interface FireflyStatus {
  connected: boolean;
  instanceUrl?: string;
  instanceVersion?: string;
  autoSyncEnabled?: boolean;
  lastSyncAt?: string;
  lastSyncStatus?: string;
  error?: string;
}

interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: string;
  profilePhoto: string | null;
  subscriptionTier: string;
  subscriptionStatus: string | null;
  casesCount: number;
  violationsCountThisMonth: number;
  voiceTranscriptionsThisMonth: number;
  mediaUploadsThisMonth: number;
}

const profileFormSchema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
});

const passwordFormSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type ProfileFormValues = z.infer<typeof profileFormSchema>;
type PasswordFormValues = z.infer<typeof passwordFormSchema>;

interface GoogleConnection {
  id: string;
  providerEmail: string;
  createdAt: string;
}

function GoogleIntegrations() {
  const { toast } = useToast();
  
  const { data: routeConfig } = useQuery<{ googleAuthEnabled: boolean, googleDriveEnabled: boolean, googleCalendarEnabled: boolean }>({
    queryKey: ['/api/config/integrations'],
  });

  const { data: connections, isLoading } = useQuery<GoogleConnection[]>({
    queryKey: ['/api/auth/google/connections'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/auth/google/disconnect'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/google/connections'] });
      toast({
        title: 'Disconnected',
        description: 'Your Google account has been unlinked successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to disconnect Google account.',
        variant: 'destructive',
      });
    },
  });

  const { data: driveStatus, isLoading: isDriveLoading } = useQuery<{ isConnected: boolean; externalAccountId?: string }>({
    queryKey: ['/api/integrations/google-drive/status'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
  });

  const disconnectDriveMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/integrations/google-drive/disconnect'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/integrations/google-drive/status'] });
      toast({
        title: 'Disconnected',
        description: 'Google Drive integration has been revoked successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to disconnect Google Drive.',
        variant: 'destructive',
      });
    },
  });

  const connectDrive = async () => {
    try {
      const res = await fetch('/api/integrations/google-drive/auth');
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No redirect URL provided');
      }
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to initiate Drive connection', variant: 'destructive' });
    }
  };

  const { data: calendarStatus, isLoading: isCalendarLoading } = useQuery<{ isConnected: boolean; externalAccountId?: string }>({
    queryKey: ['/api/integrations/google-calendar/status'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
  });

  const disconnectCalendarMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/integrations/google-calendar/disconnect'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/integrations/google-calendar/status'] });
      toast({
        title: 'Disconnected',
        description: 'Google Calendar integration has been revoked successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to disconnect Google Calendar.',
        variant: 'destructive',
      });
    },
  });

  const connectCalendar = async () => {
    try {
      const res = await fetch('/api/integrations/google-calendar/auth');
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No redirect URL provided');
      }
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to initiate Calendar connection', variant: 'destructive' });
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'drive_connected') {
      toast({ title: 'Drive Connected', description: 'Google Drive has been successfully linked for document exports.' });
      window.history.replaceState({}, '', '/settings');
    } else if (params.get('success') === 'calendar_connected') {
      toast({ title: 'Calendar Connected', description: 'Google Calendar has been successfully linked for date sync.' });
      window.history.replaceState({}, '', '/settings');
    } else if (params.get('error')) {
      const errorMsg = params.get('error') === 'drive_denied' || params.get('error') === 'calendar_denied' 
        ? 'Authorization denied by user.' 
        : 'Integration connection failed.';
      toast({ title: 'Connection Failed', description: errorMsg, variant: 'destructive' });
      window.history.replaceState({}, '', '/settings');
    }
  }, [toast]);

  const googleConnected = connections && connections.length > 0;
  const connectedEmail = connections?.[0]?.providerEmail;

  if (isLoading) {
    return (
      <Card data-testid="card-google-integration">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Globe className="h-8 w-8 text-muted-foreground" />
            <div>
              <CardTitle>Google Workspace</CardTitle>
              <CardDescription>Loading connection status...</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse h-20 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-google-integration">
      <CardHeader>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Globe className="h-8 w-8 text-primary" />
            <div>
              <CardTitle>Google Account & Workspace</CardTitle>
              <CardDescription>
                Manage your Google authentication and integrations
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Core Auth Panel */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium">Authentication</h4>
          {googleConnected ? (
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium">Connected</span>
                </div>
                <Badge variant="secondary">Active</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Linked Account</span>
                <span className="text-sm">{connectedEmail}</span>
              </div>
              <div className="pt-2 flex justify-end">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                >
                  <Link2Off className="h-4 w-4 mr-2" />
                  Disconnect Google Auth
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Link Google Identity</p>
                <p className="text-[13px] text-muted-foreground mt-1">
                  Connect your Google account to enable secure Single Sign-On (SSO). We never request Calendar or Drive access during sign-in.
                </p>
              </div>
              <Button 
                onClick={() => window.location.href = '/api/auth/google'}
                disabled={routeConfig && !routeConfig.googleAuthEnabled}
              >
                <Link2 className="h-4 w-4 mr-2" />
                {routeConfig && !routeConfig.googleAuthEnabled ? 'Not Configured' : 'Connect'}
              </Button>
            </div>
          )}
        </div>

        <Separator />

        {/* Integrations Panels (View only/Future) */}
        <div className="space-y-4 pt-2">
          <h4 className="text-sm font-medium flex items-center gap-2">
            Optional Workspace Integrations 
            <Badge variant="outline" className="text-[10px]">Coming Soon</Badge>
          </h4>
          
          <div className="grid gap-4 md:grid-cols-2">
            <div className={`rounded-lg border p-4 ${!calendarStatus?.isConnected ? '' : 'bg-muted/10'}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-blue-500/10 text-blue-600 rounded">
                    <Globe className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-medium">Google Calendar</p>
                </div>
                {calendarStatus?.isConnected && (
                    <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-500/20">Active</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Sync critical dates and mediation sessions. Requires explicit separate authorization scope.
              </p>
              
              {calendarStatus?.isConnected ? (
                  <div className="space-y-4 mt-2">
                      <div className="text-sm">
                          <span className="text-muted-foreground mr-2">Linked:</span>
                          <span className="font-medium truncate block sm:inline">{calendarStatus.externalAccountId}</span>
                      </div>
                      <Button 
                          variant="destructive" 
                          size="sm" 
                          className="w-full" 
                          onClick={() => disconnectCalendarMutation.mutate()}
                          disabled={disconnectCalendarMutation.isPending}
                      >
                          <Link2Off className="h-4 w-4 mr-2" /> Revoke Access
                      </Button>
                  </div>
              ) : (
                  <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full" 
                      onClick={connectCalendar}
                      disabled={routeConfig && !routeConfig.googleCalendarEnabled}
                  >
                    <Link2 className="h-4 w-4 mr-2" />
                    {routeConfig && !routeConfig.googleCalendarEnabled ? 'Not Configured' : 'Connect Calendar'}
                  </Button>
              )}
            </div>

            <div className={`rounded-lg border p-4 ${!driveStatus?.isConnected ? '' : 'bg-muted/10'}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-green-500/10 text-green-600 rounded">
                    <Database className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-medium">Google Drive</p>
                </div>
                {driveStatus?.isConnected && (
                    <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-500/20">Active</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Export reports and import discovery documents directly. Uses a strictly limited file-level scope.
              </p>
              
              {driveStatus?.isConnected ? (
                  <div className="space-y-4 mt-2">
                      <div className="text-sm">
                          <span className="text-muted-foreground mr-2">Linked:</span>
                          <span className="font-medium truncate block sm:inline">{driveStatus.externalAccountId}</span>
                      </div>
                      <Button 
                          variant="destructive" 
                          size="sm" 
                          className="w-full" 
                          onClick={() => disconnectDriveMutation.mutate()}
                          disabled={disconnectDriveMutation.isPending}
                      >
                          <Link2Off className="h-4 w-4 mr-2" /> Revoke Access
                      </Button>
                  </div>
              ) : (
                  <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full" 
                      onClick={connectDrive}
                      disabled={routeConfig && !routeConfig.googleDriveEnabled}
                  >
                    <Link2 className="h-4 w-4 mr-2" />
                    {routeConfig && !routeConfig.googleDriveEnabled ? 'Drive Not Configured' : 'Connect Drive'}
                  </Button>
              )}
            </div>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}

function QuickBooksIntegration() {
  const { toast } = useToast();
  const [location] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('qb_success') === 'true') {
      toast({
        title: 'QuickBooks Connected',
        description: 'Your QuickBooks account has been successfully linked.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/quickbooks/status'] });
      window.history.replaceState({}, '', '/settings');
    }
    if (params.get('qb_error')) {
      const error = params.get('qb_error');
      toast({
        title: 'QuickBooks Connection Failed',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
      window.history.replaceState({}, '', '/settings');
    }
  }, [location, toast]);

  const { data: status, isLoading } = useQuery<QuickBooksStatus>({
    queryKey: ['/api/quickbooks/status'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/quickbooks/status', { credentials: 'include' });
        if (!res.ok) return null;
        return res.json();
      } catch { return null; }
    },
    retry: false,
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/quickbooks/disconnect'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/quickbooks/status'] });
      toast({
        title: 'Disconnected',
        description: 'Your QuickBooks account has been disconnected.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to disconnect QuickBooks. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const refreshMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/quickbooks/refresh'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/quickbooks/status'] });
      toast({
        title: 'Token Refreshed',
        description: 'Your QuickBooks connection has been refreshed.',
      });
    },
    onError: () => {
      toast({
        title: 'Refresh Failed',
        description: 'Failed to refresh token. You may need to reconnect.',
        variant: 'destructive',
      });
    },
  });

  function getErrorMessage(error: string | null): string {
    switch (error) {
      case 'not_authenticated':
        return 'Please log in to connect QuickBooks.';
      case 'oauth_denied':
        return 'You denied access to QuickBooks.';
      case 'state_mismatch':
        return 'Security validation failed. Please try again.';
      case 'token_exchange_failed':
        return 'Failed to complete authentication.';
      case 'not_configured':
        return 'QuickBooks integration is not configured.';
      default:
        return 'An unexpected error occurred.';
    }
  }

  const handleConnect = async () => {
    try {
      const response = await apiRequest('GET', '/api/quickbooks/auth-url');
      const data = await response.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        toast({
          title: 'Error',
          description: data.message || 'Failed to get authorization URL',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to connect to QuickBooks',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <Card data-testid="card-quickbooks-integration">
        <CardHeader>
          <div className="flex items-center gap-3">
            <SiQuickbooks className="h-8 w-8 text-[#2CA01C]" />
            <div>
              <CardTitle>QuickBooks</CardTitle>
              <CardDescription>Loading connection status...</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse h-20 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-quickbooks-integration">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <SiQuickbooks className="h-8 w-8 text-[#2CA01C]" />
            <div>
              <CardTitle>QuickBooks</CardTitle>
              <CardDescription>
                Connect your QuickBooks account to import financial data
              </CardDescription>
            </div>
          </div>
          {status?.connected && (
            <Badge variant="default" className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              Connected
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {status?.connected ? (
          <>
            <div className="rounded-lg bg-muted/50 p-4 space-y-2">
              {status.companyName && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Company</span>
                  <span className="text-sm font-medium">{status.companyName}</span>
                </div>
              )}
              {status.connectedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Connected</span>
                  <span className="text-sm">
                    {new Date(status.connectedAt).toLocaleDateString()}
                  </span>
                </div>
              )}
              {status.lastSyncAt && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Last Sync</span>
                  <span className="text-sm">{new Date(status.lastSyncAt).toLocaleString()}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">API Calls Remaining</span>
                <span className="text-sm flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {status.apiCallsRemaining} / 100 today
                </span>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={() => refreshMutation.mutate()}
                disabled={refreshMutation.isPending}
                data-testid="button-qb-refresh"
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${refreshMutation.isPending ? 'animate-spin' : ''}`}
                />
                Refresh Token
              </Button>
              <Button
                variant="destructive"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                data-testid="button-qb-disconnect"
              >
                <Link2Off className="h-4 w-4 mr-2" />
                Disconnect
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Connect your QuickBooks account to automatically import transactions, invoices, and
              financial reports into your case documentation.
            </p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Import bank transactions
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Track income and expenses
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Generate financial reports
              </li>
            </ul>
            <Button onClick={handleConnect} data-testid="button-qb-connect">
              <Link2 className="h-4 w-4 mr-2" />
              Connect My QuickBooks
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

const fireflyFormSchema = z.object({
  instanceUrl: z.string().url('Must be a valid URL'),
  accessToken: z.string().min(10, 'Access token is required'),
  autoSyncEnabled: z.boolean().optional().default(false),
});

type FireflyFormValues = z.infer<typeof fireflyFormSchema>;

function FireflyIntegration() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);

  const { data: status, isLoading } = useQuery<FireflyStatus>({
    queryKey: ['/api/firefly/status'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/firefly/status', { credentials: 'include' });
        if (!res.ok) return null;
        return res.json();
      } catch { return null; }
    },
    retry: false,
  });

  const form = useForm<FireflyFormValues>({
    resolver: zodResolver(fireflyFormSchema),
    defaultValues: {
      instanceUrl: '',
      accessToken: '',
      autoSyncEnabled: false,
    },
  });

  const connectMutation = useMutation({
    mutationFn: async (data: FireflyFormValues) => {
      const res = await apiRequest('POST', '/api/firefly/connect', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/firefly/status'] });
      setShowForm(false);
      form.reset();
      toast({
        title: 'Firefly III Connected',
        description: 'Your Firefly III instance has been successfully linked.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Connection Failed',
        description:
          error?.message || 'Failed to connect to Firefly III. Please check your settings.',
        variant: 'destructive',
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/firefly/disconnect'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/firefly/status'] });
      toast({
        title: 'Disconnected',
        description: 'Your Firefly III connection has been removed.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to disconnect. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const syncAllMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/firefly/sync/all'),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ['/api/firefly/status'] });
      toast({
        title: 'Sync Complete',
        description: data.message || 'All records have been synced to Firefly III.',
      });
    },
    onError: () => {
      toast({
        title: 'Sync Failed',
        description: 'Failed to sync records. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: FireflyFormValues) => {
    connectMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <Card data-testid="card-firefly-integration">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Flame className="h-8 w-8 text-orange-500" />
            <div>
              <CardTitle>Firefly III</CardTitle>
              <CardDescription>Loading connection status...</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse h-20 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-firefly-integration">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Flame className="h-8 w-8 text-orange-500" />
            <div>
              <CardTitle>Firefly III</CardTitle>
              <CardDescription>
                Connect to your self-hosted personal finance manager
              </CardDescription>
            </div>
          </div>
          {status?.connected && (
            <Badge variant="default" className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              Connected
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {status?.connected ? (
          <>
            <div className="rounded-lg bg-muted/50 p-4 space-y-2">
              {status.instanceUrl && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Instance</span>
                  <span className="text-sm font-medium truncate max-w-[200px]">
                    {status.instanceUrl}
                  </span>
                </div>
              )}
              {status.instanceVersion && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Version</span>
                  <span className="text-sm">v{status.instanceVersion}</span>
                </div>
              )}
              {status.lastSyncAt && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Last Sync</span>
                  <span className="text-sm">{new Date(status.lastSyncAt).toLocaleString()}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Sync Status</span>
                <Badge variant={status.lastSyncStatus === 'success' ? 'secondary' : 'outline'}>
                  {status.lastSyncStatus || 'Never synced'}
                </Badge>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="default"
                onClick={() => syncAllMutation.mutate()}
                disabled={syncAllMutation.isPending}
                data-testid="button-firefly-sync"
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${syncAllMutation.isPending ? 'animate-spin' : ''}`}
                />
                Sync All Records
              </Button>
              <Button
                variant="destructive"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                data-testid="button-firefly-disconnect"
              >
                <Link2Off className="h-4 w-4 mr-2" />
                Disconnect
              </Button>
            </div>
          </>
        ) : showForm ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="instanceUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Firefly III URL</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="https://firefly.example.com"
                        data-testid="input-firefly-url"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="accessToken"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Personal Access Token</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="Enter your Personal Access Token"
                        data-testid="input-firefly-token"
                      />
                    </FormControl>
                    <FormMessage />
                    <p className="text-xs text-muted-foreground">
                      Generate a token in Firefly III: Profile {'>'} OAuth {'>'} Personal Access
                      Tokens
                    </p>
                  </FormItem>
                )}
              />
              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={connectMutation.isPending}
                  data-testid="button-firefly-connect-submit"
                >
                  {connectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Connect
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowForm(false)}
                  data-testid="button-firefly-cancel"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Connect to your self-hosted Firefly III instance to automatically sync expenses and
              income from your documents.
            </p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Sync expenses from scanned documents
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Track income automatically
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Create transactions in Firefly III
              </li>
            </ul>
            <Button onClick={() => setShowForm(true)} data-testid="button-firefly-connect">
              <Link2 className="h-4 w-4 mr-2" />
              Connect Firefly III
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ProfileSettings() {
  const { toast } = useToast();
  const { user: authUser, logout } = useAuth();

  const { data: profileData, isLoading } = useQuery<{ user: UserProfile }>({
    queryKey: ['/api/auth/me'],
  });

  const profile = profileData?.user;

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      fullName: '',
      email: '',
    },
  });

  useEffect(() => {
    if (profile) {
      form.reset({
        fullName: profile.fullName,
        email: profile.email,
      });
    }
  }, [profile, form]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormValues) => {
      const res = await apiRequest('PATCH', '/api/auth/profile', data);
      return res.json();
    },
    onSuccess: (data: { user: UserProfile }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      localStorage.setItem('user', JSON.stringify(data.user));
      toast({
        title: 'Profile Updated',
        description: 'Your profile has been updated successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Update Failed',
        description: error?.message || 'Failed to update profile. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: ProfileFormValues) => {
    updateProfileMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <Card data-testid="card-profile-settings">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile Information
          </CardTitle>
          <CardDescription>Loading your profile...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-muted rounded" />
            <div className="h-10 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const initials =
    profile?.fullName
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase() || '?';

  return (
    <Card data-testid="card-profile-settings">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Profile Information
        </CardTitle>
        <CardDescription>Update your personal information</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 mb-6">
          <Avatar className="h-16 w-16">
            <AvatarImage src={profile?.profilePhoto || undefined} alt={profile?.fullName} />
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{profile?.fullName}</p>
            <p className="text-sm text-muted-foreground">{profile?.email}</p>
            <Badge variant="secondary" className="mt-1">
              {profile?.role === 'client' ? 'Client' : profile?.role}
            </Badge>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Enter your full name"
                      data-testid="input-fullname"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Address</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="email"
                      placeholder="Enter your email"
                      data-testid="input-email"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              disabled={updateProfileMutation.isPending}
              data-testid="button-save-profile"
            >
              {updateProfileMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function PasswordSettings() {
  const { toast } = useToast();

  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      apiRequest('POST', '/api/auth/change-password', data),
    onSuccess: () => {
      form.reset();
      toast({
        title: 'Password Changed',
        description: 'Your password has been changed successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Password Change Failed',
        description: error?.message || 'Failed to change password. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: PasswordFormValues) => {
    changePasswordMutation.mutate({
      currentPassword: data.currentPassword,
      newPassword: data.newPassword,
    });
  };

  return (
    <Card data-testid="card-password-settings">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          Change Password
        </CardTitle>
        <CardDescription>Update your account password</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current Password</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="password"
                      placeholder="Enter current password"
                      data-testid="input-current-password"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New Password</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="password"
                      placeholder="Enter new password"
                      data-testid="input-new-password"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm New Password</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="password"
                      placeholder="Confirm new password"
                      data-testid="input-confirm-password"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              disabled={changePasswordMutation.isPending}
              data-testid="button-change-password"
            >
              {changePasswordMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Change Password
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function SubscriptionSettings() {
  const { data: profileData, isLoading } = useQuery<{ user: UserProfile }>({
    queryKey: ['/api/auth/me'],
  });

  const profile = profileData?.user;

  const tierNames: Record<string, string> = {
    free: 'Free',
    basic: 'Basic',
    pro: 'Pro',
    team: 'Team',
    enterprise: 'Enterprise',
  };

  const tierColors: Record<string, string> = {
    free: 'secondary',
    basic: 'default',
    pro: 'default',
    team: 'default',
    enterprise: 'default',
  };

  if (isLoading) {
    return (
      <Card data-testid="card-subscription-settings">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Subscription
          </CardTitle>
          <CardDescription>Loading subscription information...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-muted rounded" />
            <div className="h-20 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-subscription-settings">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Subscription
        </CardTitle>
        <CardDescription>Manage your subscription plan</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Current Plan</p>
            <p className="text-sm text-muted-foreground">Your active subscription</p>
          </div>
          <Badge
            variant={tierColors[profile?.subscriptionTier || 'free'] as any}
            className="text-sm"
          >
            {tierNames[profile?.subscriptionTier || 'free'] || profile?.subscriptionTier}
          </Badge>
        </div>

        <Separator />

        <div className="space-y-3">
          <p className="font-medium text-sm">Usage This Month</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-2xl font-bold">{profile?.casesCount || 0}</p>
              <p className="text-xs text-muted-foreground">Active Cases</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-2xl font-bold">{profile?.violationsCountThisMonth || 0}</p>
              <p className="text-xs text-muted-foreground">Violations Logged</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-2xl font-bold">{profile?.voiceTranscriptionsThisMonth || 0}</p>
              <p className="text-xs text-muted-foreground">Voice Transcriptions</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-2xl font-bold">{profile?.mediaUploadsThisMonth || 0}</p>
              <p className="text-xs text-muted-foreground">Media Uploads</p>
            </div>
          </div>
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Subscription Status</p>
            <p className="text-sm text-muted-foreground">
              {profile?.subscriptionStatus === 'active'
                ? 'Your subscription is active'
                : 'Subscription inactive'}
            </p>
          </div>
          <Badge variant={profile?.subscriptionStatus === 'active' ? 'default' : 'secondary'}>
            {profile?.subscriptionStatus === 'active' ? (
              <span className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                Active
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {profile?.subscriptionStatus || 'Inactive'}
              </span>
            )}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function DemoDataReset() {
  const { toast } = useToast();
  const { environment, user } = useAuth();
  const userId = user?.id;
  const [isResetting, setIsResetting] = useState(false);
  const [isErasing, setIsErasing] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/test-user/seed-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId || '',
          'X-Environment': environment || 'demo',
        },
      });
      if (!res.ok) throw new Error('Seed failed');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast({
        title: 'Sample Data Added',
        description: 'Your sandbox now has sample financial data. Refreshing...',
      });
      setIsSeeding(false);
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    },
    onError: () => {
      toast({
        title: 'Seed Failed',
        description: 'Failed to add sample data. Please try again.',
        variant: 'destructive',
      });
      setIsSeeding(false);
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/demo/reset'),
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast({
        title: 'Demo Data Reset',
        description:
          'All demo data has been cleared and reset with fresh sample data. Refreshing...',
      });
      setIsResetting(false);
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    },
    onError: () => {
      toast({
        title: 'Reset Failed',
        description: 'Failed to reset demo data. Please try again.',
        variant: 'destructive',
      });
      setIsResetting(false);
    },
  });

  const eraseMutation = useMutation({
    mutationFn: () =>
      fetch('/api/demo/erase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Environment': environment || 'demo',
        },
      }).then((res) => {
        if (!res.ok) throw new Error('Erase failed');
        return res.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast({
        title: 'Data Erased',
        description: 'All your data has been completely erased. Refreshing...',
      });
      setIsErasing(false);
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    },
    onError: () => {
      toast({
        title: 'Erase Failed',
        description: 'Failed to erase data. Please try again.',
        variant: 'destructive',
      });
      setIsErasing(false);
    },
  });

  // Check if user is in a demo or test environment
  const isTestUser = environment?.startsWith('demo-test');
  const isDemoOrTest = environment === 'demo' || isTestUser;

  if (!isDemoOrTest) {
    return null;
  }

  return (
    <Card data-testid="card-demo-reset">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RotateCcw className="h-5 w-5" />
          {isTestUser ? 'Test Environment' : 'Demo Data'}
        </CardTitle>
        <CardDescription>
          {isTestUser
            ? `You're in sandbox: ${environment}. Your data won't be auto-reset.`
            : 'Reset or erase demo data'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isTestUser && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Reset with Sample Data</p>
            <p className="text-sm text-muted-foreground">
              Clears all data and regenerates fresh sample data to explore the app.
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="w-full" data-testid="button-reset-demo-data">
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset with Sample Data
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset Demo Data?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will delete all your current demo data and regenerate fresh sample data.
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      setIsResetting(true);
                      resetMutation.mutate();
                    }}
                    data-testid="button-confirm-reset"
                  >
                    {isResetting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Resetting...
                      </>
                    ) : (
                      'Reset with Sample Data'
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {isTestUser && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Populate Sample Data</p>
            <p className="text-sm text-muted-foreground">
              Add sample financial records to explore the app's features.
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setIsSeeding(true);
                seedMutation.mutate();
              }}
              disabled={isSeeding}
              data-testid="button-seed-sample-data"
            >
              {isSeeding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding Data...
                </>
              ) : (
                <>
                  <Database className="mr-2 h-4 w-4" />
                  Populate with Sample Data
                </>
              )}
            </Button>
          </div>
        )}

        <div className={!isTestUser ? 'border-t pt-4 space-y-2' : 'border-t pt-4 space-y-2'}>
          <p className="text-sm font-medium">Erase All Data</p>
          <p className="text-sm text-muted-foreground">
            {isTestUser
              ? 'Clears all your test data. Start fresh with an empty sandbox.'
              : 'Completely clears all demo data without regenerating sample data. Start from scratch.'}
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full" data-testid="button-erase-demo-data">
                <Trash2 className="mr-2 h-4 w-4" />
                Erase All Data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Erase All Demo Data?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete ALL your demo data including financial records,
                  documents, violations, journals, conversations, and recommendations. No sample
                  data will be regenerated. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    setIsErasing(true);
                    eraseMutation.mutate();
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  data-testid="button-confirm-erase"
                >
                  {isErasing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Erasing...
                    </>
                  ) : (
                    'Yes, Erase Everything'
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

interface UserDevice {
  id: string;
  deviceName: string;
  deviceType: string;
  browser: string | null;
  os: string | null;
  isTrusted: boolean;
  isBlocked: boolean;
  lastActiveAt: string | null;
  createdAt: string;
}

interface AuthSession {
  id: string;
  deviceId: string | null;
  ipAddress: string | null;
  lastActiveAt: string | null;
  createdAt: string;
  expiresAt: string;
  isActive: boolean;
  isCurrent?: boolean;
}

interface SecurityEvent {
  id: string;
  eventType: string;
  eventStatus: string;
  ipAddress: string | null;
  deviceFingerprint: string | null;
  createdAt: string;
}

function SecuritySettings() {
  const { toast } = useToast();
  const [revokingSession, setRevokingSession] = useState<string | null>(null);

  const { data: devicesData, isLoading: devicesLoading } = useQuery<{ devices: UserDevice[] }>({
    queryKey: ['/api/security/devices'],
  });

  const { data: sessionsData, isLoading: sessionsLoading } = useQuery<{ sessions: AuthSession[] }>({
    queryKey: ['/api/security/sessions'],
  });

  const { data: eventsData, isLoading: eventsLoading } = useQuery<{ events: SecurityEvent[] }>({
    queryKey: ['/api/security/events'],
  });

  const revokeSessionMutation = useMutation({
    mutationFn: (sessionId: string) =>
      apiRequest('POST', `/api/security/sessions/${sessionId}/revoke`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/security/sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/security/events'] });
      toast({
        title: 'Session Revoked',
        description: 'The session has been terminated successfully.',
      });
      setRevokingSession(null);
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to revoke session. Please try again.',
        variant: 'destructive',
      });
      setRevokingSession(null);
    },
  });

  const revokeAllSessionsMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/security/sessions/revoke-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/security/sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/security/events'] });
      toast({
        title: 'All Sessions Revoked',
        description: 'All sessions except the current one have been terminated.',
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

  const blockDeviceMutation = useMutation({
    mutationFn: (deviceId: string) => apiRequest('POST', `/api/security/devices/${deviceId}/block`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/security/devices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/security/sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/security/events'] });
      toast({
        title: 'Device Blocked',
        description: 'This device has been blocked and all its sessions terminated.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to block device. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType?.toLowerCase()) {
      case 'mobile':
        return <Smartphone className="h-5 w-5" />;
      case 'tablet':
        return <Monitor className="h-5 w-5" />;
      case 'desktop':
        return <Laptop className="h-5 w-5" />;
      default:
        return <Globe className="h-5 w-5" />;
    }
  };

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

  const devices = devicesData?.devices || [];
  const sessions = sessionsData?.sessions || [];
  const events = eventsData?.events || [];

  return (
    <div className="space-y-6">
      <Card data-testid="card-active-sessions">
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Active Sessions
              </CardTitle>
              <CardDescription>Manage your logged-in sessions across devices</CardDescription>
            </div>
            {sessions.length > 1 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-revoke-all-sessions">
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out Everywhere
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Sign out of all devices?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will terminate all sessions except your current one. You'll need to sign
                      in again on other devices.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => revokeAllSessionsMutation.mutate()}
                      data-testid="button-confirm-revoke-all"
                    >
                      {revokeAllSessionsMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Signing Out...
                        </>
                      ) : (
                        'Sign Out Everywhere'
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {sessionsLoading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-16 bg-muted rounded" />
              <div className="h-16 bg-muted rounded" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active sessions found.</p>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${session.isCurrent ? 'bg-primary/5 border-primary/20' : 'bg-muted/50'}`}
                  data-testid={`session-${session.id}`}
                >
                  <div className="flex items-center gap-3">
                    <Globe className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">
                          {session.ipAddress || 'Unknown location'}
                        </p>
                        {session.isCurrent && (
                          <Badge variant="default" className="text-xs">
                            Current
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Last active:{' '}
                        {session.lastActiveAt ? formatTimeAgo(session.lastActiveAt) : 'Unknown'}
                      </p>
                    </div>
                  </div>
                  {!session.isCurrent && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setRevokingSession(session.id);
                        revokeSessionMutation.mutate(session.id);
                      }}
                      disabled={revokingSession === session.id}
                      data-testid={`button-revoke-session-${session.id}`}
                    >
                      {revokingSession === session.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <LogOut className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-trusted-devices">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Your Devices
          </CardTitle>
          <CardDescription>Devices that have logged into your account</CardDescription>
        </CardHeader>
        <CardContent>
          {devicesLoading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-16 bg-muted rounded" />
              <div className="h-16 bg-muted rounded" />
            </div>
          ) : devices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No devices found.</p>
          ) : (
            <div className="space-y-3">
              {devices.map((device) => (
                <div
                  key={device.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${device.isBlocked ? 'bg-destructive/5 border-destructive/20' : 'bg-muted/50'}`}
                  data-testid={`device-${device.id}`}
                >
                  <div className="flex items-center gap-3">
                    {getDeviceIcon(device.deviceType)}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{device.deviceName}</p>
                        {device.isTrusted && (
                          <Badge variant="secondary" className="text-xs">
                            Trusted
                          </Badge>
                        )}
                        {device.isBlocked && (
                          <Badge variant="destructive" className="text-xs">
                            Blocked
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {[device.browser, device.os].filter(Boolean).join(' on ') ||
                          'Unknown browser/OS'}
                        {device.lastActiveAt &&
                          ` • Last seen: ${formatTimeAgo(device.lastActiveAt)}`}
                      </p>
                    </div>
                  </div>
                  {!device.isBlocked && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`button-block-device-${device.id}`}
                        >
                          <ShieldAlert className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Block this device?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will block "{device.deviceName}" and terminate all sessions from
                            this device. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => blockDeviceMutation.mutate(device.id)}
                            className="bg-destructive text-destructive-foreground"
                            data-testid="button-confirm-block-device"
                          >
                            Block Device
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-security-events">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Recent Security Activity
          </CardTitle>
          <CardDescription>Review recent login attempts and security events</CardDescription>
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
            <div className="space-y-2">
              {events.slice(0, 10).map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                  data-testid={`event-${event.id}`}
                >
                  <div className="flex items-center gap-3">
                    {getEventIcon(event.eventType, event.eventStatus)}
                    <div>
                      <p className="text-sm">{formatEventType(event.eventType)}</p>
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
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Settings() {
  return (
    <div className="container mx-auto p-6 space-y-6 pb-24 md:pb-6" data-testid="page-settings">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account and integrations</p>
      </div>

      <Tabs defaultValue="integrations" className="w-full">
        <TabsList>
          <TabsTrigger value="integrations" data-testid="tab-integrations">
            Integrations
          </TabsTrigger>
          <TabsTrigger value="account" data-testid="tab-account">
            Account
          </TabsTrigger>
          <TabsTrigger value="security" data-testid="tab-security">
            Security
          </TabsTrigger>
          <TabsTrigger value="data" data-testid="tab-data">
            Data
          </TabsTrigger>
        </TabsList>

        <TabsContent value="integrations" className="mt-6 space-y-6">
          <div className="grid gap-6">
            <GoogleIntegrations />
            <QuickBooksIntegration />
            <FireflyIntegration />
          </div>
        </TabsContent>

        <TabsContent value="account" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-6">
              <ProfileSettings />
              <PasswordSettings />
            </div>
            <div>
              <SubscriptionSettings />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="security" className="mt-6">
          <div className="max-w-2xl">
            <SecuritySettings />
          </div>
        </TabsContent>

        <TabsContent value="data" className="mt-6">
          <div className="max-w-md">
            <DemoDataReset />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
