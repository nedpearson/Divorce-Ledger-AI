import { useState, useEffect, lazy, Suspense } from 'react';
import { Switch, Route, Redirect, useLocation } from 'wouter';
import { queryClient } from './lib/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/lib/theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { SubscriptionProvider } from '@/lib/subscription';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import { SubscriptionBadge } from '@/components/upgrade-prompt';
import { DrilldownProvider } from '@/lib/drilldown-context';
import { Bell, Loader2, RefreshCw, TestTube2 } from 'lucide-react';
import { NotificationsBell } from '@/components/notifications-bell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GlobalSecurityBanner } from '@/components/security-banner';

function GlobalDemoBanner() {
  const { environment, isAuthenticated } = useAuth();
  if (environment !== 'demo' || !isAuthenticated) return null;

  return (
    <div className="bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400 border-b border-red-200 dark:border-red-900/50 text-xs py-2 px-4 text-center font-medium flex items-center justify-center shadow-sm w-full shrink-0 z-[100]">
      <span className="flex items-center gap-2">
        <TestTube2 className="h-4 w-4" />
        DEMO ENVIRONMENT — Any changes made here are isolated and will reset automatically.
      </span>
    </div>
  );
}

import Landing from '@/pages/landing';
import Login from '@/pages/login';
import Signup from '@/pages/signup';
import ForgotPassword from '@/pages/forgot-password';
import ResetPassword from '@/pages/reset-password';
import Home from '@/pages/home';
import Dashboard from '@/pages/dashboard';
import NotFound from '@/pages/not-found';

const Finances = lazy(() => import('@/pages/finances'));
const Violations = lazy(() => import('@/pages/violations'));
const Timeline = lazy(() => import('@/pages/timeline'));
const Communication = lazy(() => import('@/pages/communication'));
const Communications = lazy(() => import('@/pages/communications'));
const Journal = lazy(() => import('@/pages/journal'));
const CaseBuilder = lazy(() => import('@/pages/case-builder'));
const Pricing = lazy(() => import('@/pages/pricing'));
const DemoPresentation = lazy(() => import('@/pages/demo-presentation'));
const WorkspaceSetup = lazy(() => import('@/pages/workspace-setup'));
const WorkspaceSettings = lazy(() => import('@/pages/workspace-settings'));
const Calendar = lazy(() => import('@/pages/calendar'));
const Legal = lazy(() => import('@/pages/legal'));
const ChildSupport = lazy(() => import('@/pages/child-support'));
const Property = lazy(() => import('@/pages/property'));
const AICoach = lazy(() => import('@/pages/ai-coach'));
const AnalyticsDashboard = lazy(() => import('@/pages/analytics-dashboard'));
const Settings = lazy(() => import('@/pages/settings'));
const Governance = lazy(() => import('@/pages/governance'));
const Mobile = lazy(() => import('@/pages/mobile'));
const MobileInstall = lazy(() => import('@/pages/mobile-install'));
const MobileLink = lazy(() => import('@/pages/mobile-link'));
const AdminUsers = lazy(() => import('@/pages/admin-users'));
const Recommendations = lazy(() => import('@/pages/recommendations'));
const AdminRecommendations = lazy(() => import('@/pages/admin-recommendations'));
const Changelog = lazy(() => import('@/pages/changelog'));
const AdminPanel = lazy(() => import('@/pages/admin'));
const SuperAdmin = lazy(() => import('@/pages/superadmin'));
const DocumentManager = lazy(() => import('@/pages/document-manager'));
import { MobileBottomNav } from '@/components/mobile-bottom-nav';
import { QuickCaptureSheet } from '@/components/quick-capture-sheet';
import { PWAInstallPrompt } from '@/components/pwa-install-prompt';
import { SyncStatusIndicator } from '@/components/sync-status-indicator';
import { MobileAppHeaderButton } from '@/components/mobile-app-banner';
import { EnvironmentBadge } from '@/components/environment-badge';
import { ErrorBoundary } from '@/components/error-boundary';
import { GlobalBackButton } from '@/components/global-back-button';
import './lib/sentry'; // Initialize Sentry for error logging

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    const loginUrl = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
    return <Redirect to={loginUrl} />;
  }

  return <>{children}</>;
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

