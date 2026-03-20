import { useState, useEffect } from 'react';
import AuthGuard from '@/components/guards/AuthGuard';
import RoleGuard from '@/components/guards/RoleGuard';
import WorkspaceStatusGuard from '@/components/guards/WorkspaceStatusGuard';
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { supabase } from '@/lib/supabase';
import {
  BriefcaseIcon,
  UserGroupIcon,
  DocumentTextIcon,
  PlusIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';

interface Matter {
  id: string;
  matter_number: string;
  title: string;
  status: string;
  created_at: string;
  client_name?: string;
}

interface Stats {
  totalMatters: number;
  activeMatters: number;
  teamMembers: number;
  documentsCount: number;
}

export default function FirmDashboard() {
  const { activeWorkspaceId } = useWorkspaceStore();
  const [matters, setMatters] = useState<Matter[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalMatters: 0,
    activeMatters: 0,
    teamMembers: 0,
    documentsCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (activeWorkspaceId) {
      loadDashboardData();
    }
  }, [activeWorkspaceId]);

  const loadDashboardData = async () => {
    if (!activeWorkspaceId) return;

    try {
      setLoading(true);

      // Load matters
      const { data: mattersData, error: mattersError } = await supabase
        .from('matters')
        .select('*')
        .eq('workspace_id', activeWorkspaceId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (mattersError) throw mattersError;

      // Load stats
      const [allMattersRes, teamRes, docsRes] = await Promise.all([
        supabase
          .from('matters')
          .select('status', { count: 'exact' })
          .eq('workspace_id', activeWorkspaceId),
        supabase
          .from('workspace_members')
          .select('id', { count: 'exact' })
          .eq('workspace_id', activeWorkspaceId),
        supabase
          .from('documents')
          .select('id', { count: 'exact' })
          .eq('workspace_id', activeWorkspaceId),
      ]);

      const allMatters = allMattersRes.data || [];
      setStats({
        totalMatters: allMatters.length,
        activeMatters: allMatters.filter((m) => m.status === 'active').length,
        teamMembers: teamRes.count || 0,
        documentsCount: docsRes.count || 0,
      });

      setMatters(mattersData || []);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthGuard>
      <RoleGuard
        requireWorkspaceType="firm"
        requireWorkspaceRole={['firm_owner', 'firm_admin', 'firm_staff']}
        fallbackPath="/"
      >
        <WorkspaceStatusGuard>
          <div className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
              {/* Header with Workspace Switcher */}
              <div className="px-4 py-6 sm:px-0">
                <div className="flex justify-between items-start">
                  <div>
                    <h1 className="text-3xl font-bold text-gray-900">Firm Dashboard</h1>
                    <p className="mt-2 text-gray-600">Manage your matters, team, and clients</p>
                  </div>
                  <div className="w-64">
                    <WorkspaceSwitcher />
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <BriefcaseIcon className="h-6 w-6 text-blue-400" />
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">
                            Total Matters
                          </dt>
                          <dd className="text-2xl font-semibold text-gray-900">
                            {stats.totalMatters}
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <BriefcaseIcon className="h-6 w-6 text-green-400" />
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">
                            Active Matters
                          </dt>
                          <dd className="text-2xl font-semibold text-green-600">
                            {stats.activeMatters}
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <UserGroupIcon className="h-6 w-6 text-purple-400" />
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">
                            Team Members
                          </dt>
                          <dd className="text-2xl font-semibold text-gray-900">
                            {stats.teamMembers}
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <DocumentTextIcon className="h-6 w-6 text-yellow-400" />
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">Documents</dt>
                          <dd className="text-2xl font-semibold text-gray-900">
                            {stats.documentsCount}
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Matters */}
              <div className="mt-8">
                <div className="bg-white shadow rounded-lg">
                  <div className="px-4 py-5 sm:px-6 border-b border-gray-200 flex justify-between items-center">
                    <h3 className="text-lg font-medium text-gray-900">Recent Matters</h3>
                    <Link
                      href="/firm/matters/new"
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                    >
                      <PlusIcon className="h-4 w-4 mr-2" />
                      New Matter
                    </Link>
                  </div>
                  <div className="px-4 py-5 sm:p-6">
                    {loading ? (
                      <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                      </div>
                    ) : matters.length === 0 ? (
                      <p className="text-gray-500 text-center py-8">
                        No matters yet. Create your first matter to get started.
                      </p>
                    ) : (
                      <ul className="divide-y divide-gray-200">
                        {matters.map((matter) => (
                          <li key={matter.id} className="py-4">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center">
                                  <h4 className="text-sm font-medium text-gray-900">
                                    {matter.title}
                                  </h4>
                                  <span
                                    className={`ml-3 px-2 py-1 text-xs font-medium rounded-full ${
                                      matter.status === 'active'
                                        ? 'bg-green-100 text-green-800'
                                        : matter.status === 'closed'
                                          ? 'bg-gray-100 text-gray-800'
                                          : 'bg-yellow-100 text-yellow-800'
                                    }`}
                                  >
                                    {matter.status}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-500 mt-1">
                                  Matter #: {matter.matter_number}
                                  {matter.client_name && ` • Client: ${matter.client_name}`}
                                </p>
                                <p className="text-xs text-gray-400 mt-1">
                                  Created: {new Date(matter.created_at).toLocaleDateString()}
                                </p>
                              </div>
                              <Link
                                href={`/firm/matters/${matter.id}`}
                                className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
                              >
                                View
                                <ArrowRightIcon className="ml-1 h-4 w-4" />
                              </Link>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
                <Link
                  href="/firm/matters"
                  className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow"
                >
                  <div className="px-4 py-5 sm:p-6">
                    <div className="flex items-center">
                      <BriefcaseIcon className="h-8 w-8 text-blue-500" />
                      <div className="ml-4">
                        <h3 className="text-lg font-medium text-gray-900">All Matters</h3>
                        <p className="text-sm text-gray-500">View and manage all matters</p>
                      </div>
                    </div>
                  </div>
                </Link>

                <Link
                  href="/firm/team"
                  className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow"
                >
                  <div className="px-4 py-5 sm:p-6">
                    <div className="flex items-center">
                      <UserGroupIcon className="h-8 w-8 text-blue-500" />
                      <div className="ml-4">
                        <h3 className="text-lg font-medium text-gray-900">Team & Staff</h3>
                        <p className="text-sm text-gray-500">Manage team members</p>
                      </div>
                    </div>
                  </div>
                </Link>

                <Link
                  href="/firm/settings"
                  className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow"
                >
                  <div className="px-4 py-5 sm:p-6">
                    <div className="flex items-center">
                      <DocumentTextIcon className="h-8 w-8 text-blue-500" />
                      <div className="ml-4">
                        <h3 className="text-lg font-medium text-gray-900">Firm Settings</h3>
                        <p className="text-sm text-gray-500">Configure preferences</p>
                      </div>
                    </div>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </WorkspaceStatusGuard>
      </RoleGuard>
    </AuthGuard>
  );
}
