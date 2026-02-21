import React from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { FileText, FileSpreadsheet, Image, Music, MoreVertical } from 'lucide-react';
import { Document } from '@/store/documentStore';

interface DocumentListProps {
  documents: Document[];
  onDelete?: (id: string) => void;
  onClassify?: (id: string) => void;
}

export default function DocumentList({ documents, onDelete, onClassify }: DocumentListProps) {
  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return Image;
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return FileSpreadsheet;
    if (mimeType.startsWith('audio/')) return Music;
    return FileText;
  };

  const getStatusColor = (status: Document['status']) => {
    switch (status) {
      case 'classified':
        return 'bg-green-100 text-green-800';
      case 'processing':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeColor = (type: Document['document_type']) => {
    switch (type) {
      case 'financial':
        return 'bg-blue-100 text-blue-800';
      case 'legal':
        return 'bg-purple-100 text-purple-800';
      case 'custody':
        return 'bg-pink-100 text-pink-800';
      case 'property':
        return 'bg-indigo-100 text-indigo-800';
      case 'communication':
        return 'bg-teal-100 text-teal-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (documents.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">No documents</h3>
        <p className="mt-1 text-sm text-gray-500">Get started by uploading a document.</p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-lg">
      <ul className="divide-y divide-gray-200">
        {documents.map((document) => {
          const Icon = getFileIcon(document.mime_type);

          return (
            <li key={document.id}>
              <Link
                href={`/documents/${document.id}`}
                className="block hover:bg-gray-50 transition-colors"
              >
                <div className="px-4 py-4 sm:px-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center min-w-0 flex-1">
                      <Icon className="flex-shrink-0 h-10 w-10 text-gray-400" />
                      <div className="ml-4 min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {document.original_filename}
                        </p>
                        <div className="mt-1 flex items-center space-x-2">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTypeColor(
                              document.document_type
                            )}`}
                          >
                            {document.document_type}
                          </span>
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                              document.status
                            )}`}
                          >
                            {document.status}
                          </span>
                          {document.classifications && document.classifications.length > 0 && (
                            <span className="text-xs text-gray-500">
                              {(document.classifications[0].confidence_score * 100).toFixed(0)}%
                              confidence
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="ml-4 flex-shrink-0 text-sm text-gray-500">
                      <p>{format(new Date(document.created_at), 'MMM d, yyyy')}</p>
                      <p className="text-xs">
                        {(document.file_size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
