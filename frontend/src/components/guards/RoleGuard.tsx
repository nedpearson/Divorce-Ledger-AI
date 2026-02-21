import { ReactNode } from 'react';
import { useRouter } from 'next/router';
import { useWorkspaceStore, PlatformRole, WorkspaceRole } from '@/store/workspaceStore';
import { useEffect } from 'react';

interface RoleGuardProps {
  children: ReactNode;
  requirePlatformRole?: PlatformRole[];
  requireWorkspaceRole?: WorkspaceRole[];
  requireWorkspaceType?: 'firm' | 'consumer';
  fallbackPath?: string;
}

export default function RoleGuard({
  children,
  requirePlatformRole,
  requireWorkspaceRole,
  requireWorkspaceType,
  fallbackPath = '/auth/login',
}: RoleGuardProps) {
  const router = useRouter();
  const { profile, activeWorkspace, initialized } = useWorkspaceStore();

  const hasAccess = (() => {
    if (!initialized) return false;

    // Check platform role
    if (requirePlatformRole && requirePlatformRole.length > 0) {
      if (!profile?.platform_role || !requirePlatformRole.includes(profile.platform_role)) {
        return false;
      }
    }

    // Check workspace role
    if (requireWorkspaceRole && requireWorkspaceRole.length > 0) {
      if (!activeWorkspace || !requireWorkspaceRole.includes(activeWorkspace.role)) {
        return false;
      }
    }

    // Check workspace type
    if (requireWorkspaceType) {
      if (!activeWorkspace || activeWorkspace.workspace_type !== requireWorkspaceType) {
        return false;
      }
    }

    return true;
  })();

  useEffect(() => {
    if (initialized && !hasAccess) {
      router.push(fallbackPath);
    }
  }, [initialized, hasAccess, fallbackPath, router]);

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return null;
  }

  return <>{children}</>;
}
