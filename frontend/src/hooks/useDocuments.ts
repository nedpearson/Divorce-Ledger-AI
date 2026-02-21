import { useEffect } from 'react';
import { useDocumentStore } from '@/store/documentStore';

export function useDocuments() {
  const {
    documents,
    currentDocument,
    loading,
    error,
    pagination,
    filters,
    fetchDocuments,
    fetchDocument,
    deleteDocument,
    updateDocument,
    classifyDocument,
    setFilters,
    clearError,
  } = useDocumentStore();

  useEffect(() => {
    if (documents.length === 0 && !loading) {
      fetchDocuments();
    }
  }, []);

  return {
    documents,
    currentDocument,
    loading,
    error,
    pagination,
    filters,
    fetchDocuments,  
    fetchDocument,
    deleteDocument,
    updateDocument,
    classifyDocument,
    setFilters,
    clearError,
    hasMore: pagination.page * pagination.limit < pagination.total,
    totalPages: Math.ceil(pagination.total / pagination.limit),
  };
}