function AuthLayout({ children }: { children: React.ReactNode }) {
  const [captureOpen, setCaptureOpen] = useState(false);

  const style = {
    '--sidebar-width': '14rem',
    '--sidebar-width-icon': '3rem',
  };

  return (
    <DrilldownProvider>
      <SidebarProvider style={style as React.CSSProperties}>
        <div className="flex h-full w-full">
          <AppSidebar />
          <div className="flex flex-col flex-1 min-w-0">
            <header className="flex items-center justify-between gap-2 p-2 border-b h-14 shrink-0">
              <div className="flex items-center gap-2">
                <SidebarTrigger data-testid="button-sidebar-toggle" className="md:hidden" />
                <h1 className="font-semibold text-lg md:hidden">Divorce Ledger</h1>
              </div>
              <div className="flex items-center gap-2">
                <SubscriptionBadge />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    queryClient.invalidateQueries();
                    const now = Date.now();
                    const lastReload = parseInt(sessionStorage.getItem('lastManualReload') || '0');
                    if (now - lastReload > 5000) {
                      sessionStorage.setItem('lastManualReload', now.toString());
                      window.location.reload();
                    }
                  }}
                  title="Refresh application data"
                  data-testid="button-refresh-all"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <NotificationsBell />
                <SyncStatusIndicator />
                <MobileAppHeaderButton />
                <ThemeToggle />
              </div>
            </header>
            <main className="flex-1 overflow-auto bg-background pb-20 md:pb-0">
              <Suspense fallback={<PageLoader />}>{children}</Suspense>
            </main>
          </div>
          <MobileBottomNav onCaptureClick={() => setCaptureOpen(true)} />
          <QuickCaptureSheet open={captureOpen} onOpenChange={setCaptureOpen} />
          <PWAInstallPrompt />
        </div>
      </SidebarProvider>
    </DrilldownProvider>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    if (location === '/' || location === '/login') return null;
    const redirectUrl = `/login?redirect=${encodeURIComponent(location)}`;
    return <Redirect to={redirectUrl} />;
  }

  return <>{children}</>;
}

import { useLoopWatchdog } from '@/hooks/use-loop-watchdog';

