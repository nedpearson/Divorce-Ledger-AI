import { useState, useEffect } from 'react';
import AuthGuard from '@/components/guards/AuthGuard';
import RoleGuard from '@/components/guards/RoleGuard';
import { supabase } from '@/lib/supabase';
import { 
  BuildingOfficeIcon, 
  UserGroupIcon, 
  CheckCircleIcon, 
  XCircleIcon,
  ClockIcon,
  ChartBarIcon 
} from '@heroicons/react/24/outline';

interface Stats {
  totalWorkspaces: number;
  pendingApprovals: number;
  activeUsers: number;
  suspendedWorkspaces: number;
}

interface PendingWorkspace {
  id: string;
  name: string;
  type: string;
  owner_email: string;
  created_at: string;
}

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState<Stats>({
    totalWorkspaces: 0,
    pendingApprovals: 0,
    activeUsers: 0,
    suspendedWorkspaces: 0,
  });
  const [pendingWorkspaces, setPendingWorkspaces] = useState<PendingWorkspace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // Load stats
      const [workspacesRes, usersRes, pendingRes] = await Promise.all([
        supabase.from('workspaces').select('status', { count: 'exact' }),
        supabase.from('profiles').select('id', { count: 'exact' }),
        supabase.from('workspaces').select('*').eq('status', 'pending').limit(10),
      ]);

      const workspaces = workspacesRes.data || [];
      setStats({
        totalWorkspaces: workspaces.length,
        pendingApprovals: workspaces.filter(w => w.status === 'pending').length,
        activeUsers: usersRes.count || 0,
        suspendedWorkspaces: workspaces.filter(w => w.status === 'suspended').length,
      });

      // Load pending workspaces with owner info
      if (pendingRes.data) {
        const workspacesWithOwners = await Promise.all(
          pendingRes.data.map(async (workspace) => {
            const { data: member } = await supabase
              .from('workspace_members')
              .select('user_id')
              .eq('workspace_id', workspace.id)
              .eq('role', 'firm_owner')
              .single();

            let ownerEmail = 'Unknown';
            if (member) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('email')
                .eq('id', member.user_id)
                .single();
              ownerEmail = profile?.email || 'Unknown';
            }

            return {
              id: workspace.id,
              name: workspace.name,
              type: workspace.type,
              owner_email: ownerEmail,
              created_at: workspace.created_at,
            };
          })
        );
        setPendingWorkspaces(workspacesWithOwners);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (workspaceId: string) => {
    try {
      const { error } = await supabase
        .from('workspaces')
        .update({ status: 'active' })
        .eq('id', workspaceId);

      if (error) throw error;
      
      alert('Workspace approved successfully');
      loadDashboardData();
    } catch (error) {
      console.error('Failed to approve workspace:', error);
      alert('Failed to approve workspace');
    }
  };

  const handleReject = async (workspaceId: string) => {
    if (!confirm('Are you sure you want to reject this workspace?')) return;

    try {
      const { error } = await supabase
        .from('workspaces')
        .update({ status: 'suspended' })
        .eq('id', workspaceId);

      if (error) throw error;
      
      alert('Workspace rejected');
      loadDashboardData();
    } catch (error) {
      console.error('Failed to reject workspace:', error);
      alert('Failed to reject workspace');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <AuthGuard>
      <RoleGuard requirePlatformRole={['super_admin', 'support_admin']} fallbackPath="/">
        <div className="min-h-screen bg-gray-50">
          <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
            {/* Header */}
            <div className="px-4 py-6 sm:px-0">
              <h1 className="text-3xl font-bold text-gray-900">Super Admin Dashboard</h1>
              <p className="mt-2 text-gray-600">Platform overview and management</p>
            </div>

            {/* Stats Grid */}
            <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <BuildingOfficeIcon className="h-6 w-6 text-gray-400" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">Total Workspaces</dt>
                        <dd className="text-2xl font-semibold text-gray-900">{stats.totalWorkspaces}</dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <ClockIcon className="h-6 w-6 text-yellow-400" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">Pending Approvals</dt>
                        <dd className="text-2xl font-semibold text-yellow-600">{stats.pendingApprovals}</dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <UserGroupIcon className="h-6 w-6 text-green-400" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">Active Users</dt>
                        <dd className="text-2xl font-semibold text-gray-900">{stats.activeUsers}</dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <XCircleIcon className="h-6 w-6 text-red-400" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">Suspended</dt>
                        <dd className="text-2xl font-semibold text-red-600">{stats.suspendedWorkspaces}</dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Pending Approvals */}
            <div className="mt-8">
              <div className="bg-white shadow rounded-lg">
                <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">Pending Workspace Approvals</h3>
                </div>
                <div className="px-4 py-5 sm:p-6">
                  {pendingWorkspaces.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">No pending approvals</p>
                  ) : (
                    <ul className="divide-y divide-gray-200">
                      {pendingWorkspaces.map((workspace) => (
                        <li key={workspace.id} className="py-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h4 className="text-sm font-medium text-gray-900">{workspace.name}</h4>
                              <p className="text-sm text-gray-500">
                                Type: <span className="capitalize">{workspace.type}</span> • 
                                Owner: {workspace.owner_email}
                              </p>
                              <p className="text-xs text-gray-400 mt-1">
                                Created: {new Date(workspace.created_at).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="flex space-x-3">
                              <button
                                onClick={() => handleApprove(workspace.id)}
                                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
                              >
                                <CheckCircleIcon className="h-4 w-4 mr-1" />
                                Approve
                              </button>
                              <button
                                onClick={() => handleReject(workspace.id)}
                                className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                              >
                                <XCircleIcon className="h-4 w-4 mr-1" />
                                Reject
                              </button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Links */}
            <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
              <a
                href="/superadmin/workspaces"
                className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow"
              >
                <div className="px-4 py-5 sm:p-6">
                  <div className="flex items-center">
                    <BuildingOfficeIcon className="h-8 w-8 text-blue-500" />
                    <div className="ml-4">
                      <h3 className="text-lg font-medium text-gray-900">Manage Workspaces</h3>
                      <p className="text-sm text-gray-500">View and manage all workspaces</p>
                    </div>
                  </div>
                </div>
              </a>

              <a
                href="/superadmin/users"
                className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow"
              >
                <div className="px-4 py-5 sm:p-6">
                  <div className="flex items-center">
                    <UserGroupIcon className="h-8 w-8 text-blue-500" />
                    <div className="ml-4">
                      <h3 className="text-lg font-medium text-gray-900">User Management</h3>
                      <p className="text-sm text-gray-500">Search and manage users</p>
                    </div>
                  </div>
                </div>
              </a>

              <a
                href="/superadmin/audit"
                className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow"
              >
                <div className="px-4 py-5 sm:p-6">
                  <div className="flex items-center">
                    <ChartBarIcon className="h-8 w-8 text-blue-500" />
                    <div className="ml-4">
                      <h3 className="text-lg font-medium text-gray-900">Audit Logs</h3>
                      <p className="text-sm text-gray-500">View platform activity</p>
                    </div>
                  </div>
                </div>
              </a>
            </div>
          </div>
        </div>
      </RoleGuard>
    </AuthGuard>
  );
}
