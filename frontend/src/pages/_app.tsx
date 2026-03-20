import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { Analytics } from '@vercel/analytics/next';

export default function App({ Component, pageProps }: AppProps) {
  const { initialize: initializeAuth, user } = useAuthStore();
  const { initialize: initializeWorkspace, initialized: workspaceInitialized } =
    useWorkspaceStore();

  useEffect(() => {
    // Initialize auth on app start
    initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    // Initialize workspace context when user is authenticated
    if (user && !workspaceInitialized) {
      initializeWorkspace(user.id).catch((error) => {
        console.error('Failed to initialize workspace:', error);
      });
    }
  }, [user, workspaceInitialized, initializeWorkspace]);

  return (
    <>
      <Component {...pageProps} />
      <Analytics />
    </>
  );
}