function Router() {
  useLoopWatchdog({
    maxRendersPerRoute: 50,
    timeWindowMs: 4000,
  });
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/admin" component={AdminPanel} />
      <Route path="/home">
        <RequireAuth>
          <AuthLayout>
            <Home />
          </AuthLayout>
        </RequireAuth>
      </Route>
      <Route path="/dashboard">
        <RequireAuth>
          <AuthLayout>
            <Dashboard />
          </AuthLayout>
        </RequireAuth>
      </Route>
      <Route path="/finances">
        <RequireAuth>
          <AuthLayout>
            <Finances />
          </AuthLayout>
        </RequireAuth>
      </Route>
      <Route path="/documents">
        <RequireAuth>
          <AuthLayout>
            <DocumentManager />
          </AuthLayout>
        </RequireAuth>
      </Route>
      <Route path="/document-intake">
        <Redirect to="/documents" />
      </Route>
      <Route path="/violations">
        <RequireAuth>
          <AuthLayout>
            <Violations />
          </AuthLayout>
        </RequireAuth>
      </Route>
      <Route path="/timeline">
        <RequireAuth>
          <AuthLayout>
            <Timeline />
          </AuthLayout>
        </RequireAuth>
      </Route>
      <Route path="/case-builder">
        <RequireAuth>
          <AuthLayout>
            <CaseBuilder />
          </AuthLayout>
        </RequireAuth>
      </Route>
      <Route path="/communication">
        <RequireAuth>
          <AuthLayout>
            <Communication />
          </AuthLayout>
        </RequireAuth>
      </Route>
      <Route path="/communications">
        <RequireAuth>
          <AuthLayout>
            <Communications />
          </AuthLayout>
        </RequireAuth>
      </Route>
      <Route path="/journal">
        <RequireAuth>
          <AuthLayout>
            <Journal />
          </AuthLayout>
        </RequireAuth>
      </Route>
      <Route path="/calendar">
        <RequireAuth>
          <AuthLayout>
            <Calendar />
          </AuthLayout>
        </RequireAuth>
      </Route>
      <Route path="/legal">
        <RequireAuth>
          <AuthLayout>
            <Legal />
          </AuthLayout>
        </RequireAuth>
      </Route>
      <Route path="/child-support">
        <RequireAuth>
          <AuthLayout>
            <ChildSupport />
          </AuthLayout>
        </RequireAuth>
      </Route>
      <Route path="/property">
        <RequireAuth>
          <AuthLayout>
            <Property />
          </AuthLayout>
        </RequireAuth>
      </Route>
      <Route path="/analytics">
        <RequireAuth>
          <AuthLayout>
            <AnalyticsDashboard />
          </AuthLayout>
        </RequireAuth>
      </Route>
      <Route path="/ai-coach">
        <RequireAuth>
          <AuthLayout>
            <AICoach />
          </AuthLayout>
        </RequireAuth>
      </Route>
      <Route path="/settings">
        <RequireAuth>
          <AuthLayout>
            <Settings />
          </AuthLayout>
        </RequireAuth>
      </Route>
      <Route path="/demo-presentation">
        <Suspense fallback={<PageLoader />}>
          <DemoPresentation />
        </Suspense>
      </Route>
      <Route path="/pricing">
        <Suspense fallback={<PageLoader />}>
          <Pricing />
        </Suspense>
      </Route>
      <Route path="/workspace-setup">
        <RequireAuth>
          <Suspense fallback={<PageLoader />}>
            <WorkspaceSetup />
          </Suspense>
        </RequireAuth>
      </Route>
      <Route path="/workspace/:workspaceId/settings">
        <RequireAuth>
          <AuthLayout>
            <Suspense fallback={<PageLoader />}>
              <WorkspaceSettings />
            </Suspense>
          </AuthLayout>
        </RequireAuth>
      </Route>
      <Route path="/governance">
        <RequireAuth>
          <AuthLayout>
            <Governance />
          </AuthLayout>
        </RequireAuth>
      </Route>
      <Route path="/recommendations">
        <RequireAuth>
          <AuthLayout>
            <Recommendations />
          </AuthLayout>
        </RequireAuth>
      </Route>
      <Route path="/mobile">
        <RequireAuth>
          <Suspense fallback={<PageLoader />}>
            <Mobile />
          </Suspense>
        </RequireAuth>
      </Route>
      <Route path="/mobile-link">
        <Suspense fallback={<PageLoader />}>
          <MobileLink />
        </Suspense>
      </Route>
      <Route path="/mobile-install">
        <Suspense fallback={<PageLoader />}>
          <MobileInstall />
        </Suspense>
      </Route>
      <Route path="/admin/users">
        <RequireAuth>
          <AuthLayout>
            <AdminUsers />
          </AuthLayout>
        </RequireAuth>
      </Route>
      <Route path="/admin/recommendations">
        <RequireAuth>
          <AuthLayout>
            <AdminRecommendations />
          </AuthLayout>
        </RequireAuth>
      </Route>
      <Route path="/changelog">
        <RequireAuth>
          <AuthLayout>
            <Changelog />
          </AuthLayout>
        </RequireAuth>
      </Route>
      <Route path="/superadmin">
        <RequireAuth>
          <AuthLayout>
            <SuperAdmin />
          </AuthLayout>
        </RequireAuth>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function CacheClearer() {
  useEffect(() => {
    const checkVersionAndClearCache = async () => {
      try {
        const res = await fetch('/api/version');
        if (!res.ok) return;
        const data = await res.json();
        const serverVersion = data.version;
        const cachedVersion = localStorage.getItem('appVersion');

        if (cachedVersion && cachedVersion !== serverVersion) {
          queryClient.clear();
          if (import.meta.env.DEV) {
            console.info('Cache cleared due to app update');
          }
          // Do NOT reload here, let the user trigger it or wait for next manual reload
          localStorage.setItem('appVersion', serverVersion);
        }
      } catch (e) {
        // Ignore version check errors
      }
    };

    checkVersionAndClearCache();
  }, []);

  return null;
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <CacheClearer />
        <ThemeProvider>
          <AuthProvider>
            <SubscriptionProvider>
              <TooltipProvider>
                <div className="flex flex-col h-[100dvh] w-full overflow-hidden">
                  <GlobalDemoBanner />
                  <GlobalSecurityBanner />
                  <div className="flex-1 w-full min-h-0 relative overflow-y-auto">
                    <Toaster />
                    <GlobalBackButton />
                    <Router />
                  </div>
                </div>
              </TooltipProvider>
            </SubscriptionProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
