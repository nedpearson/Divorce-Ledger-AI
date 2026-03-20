import { useState, useEffect } from 'react';
import AuthGuard from '@/components/guards/AuthGuard';
import RoleGuard from '@/components/guards/RoleGuard';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import {
  BriefcaseIcon,
  DocumentTextIcon,
  ClockIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';

interface Matter {
  id: string;
  matter_number: string;
  title: string;
  description: string;
  status: string;
  workspace_name: string;
}

interface Document {
  id: string;
  title: string;
  document_type: string;
  created_at: string;
  matter_id: string;
}

export default function ClientPortal() {
  const { user } = useAuthStore();
  const [matters, setMatters] = useState<Matter[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedMatter, setSelectedMatter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadClientData();
    }
  }, [user]);

  useEffect(() => {
    if (selectedMatter) {
      loadMatterDocuments(selectedMatter);
    }
  }, [selectedMatter]);

  const loadClientData = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // Load matters where user is a client
      const { data: matterAccess, error } = await supabase
        .from('matter_access')
        .select(
          `
          matter_id,
          matter_number,
          matter_title,
          matter_description,
          matter_status,
          workspace_name
        `
        )
        .eq('user_id', user.id);

      if (error) throw error;

      const mattersData = (matterAccess || []).map((ma) => ({
        id: ma.matter_id,
        matter_number: ma.matter_number,
        title: ma.matter_title,
        description: ma.matter_description,
        status: ma.matter_status,
        workspace_name: ma.workspace_name,
      }));

      setMatters(mattersData);

      // Auto-select first matter
      if (mattersData.length > 0 && !selectedMatter) {
        setSelectedMatter(mattersData[0].id);
      }
    } catch (error) {
      console.error('Failed to load client data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMatterDocuments = async (matterId: string) => {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('id, title, document_type, created_at, matter_id')
        .eq('matter_id', matterId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Failed to load matter documents:', error);
    }
  };

  const currentMatter = matters.find((m) => m.id === selectedMatter);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your case information...</p>
        </div>
      </div>
    );
  }

  if (matters.length === 0) {
    return (
      <AuthGuard>
        <RoleGuard requireWorkspaceRole={['client']} fallbackPath="/">
          <div className="min-h-screen bg-gray-50">
            <div className="max-w-4xl mx-auto py-16 px-4 sm:px-6 lg:px-8">
              <div className="text-center">
                <BriefcaseIcon className="mx-auto h-16 w-16 text-gray-400" />
                <h2 className="mt-4 text-2xl font-bold text-gray-900">No Cases Assigned</h2>
                <p className="mt-2 text-gray-600">
                  You don't have access to any cases yet. Your attorney will grant you access once
                  your case is set up.
                </p>
                <div className="mt-6">
                  <a
                    href="mailto:support@divorcelegder.com"
                    className="text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Contact Support
                  </a>
                </div>
              </div>
            </div>
          </div>
        </RoleGuard>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <RoleGuard requireWorkspaceRole={['client']} fallbackPath="/">
        <div className="min-h-screen bg-gray-50">
          <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
            {/* Header */}
            <div className="px-4 py-6 sm:px-0">
              <h1 className="text-3xl font-bold text-gray-900">Client Portal</h1>
              <p className="mt-2 text-gray-600">View your case details and documents</p>
            </div>

            {/* Info Banner */}
            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex">
                <InformationCircleIcon className="h-5 w-5 text-blue-400 mt-0.5" />
                <div className="ml-3">
                  <p className="text-sm text-blue-700">
                    This is a read-only view of your case. Contact your attorney if you need to
                    update any information.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Matters List */}
              <div className="lg:col-span-1">
                <div className="bg-white shadow rounded-lg">
                  <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900">Your Cases</h3>
                  </div>
                  <ul className="divide-y divide-gray-200">
                    {matters.map((matter) => (
                      <li
                        key={matter.id}
                        className={`px-4 py-4 cursor-pointer hover:bg-gray-50 ${
                          selectedMatter === matter.id ? 'bg-blue-50' : ''
                        }`}
                        onClick={() => setSelectedMatter(matter.id)}
                      >
                        <div className="flex items-start">
                          <BriefcaseIcon className="h-5 w-5 text-gray-400 mt-1" />
                          <div className="ml-3 flex-1">
                            <p className="text-sm font-medium text-gray-900">{matter.title}</p>
                            <p className="text-xs text-gray-500 mt-1">{matter.workspace_name}</p>
                            <p className="text-xs text-gray-400 mt-1">
                              Matter #{matter.matter_number}
                            </p>
                            <span
                              className={`inline-block mt-2 px-2 py-1 text-xs font-medium rounded-full ${
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
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Matter Details */}
              <div className="lg:col-span-2">
                {currentMatter ? (
                  <div className="space-y-6">
                    {/* Matter Info */}
                    <div className="bg-white shadow rounded-lg">
                      <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
                        <h3 className="text-lg font-medium text-gray-900">Case Details</h3>
                      </div>
                      <div className="px-4 py-5 sm:p-6">
                        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div>
                            <dt className="text-sm font-medium text-gray-500">Matter Number</dt>
                            <dd className="mt-1 text-sm text-gray-900">
                              {currentMatter.matter_number}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-sm font-medium text-gray-500">Status</dt>
                            <dd className="mt-1">
                              <span
                                className={`px-2 py-1 text-xs font-medium rounded-full ${
                                  currentMatter.status === 'active'
                                    ? 'bg-green-100 text-green-800'
                                    : currentMatter.status === 'closed'
                                      ? 'bg-gray-100 text-gray-800'
                                      : 'bg-yellow-100 text-yellow-800'
                                }`}
                              >
                                {currentMatter.status}
                              </span>
                            </dd>
                          </div>
                          <div className="sm:col-span-2">
                            <dt className="text-sm font-medium text-gray-500">Law Firm</dt>
                            <dd className="mt-1 text-sm text-gray-900">
                              {currentMatter.workspace_name}
                            </dd>
                          </div>
                          {currentMatter.description && (
                            <div className="sm:col-span-2">
                              <dt className="text-sm font-medium text-gray-500">Description</dt>
                              <dd className="mt-1 text-sm text-gray-900">
                                {currentMatter.description}
                              </dd>
                            </div>
                          )}
                        </dl>
                      </div>
                    </div>

                    {/* Documents */}
                    <div className="bg-white shadow rounded-lg">
                      <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
                        <h3 className="text-lg font-medium text-gray-900">Case Documents</h3>
                      </div>
                      <div className="px-4 py-5 sm:p-6">
                        {documents.length === 0 ? (
                          <p className="text-gray-500 text-center py-8">
                            No documents available yet.
                          </p>
                        ) : (
                          <ul className="divide-y divide-gray-200">
                            {documents.map((doc) => (
                              <li key={doc.id} className="py-4">
                                <div className="flex items-center">
                                  <DocumentTextIcon className="h-5 w-5 text-gray-400 mr-3" />
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-900">{doc.title}</p>
                                    <p className="text-xs text-gray-500 mt-1">
                                      Type: {doc.document_type} • Uploaded:{' '}
                                      {new Date(doc.created_at).toLocaleDateString()}
                                    </p>
                                  </div>
                                  <button className="text-sm text-blue-600 hover:text-blue-800">
                                    View
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white shadow rounded-lg p-8 text-center">
                    <p className="text-gray-500">Select a case to view details</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </RoleGuard>
    </AuthGuard>
  );
}
