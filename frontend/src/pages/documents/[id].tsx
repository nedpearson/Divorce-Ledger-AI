import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '@/components/Layout';
import AuthGuard from '@/components/AuthGuard';
import { useDocuments } from '@/hooks/useDocuments';
import { storage } from '@/lib/supabase';
import {
  ArrowLeft,
  Download,
  Trash2,
  Sparkles,
  FileText,
  Calendar,
  User,
  Tag,
  AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';

export default function DocumentDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const { currentDocument, fetchDocument, deleteDocument, classifyDocument, loading, error } =
    useDocuments();
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (id && typeof id === 'string') {
      fetchDocument(id);
    }
  }, [id]);

  const handleDownload = async () => {
    if (!currentDocument) return;

    setDownloading(true);
    try {
      const { data, error } = await storage.download('documents', currentDocument.storage_path);

      if (error) throw error;

      // Create download link
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = currentDocument.original_filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Failed to download document: ' + err.message);
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!currentDocument) return;

    if (!confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteDocument(currentDocument.id, false);
      router.push('/documents');
    } catch (err: any) {
      alert('Failed to delete document: ' + err.message);
    }
  };

  const handleClassify = async () => {
    if (!currentDocument) return;

    try {
      await classifyDocument(currentDocument.id);
      alert('Classification started. This may take a few moments.');
      // Refetch after a delay
      setTimeout(() => {
        if (id && typeof id === 'string') {
          fetchDocument(id);
        }
      }, 3000);
    } catch (err: any) {
      alert('Failed to start classification: ' + err.message);
    }
  };

  if (loading) {
    return (
      <AuthGuard>
        <Layout>
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        </Layout>
      </AuthGuard>
    );
  }

  if (error || !currentDocument) {
    return (
      <AuthGuard>
        <Layout>
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center p-4 text-sm text-red-800 bg-red-50 rounded-lg">
              <AlertCircle className="h-5 w-5 mr-2" />
              {error || 'Document not found'}
            </div>
            <Link
              href="/documents"
              className="mt-4 inline-flex items-center text-primary-600 hover:text-primary-700"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to documents
            </Link>
          </div>
        </Layout>
      </AuthGuard>
    );
  }

  const classification = currentDocument.classifications?.[0];

  return (
    <AuthGuard>
      <Layout>
        <Head>
          <title>{currentDocument.original_filename} - Divorce Ledger AI</title>
        </Head>

        <div className="max-w-4xl mx-auto">
          {/* Back Button */}
          <Link
            href="/documents"
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to documents
          </Link>

          {/* Header */}
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <FileText className="h-6 w-6 text-primary-600" />
                  <h1 className="text-2xl font-bold text-gray-900">
                    {currentDocument.original_filename}
                  </h1>
                </div>

                <div className="flex flex-wrap gap-2 mt-4">
                  {/* Type Badge */}
                  <span className="px-3 py-1 text-xs font-medium bg-primary-100 text-primary-800 rounded-full">
                    {currentDocument.document_type}
                  </span>

                  {/* Status Badge */}
                  <span
                    className={`px-3 py-1 text-xs font-medium rounded-full ${
                      currentDocument.status === 'classified'
                        ? 'bg-green-100 text-green-800'
                        : currentDocument.status === 'processing'
                          ? 'bg-yellow-100 text-yellow-800'
                          : currentDocument.status === 'failed'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {currentDocument.status}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex space-x-2">
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {downloading ? 'Downloading...' : 'Download'}
                </button>

                {currentDocument.status !== 'classified' &&
                  currentDocument.status !== 'processing' && (
                    <button
                      onClick={handleClassify}
                      className="flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      Classify
                    </button>
                  )}

                <button
                  onClick={handleDelete}
                  className="flex items-center px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </button>
              </div>
            </div>
          </div>

          {/* Metadata */}
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Document Information</h2>

            <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">File Size</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {(currentDocument.file_size / 1024 / 1024).toFixed(2)} MB
                </dd>
              </div>

              <div>
                <dt className="text-sm font-medium text-gray-500">File Type</dt>
                <dd className="mt-1 text-sm text-gray-900">{currentDocument.mime_type}</dd>
              </div>

              <div>
                <dt className="text-sm font-medium text-gray-500 flex items-center">
                  <Calendar className="h-4 w-4 mr-1" />
                  Uploaded
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {format(new Date(currentDocument.created_at), 'MMM d, yyyy h:mm a')}
                </dd>
              </div>

              <div>
                <dt className="text-sm font-medium text-gray-500 flex items-center">
                  <Calendar className="h-4 w-4 mr-1" />
                  Last Modified
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {format(new Date(currentDocument.updated_at), 'MMM d, yyyy h:mm a')}
                </dd>
              </div>
            </dl>

            {/* Tags */}
            {currentDocument.tags && currentDocument.tags.length > 0 && (
              <div className="mt-6">
                <dt className="text-sm font-medium text-gray-500 flex items-center mb-2">
                  <Tag className="h-4 w-4 mr-1" />
                  Tags
                </dt>
                <div className="flex flex-wrap gap-2">
                  {currentDocument.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Classification Results */}
          {classification && (
            <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Classification Results</h2>

              <dl className="space-y-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Primary Category</dt>
                  <dd className="mt-1 text-sm text-gray-900">{classification.primary_category}</dd>
                </div>

                <div>
                  <dt className="text-sm font-medium text-gray-500">Confidence Score</dt>
                  <dd className="mt-1">
                    <div className="flex items-center">
                      <div className="flex-1 bg-gray-200 rounded-full h-2 mr-3">
                        <div
                          className="bg-primary-600 h-2 rounded-full"
                          style={{ width: `${classification.confidence_score * 100}%` }}
                        ></div>
                      </div>
                      <span className="text-sm text-gray-900">
                        {(classification.confidence_score * 100).toFixed(1)}%
                      </span>
                    </div>
                  </dd>
                </div>

                {classification.entities && classification.entities.length > 0 && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500 mb-2">Extracted Entities</dt>
                    <dd className="mt-1">
                      <div className="bg-gray-50 rounded-lg p-4">
                        <pre className="text-sm text-gray-900 whitespace-pre-wrap">
                          {JSON.stringify(classification.entities, null, 2)}
                        </pre>
                      </div>
                    </dd>
                  </div>
                )}

                {classification.sentiment && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Sentiment Analysis</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {JSON.stringify(classification.sentiment)}
                    </dd>
                  </div>
                )}

                <div>
                  <dt className="text-sm font-medium text-gray-500">Classified At</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {format(new Date(classification.created_at), 'MMM d, yyyy h:mm a')}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      </Layout>
    </AuthGuard>
  );
}
