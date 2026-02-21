import { useEffect, ReactNode } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/store/authStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

interface AuthGuardProps {
  children: ReactNode;
  requireAuth?: boolean;
}

export default function AuthGuard({ children, requireAuth = true }: AuthGuardProps) {
  const router = useRouter();
  const { user, loading: authLoading, initialized: authInitialized, initialize: initializeAuth } = useAuthStore();
  const { initialize: initializeWorkspace, initialized: workspaceInitialized, loading: workspaceLoading } = useWorkspaceStore();

  useEffect(() => {
    if (!authInitialized) {
      initializeAuth();
    }
  }, [authInitialized, initializeAuth]);

  useEffect(() => {
    if (authInitialized && user && !workspaceInitialized) {
      initializeWorkspace(user.id).catch(error => {
        console.error('Failed to initialize workspace:', error);
      });
    }
  }, [authInitialized, user, workspaceInitialized, initializeWorkspace]);

  useEffect(() => {
    if (!authLoading && authInitialized && requireAuth && !user) {
      router.push('/auth/login');
    }
  }, [authLoading, authInitialized, requireAuth, user, router]);

  // Show loading state
  if (authLoading || !authInitialized || (user && (workspaceLoading || !workspaceInitialized))) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect if auth required but no user
  if (requireAuth && !user) {
    return null;
  }

  return <>{children}</>;
}
