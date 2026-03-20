import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/lib/supabase';

export type WorkspaceType = 'firm' | 'consumer';
export type PlatformRole = 'super_admin' | 'support_admin' | null;
export type WorkspaceRole = 'firm_owner' | 'firm_admin' | 'firm_staff' | 'client' | 'consumer';

export interface Workspace {
  id: string;
  name: string;
  type: WorkspaceType;
  status: 'active' | 'pending' | 'suspended';
  created_at: string;
}

export interface WorkspaceMembership {
  workspace_id: string;
  workspace_name: string;
  workspace_type: WorkspaceType;
  workspace_status: string;
  role: WorkspaceRole;
  is_primary: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  platform_role: PlatformRole;
  created_at: string;
}

interface WorkspaceState {
  profile: UserProfile | null;
  workspaces: WorkspaceMembership[];
  activeWorkspaceId: string | null;
  activeWorkspace: WorkspaceMembership | null;
  loading: boolean;
  initialized: boolean;

  // Actions
  setProfile: (profile: UserProfile | null) => void;
  setWorkspaces: (workspaces: WorkspaceMembership[]) => void;
  setActiveWorkspaceId: (workspaceId: string | null) => void;
  setLoading: (loading: boolean) => void;

  // Async actions
  loadProfile: (userId: string) => Promise<void>;
  loadWorkspaces: (userId: string) => Promise<void>;
  switchWorkspace: (workspaceId: string) => void;
  initialize: (userId: string) => Promise<void>;
  reset: () => void;

  // Computed
  isPlatformAdmin: () => boolean;
  isSuperAdmin: () => boolean;
  hasWorkspaceRole: (role: WorkspaceRole) => boolean;
  canAccessSuperAdmin: () => boolean;
  canAccessFirmDashboard: () => boolean;
  canAccessConsumerDashboard: () => boolean;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      profile: null,
      workspaces: [],
      activeWorkspaceId: null,
      activeWorkspace: null,
      loading: false,
      initialized: false,

      setProfile: (profile) => set({ profile }),

      setWorkspaces: (workspaces) => {
        const state = get();
        set({ workspaces });

        // Auto-select workspace if none selected
        if (!state.activeWorkspaceId && workspaces.length > 0) {
          const primary = workspaces.find((w) => w.is_primary) || workspaces[0];
          set({
            activeWorkspaceId: primary.workspace_id,
            activeWorkspace: primary,
          });
        } else if (state.activeWorkspaceId) {
          // Update active workspace data
          const active = workspaces.find((w) => w.workspace_id === state.activeWorkspaceId);
          set({ activeWorkspace: active || null });
        }
      },

      setActiveWorkspaceId: (workspaceId) => {
        const state = get();
        const workspace = state.workspaces.find((w) => w.workspace_id === workspaceId);
        set({
          activeWorkspaceId: workspaceId,
          activeWorkspace: workspace || null,
        });
      },

      setLoading: (loading) => set({ loading }),

      loadProfile: async (userId: string) => {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

          if (error) throw error;
          set({ profile: data });
        } catch (error) {
          console.error('Failed to load profile:', error);
          throw error;
        }
      },

      loadWorkspaces: async (userId: string) => {
        try {
          const { data, error } = await supabase
            .from('active_workspace_memberships')
            .select('*')
            .eq('user_id', userId)
            .order('is_primary', { ascending: false })
            .order('created_at', { ascending: true });

          if (error) throw error;
          get().setWorkspaces(data || []);
        } catch (error) {
          console.error('Failed to load workspaces:', error);
          throw error;
        }
      },

      switchWorkspace: (workspaceId: string) => {
        const state = get();
        const workspace = state.workspaces.find((w) => w.workspace_id === workspaceId);

        if (workspace) {
          set({
            activeWorkspaceId: workspaceId,
            activeWorkspace: workspace,
          });

          // Trigger page navigation based on workspace type
          if (typeof window !== 'undefined') {
            if (workspace.workspace_type === 'firm') {
              window.location.href = '/firm';
            } else {
              window.location.href = '/app';
            }
          }
        }
      },

      initialize: async (userId: string) => {
        if (get().initialized) return;

        set({ loading: true });
        try {
          await Promise.all([get().loadProfile(userId), get().loadWorkspaces(userId)]);
          set({ initialized: true, loading: false });
        } catch (error) {
          console.error('Failed to initialize workspace store:', error);
          set({ loading: false, initialized: true });
          throw error;
        }
      },

      reset: () => {
        set({
          profile: null,
          workspaces: [],
          activeWorkspaceId: null,
          activeWorkspace: null,
          loading: false,
          initialized: false,
        });
      },

      // Computed properties
      isPlatformAdmin: () => {
        const { profile } = get();
        return (
          profile?.platform_role === 'super_admin' || profile?.platform_role === 'support_admin'
        );
      },

      isSuperAdmin: () => {
        const { profile } = get();
        return profile?.platform_role === 'super_admin';
      },

      hasWorkspaceRole: (role: WorkspaceRole) => {
        const { activeWorkspace } = get();
        return activeWorkspace?.role === role;
      },

      canAccessSuperAdmin: () => {
        return get().isPlatformAdmin();
      },

      canAccessFirmDashboard: () => {
        const { activeWorkspace } = get();
        return (
          activeWorkspace?.workspace_type === 'firm' &&
          ['firm_owner', 'firm_admin', 'firm_staff'].includes(activeWorkspace.role)
        );
      },

      canAccessConsumerDashboard: () => {
        const { activeWorkspace } = get();
        return (
          activeWorkspace?.workspace_type === 'consumer' && activeWorkspace.role === 'consumer'
        );
      },
    }),
    {
      name: 'workspace-storage',
      partialize: (state) => ({
        activeWorkspaceId: state.activeWorkspaceId,
        profile: state.profile,
      }),
    }
  )
);
