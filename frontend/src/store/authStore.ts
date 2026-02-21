import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '@supabase/supabase-js';
import { auth } from '@/lib/supabase';

interface AuthState {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setInitialized: (initialized: boolean) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      loading: false,
      initialized: false,

      setUser: (user) => set({ user }),
      setLoading: (loading) => set({ loading }),
      setInitialized: (initialized) => set({ initialized }),

      signIn: async (email, password) => {
        set({ loading: true });
        try {
          const { user } = await auth.signIn(email, password);
          set({ user, loading: false });
        } catch (error) {
          set({ loading: false });
          throw error;
        }
      },

      signUp: async (email, password, fullName) => {
        set({ loading: true });
        try {
          const { user } = await auth.signUp(email, password, { full_name: fullName });
          set({ user, loading: false });
        } catch (error) {
          set({ loading: false });
          throw error;
        }
      },

      signOut: async () => {
        set({ loading: true });
        try {
          await auth.signOut();
          set({ user: null, loading: false });
        } catch (error) {
          set({ loading: false });
          throw error;
        }
      },

      initialize: async () => {
        if (get().initialized) return;

        set({ loading: true });
        try {
          const user = await auth.getUser();
          set({ user, loading: false, initialized: true });

          // Listen to auth state changes
          auth.onAuthStateChange((user) => {
            set({ user });
          });
        } catch (error) {
          set({ loading: false, initialized: true });
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user }),
    }
  )
);
