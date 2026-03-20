import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';

export async function proxy(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createServerClient({ req, res });

  // Refresh session if expired
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { pathname } = req.nextUrl;

  // Public routes that don't require auth
  const publicRoutes = [
    '/',
    '/auth/login',
    '/auth/signup',
    '/auth/callback',
    '/auth/reset-password',
  ];
  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith('/api/health')
  );

  // Redirect logged-in users away from auth pages
  if (session && pathname.startsWith('/auth/') && pathname !== '/auth/callback') {
    return NextResponse.redirect(new URL('/', req.url));
  }

  // Allow public routes
  if (isPublicRoute) {
    return res;
  }

  // Require authentication for all other routes
  if (!session) {
    const redirectUrl = new URL('/auth/login', req.url);
    redirectUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Load user profile and check roles
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('platform_role')
      .eq('id', session.user.id)
      .single();

    // Super Admin routes
    if (pathname.startsWith('/superadmin')) {
      if (
        !profile?.platform_role ||
        !['super_admin', 'support_admin'].includes(profile.platform_role)
      ) {
        return NextResponse.redirect(new URL('/', req.url));
      }
      return res;
    }

    // Firm routes - check workspace membership
    if (pathname.startsWith('/firm')) {
      const { data: workspaces } = await supabase
        .from('active_workspace_memberships')
        .select('workspace_type, workspace_status, role')
        .eq('user_id', session.user.id)
        .eq('workspace_type', 'firm');

      const firmWorkspace = workspaces?.[0];

      if (!firmWorkspace) {
        return NextResponse.redirect(new URL('/', req.url));
      }

      // Check for pending approval
      if (firmWorkspace.workspace_status === 'pending') {
        if (pathname !== '/firm/pending') {
          return NextResponse.redirect(new URL('/firm/pending', req.url));
        }
        return res;
      }

      // Check for suspension
      if (firmWorkspace.workspace_status === 'suspended') {
        return NextResponse.redirect(new URL('/firm/suspended', req.url));
      }

      // Check role
      if (!['firm_owner', 'firm_admin', 'firm_staff'].includes(firmWorkspace.role)) {
        return NextResponse.redirect(new URL('/', req.url));
      }

      return res;
    }

    // Consumer routes
    if (pathname.startsWith('/app')) {
      const { data: workspaces } = await supabase
        .from('active_workspace_memberships')
        .select('workspace_type, workspace_status, role')
        .eq('user_id', session.user.id)
        .eq('workspace_type', 'consumer');

      const consumerWorkspace = workspaces?.[0];

      if (!consumerWorkspace || consumerWorkspace.role !== 'consumer') {
        return NextResponse.redirect(new URL('/', req.url));
      }

      // Check for pending approval
      if (consumerWorkspace.workspace_status === 'pending') {
        return NextResponse.redirect(new URL('/app/pending', req.url));
      }

      return res;
    }

    // Client portal routes
    if (pathname.startsWith('/client')) {
      const { data: matterAccess } = await supabase
        .from('matter_access')
        .select('matter_id')
        .eq('user_id', session.user.id)
        .limit(1);

      if (!matterAccess || matterAccess.length === 0) {
        return NextResponse.redirect(new URL('/', req.url));
      }

      return res;
    }
  } catch (error) {
    console.error('Proxy error:', error);
    // On error, redirect to login
    return NextResponse.redirect(new URL('/auth/login', req.url));
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
};
