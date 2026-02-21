import { useState, useEffect } from 'react';
import AuthGuard from '@/components/guards/AuthGuard';
import RoleGuard from '@/components/guards/RoleGuard';
import WorkspaceStatusGuard from '@/components/guards/WorkspaceStatusGuard';
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { supabase } from '@/lib/supabase';
import { 
  DocumentTextIcon, 
  ClockIcon, 
  ChartBarIcon,
  CloudArrowUpIcon,
  FolderIcon
} from '@heroicons/react/24/outline';
import Link from 'next/link';

interface Document {
  id: string;
  title: string;
  document_type: string;
  status: string;
  created_at: string;
}

interface Stats {
  totalDocuments: number;
  pendingReview: number;
  processed: number;
  storageUsed: string;
}

export default function ConsumerDashboard() {
  const { activeWorkspaceId } = useWorkspaceStore();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalDocuments: 0,
    pendingReview: 0,
    processed: 0,
    storageUsed: '0 MB',
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

      // Load recent documents
      const { data: docsData, error: docsError } = await supabase
        .from('documents')
        .select('*')
        .eq('workspace_id', activeWorkspaceId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (docsError) throw docsError;

      // Load stats
      const { data: allDocs } = await supabase
        .from('documents')
        .select('status, file_size')
        .eq('workspace_id', activeWorkspaceId);

      const totalSize = (allDocs || []).reduce((sum, doc) => sum + (doc.file_size || 0), 0);
      const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);

      setStats({
        totalDocuments: allDocs?.length || 0,
        pendingReview: allDocs?.filter(d => d.status === 'pending').length || 0,
        processed: allDocs?.filter(d => d.status === 'processed').length || 0,
        storageUsed: `${sizeMB} MB`,
      });

      setDocuments(docsData || []);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthGuard>
      <RoleGuard 
        requireWorkspaceType="consumer" 
        requireWorkspaceRole={['consumer']}
        fallbackPath="/"
      >
        <WorkspaceStatusGuard>
          <div className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
              {/* Header */}
              <div className="px-4 py-6 sm:px-0">
                <div className="flex justify-between items-start">
                  <div>
                    <h1 className="text-3xl font-bold text-gray-900">My Dashboard</h1>
                    <p className="mt-2 text-gray-600">Manage your documents and divorce ledger</p>
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
                        <DocumentTextIcon className="h-6 w-6 text-blue-400" />
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">Total Documents</dt>
                          <dd className="text-2xl font-semibold text-gray-900">{stats.totalDocuments}</dd>
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
                          <dt className="text-sm font-medium text-gray-500 truncate">Pending Review</dt>
                          <dd className="text-2xl font-semibold text-yellow-600">{stats.pendingReview}</dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <ChartBarIcon className="h-6 w-6 text-green-400" />
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">Processed</dt>
                          <dd className="text-2xl font-semibold text-green-600">{stats.processed}</dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <FolderIcon className="h-6 w-6 text-purple-400" />
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">Storage Used</dt>
                          <dd className="text-lg font-semibold text-gray-900">{stats.storageUsed}</dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Upload Section */}
              <div className="mt-8">
                <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg shadow-lg">
                  <div className="px-6 py-8 text-center">
                    <CloudArrowUpIcon className="mx-auto h-12 w-12 text-white" />
                    <h3 className="mt-4 text-xl font-semibold text-white">Upload New Documents</h3>
                    <p className="mt-2 text-blue-100">
                      Upload financial documents, court filings, or any divorce-related paperwork
                    </p>
                    <Link
                      href="/app/upload"
                      className="mt-6 inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-blue-600 bg-white hover:bg-blue-50"
                    >
                      Start Upload
                    </Link>
                  </div>
                </div>
              </div>

              {/* Recent Documents */}
              <div className="mt-8">
                <div className="bg-white shadow rounded-lg">
                  <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900">Recent Documents</h3>
                  </div>
                  <div className="px-4 py-5 sm:p-6">
                    {loading ? (
                      <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                      </div>
                    ) : documents.length === 0 ? (
                      <p className="text-gray-500 text-center py-8">No documents yet. Upload your first document to get started.</p>
                    ) : (
                      <ul className="divide-y divide-gray-200">
                        {documents.map((doc) => (
                          <li key={doc.id} className="py-4">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center">
                                  <DocumentTextIcon className="h-5 w-5 text-gray-400 mr-3" />
                                  <div>
                                    <h4 className="text-sm font-medium text-gray-900">{doc.title}</h4>
                                    <p className="text-sm text-gray-500 mt-1">
                                      Type: {doc.document_type}
                                      {' • '}
                                      <span className={`${
                                        doc.status === 'processed' ? 'text-green-600' :
                                        doc.status === 'pending' ? 'text-yellow-600' :
                                        'text-gray-600'
                                      }`}>
                                        {doc.status}
                                      </span>
                                    </p>
                                    <p className="text-xs text-gray-400 mt-1">
                                      {new Date(doc.created_at).toLocaleDateString()}
                                    </p>
                                  </div>
                                </div>
                              </div>
                              <Link
                                href={`/app/documents/${doc.id}`}
                                className="text-sm text-blue-600 hover:text-blue-800"
                              >
                                View
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
                  href="/app/documents"
                  className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow"
                >
                  <div className="px-4 py-5 sm:p-6">
                    <div className="flex items-center">
                      <DocumentTextIcon className="h-8 w-8 text-blue-500" />
                      <div className="ml-4">
                        <h3 className="text-lg font-medium text-gray-900">All Documents</h3>
                        <p className="text-sm text-gray-500">View document library</p>
                      </div>
                    </div>
                  </div>
                </Link>

                <Link
                  href="/app/ledger"
                  className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow"
                >
                  <div className="px-4 py-5 sm:p-6">
                    <div className="flex items-center">
                      <ChartBarIcon className="h-8 w-8 text-blue-500" />
                      <div className="ml-4">
                        <h3 className="text-lg font-medium text-gray-900">Financial Ledger</h3>
                        <p className="text-sm text-gray-500">Track expenses & assets</p>
                      </div>
                    </div>
                  </div>
                </Link>

                <Link
                  href="/app/timeline"
                  className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow"
                >
                  <div className="px-4 py-5 sm:p-6">
                    <div className="flex items-center">
                      <ClockIcon className="h-8 w-8 text-blue-500" />
                      <div className="ml-4">
                        <h3 className="text-lg font-medium text-gray-900">Timeline</h3>
                        <p className="text-sm text-gray-500">View case timeline</p>
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
