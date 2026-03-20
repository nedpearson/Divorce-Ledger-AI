import { useState, useEffect } from 'react';
import AuthGuard from '@/components/guards/AuthGuard';
import RoleGuard from '@/components/guards/RoleGuard';
import { supabase } from '@/lib/supabase';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ShieldCheckIcon,
  UserIcon,
} from '@heroicons/react/24/outline';

interface AuditLogEntry {
  id: string;
  created_at: string;
  user_id: string;
  actor_email: string;
  is_platform_admin: boolean;
  action: string;
  resource_type: string;
  resource_id: string;
  workspace_id?: string;
  changes?: Record<string, any>;
  metadata?: Record<string, any>;
  ip_address?: string;
}

export default function AuditLogViewer() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({
    search: '',
    resourceType: '',
    isPlatformAdmin: '',
  });
  const [page, setPage] = useState(0);
  const pageSize = 50;

  useEffect(() => {
    loadLogs();
  }, [page, filter]);

  const loadLogs = async () => {
    try {
      setLoading(true);

      let query = supabase
        .from('audit_log')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      // Apply filters
      if (filter.search) {
        query = query.or(`actor_email.ilike.%${filter.search}%,action.ilike.%${filter.search}%`);
      }

      if (filter.resourceType) {
        query = query.eq('resource_type', filter.resourceType);
      }

      if (filter.isPlatformAdmin === 'true') {
        query = query.eq('is_platform_admin', true);
      } else if (filter.isPlatformAdmin === 'false') {
        query = query.eq('is_platform_admin', false);
      }

      const { data, error } = await query;

      if (error) throw error;

      setLogs(data || []);
    } catch (error) {
      console.error('Failed to load audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilter({ ...filter, [key]: value });
    setPage(0); // Reset to first page
  };

  const getActionBadgeColor = (action: string) => {
    if (action.includes('delete') || action.includes('suspend')) return 'bg-red-100 text-red-800';
    if (action.includes('create') || action.includes('approve'))
      return 'bg-green-100 text-green-800';
    if (action.includes('update')) return 'bg-blue-100 text-blue-800';
    if (action.includes('impersonation')) return 'bg-purple-100 text-purple-800';
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <AuthGuard>
      <RoleGuard requirePlatformRole={['super_admin', 'support_admin']} fallbackPath="/">
        <div className="min-h-screen bg-gray-50">
          <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
            {/* Header */}
            <div className="px-4 py-6 sm:px-0">
              <div className="flex justify-between items-center">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">Audit Logs</h1>
                  <p className="mt-2 text-gray-600">Platform-wide activity and security log</p>
                </div>
                <a href="/superadmin" className="text-blue-600 hover:text-blue-800 font-medium">
                  ← Back to Dashboard
                </a>
              </div>
            </div>

            {/* Filters */}
            <div className="mt-6 bg-white shadow rounded-lg p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      value={filter.search}
                      onChange={(e) => handleFilterChange('search', e.target.value)}
                      placeholder="Search by email or action..."
                      className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Resource Type
                  </label>
                  <select
                    value={filter.resourceType}
                    onChange={(e) => handleFilterChange('resourceType', e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="">All Types</option>
                    <option value="workspace">Workspace</option>
                    <option value="matter">Matter</option>
                    <option value="user">User</option>
                    <option value="document">Document</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Actor Type</label>
                  <select
                    value={filter.isPlatformAdmin}
                    onChange={(e) => handleFilterChange('isPlatformAdmin', e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="">All Actors</option>
                    <option value="true">Platform Admins</option>
                    <option value="false">Regular Users</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Logs Table */}
            <div className="mt-6 bg-white shadow rounded-lg overflow-hidden">
              {loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              ) : logs.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">No audit logs found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Timestamp
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actor
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Action
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Resource
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          IP Address
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {logs.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              {log.is_platform_admin ? (
                                <ShieldCheckIcon className="h-5 w-5 text-purple-500 mr-2" />
                              ) : (
                                <UserIcon className="h-5 w-5 text-gray-400 mr-2" />
                              )}
                              <div>
                                <div className="text-sm font-medium text-gray-900">
                                  {log.actor_email}
                                </div>
                                {log.is_platform_admin && (
                                  <div className="text-xs text-purple-600">Platform Admin</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-1 text-xs font-medium rounded-full ${getActionBadgeColor(log.action)}`}
                            >
                              {log.action}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <div>
                              <div className="font-medium text-gray-900">{log.resource_type}</div>
                              {log.resource_id && (
                                <div className="text-xs text-gray-400 truncate max-w-xs">
                                  {log.resource_id}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {log.ip_address || 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {!loading && logs.length > 0 && (
                <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                  <div className="flex-1 flex justify-between sm:hidden">
                    <button
                      onClick={() => setPage(Math.max(0, page - 1))}
                      disabled={page === 0}
                      className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPage(page + 1)}
                      disabled={logs.length < pageSize}
                      className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                  <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm text-gray-700">
                        Showing page <span className="font-medium">{page + 1}</span>
                      </p>
                    </div>
                    <div>
                      <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                        <button
                          onClick={() => setPage(Math.max(0, page - 1))}
                          disabled={page === 0}
                          className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Previous
                        </button>
                        <button
                          onClick={() => setPage(page + 1)}
                          disabled={logs.length < pageSize}
                          className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Next
                        </button>
                      </nav>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </RoleGuard>
    </AuthGuard>
  );
}
