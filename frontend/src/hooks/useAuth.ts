import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/store/authStore';

export function useAuth() {
  const router = useRouter();
  const { user, loading, initialized, signIn, signUp, signOut, initialize } = useAuthStore();

  useEffect(() => {
    if (!initialized) {
      initialize();
    }
  }, [initialized, initialize]);

  const requireAuth = () => {
    if (!loading && initialized && !user) {
      router.push('/auth/login');
    }
  };

  return {
    user,
    loading,
    initialized,
    signIn,
    signUp,
    signOut,
    requireAuth,
    isAuthenticated: !!user,
  };
}
