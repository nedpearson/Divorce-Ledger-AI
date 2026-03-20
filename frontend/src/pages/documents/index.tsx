import React, { useState } from 'react';
import Head from 'next/head';
import Layout from '@/components/Layout';
import AuthGuard from '@/components/AuthGuard';
import DocumentList from '@/components/DocumentList';
import UploadButton from '@/components/UploadButton';
import { useDocuments } from '@/hooks/useDocuments';
import { Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react';

export default function DocumentsPage() {
  const {
    documents,
    loading,
    error,
    pagination,
    filters,
    setFilters,
    fetchDocuments,
    deleteDocument,
    classifyDocument,
    hasMore,
  } = useDocuments();

  const [searchQuery, setSearchQuery] = useState(filters.search || '');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters({ ...filters, search: searchQuery });
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters({ ...filters, [key]: value || undefined });
  };

  const handlePageChange = (newPage: number) => {
    fetchDocuments(newPage);
  };

  return (
    <AuthGuard>
      <Layout>
        <Head>
          <title>Documents - Divorce Ledger AI</title>
        </Head>

        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Documents</h1>
            <p className="mt-2 text-gray-600">Manage and organize your legal documents</p>
          </div>

          {/* Actions Bar */}
          <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
            {/* Search */}
            <form onSubmit={handleSearch} className="flex-1 max-w-lg">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search documents..."
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </form>

            {/* Upload Button */}
            <UploadButton onUploadComplete={() => fetchDocuments(pagination.page)} />
          </div>

          {/* Filters */}
          <div className="mb-6 flex flex-wrap gap-4">
            <div className="flex items-center space-x-2">
              <Filter className="h-5 w-5 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">Filters:</span>
            </div>

            {/* Document Type Filter */}
            <select
              value={filters.document_type || ''}
              onChange={(e) => handleFilterChange('document_type', e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">All Types</option>
              <option value="financial">Financial</option>
              <option value="legal">Legal</option>
              <option value="custody">Custody</option>
              <option value="property">Property</option>
              <option value="communication">Communication</option>
              <option value="other">Other</option>
            </select>

            {/* Status Filter */}
            <select
              value={filters.status || ''}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="classified">Classified</option>
              <option value="failed">Failed</option>
            </select>

            {/* Clear Filters */}
            {(filters.document_type || filters.status || filters.search) && (
              <button
                onClick={() => {
                  setFilters({});
                  setSearchQuery('');
                }}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 p-4 text-sm text-red-800 bg-red-50 rounded-lg">{error}</div>
          )}

          {/* Loading */}
          {loading && !documents.length && (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
          )}

          {/* Document List */}
          {!loading && (
            <DocumentList
              documents={documents}
              onDelete={async (id) => {
                if (confirm('Are you sure you want to delete this document?')) {
                  await deleteDocument(id, false);
                }
              }}
              onClassify={classifyDocument}
            />
          )}

          {/* Pagination */}
          {pagination.total > pagination.limit && (
            <div className="mt-8 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Showing {Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total)}{' '}
                to {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                {pagination.total} documents
              </div>

              <div className="flex space-x-2">
                <button
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </button>

                <div className="flex items-center px-4 py-2 text-sm font-medium text-gray-700">
                  Page {pagination.page} of {Math.ceil(pagination.total / pagination.limit)}
                </div>

                <button
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={!hasMore}
                  className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </button>
              </div>
            </div>
          )}
        </div>
      </Layout>
    </AuthGuard>
  );
}
